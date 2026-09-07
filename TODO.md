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

- [ ] **Session tokens are stored in plaintext and never expire server-side.**
      `sessions` is `(token TEXT PRIMARY KEY, userId TEXT)` (`lib/db.js:40-44`) with
      no `createdAt`/`expiresAt`. A database read — the file is world-readable on the
      VPS and copied into `database-backup-*.sqlite3` — hands over every live
      session, and a token stolen once works forever regardless of cookie `Max-Age`.
      Store `sha256(token)`, add `expiresAt`, check it in `getUserByToken`, and sweep
      expired rows.
- [ ] **The session-token HMAC is dead code.** `isValidSignedToken`
      (`lib/users.js:19-27`) returns `true` whenever the token has no `.`, and
      `getUserByToken` deliberately does not fail on mismatch (`lib/users.js:60-78`),
      so `SESSION_SECRET` buys nothing today. Either enforce it (constant-time
      compare via `crypto.timingSafeEqual`, reject on mismatch) or delete it — the
      current shape reads like protection that is not there.
- [ ] **Turnstile fails open on `NODE_ENV`.** `lib/turnstile.js:34-38` returns
      `{ success: true, devBypass: true }` whenever `NODE_ENV !== "production"`, and
      the backend `.env` currently has `NODE_ENV=development`. If that value ever
      reaches the deployed process, every human-verification gate (arena fights
      included) silently no-ops. Make the bypass an explicit opt-in
      (`TURNSTILE_DEV_BYPASS=true`) so the safe state is the default state.
- [ ] **Multer runs before the auth check on video upload.**
      `routes/pixies.js:662` and `:712` pass through `videoUpload.single("video")`
      before `authFromReq`/`isOwner`, so an anonymous request writes up to 250 MB to
      `VIDEOS_DIR` and only then gets a 401/403 — and nothing unlinks the orphan
      (the `/admin` handler's `cleanupFile` is defined after the auth returns).
      Unauthenticated disk exhaustion. Move auth into a middleware ahead of multer,
      and unlink `req.file` on every early return.
- [ ] **Profile `website` is unvalidated and rendered as an `href`.**
      `POST /me` passes `req.body.website` straight into `updateUserById`
      (`routes/auth.js:561`, `lib/users.js:96-103`) with no scheme check, and
      `src/pages/Profile.tsx:501` renders it as `<a href={user.website}>` — a
      `javascript:` URL is stored XSS for anyone who clicks it. The guestbook already
      has the right helper (`sanitizeWebsite` in `routes/guestbook.js:50-65`); reuse
      it here. The same route also accepts arbitrary `avatar`/`banner` strings, so a
      user can point their avatar at any remote URL (visitor IP leak to a third party).
- [ ] **Vulnerable dependencies.** `npm audit --production`:
  - Backend (5 high, 1 moderate, 1 low): `sharp` (libvips CVE-2026-33327/33328/35590/35591
    — directly in the path of every user-uploaded image), `multer` (DoS via deeply
    nested field names + incomplete cleanup of aborted uploads), `socket.io-parser`
    (zero-attachment memory exhaustion), `axios` (ReDoS), `form-data` (CRLF
    injection), `qs`, `body-parser`.
  - Frontend (5 high, 36 moderate, 1 low): `vite`, `postcss`, `nanoid`,
    `immutable`, `socket.io-parser`, and the `@tiptap/core` `mergeAttributes()`
    `__proto__` advisory — which matters here specifically, because
    `src/parts/Post.tsx` renders untrusted post content through `mergeAttributes`
    with custom `parseHTML` attribute handlers.
  - All are marked `fixAvailable`. Upgrade, then re-run both audits.

## 🟡 Medium

- [ ] **No security headers at all** — `helmet` is not installed and nothing sets
      them by hand. Missing `X-Content-Type-Options: nosniff` (which would blunt the
      `/images` upload issue above), CSP, HSTS, `X-Frame-Options`/`frame-ancestors`,
      and `Referrer-Policy`. Add `helmet` in `registerMiddlewares` (`app.js:157`) and
      set `Content-Disposition: attachment` + `nosniff` on the user-upload static
      mounts specifically.
- [ ] **Rate limiting exists only for arena fights.** `lib/arena-fight-guard.js` is
      the only limiter in the codebase — login, `POST /me`, comments, guestbook,
      uploads, follows and the whole TCG surface are unmetered. Add a global
      `express-rate-limit` baseline plus tighter buckets on the write endpoints.
- [ ] **The WebSocket fight limiter shares one global bucket.** `app.js` calls
      `checkArenaFightRateLimit(null, userId)` with `req === null`, so
      `normalizeIp` (`lib/arena-fight-guard.js:33`) returns the literal `"ws"` and
      every socket user lands on the key `fight:ip:ws` — a 30-fights-per-minute
      ceiling shared across the entire server. One player can lock every other
      player out of fighting. Either pass the socket's address through or skip the
      `ip` window when there is no request.
- [ ] **`trust proxy` is never configured.** Nothing calls `app.set("trust proxy", …)`,
      so behind nginx/Cloudflare `req.ip` is the proxy for every visitor. IP-scoped
      rate limiting collapses into a single bucket, and Turnstile's `remoteip`
      (`lib/turnstile.js:15-18`) only works because of its `cf-connecting-ip`
      fallback. Set it to the actual hop count.
- [ ] **`localhost` origins are allowlisted in production CORS.** Both the HTTP
      allowlist (`app.js:46-54`) and the Socket.IO config
      (`lib/websocket-server.js:130-137`) hardcode `http://localhost:5173` and
      `http://127.0.0.1:5173` alongside `credentials: true`. A page served from a
      local dev server on a victim's machine can make credentialed calls to the
      production API and read the responses. Gate the localhost entries behind a
      dev-only env check.
- [ ] **OAuth `state` carries the redirect origin instead of a CSRF nonce.**
      `routes/auth.js:409-415` sets `state: frontendOrigin`, and the callback only
      reads it back as a destination — there is no per-request random value bound to
      the user's session, so Discord login CSRF (forcing a victim into the attacker's
      account) is possible. Generate a nonce, store it in the existing
      `oauth_frontend_origin` cookie alongside the origin, and verify it on callback.
- [ ] **`resolveFrontendOrigin` accepts any localhost origin.**
      `routes/auth.js:170-181` returns `requested.origin` for *any* hostname that
      `isLocalhostHost` matches, on any port, in production. Restrict to the
      configured frontend origin unless running in dev.
- [ ] **`GET /images/list` enumerates every uploaded file, unauthenticated.**
      `routes/images.js:41-55` returns the filename, size and mtime of everything in
      `IMAGES_DIR` — every user's avatar and banner, every blog image, including any
      that were meant to be unlisted. Require owner auth or drop the route.
- [ ] **Security state is in-process memory.** Rate-limit counters
      (`arena-fight-guard.js`), Turnstile verification (`arena-fight-verification.js`)
      and WS handshake tokens (`websocket-server.js`) all live in `Map`s, so a restart
      clears every limit and a second instance would not share them. Fine for a single
      node today; note it as a constraint before scaling out.
- [ ] **`GET /user/:id/stats` reads every row in `posts` per request.**
      `routes/auth.js:568-576` pulls all `likes`/`comments` blobs and counts in JS —
      an unauthenticated, uncached amplification endpoint. Denormalize the counts or
      cache them.

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
