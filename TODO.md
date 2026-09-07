# Security review (2026-09-07)

Audit of `mirabellier-backend` (Express 5 + better-sqlite3 + Socket.IO) and the
Vite/React frontend. Ordered by severity. Line refs are from the state of the
tree at review time.

Good news first, so these are not re-litigated: every SQL statement goes through
`better-sqlite3` prepared statements with bound parameters (the only interpolated
identifiers — `users.js:99` and `db.js:694` — come from hardcoded whitelists), all
`child_process` calls use `execFile` with an argv array (no shell), admin routes
consistently gate on `isOwner`, blog HTML is re-parsed through the Tiptap schema
rather than `dangerouslySetInnerHTML`, session tokens live in an HttpOnly
`SameSite=Lax` cookie instead of `localStorage`, and no secrets are tracked in git.

## 🔴 Critical

- [x] **`POST /posts` is unauthenticated and lets the caller spoof authorship.**
      `routes/posts.js:636-639` does `const userId = userFromToken ? userFromToken.id : req.body.userId;`
      — anyone on the internet can publish a blog post on the site, and pick whose
      name it appears under. Require `authFromReq`, drop the `req.body.userId`
      fallback entirely, and gate creation on `isOwner` if the blog is meant to be
      single-author.
- [x] **`POST /posts-img` is an unauthenticated arbitrary-file upload that is then
      served back as static content.** `app.js:298` mounts it with no auth; the
      `imageUpload` multer instance (`lib/uploads.js:66`) has no `fileFilter`, no
      `limits`, and `allowEmptyExtension = true`, so the extension is taken verbatim
      from `originalname`. Upload `x.html` or `x.svg`, get it back from
      `/images/<name>` on the API origin with `Content-Type: text/html` and a
      one-year immutable cache → stored XSS against `api.mirabellier.com`, plus
      unbounded disk fill. Fix: require auth, add `limits: { fileSize }`, restrict
      `fileFilter` to the image MIME types, and derive the stored extension from a
      whitelist keyed on the detected type rather than from user input.

## 🟠 High

