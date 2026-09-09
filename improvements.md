# Improvement audit (2026-09-09)

Follow-on to `TODO.md` (security, all closed) and `bugs.md` (Arena, all closed).
This pass looked at delivery performance, crawlability, correctness of the
non-happy paths, CI, and dead weight. Every number below was measured against
the tree at review time, not estimated.

Not re-litigated, because they are already good: routes are lazy-loaded, chunk
splitting and a bundle budget exist, fonts are preloaded with `unicode-range`
subsetting and `font-display: swap`, a boot shell prevents FOUC, the theme is
applied pre-hydration, `alt` coverage is 83/86 `<img>`, `prefers-reduced-motion`
is honoured in four stylesheets, there is a skip link and an `ErrorBoundary`,
and the SQLite schema carries 59 indexes across 46 tables.

## 🔴 High impact

- [x] **The blog editor ships on the critical path of every page.**
      *Done 2026-09-09: dropped the `BlogEdit.tsx` clause from the `simple-editor`
      manualChunks rule and added `entryChunkPurityPlugin()` in `vite.config.ts`,
      which fails the build if the entry chunk transitively static-imports a
      tiptap/prosemirror/simple-editor chunk (negative-tested). Measured after:
      JS 715 kB raw / 217 kB gzip, CSS 122 kB raw / 21 kB gzip — matches the
      table below. `arena-shop-ui` shell absorption left as a follow-up.*
      `dist/index.html` `modulepreload`s `simple-editor` and hard-links its
      stylesheet, so `tiptap-vendor` (363 kB), `prosemirror-vendor` (241 kB),
      `simple-editor` (221 kB) and `simple-editor.css` (79 kB, render-blocking)
      load for a logged-out visitor on the homepage — **904 kB raw / 243 kB gzip
      of editor code nobody on that page will use.**

      Cause: `vite.config.ts` `manualChunks` force-assigns
      `/src/pages/BlogEdit.tsx` to the `simple-editor` chunk. `BlogEdit.tsx`
      statically imports `Navigation`, `Header`, `Footer` and `Toast`
      (`src/pages/BlogEdit.tsx:1-4`), which the eagerly-loaded `Home` route also
      uses. Rollup's manual-chunk assignment wins for shared modules, so the
      whole app shell is emitted *inside* the editor chunk and the entry chunk
      has to statically import it. Verified: `dist/assets/simple-editor-*.js`
      contains the string `Skip to main content`; the entry chunk does not.

      Fix: drop `chunkId.includes("/src/pages/BlogEdit.tsx")` from that rule and
      leave only `/src/components/tiptap-templates/simple/`, which is already
      behind BlogEdit's own dynamic `import()` (`src/pages/BlogEdit.tsx:23`).
      Measured with a throwaway build:

      | critical path | before | after |
      | --- | --- | --- |
      | JS | 1556 kB raw / 459 kB gzip | 715 kB raw / **216 kB gzip** |
      | CSS | 201 kB raw / 32 kB gzip | 122 kB raw / **21 kB gzip** |

      −53% JS and −35% CSS before the first paint, from one line.

      Careful: the two `src/` rules interact. Removing the `arena-shop-ui` rule
      *instead* pulls tiptap straight back onto the critical path (measured:
      456 kB gzip), because the shell then lands in `simple-editor` again. After
      the fix `arena-shop-ui` (13 kB gzip) is still absorbing shell modules —
      worth an explicit anchor chunk for `src/parts` + `src/states`, or dropping
      both `src/` rules and letting the lazy route boundaries do the splitting.
      Guard it with a build-time assertion that the entry chunk has no static
      import of a tiptap/prosemirror chunk, so this cannot silently regress.