- [x] **Session tokens are stored in plaintext and never expire server-side.**
      `sessions` now `(token TEXT PRIMARY KEY /* sha256 */, userId, createdAt, expiresAt)`.
      `createSession` stores `sha256(token)` + a `createdAt`/`expiresAt` derived from
      `SESSION_COOKIE_MAX_AGE_SECONDS` (default 30d); `getUserByToken` hashes the
      incoming token, rejects + deletes an expired row; `sweepExpiredSessions()` runs
      at boot and hourly (unref'd timer). Migration adds the columns; legacy rows have
      `NULL expiresAt` and are swept — **every existing session is invalidated on
      deploy, all users re-login once** (their plaintext-keyed rows can't hash-match
      anyway).
- [x] **The session-token HMAC is dead code.** `isValidSignedToken` now enforces:
      with `SESSION_SECRET` set, an unsigned / malformed / mismatched token is
      rejected (`crypto.timingSafeEqual`, length-checked). `getUserByToken` returns
      `null` on invalid signature. No-op only when no secret is configured.
- [x] **Turnstile fails open on `NODE_ENV`.** `lib/turnstile.js` bypass is now
      `TURNSTILE_DEV_BYPASS=true` only — `NODE_ENV`/hostname no longer matter. Added
      to `.env` (`=true`, local) and `.env.example` (`=false`). **Ensure the VPS env
      does NOT set `TURNSTILE_DEV_BYPASS`** (or sets it false). Fail-closed tests
      added in `test/turnstile.test.js`.
- [x] **Multer runs before the auth check on video upload.** `routes/pixies.js` adds
      `requireUserMw` / `requireOwnerMw` that run `authFromReq` (+`isOwner`) *before*
      `videoUpload.single("video")` on `POST /pixies` and `POST /pixies/admin`, so an
      anonymous/non-owner request is rejected before anything hits `VIDEOS_DIR`. The
      `catch`/`cleanupFile` paths still unlink `req.file`.
- [x] **Profile `website` is unvalidated and rendered as an `href`.** New
      `lib/sanitize-website.js` (`sanitizeWebsite` moved out of guestbook +
      `sanitizeMediaUrl`). `updateUserById` runs `website` through `sanitizeWebsite`
      and `avatar`/`banner` through `sanitizeMediaUrl` (local `/images/...` path or
      `https:` only) before persisting; `""`/`null` still clears the field, `undefined`
      skips. Guestbook now imports the shared helper. Tests in
      `test/sanitize-website.test.js`.
- [x] **Vulnerable dependencies.** Both audits now report **0 vulnerabilities**
      (`npm audit --omit=dev` backend, `npm audit` frontend).
  - Backend: `npm audit fix` (axios, multer, form-data, qs, socket.io-parser,
    body-parser via transitive resolution) + `sharp` bumped to `^0.35.4`. All 256
    tests pass; server boots; sharp jpeg/png/webp pipeline verified.
  - Frontend: `npm audit fix` + `@tiptap/*` bumped to `^3.31.3` (clears the
    `mergeAttributes()` `__proto__` advisory and, transitively, the vite / postcss /
    nanoid / react-router advisories) + `sharp` `^0.35.4` (build-only devDep).
    `tsc -b && vite build` passes; 25 frontend tests pass.
  - Lockfiles changed on both; `package.json` changed for `sharp` (both) and
    `@tiptap/*` (frontend). Redeploy needs a fresh `npm ci` on both.

## 🟡 Medium

- [x] **No security headers at all.** `helmet` added in `registerMiddlewares`
      (`contentSecurityPolicy: false` — API + SSR share the origin; CORP set to
      `cross-origin` so the frontend can load `/images` + `/videos`). Now sends
      HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
      `Referrer-Policy: no-referrer`, COOP, etc. `createStaticMiddleware` also sets
      `Content-Disposition: attachment` on the user-upload mounts (verified: media
      `<video>`/`<img>`/blob-download paths ignore it).
- [x] **Rate limiting exists only for arena fights.** Added `express-rate-limit`:
      a global per-IP baseline (`RATE_LIMIT_GLOBAL_PER_MIN`, default 600/min) and a
      write-only limiter that skips GET/HEAD/OPTIONS (`RATE_LIMIT_WRITE_PER_MIN`,
      default 60/min) — both in `registerMiddlewares`, standard `RateLimit-*`
      headers. Live-tested: 61st write in a minute → 429.
- [x] **The WebSocket fight limiter shares one global bucket.**
      `lib/arena-fight-guard.js` `checkRateLimit` now drops `ip`-scope windows when
      `req` is falsy (the WS path), so socket users are limited per account instead
      of all sharing `fight:ip:ws`. Test added.
- [x] **`trust proxy` is never configured.** `app.set("trust proxy",
      TRUST_PROXY_HOPS)` (env `TRUST_PROXY_HOPS`, default 1) in
      `registerMiddlewares`, before the rate limiters — `req.ip` is now the real
      client. **Set `TRUST_PROXY_HOPS` on the VPS to the real hop count (Cloudflare
      only = 1, Cloudflare + nginx = 2).**
- [x] **`localhost` origins are allowlisted in production CORS.** New
      `lib/dev-origins.js` (`DEV_ORIGINS` + `devOriginsEnabled()`); the HTTP CORS
      allowlist (`app.js`) and the Socket.IO config (`lib/websocket-server.js`) only
      include the localhost origins when `ALLOW_DEV_ORIGINS=true`. Added to `.env`
      (`=true`, local) and `.env.example` (`=false`). Test added.
- [x] **OAuth `state` carries the redirect origin instead of a CSRF nonce.**
      `/auth/discord` now generates a random 16-byte nonce, stores `<nonce>|<origin>`
      in the `oauth_frontend_origin` cookie, and passes `state: nonce`. The callback
      constant-time-compares the returned `state` against the cookie nonce and
      redirects to `/login?error=auth_state_mismatch` on failure; the redirect
      origin is taken from the cookie only (no longer from attacker-controllable
      `state`).
- [x] **`resolveFrontendOrigin` accepts any localhost origin.** Now only returns a
      localhost `requested.origin` when `devOriginsEnabled()`; otherwise falls back
      to the configured frontend origin.
- [x] **`GET /images/list` enumerates every uploaded file, unauthenticated.** Now
      gated on `authFromReq` + `isOwner` (403 otherwise), response marked
      `Cache-Control: private, no-store`. `authFromReq`/`isOwner` passed into
      `registerImageRoutes` from `app.js`. (Frontend `fetchImages` was already
      unused dead code.)
- [~] **Security state is in-process memory.** Acknowledged as a single-node
      constraint (comment added at the rate-limiter in `app.js`). No code change —
      revisit with a shared store (Redis) before running more than one instance.
- [x] **`GET /user/:id/stats` reads every row in `posts` per request.**
      `routes/auth.js` now aggregates all per-user like/comment counts in one pass
      and memoizes it for 60s (`getPostInteractionAggregate`), so the full `posts`
      scan runs at most once per minute regardless of how many profiles are hit;
      response also gets `Cache-Control: public, max-age=60`. `postsCount` /
      `recentPosts` stay as per-request indexed lookups. Dead `countLikesForUser` /
      `countCommentsForUser` removed.

## 🟢 Low / hardening

- [ ] **`classifyPlatform` checks hostname but not protocol** (`lib/social.js:143-171`)
      — `new URL("file://youtube.com/…")` passes the allowlist before reaching
      `yt-dlp`. Owner-gated today, so impact is low, but add
      `parsed.protocol === "https:"` while it is cheap.
- [ ] **No username validation.** `updateUserById` (`lib/users.js:88-93`) accepts any
      string: no length cap, no charset restriction, no case-insensitive uniqueness —
      so `Mira` / `mira` / `mіra` (Cyrillic і) can coexist and impersonate. Add a
      pattern + length limit and a `COLLATE NOCASE` uniqueness check. Same for `bio`
      and `location`, which have no length cap.
- [ ] **CI actions are pinned to a moving ref.** `.github/workflows/deploy.yml` uses
      `appleboy/ssh-action@master` and `appleboy/scp-action@master`, both of which
      receive `secrets.VPS_SSH_KEY`. Pin to a commit SHA.
- [ ] **Sensitive data sits unencrypted on disk.** `mirabellier-backend/` holds six
      `database-backup-*.sqlite3` files (which include the plaintext `sessions` table)
      plus `data/{tiktok,instagram,youtube}-cookies.txt`. Gitignored, but move them
      off the app directory, restrict file modes, and add a retention policy.
- [ ] **Sessions are not invalidated on identity change** — no revoke-all on
      username change, and no "sign out other devices". Add once `sessions` grows an
      `expiresAt`/`createdAt`.
- [ ] **No `.well-known/security.txt` and no dependency scanning in CI.** Add
      Dependabot or a scheduled `npm audit` job so the dependency findings above do
      not silently re-accumulate.

## Suggested order

1. The two 🔴 items — both are unauthenticated and remotely reachable right now.
2. `npm audit fix` on both packages, then `helmet` + a global rate limiter (three
   small changes that cover a lot of the 🟡 list).
3. Session storage rework (hash + expiry), Turnstile fail-closed, and the
   `website` sanitizer.
4. The rest, in listed order.