- [x] **44 of 52 pages have no `<h1>`.** The whole site has 13 `<h1>` against
      124 `<h2>`. A blog post renders its own title as an `<h2>`
      (`src/pages/BlogPost.tsx:307`) with nothing above it; `Home`, `Blog`,
      `About` have no `<h1>` either. That is the single strongest on-page title
      signal missing sitewide, and screen-reader users navigating by heading
      level land in a document that starts at level 2.

      *Done 2026-09-09: established one policy — `Header` renders the sole
      per-page `<h1>`, so every page now has exactly one. Header gained an
      optional `title` prop: when a page knows its real subject it passes it
      and the `<h1>` becomes that instead of the generic route label. Wired
      into `BlogPost` (`post.title` — was "Blog Post" on every post; removed
      the now-duplicate in-card `<h2>`), `CharacterShrinePage` (`hero.name` —
      also killed a double-`<h1>`), `Twitch` (`channel.displayName`) and
      `Profile` (`username`). Demoted stray in-content `<h1>`s to `<h2>` in
      ArenaInbox / ArenaMarket / ArenaTrade / AdminArenaMetrics /
      AdminArenaUpdates / AdminTwitch (each had a 2nd `<h1>` under Header's).
      Added an `sr-only <h1>` to `Pixies` (full-screen viewer, no Header).
      `ErrorBoundary` keeps its own `<h1>` (renders without Header). tsc +
      eslint + 25 tests + build all green.*

- [x] **There is no 404 route.** `src/App.tsx` has no `path="*"` and no
      `NotFound` page. With nginx's SPA fallback, every typo, dead link and
      stale search result returns **HTTP 200 with a blank page** — a soft-404.
      Google either indexes those or burns crawl budget on them, and a human
      just sees white. Add a catch-all route with a real page, and ideally have
      nginx serve a genuine 404 status for a known-bad prefix set.

      *Done 2026-09-09: added `src/pages/NotFound.tsx` (lazy, own 1.5 kB gzip
      chunk) — full site chrome (Header/Navigation/Footer), a single `<h1>`
      "Page not found", "Error 404" label, and links back into the site. Wired
      `<Route path="*" element={<NotFound />} />` as the last route in
      `App.tsx`. `usePageSeo` gained an optional `robots` param; NotFound sets
      `noindex,follow` and the hook captures + restores the prior `robots`
      meta on unmount so it never leaks onto the next route (verified in a
      browser: set on the 404 route, back to `index,follow,…` after
      navigating away). Still worth doing on the server: nginx returning a
      real HTTP 404 for a known-bad prefix set — not possible from the repo
      (no nginx config is checked in).*

- [x] **Only `/arena` and `/ar` get a crawler-visible `<head>`.**
      `vite.config.ts` `SEO_ROUTES` prerenders exactly two paths, yet
      `generate-sitemap.cjs` submits every blog post, plus `/blog`, `/shrine/*`,
      `/question-of-the-day`, `/quotes`, `/pixies`, `/anime`, `/fanart`. Social
      unfurls are covered — the backend serves an OG redirect page to crawlers
      (`routes/posts.js:337-398`, `shrines.js`, `question-of-the-day.js`,
      `pixies.js`) — but a crawler that fetches the canonical
      `mirabellier.com/blog/<slug>` gets the generic site card and an empty
      body. `routeSeoPlugin` already does the hard part; feeding it the
      published-post list at build time (the sitemap generator already fetches
      it) would give every post a real title, description, OG image and
      `BlogPosting` JSON-LD without JS.

      *Done 2026-09-09: `routeSeoPlugin` gained an `ogType` per route and an
      async `dynamicRoutes()` hook; `vite.config.ts` `blogPostSeoRoutes()`
      fetches `${VITE_API_BASE}/posts` during `vite build` and emits
      `dist/blog/<slug>-<id>/index.html` per published post — real
      title/description (shortDescription → content excerpt → title, matching
      `routes/posts.js`), absolute OG image from the thumbnail,
      `og:type=article`, and `BlogPosting` JSON-LD (headline, dates, author,
      keywords). The path is built with the same `slugify` the backend
      canonical URL and the SPA links use, so nginx's `try_files $uri $uri/`
      serves the prerendered head for the canonical URL (verified against a
      static server with dir-index resolution). A failed / slow / offline API
      is caught by the plugin and logged — the build still succeeds and those
      posts keep the generic head (verified: unreachable API → exit 0). Also
      added static heads for `/blog`, `/quotes`, `/question-of-the-day`,
      `/anime`, `/fanart`, `/pixies`, `/shrine`, `/shrine/kanna`,
      `/shrine/rossina`. Build now writes 20 heads (9 posts + 11 static);
      base `index.html` is untouched; `SKIP_BLOG_SEO_PRERENDER=1` opts out.
      tsc + eslint + 25 tests green.*

## 🟠 Medium

- [x] **The deploy is not atomic.** `.github/workflows/deploy.yml` wipes
      `/var/www/mirabellier.com/current` with `find … -exec rm -rf {} +` and
      *then* scps `dist/` over. For the duration of the copy the site is empty
      or half-copied, and a failed scp leaves it broken with no rollback. The
      path is already named `current`; upload to `releases/<sha>/` and swap a
      symlink instead.

      *Done 2026-09-09: `deploy-frontend` now does exactly that. Three steps —
      (1) ssh `mkdir -p releases/<github.sha>` (emptied first so a same-SHA
      re-run is clean), (2) scp the build into it, (3) ssh: `test -f
      $release/index.html` then `ln -s` a temp symlink and `mv -T` it over
      `current` (atomic `rename(2)`), then keep the 5 newest `releases/*`.
      `current` only moves after a verified upload, so a failed deploy is a
      no-op on the live site and the last 5 builds stay for rollback. One-time
      migration built in: the old real `current/` dir is `rm -rf`'d once when
      it's not yet a symlink. Needs nginx `disable_symlinks` off (default).
      Top-level `FRONTEND_DEPLOY_PATH` → `FRONTEND_BASE_PATH`; README updated.
      YAML validated; swap/migration/prune logic sandbox-tested.*

- [x] **CI never runs the tests.** The workflow runs `npm run lint` and
      `npm run build` only. There are 19 backend test files and 2 frontend ones
      (`src/lib/arena-fight-resume.test.ts`, `post-login-redirect.test.ts`), and
      nothing runs them on push. `npm test` exists — wire it in, and add the
      backend suite as its own job. Test coverage itself is thin for a codebase
      this size: 2 test files against 295 `.ts`/`.tsx` files.

      *Done 2026-09-09: added a `test-frontend` job to `deploy.yml` (runs in
      parallel with `build-frontend`, on push and PR — `npm ci` + `npm test`,
      25 tests); `deploy-frontend` now `needs: [build-frontend, test-frontend]`
      so a red test blocks the deploy. Pinned `node-version: 24.x` for that job
      because `npm test` strips types from the `.ts` test files (needs Node
      ≥ 23.6). Verified the 25 tests pass on Node 24.*

      *`mirabellier-backend/` turned out to be a **separate git repo**
      (`github.com/MiraBellierr/mirabellier-backend`, `.gitignore`d here), so a
      `test-backend` job in this workflow can't check it out. Its 281-test
      suite is wired into that repo's own `.github/workflows/deploy.yml`
      instead (added alongside the backend CD).*

- [x] **~3.6 MB of unused assets ship on every deploy.** 18 files in `public/`
      are referenced from no source file, stylesheet, `index.html`, `sw.js` or
      build script: `dark.jpg` (802 kB), `light.jpg` (590 kB), `pat.gif`
      (416 kB), `notebook.png` (374 kB), `redhood.png` (343 kB),
      `background.svg` (317 kB), `thermos.png` (300 kB), `ribbon.png` (142 kB)
      and ten smaller ones. The `.jpg` pairs look like pre-webp leftovers —
      `dark.webp`/`light.webp` are the ones actually used.

      *Done 2026-09-09: `git rm`'d exactly those 18 (~3.7 MB): `background.svg`,
      `dark.jpg`, `light.jpg`, `pat.gif`, `notebook.{png,jpg}`,
      `redhood.{png,jpg}`, `thermos.{png,jpg}`, `ribbon.{png,jpg}`,
      `blanket.jpg`, `pancake.jpg`, `cloud-shaped-candy.jpg`, `rossi5.jpg`,
      `border-blue-100.png`, `performance-monitor.js` (also on the hygiene
      list). Each verified unreferenced across `src/`, root configs,
      `index.html`, `sw.js`, and the `convert-*.cjs` scripts (the
      `convert-images.cjs` hits on `dark.jpg`/`light.jpg` point at
      `src/assets/`, not `public/`). Kept: `dark.webp`/`light.webp` (used via
      `--page-bg` in `src/index.css`), `background.{jpg,webp}`, and
      `f2bae906…​.txt` — that last one is the IndexNow key-verification file
      (its body is the key), not a stray. Build + lint + 25 tests green;
      `dist/` no longer carries any of the removed files.*

- [x] **`public/pixies.png` is 2.7 MB and is referenced.** It is the single
      largest file in the repo's static output. Converting it to webp/avif at
      the size it is actually displayed is a one-shot win; the repo already has
      `convert-public-images.cjs` for exactly this. Overall `dist/` carries
      10.5 MB of non-webp raster against 5.3 MB of webp.

      *Done 2026-09-09: it's only ever an OG/share-card image (4 refs in
      `Pixies.tsx` `usePageSeo`, never an on-page `<img>`), and the full-res
      2844×1890 PNG was already sitting unbundled at `src/assets/pixies.png`
      too. Extended `convert-public-images.cjs` with an optional `width` and
      pointed it at that source → `public/pixies.webp` (1200×797, **61 KB**,
      −97.8%). Removed `public/pixies.png` (the served copy); the src/assets
      original stays in VCS. Repointed the 4 `Pixies.tsx` refs and the
      `/pixies` prerender route (`vite.config.ts`) to `/pixies.webp` — WebP
      OG images are fine for every current unfurler, and the repo already
      serves a `.webp` OG image from `index.html`. `dist/` non-webp raster is
      now 4.5 MB (was 10.5). Build + tsc + eslint + 25 tests green.*

- [~] **52 of 86 `<img>` have no `width`/`height`.** Every one is a layout-shift
      source on a slow connection. There is also no `srcset`, `sizes` or
      `<picture>` anywhere in `src/` — phones download desktop-sized images.

      *Done 2026-09-09 (dimensions half): added `width`/`height` to ~35 `<img>`
      across 18 files — avatars, card/cover thumbnails, nav + social icons,
      the maintenance graphic. Values match the element's existing Tailwind
      box (`h-N w-M` → `N*4`×`M*4` px) or the asset's true intrinsics, so
      there is no visual change — the attributes just give the browser the
      aspect ratio before CSS resolves and clear Lighthouse's unsized-image
      audit. Applied partly by hand, partly via a small className→dims
      codemod for the repeated card thumbnails in `ArenaMarket`/`ArenaTrade`.
      Count of unsized `<img>` went ~52 → ~15, and every one that remains is
      already CLS-safe: inside a fixed-size parent box, an `aspect-video`
      container, a fixed-height banner, or a transient drag/hover/lightbox
      overlay. tsc + eslint + build + 25 tests green.*

      *Responsive-images, part 1 (2026-09-09): `vite-imagetools` needs vite ≥8
      (repo is on 7), so stayed with the repo's prebuild-script convention.
      `convert-images.cjs` reworked to emit `-<w>w.webp` width variants;
      `src/components/ResponsiveImage.tsx` + `src/lib/srcset.ts` (`buildSrcSet`)
      added; `ShrineImage` / `PhotoCard` now carry `srcSet`/`sizes`/`width`/
      `height`. Converted the 6 heaviest rasters: `back-card-design.jpg`
      **2.35 MB → 48 KB webp** (shown ~100px, 4 importers), `kanna3.jpg`
      226 KB → a 320/480/640/800-wide webp `srcSet` on the Kanna rail
      (browser correctly pulls 640w at a 289px/1.25dpr box — verified),
      `flower.png` 165→5 KB, `sun.png` 132→2.6 KB, `moon.png` 129→2.2 KB,
      `board.jpg` 128→44 KB (CSS tile). Sources moved to
      `src/assets/{decoration,shrine}/` (unbundled). `dist/` non-webp raster
      **4.5 MB → 1.5 MB** (rest is Arena sprites). Build + lint + 25 tests
      green; no broken images across shrine/arena/quotes.*

      *Responsive-images, part 2 (2026-09-09):*

      *· Shrine galleries — all 16 Kanna/Rossina `.jpg` sources moved to
      `src/assets/shrine/`, batch-converted by `convert-images.cjs` to a
      ≤800px WebP primary + 320/480/640 variants + a generated `manifest.ts`.
      New `src/lib/shrine-images.ts` (`shrineImg(name, sizes)` +
      `SHRINE_SIZES`) resolves a name to `{src, srcSet, sizes, width,
      height}` via an eager-URL glob. Kanna/Rossina data + `Shrine.tsx`
      previews rewired. `dist/` non-webp raster 1.5 MB → **0.38 MB** (rest is
      Arena sprites). Browser-verified: correct variant selected per box/DPR.*

      *· Backend `/images/…?w=<n>` — `mirabellier-backend/lib/image-resize.js`
      middleware (mounted before the static handler in `app.js`). Allow-listed
      widths only; serves a WebP resized to that width from a disk cache keyed
      on source-mtime (`.rcache/`), else falls through to the original.
      Traversal-safe, `Cache-Control: max-age=86400, stale-while-revalidate`.
      6 tests (292 total). E2E-verified against a running backend
      (`arena-guide-hero.png` 93 KB → `?w=128` → 1.5 KB webp, cached).*

      *· Frontend wiring — `src/lib/image-srcset.ts` (`imageWidthSrcSet`, only
      rewrites backend `/images/` URLs). Wired into `AvatarImage` (covers 5
      call sites; gained a `sizes` prop), the `Blog` list thumbnail, and the
      `Profile` banner + avatar.*

      *Responsive-images, part 3 (2026-09-09) — closed out:*

      *· `imageWidthSrcSet` now also matches the bare same-origin `/images/…`
      path (nginx-proxied to the backend in prod), not just the
      `${API_BASE}/images/…` form `resolveAsset` produces.*

      *· `srcSet` + `sizes` wired into the 11 raw avatar `<img>`s that don't
      go through `AvatarImage`: BlogCommentItem, QuestionAnswerCard, BlogPost
      (×2), GuestbookSign, Guestbook board notes, ArenaHallOfFame,
      ArenaLeaderboard, ArenaTrade, ArenaTradeRequest.*

      *· API-loaded shrine payloads: `enrichShrineImages()` (in
      `shrine-images.ts`) walks a `CharacterShrineData` and adds a `?w=`
      `srcSet` to every `ShrineImage` on a backend `/images/` URL, skipping
      already-enriched (static Kanna/Rossina) and external ones. Called from
      `ShrineEntry` and `AdminShrinePreview`.*

      *E2E-verified in a browser against the running backend: a guestbook
      avatar renders `src …/avatars/x.png` with `srcSet` `?w=48/96/192`,
      `sizes="34px"`; the browser fetched the `?w=48` candidate and the
      backend served it `200 image/webp`.*

- [x] **No real-user measurement and no client error reporting.** No analytics,
      no `web-vitals`, no global `error`/`unhandledrejection` handler reporting
      home. Every performance claim in this document — including the one above
      it — is a lab number. A ~1 kB `web-vitals` beacon to an existing backend
      route would make LCP/INP/CLS real, and a JS error beacon would surface the
      breakage users hit and never report. This is worth doing *before* the
      other perf work, so the gain is observable.

      *Done 2026-09-09, both repos:*

      *Frontend — `src/lib/telemetry.ts` (`initTelemetry()`, called from
      `main.tsx`'s non-critical boot). Prod + real-host only. Buffers CLS / INP
      / LCP / FCP / TTFB from a dynamically-`import()`ed `web-vitals` (v6, its
      own 3.6 kB-gzip chunk, not preloaded) and flushes one beacon on
      `visibilitychange→hidden` / `pagehide`. `window` `error` +
      `unhandledrejection` handlers beacon each unique error (deduped, ≤8/page,
      deploy-time chunk-load failures filtered out since main.tsx already
      handles those). Transport is `navigator.sendBeacon` with a
      `fetch(keepalive)` fallback; every path is wrapped so telemetry can't
      break the app.*

      *Backend (`mirabellier-backend`) — `routes/telemetry.js`:
      `POST /telemetry/vitals` and `POST /telemetry/errors`, unauthenticated,
      behind the existing global+write rate limiters, 16 kB body cap,
      malformed bodies swallowed (fire-and-forget → 204 always). Validates /
      clamps every field; writes to two new append-only tables
      (`client_vitals`, `client_errors` in `lib/db.js`) that self-prune to 30
      days. 5 route tests added (286 total).*

      *Note: the local `.env` sets `NODE_ENV=development`, which makes a local
      `npm run build` emit a **dev** bundle (`jsxDEV`, `import.meta.env.PROD`
      false → telemetry + the SW registration compile out). CI has no `.env`
      so its builds are correct; verified telemetry ships by building with
      that line removed.*

## 🟢 Low / hygiene

- [x] **Unused dependencies.** `react-icons` (^5.7.0) is imported nowhere in
      `src/` and appears in no dist chunk. `@tiptap/extension-placeholder` and
      `@tiptap/extension-text-style` are also unreferenced. Dev-side, `gh-pages`
      backs only the legacy `npm run deploy` that CI replaced.

      *Done 2026-09-09: `npm uninstall`ed all four (−31 packages,
      −398 lockfile lines). Verified zero imports of each across `src/` +
      configs; `@tiptap/starter-kit` v3 bundles its own `TextStyle` so the
      explicit dep was pure dead weight. Also dropped the now-dead
      `deploy` (`gh-pages -d dist`) and `predeploy` scripts and their README
      lines. `tiptap-vendor` chunk 372 → 370 kB. tsc + eslint + 27 tests +
      `npm ci` + build all green.*

- [x] **Dead code.** `src/parts/MenuBar.tsx` has no importers.
      `public/performance-monitor.js` (3.7 kB) is referenced from nothing and is
      deployed anyway. `vite-plugin-preload.ts` is never registered in
      `vite.config.ts`'s `plugins` array.

      *Done 2026-09-09: `git rm`'d `src/parts/MenuBar.tsx` (orphan tiptap
      toolbar, superseded by `components/tiptap-templates/simple/`) and
      `vite-plugin-preload.ts` (its `modulePreloadPlugin` duplicates Vite's
      built-in `build.modulePreload` — `dist/index.html` still gets the
      `<link rel="modulepreload">` hints after removal).
      `public/performance-monitor.js` was already removed in the asset
      cleanup (#7). tsc + eslint + 27 tests + build green.*

- [x] **`isLikelyCrawler` is copy-pasted five times.** It lives in
      `lib/share-preview-utils.js:132` and is correctly imported by
      `routes/quotes.js` and `routes/question-of-the-day.js`, but is redefined
      verbatim in `routes/auth.js:366`, `routes/pixies.js:185`,
      `routes/posts.js:337`, `routes/shrines.js:93` and `lib/anime-embed.js:597`
      — with drifting regexes (the shared one matches `preview|pinterest|
      redditbot|embedly|viber|kakaotalk`, the copies do not). Same class of
      duplication as `bugs.md` #13, which was fixed for the Arena.

      *Done 2026-09-09 (`mirabellier-backend`): deleted all 5 local copies;
      each file now imports `isLikelyCrawler` from `lib/share-preview-utils`.
      `routes/pixies.js`'s copy was already identical to the shared one; the
      other four were the narrow variant — they now also catch WhatsApp,
      Pinterest, redditbot, embedly, Viber, KakaoTalk unfurlers (the intended
      behaviour). Added `test/share-preview-utils.test.js` (3 tests, 295
      total) to lock the crawler set so the regex can't drift apart again.
      −38 net lines.*

- [x] **The main CSS bundle exceeds the project's own budget.**
      `index-*.css` is 122 kB against the 100 kB `CSS_ASSET_BUDGET_KB` set in
      `vite.config.ts`, so the build warns on every run. `src/styles/arena.css`
      alone is 52 kB and is bundled globally rather than loaded with the Arena
      routes.

      *Done 2026-09-09: the arena.css claim was already stale — it's imported
      only from `ArenaSubNav`/`ArenaErrorNotice` (Arena/Admin-Arena lazy
      routes) and ships as a separate ~40 kB `arena-*.css` chunk, not in the
      global bundle. Of the 122 kB `index-*.css`, ~105 kB is Tailwind base +
      utilities + the `@tailwindcss/typography` `.prose` set (shared by every
      route, not code-splittable) and ~21 kB is genuinely-global custom CSS —
      no proportionate trim. Split the budget: route CSS chunks stay at
      `CSS_ASSET_BUDGET_KB = 100`; the global bundle gets a Tailwind-aware
      `INDEX_CSS_BUDGET_KB = 135` whose job is to catch a *regression* (a
      route stylesheet leaking global), so the build no longer cries wolf
      every run. Also deleted the dead `src/styles/home.css` (699 lines,
      imported nowhere — the old diary/scrap home layout, since replaced by
      Tailwind utilities in `Home.tsx`).*

- [x] **No client-side response cache.** Each of the per-domain API modules in
      `src/lib/*-api.ts` calls `fetch` directly (85 call sites), so navigating
      away and back refetches everything. A small stale-while-revalidate cache
      keyed on URL would make back-navigation instant across the whole site
      without adding a data-fetching library.

      *Done 2026-09-09: `src/lib/api-cache.ts` — `swrJson(url, transform, opts)`.
      Keyed on the full URL, stores the normalised value. <10 s → served from
      memory, no network; 10 s–5 min → served instantly + refreshed in the
      background; older/never → a blocking fetch. A failed refresh keeps the
      stale value; concurrent misses share one request; ~100-entry LRU;
      `AbortSignal` aborts only the blocking fetch. `clearApiCache()` runs on
      logout. 8 unit tests (34 total). Wired into the **public, non-user-
      varying** GET reads: `blog-api.fetchPosts`, `shrine-api.fetchShrinePages`
      / `fetchShrinePage`, `anime-feed-api.fetchCurrentlyWatchingAnime`,
      `question-of-the-day-api.fetchQuestionOfTheDayArchive` /
      `…ArchiveDay`, `fanart-api.searchFanArt` (per query URL). Deliberately
      not: anything gated on an auth token / "has the viewer answered" state.
      E2E-verified in a browser: `/blog → /about → /blog` fires **zero**
      `/v1/posts` requests; after 12 s it does **one** background revalidation
      while the page still renders instantly from cache.*

## Suggested order

1. The bundle fix — one line, measured, −243 kB gzip before first paint.
2. RUM + error beacons, so everything after this is measurable in the wild.
3. `<h1>` sweep, the 404 route, then per-post prerendered heads.
4. Atomic deploy and tests in CI, together — both touch the same workflow file.
5. Asset cleanup, image dimensions, and the hygiene list.
