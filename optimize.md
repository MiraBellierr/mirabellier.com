# Mobile Performance Optimization Plan

Investigation of `mirabellier.com` (React 19 + Vite 7 SPA) with a focus on the
mobile experience. Findings are grouped by impact, each with the evidence found
in the codebase and a concrete, low-risk fix. Line references are to the state
of the repo at the time of writing.

> **Status: completed.**
>
> §1 (High impact — image payload), §2 (High impact — always-on work on mobile),
> §3 (Medium impact — paint & composite), §4 (Medium impact — JS boot path) and
> §5 (Low/medium impact — correctness-adjacent) are implemented and verified:
> `tsc -b` clean, 62/62 unit tests passing, lint clean (2 pre-existing
> warnings), production build clean against a `HEAD` baseline. Every section
> below carries a "Done" note describing what actually shipped, the measured
> saving, and any deviation from the original plan.
>
> Two changes in §5 are worth a second look because they alter behaviour rather
> than just cost:
>
> - **§5.4 removes the `!isIOS()` service-worker gate.** The history says it was
>   guarding against stale app-shell caching that the worker no longer does, and
>   iOS was already running the worker via push anyway — but it is still a
>   behaviour change on the platform with no chunk-reload fallback. Revert
>   instructions are in the section.
> - **§5.2 deleted two files** (`use-window-size.ts`, `use-cursor-visibility.ts`)
>   after confirming they were dead code.
>
> **§6 is verified against the live site and its three original items were
> already correct — but the check found a live production incident.**
> Cloudflare had a 404 cached for `index-CGfA6Gsy.css`, the live homepage's only
> stylesheet, so the site was serving unstyled. Root cause: the origin sent
> `Cache-Control: immutable` on 404 responses because the cacheable `location`
> blocks used `add_header ... always`. **Fully resolved in three steps**: the
> edge entry was purged (stylesheet returns `200`, all 129 referenced assets
> verified), the nginx config was changed on the VPS so 404s no longer carry a
> long-lived header, and Cloudflare's Browser Cache TTL was lowered so 404s now
> carry no `Cache-Control` at all. Details in **§6.1**.
>
> Deliberately **not** done, so this is not read as a blanket "everything was
> fixed":
>
> - §6.1's Cloudflare *edge* TTL still stores 404s for CF's default lifetime
>   (edge TTL is a separate setting and was left alone — bounded and invisible
>   to the browser).
> - §1.1 lever 2 (320 px `<picture>` variants) was **skipped on purpose**: at
>   2x DPR the existing 440 px files are correctly sized, so it would trade
>   sharpness on most phones for a 1x-only saving.
> - §4.3 concludes "do not spend effort here" — the original typography-CSS
>   hypothesis in that section was measured and disproved.

---

## 0. Current state (measured)

Build output in `dist/` at investigation time:

| Asset | Raw | Gzip |
|---|---|---|
| `tiptap-vendor-*.js` | 370 kB | **111 kB** |
| `prosemirror-vendor-*.js` | 247 kB | **76 kB** |
| `react-vendor-*.js` | 193 kB | **60.6 kB** |
| `vendor-*.js` (catch-all) | 90.7 kB | **35.9 kB** |
| `index-*.js` (entry) | 93.6 kB | **33.4 kB** |
| `simple-editor-*.js` | 179 kB | **37 kB** |
| `ui-vendor-*.js` (radix/floating-ui) | 99.5 kB | **32.9 kB** |
| `index-*.css` (global, mostly Tailwind) | 129 kB | **22.2 kB** |
| `Pixies-*.js` (largest route) | 101 kB | **21.8 kB** |
| `index-*.js` (shared `index-B9Xc5ltg` async) | 42.7 kB | **13.3 kB** |
| All JS in `dist/assets` | 3.05 MB | — |
| All WebP in `dist/assets` | 5.62 MB | — |

Notes from the code:

- Every route except `Home` is `React.lazy` (`src/App.tsx:6-74`) — good.
- `react-vendor` + `vendor` + `index.css` are the **only** resources
  `modulepreload`ed on first paint (`dist/index.html:330-333`). The
  editor stack is correctly kept out of the entry chunk by
  `entryChunkPurityPlugin` (`vite.config.ts:419-449`) and the dynamic socket
  import (`src/lib/websocket.ts:16-27`).
- `initTelemetry()` is already deferred to `load` (`src/main.tsx:143-158`) and
  `web-vitals` is its own async chunk (`vite.config.ts:519-524`) — good.
- The custom cursor is already off by default on coarse pointers
  (`src/states/CursorContext.tsx:48-65`) and only mounts after `load` + 1.5 s
  (`src/App.tsx:105-127`) — good.

So the remaining mobile cost is mostly **image bytes**, **paint/composite work
that is not gated on mobile**, and **a handful of always-on timers and
listeners**. The sections below are ordered by expected win per effort.

---

## 1. High impact — image payload

### 1.1 Animated WebP stickers are the single biggest mobile download

`src/assets/anime/*.webp` are animated WebPs of 80–380 kB **each** and 17 of
them are imported by lazy routes:

| File | Size | Used by |
|---|---|---|
| `kanna-smile.webp` | 377 kB | `Arena` (side rail, `Arena.tsx:257`), `Uses`, `QuestionArchiveDay` |
| `kanna-shy.webp` | 343 kB | `NotFound`, `Guestbook` (`Guestbook.tsx:780`) |
| `anime1.webp` | 307 kB | `Now` (`Now.tsx:404`) |
| `kanna-eating.webp` | 294 kB | `Blog` (empty-state, `Blog.tsx:294`) |
| `miss-kobayashi.webp` | 292 kB | `BlogEdit` (`BlogEdit.tsx:286`) |
| `anime3.webp` | 286 kB | `Anime` (`Anime.tsx:308`) |
| `kanna-happy.webp` | 258 kB | `Blog` (`Blog.tsx:554`), `BlogPost` (`BlogPost.tsx:683`) |
| `anime5.webp` | 249 kB | `Links` (`Links.tsx:265`) |
| `kobayashi-maid-dragon.webp` | 163 kB | `Profile` |
| `anime6.webp` | 129 kB | `Stats` |
| `kanna-wink.webp` | 124 kB | `Projects` |
| `anime2.webp` | 122 kB | `Changelog` |
| `kanna-kobayashi-lite.webp` | 117 kB | `Home` hero animated upgrade |
| `kanna-right.webp` | 108 kB | `Shrine`, `QuestionArchive` |
| `kanna-police.webp` | 104 kB | 6 Admin pages, `PixieUpload`, `Settings` |
| `anime4.webp` | 81 kB | `Quotes` |
| `kanna-kobayashi.webp` | 236 kB | (not imported anywhere in `src/`; likely dead — verify before deleting) |

`optimize-anime-gifs.cjs` currently caps these at `MAX_WIDTH = 440`,
`TARGET_FPS = 12`, `QUALITY = 55`. A dry run shows the encoder is already at
its budget: `node optimize-anime-gifs.cjs --dry-run` reports **3591 kB →
3556 kB (1 % saving)**, i.e. the 440 px/12 fps/55-quality setting is saturated
and simply re-running the optimizer will not help.

I benchmarked a 320 px re-encode with sharp in this repo:

```
kanna-smile.webp   377 kB -> 320px  251 kB  (33% smaller)  src 440x367
kanna-shy.webp     343 kB -> 320px  231 kB  (33% smaller)  src 440x436
anime1.webp        306 kB -> 320px  198 kB  (35% smaller)  src 440x247
```

So width alone buys ~33 %, and only for 1x-DPR devices. Note that the current
440 px width is actually **well matched to 2x displays** at the sizes these
render (`Home.tsx:584` `w-[200px] sm:w-[240px]`; `Anime.tsx:306`
`max-w-[220px]`; `Arena.tsx:256` `max-w-[320px]`): a 240 CSS px slot at 2x DPR
wants ~480 device px. Do not blindly downscale — that trades bytes for
softness on the displays most phones have.

Better levers, in order:

1. **Don't autoplay decorative animation on mobile at all.** Extract frame 0
   from each sticker as a static WebP (a few kB) and gate the animated source
   behind `(min-width: 1024px)` + `prefers-reduced-motion: no-preference`,
   exactly the pattern `Home.tsx:262-268,554-593` already uses for its hero
   (`DeferredAnimatedImage` with a poster fallback). On a phone this removes
   the entire 80–377 kB per page rather than 33 % of it, and these are
   decorative (`aria-hidden` on `Anime.tsx:312`) or below the fold.
2. **Serve 320 px variants via `<picture>` for 1x/1.5x DPR only** (33 %
   saving on those devices, no change for 2x).
3. **Honour `Save-Data` / `effectiveType`.** `navigator.connection` is already
   read for telemetry (`src/lib/telemetry.ts:42-53`); reuse that to serve the
   static frame on slow connections.
4. **Reuse one asset across routes.** `kanna-smile.webp` is pulled by three
   routes and `kanna-shy.webp` by two. They are fingerprinted once in
   `dist/assets` and cached by the browser/SW, but each *first* visit to any
   of those routes still pays the full 340–380 kB.

**Done (lever 1 + 3).** `optimize-anime-gifs.cjs` now also writes a
`<name>-poster.webp` still (frame 0, same intrinsic size) next to each
animation — 14 posters, **135 kB total** for what was 3.5 MB of animation.
`src/components/AnimeSticker.tsx` + `src/hooks/use-animation-allowed.ts` +
`src/lib/animation-gate.ts` render the still unless the viewport is ≥1024px,
motion is allowed, and neither `saveData` nor a 2G `effectiveType` is set. All
27 animated-sticker call sites across 25 pages were converted from `<img>` to
`<AnimeSticker>`.

The gate is a pure function (`shouldAllowAnimation`) with 6 unit tests in
`src/lib/animation-gate.test.ts`, and the media-query listener is shared by all
stickers on a page rather than one per sticker.

Lever 2 (320 px `<picture>` variants) was **not** taken: at 2x DPR the current
440 px files are correctly sized, so downscaling would soften the stickers on
the displays most phones have, for a 33 % saving on 1x only. Lever 4 is
unchanged.

Measured per-route animation bytes now avoided on mobile:

| Route | Was | Now (poster) |
|---|---|---|
| `/anime` | 281 kB | 8.4 kB |
| `/now` | 305 kB | 14.9 kB |
| `/blog` | 260 kB (`kanna-happy`) | 10.7 kB |
| `/arena` | 375 kB | 12.7 kB |
| `/guestbook` | 343 kB | 13.4 kB |
| `/question-of-the-day/archive/:d` | 375 kB | 12.7 kB |
| `/uses` | 375 kB | 12.7 kB |

### 1.2 `src/lib/seo.ts`-driven route splits don't split `simple-editor.css`

Not a mobile-only issue, but on mobile it matters more: `simple-editor.css`
(71.5 kB raw / 9.5 kB gz) and `arena.css` (38.7 kB raw / 8.3 kB gz) are route
chunks, which is correct. No change needed — recorded so nobody "fixes" it by
hoisting them into `index.css`.

### 1.3 Background image is a full-viewport fixed layer

`Home.tsx:364-367` (and ~60 other pages — every page has the same wrapper,
e.g. `About.tsx:212`, `Blog.tsx:254`, `TcgMatch.tsx:39`) renders:

```html
<div class="flex flex-1 flex-col bg-cover bg-no-repeat bg-fixed"
     style="background-image: var(--page-bg)">
```

with `background-attachment: fixed !important` forced in
`src/index.css:657-662` and again inline in `index.html:194-203`. On mobile,
`background-attachment: fixed` is a well-known scroll-jank source: it forces
the compositor to repaint the whole background layer on every scroll frame
(some Android WebViews and older iOS Safari repaint on the main thread). The
images are 50 kB (`light.webp`) / 25 kB (`dark.webp`), so the *download* is
fine; the *paint* is the problem.

Fix: on `(hover: none) and (pointer: coarse)`, replace the fixed attachment
with a fixed-position `::before` layer (`position: fixed; inset: 0; z-index:
-1`) and drop `background-attachment: fixed`. Same visual, zero per-frame
background repaint. Keep the desktop path untouched.

**Done.** Added to `src/index.css` (after the existing
`background-attachment: fixed` block) and mirrored in the inline critical CSS
in `index.html` so the boot shell doesn't jank pre-hydration. Verified present
in the built `index-*.css` as
`@media(hover:none)and (pointer:coarse){…[style*="var(--page-bg)"]:before{…}}`.

One caveat worth re-checking on a real phone: `z-index: -1` on a `::before`
requires the ancestor stacking context to not paint a background over it. On
these pages the wrapper's background is cleared in the same rule, so the
gradient in `:root`/`.dark` (`--page-bg` fallback, `index.css:191-198`) shows
through — which is the intended fallback while the image loads.

### 1.4 Oversized decoration assets

Benchmarked with sharp against the actual repo assets:

| Asset | Current | Rendered as | Re-encoded | Saving |
|---|---|---|---|---|
| `public/img/grain.webp` | 500×500 / 58 kB | `background-size: 200px` (`arena.css:70`) | 256×256 → **5.4 kB** | ~52 kB |
| `public/pin.png` | 499×499 / 51 kB | 80×80 slot (`guestbook.css:410`) | 160×160 WebP → **2.1 kB** | ~49 kB |

Both are ~10× larger than any display size needs and are decoded per use
(once per arena card layer, once per guestbook pin). Re-emitting them in
`convert-public-images.cjs` removes ~100 kB and two large decodes.

**Done.** `convert-public-images.cjs` now re-emits `img/grain.webp` at 256 px
(58 kB → **5.4 kB**) and `pin.png` as `pin.webp` at 160 px (51 kB → **2.1 kB**,
transparency preserved). The guestbook CSS now points at `/pin.webp` and
`public/pin.png` is deleted. `convertImages` was changed to read its input
into memory first, because `img/grain.webp` is written back over itself and on
Windows sharp holds the source path open for the pipeline's lifetime (the same
workaround `optimize-anime-gifs.cjs` already documents).

`public/board.webp` is a separate case: it is 480×320 / 44 kB but drawn at
`1199px × 678px` (`guestbook.css:338,629`), i.e. it is already *upscaled* —
so the bytes are not the problem, the softness is. It is also the least
valuable to change; leave it unless the board looks blurry on a large screen.

### 1.5 Shrine pages ship ~3 MB of images

`src/assets/shrine/` is 3.17 MB (both source JPGs and generated WebPs).
`convert-images.cjs` already emits 320/480/640 variants and
`shrineImg()` (`src/lib/shrine-images.ts:37-61`) wires up `srcSet` with
`sizes` from `SHRINE_SIZES`, so the *selection* is right. One gap:

- `src/pages/Rossina.tsx:223,228` referenced `/rossi-oa1.webp` and
  `/rossi-oa2.webp` directly from `public/` (68 kB and 70 kB) with **no
  `srcSet`** and no `width`/`height` — they were full-size on mobile and
  contribute CLS (`ShrineImage.width`/`height` are optional at
  `CharacterShrinePage.tsx:11-21`, so nothing forces the caller to provide
  them).

Fix: move the two `rossi-oa*.webp` into `src/assets/shrine/` so they go through
`convert-images.cjs`.

**Done.** `rossi-oa1/2` were converted to high-quality JPEG masters at
`src/assets/shrine/rossi-oa1.jpg` / `rossi-oa2.jpg`, `node convert-images.cjs`
regenerated their 320/480/640 variants plus `manifest.ts` (19 images now), and
`Rossina.tsx` uses `shrineImg(..., SHRINE_SIZES.gallery)` exactly like every
other gallery image. The `public/rossi-oa*.webp` originals are deleted, so
mobile now picks the 320w/480w candidate instead of a fixed 860×336 / 728×409
file.

**Correction to an earlier claim in this doc:** the rail/side `PhotoCard`s do
*not* fetch on mobile. `PhotoCard` defaults to `loading="lazy"`
(`CharacterShrinePage.tsx:107`) and its `hidden lg:flex` / `hidden lg:block`
wrappers (`:248`, `:555`) are `display: none` at mobile widths, so the browser
never starts the request. No change was needed there.

### 1.6 `background.jpg` is 272×272 but used as the fallback `og:image`

Not a runtime cost (crawler-only), but `DEFAULT_OG_IMAGE` in
`vite.config.ts:8` and `vite-plugin-route-seo.ts` fall back to
`/background.jpg`, which is 272×272 / 14.6 kB. Discord/Twitter/iMessage
expect ~1200×630 and will either letterbox or show a tiny card. Low priority
for mobile performance, but it is a one-file fix with an outsized effect on
how every un-prerendered route unfurls.

**Done.** `convert-public-images.cjs` now crops the 4000×2224
`src/assets/background.jpeg` master to a 1200×630 (1.91:1) progressive JPEG at
`public/og-image.jpg` (45 kB). All ten `background.jpg` og references were
switched to it: `index.html` (2), `vite.config.ts`, `src/lib/seo.ts`,
`src/hooks/use-tcg.ts`, `src/pages/BlogPost.tsx`, `NotFound.tsx`,
`Privacy.tsx`, `Terms.tsx`.

`src/pages/Shrine.tsx:119` keeps a `background.*` reference but as a runtime
56×80 listing thumbnail, not an og card; it was switched from
`/background.jpg` to the smaller `/background.webp`.

---

## 2. High impact — always-on work on mobile

### 2.1 `useHoloTilt` runs a `requestAnimationFrame` loop forever

`src/hooks/use-holo-tilt.ts:64-97` starts an unbounded rAF loop whenever
`auto` is true, calling `setStyle()` on **every frame** (React re-render per
frame at 60 fps). This is used in `ArenaPortraitCard` with `auto` set
explicitly in a dozen places:

- `ArenaTrade.tsx:753,944,1318,1409` — `interactive auto` on **every listing
  card** and the hover popover
- `ArenaMarket.tsx:1144` — hover card
- `ArenaFight.tsx:824,846` and `ArenaFightReplay.tsx:260,283` — already
  guarded with `auto={!isMobile}` (`use-mobile.ts`), which is the right
  pattern

On a market/trade page with 20+ listings this is 20+ concurrent rAF loops
each driving a React render, on a phone. Even the pages that guard it do so
with `useIsMobile()`, which initialises to `undefined` and thus `!!isMobile ===
false` on the first render — meaning the auto loop **starts** on mobile for
one tick before the effect corrects it.

Fixes:

1. Default `auto` to `false` on coarse pointers inside `useHoloTilt` itself
   (read `matchMedia("(hover: none), (pointer: coarse)")` once, same predicate
   as `CursorContext.tsx:62-64`). Then no caller can accidentally leave 20
   loops running.
2. Make the tilt **write CSS variables to the node via a ref instead of
   `setStyle`**. `computeTiltStyle` already only produces CSS custom
   properties plus a transform; writing them with `el.style.setProperty` in
   the rAF body removes the React render entirely (the same technique
   `CursorManager` uses at `src/parts/CursorManager.tsx:101-108`).
3. Stop the loop when the card is off-screen with a shared
   `IntersectionObserver`.

**Done — all three levers.** `use-holo-tilt.ts` was rewritten:

1. `auto` is now `options.auto && !reducedMotion && !isCoarsePointer()`, so
   the guard can't be forgotten by a caller and the loop never starts on a
   phone in the first place.
2. Tilt frames are written straight to the node via a ref callback
   (`tiltRef`). `setStyle` is gone; the hook returns `{ tiltRef,
   onPointerMove, onPointerLeave }` and `ArenaPortraitCard` spreads the ref
   onto `.arena-portrait-card__rotator` instead of `style={tiltStyle}`. The
   initial frame still lands in the commit phase (refs run before paint), so
   there is no flash.
3. One shared `IntersectionObserver` (module-level registry, not one observer
   per card) starts/stops the loop as the card enters and leaves the
   viewport.

Two consequences worth knowing:

- The CSS-var contract changed from React `style` to imperative writes, so
  any test or snapshot asserting the old `tiltStyle` object needs updating.
  Nothing in the repo did.
- `ArenaFight` already passed `auto={!isMobile}` explicitly. That is now
  redundant (the hook checks coarse pointers itself) but harmless, and it
  still correctly disables auto on narrow *desktop* windows.

### 2.2 Every visitor pays for `AuthProvider`'s `/me` request

`src/App.tsx:270-305` wraps the whole tree in `AuthProvider` and
`WebSocketProvider`, both of which run on first paint:

- `AuthContext.tsx:33-54` fires `GET /me` with `cache: "no-store"` on mount,
  on every page, for every visitor (including logged-out ones on the
  homepage). This is a cross-origin request
  (`api.mirabellier.com/v1/me`) that competes with the LCP image and first
  route chunk for mobile bandwidth. The `preconnect` hint in
  `src/main.tsx:144` helps the TLS handshake, but the request itself is still
  unconditional and uncacheable.
- `WebSocketProvider.tsx:16` calls `getWebSocketClient()` eagerly; the
  client object is cheap, and the actual socket is only opened when a page
  subscribes (`lib/websocket.ts:197-211`), so this provider is *not* a
  significant cost by itself. `PixiesInbox.tsx:85` (`useWebSocket()`) is what
  triggers a connection, and it is rendered inside `Pixies` only — fine.
  `Anime.tsx:88` and `ArenaSpectate.tsx:93` also connect, as intended.

Fixes:

1. Defer the `/me` fetch until after the first paint (e.g.
   `requestIdleCallback` or a `window.load` listener), or skip it entirely
   until the user opens the account menu / hits a route that needs auth. The
   Header already renders the logged-out login link, so a brief
   "logged-out" state is acceptable: `useOptionalAuth`
   (`src/hooks/use-optional-auth.ts:3-9`) already tolerates a missing/failed
   auth context and `Header.tsx:216-307` branches on `auth?.user`.
2. Cache the `/me` result in `sessionStorage` for the tab session so
   back/forward navigation doesn't re-fetch; revalidate in the background.

(Do *not* simply move `AuthProvider` below `Header` — `useAuth` throws when
the context is absent and only `useOptionalAuth` catches it, so any future
non-optional consumer would break. Deferring the fetch is the safe change.)

**Done — but lever 1 alone was not safe, so the order was inverted.** The plan
assumed a brief logged-out state is harmless. It is not: `BlogEdit.tsx:73-77`
redirects to Discord login whenever `auth.token` is null, so deferring `/me`
would bounce a logged-in user opening the editor straight to OAuth. Several
admin pages and `PixieUpload` have the same shape.

`AuthContext.tsx` therefore does the cache **first** and the deferral second:

1. The `/me` result is cached in `sessionStorage` under
   `mirabellier-auth-cache` with a 5-minute TTL, read once at module scope so
   the `user` and `token` initial states can never disagree. A repeat visit or
   back/forward paints the correct signed-in state synchronously — no flash,
   and no auth-gated redirect.
2. Only when that cache answered does the revalidation move behind
   `requestIdleCallback` (2000 ms timeout, 200 ms `setTimeout` fallback). With
   no cached answer the fetch still runs immediately, because an auth-gated
   route must not render its "not logged in" branch first.
3. `logout()` clears the cache; a failed revalidation writes back `null` so a
   dead session isn't resurrected from cache.

Session storage (not local storage) is deliberate — it dies with the tab, so
a shared browser can't leak one visitor's profile to the next.

### 2.3 Polling timers that never check visibility

Several pages keep intervals running when the tab is backgrounded, which on
mobile means the radio/CPU keeps waking:

- `Anime.tsx:134-136` — 60 s interval, and `visibilitychange` only triggers
  an extra load, never pauses the timer.
- `ArenaSpectate.tsx:57,127` — 5 s list poll + 2 s fight poll.
- `use-tcg.ts:322,329` — 2 s queue poll + 5 s game poll.
- `ArenaFight.tsx:190` — 250 ms `setInterval` updating a countdown element.
- `Twitch.tsx:1250,1302` — 15 s background refresh.
- `ArenaShop.tsx:445` — 1 s countdown.
- `AdminPixies.tsx:83,145` — 1 s tick + 2/8 s polling (admin-only, lower
  priority).

Fix: wrap every poll in a shared `useVisibilityInterval` helper that
clears the interval on `document.hidden` and restarts (with one immediate
refresh) on visible. This is mechanical but touches many files; it is the
single largest battery/CPU win on mobile for users who background the tab.

**Done**, with one site deliberately left alone:

- New `src/lib/visibility-timer.ts` (a `VisibilityTimer` class that
  self-reschedules with `setTimeout` rather than `setInterval` — a paused
  interval still fires its outstanding tick on resume, which is the stale-data
  case this exists to avoid) and `src/hooks/use-visibility-interval.ts`
  (subscribes `visibilitychange`, reads the callback through a ref so callers
  don't have to memoise). 8 unit tests in `src/lib/visibility-timer.test.ts`
  drive it with a fake clock.
- Converted: `Anime` (60 s), `ArenaSpectate` (5 s list + 2 s fight),
  `use-tcg` (2 s queue + 5 s game), `Twitch` (30 s clock, 10 min profile,
  15 s channels/prediction), `ArenaShop` (1 s offer countdown),
  `ArenaTradeRequest` (2 s), `AdminPixies` (2 s/8 s queue poll), and `Home`'s
  clock/status tick (1 s/60 s — local-time display, no network, but a hidden
  homepage has no reason to re-render once a second).
- Each converted site passes `immediate: false` where the old code ran the
  first fetch from its own effect, so the initial load and its error handling
  stayed in one place. `Anime`'s old manual `visibilitychange` listener is
  gone — the hook's refresh-on-visible replaces it.
- **`ArenaFight` was not converted.** Its 250 ms countdown and auto-battle
  loop have an intentional `pagehide`/`pageshow` policy ("keep auto-battle
  alive when switching tabs; only hard page lifecycle exits stop timers",
  `ArenaFight.tsx:203-220`) that is a game-design decision, not an oversight.
  Forcing it to pause on `document.hidden` would change behaviour the code
  comments explicitly promise. Worth revisiting only if the owner wants
  auto-battle to stop on tab switch.
- **`AdminPixies`' 1 s tick was also left running** — it drives an elapsed-time
  clock (`0:42`), so pausing it would make the displayed time wrong rather
  than just stale. Only its fetching poll (2 s/8 s) was converted; that one is
  fine to pause because it refetches the true state on return.

After §2.3 the only `window.setInterval` calls left in `src/` are the two
documented exceptions in `ArenaFight.tsx:190` and `AdminPixies.tsx:86`.

### 2.4 `Blog.tsx` closes its menu on every scroll event

`Blog.tsx:91-102` attaches `window.addEventListener("scroll", onScroll)`
whose body calls `setOpenMenuId(null)` + `setMenuPos(null)`. Even though
React bails out when state is already `null`, the listener still fires on
every scroll frame. Guard with an early return:

```ts
const onScroll = () => {
  if (openMenuId === null) return;
  setOpenMenuId(null); setMenuPos(null);
};
```

(or read the current id from a ref). `BlogPost.tsx:512-525` already rAF-batches
its scroll handler — use that as the pattern.

**Done.** The id is mirrored into `openMenuIdRef` and the shared `closeMenu`
helper returns immediately when no menu is open, so a scroll frame with nothing
open costs one map lookup instead of two `setState` calls. The click/keydown
handlers share the same helper.

### 2.5 `Guestbook` drag re-renders the whole board every mousemove

`Guestbook.tsx:182-211`: `handleMouseMove` calls `setEntries(current =>
current.map(...))` for **every** mouse/touch move while dragging a note. With
many notes on the board this is O(n) reconciliation at pointer frequency.
Since notes are absolutely positioned by transform, the drag position should
be written directly to the dragged node's `style.transform` and only committed
to state on pointer-up (which `persistNotePosition` already does).

**Done.** `handleMouseMove` now writes
`translate(x, y) rotate(rotation)` straight to the dragged node and returns;
the O(n) `setEntries` map is gone from the move path. `handleNoteMouseDown`
captures the node (`event.currentTarget`) and the note's rotation into
`dragRef`. On pointer-up the final position is committed to state once so the
next render agrees with the DOM, then persisted as before.

Two details that make this safe:

- The imperative write leaves the inline `transform` in place on pointer-up.
  React's next style write is byte-identical, so there is no flash; removing
  it first would snap the note back for the frame before the state update
  lands.
- A `useLayoutEffect` re-asserts the in-flight position after any commit that
  happens mid-drag (a websocket push, a parent state change). Without it, an
  unrelated render would repaint the note at its stale committed `x`/`y` and
  it would jump out from under the pointer.

Keyboard moves (`moveNoteByDelta`) still go through state — one event per
keypress is not the hot path, and the existing code persists from there.

---

## 3. Medium impact — paint & composite

### 3.1 `mix-blend-mode` + `filter` stack on every arena card

`src/styles/arena.css:41-99` gives each portrait card:

- `.arena-portrait-card__image` with `filter: brightness(1.15)`
- `.arena-portrait-card__veil` (gradient)
- `.arena-portrait-card__grain` with `mix-blend-mode: overlay`
- `.arena-portrait-card__shine` with `mix-blend-mode: color-dodge` +
  `filter: brightness() contrast() saturate()`
- `.arena-portrait-card__glare` with `mix-blend-mode: overlay`

`mix-blend-mode` forces the browser to composite the card's whole stacking
context off-screen; with 20+ cards on a market/trade page this is expensive on
mobile GPUs. The UR variants (`.arena.css:323-540`) stack **two**
`mix-blend-mode` pseudo-elements plus gradients.

Fix: on coarse pointers, render the static frame only — drop `__grain` and
`__shine` (they are the pointer-tracking layers and are invisible when
`--card-opacity: 0` anyway; make sure the default opacity is honoured) and keep
`__veil` + `__glare` as plain `background-image` gradients without
`mix-blend-mode`.

**Done**, as a CSS-only media query at the **end** of `arena.css`:

- `__grain` and `__shine` are `display: none`.
- `__glare` drops `mix-blend-mode` and `filter` and runs at 35 % of its
  former opacity (it is the only layer that is meaningfully visible at rest,
  and losing it entirely would flatten the portrait).

Three things worth recording:

1. **The block had to go at the end of the file.** The UR-texture rules
   (`.arena.css:330-551`) have equal specificity and come later in source
   order, so an earlier block was silently overridden — the coarse query
   compiled in but `[data-rarity="UR"] .arena-portrait-card__shine
   { display: grid }` re-enabled exactly the most expensive cards. Verified in
   the built CSS that the coarse media query now sits after the UR base.
2. **Rainbow cards are excluded.** `[data-ur-texture="rainbow"]` sets
   `opacity: max(1, var(--card-opacity))` — its shine is a *static* colour
   wash, not a pointer highlight, so hiding it would visibly change every
   minted card. The `:not()` guard keeps it.
3. `__veil` was left alone: it is a plain composited gradient with no blend
   mode, so it costs nothing to keep, and removing it would darken every card.

### 3.2 `will-change: transform` on `.arena-portrait-card__rotator`

`arena.css:171` sets a permanent `will-change: transform` on every rotator,
which promotes every card to its own compositor layer. Combined with 3.1 this
is a lot of GPU memory on a mobile device. `Pixies.tsx:2230-2236` already
documents the exact failure mode ("A permanent `will-change: transform` parks
every slide on its own compositor layer…") and only applies it while dragging
— apply the same approach here: set it on `:hover`/`.is-tilting`, not
statically.

**Done**, but a pure `:hover` rule was not sufficient: the auto-cycling cards
tilt without ever being hovered, so they would have lost their layer hint
mid-animation. The hint is therefore owned by `useHoloTilt`:

- `.arena-portrait-card__rotator` no longer sets `will-change` statically.
- A small `:hover` / `:focus-visible` rule in `arena.css` covers the pointer
  path (the transform follows the cursor directly, with no rAF involved).
- `use-holo-tilt.ts` gained a `setWillChange` helper that the auto-cycle
  effect turns on in `start()` and off in `stop()` (which runs when the card
  scrolls out of view), and that the non-auto pointer settle clears when it
  comes to rest. It deliberately uses `removeProperty` rather than writing
  `will-change: auto`, so the stylesheet's hover rule stays in charge.

Net effect: a card holds a compositor layer only while it is actually moving
or under the pointer — never at rest, which is where 20+ market listings sit.

### 3.3 `backdrop-blur` on modal scrims

17 modal scrims use `backdrop-blur-sm` (28 `backdrop-blur-*` occurrences
across 35 matches total; e.g. `CommandPalette.tsx:171`, `ConfirmDialog.tsx:51`,
`PackOpeningModal.tsx:104`, `ArenaTradeSession.tsx:94`).
A full-viewport backdrop filter forces a full-screen readback+blur per frame
on mobile. These are transient (only while the modal is open) so the impact is
bounded, but if INP on Arena pages is poor, replacing `backdrop-blur-sm` with a
slightly more opaque `bg-white/70` (or `bg-black/60`) scrim removes the blur
with no visual regression on phone screens.

`PixiesInbox.tsx:268` and `Pixies.tsx:2728` are worse: they keep
`backdrop-blur-xl` on an always-visible popover. Drop to a solid background.

**Done**, as one media query in `index.css` rather than 35 JSX edits — a CSS
rule cannot be forgotten by a future call site, and it keeps the desktop look.

The naive version of this (`[class*="backdrop-blur"] { backdrop-filter: none }`)
was rejected after auditing every call site: it would also have flattened the
small translucent overlays sitting *on top of video* (the Pixies search pill at
`bg-white/15`, tag chips at `bg-white/15`, the expanded caption at
`bg-black/45`), where the blur is doing real legibility work rather than
frosting a backdrop. Two categories are dropped instead:

- full-screen scrims — `[class*="backdrop-blur"][class*="fixed"][class*="inset-0"]`;
- near-opaque surfaces — `[class*="/90"]`, `[class*="/95"]`.

I enumerated the JSX to confirm the first selector hits exactly the 19 intended
scrims and no others (no `inset-0.5` false positives). Note this is a substring
match on the class attribute, which is why it is written as three separate
attribute selectors rather than a `.backdrop-blur-sm`-shaped utility match —
Tailwind's class names are stable but its generated selector names are not
something to depend on.

### 3.4 `.dark img { filter: … }` applies to every image

`src/index.css:548-551` applies `filter: saturate(0.95) contrast(0.95)
brightness(0.95)` to *every* `<img>` in dark mode. Filters create a new
stacking context and force off-screen raster for each image. On a dark-mode
phone this re-rasters every photo during scroll. Consider scoping it to
non-animated decorative images, or removing it and baking the adjustment into
the WebP pipeline (the dark variants already exist for backgrounds).

**Done (coarse pointers only).** `.dark img { filter: none }` inside the
coarse-pointer block in `index.css`. The effect is a subtle 5 % tonal shift;
on a phone it costs an off-screen raster per image plus a filter re-run on
every scroll frame, which is a bad trade. Desktop keeps the tint, so nothing
about the desktop dark theme changes.

I did **not** bake the adjustment into the WebP pipeline as the original note
suggested — the filter applies to every `<img>`, including backend-served
card art, avatars and pixie posters that the frontend pipeline never touches,
so there is no single place to move it to. A media query is the honest fix.
(`optimize-anime-gifs.cjs` does not need a dark variant either: animated
stickers now render their still on mobile, and the static still is generated
per-theme-neutral.)

---

## 4. Medium impact — JS boot path

### 4.1 `CommandPalette` is statically imported

`src/parts/CommandPalette.tsx` is the only non-lazy `parts/` import in
`App.tsx:76`. The palette's own component code is ~8.9 kB raw / **~3.9 kB gz**
in the entry chunk (measured from `dist/assets/index-Cd9QQ4CJ.js`), including
its `createPortal` and the static `HEADER_ROUTE_TITLES`-derived items list.

That is real but modest. It is cheap to fix and it also unblocks removing the
`Header.tsx` → `HEADER_ROUTE_TITLES` import from the palette path (the
constant is 3.5 kB of route titles). Making it `React.lazy` + mounting only
when `openCommandPalette` fires is safe: the pub-sub at
`src/lib/command-palette.ts` already exists and `Navigation.tsx:236` is the
only caller.

Expected: ~4 kB gz off the entry chunk, and `HEADER_ROUTE_TITLES` stays in
whatever chunk still references it. Do this only after the bigger wins; it is
not a mobile-first fix.

**Done, with one correction: the saving is ~1 kB gz, not ~4 kB.**

Measured with a clean A/B build (same tree, only these three files swapped):

| | entry chunk | lazy chunk |
|---|---|---|
| before | 96 064 B raw / **34 290 B gz** | — |
| after | 92 975 B raw / **33 258 B gz** | 3 610 B raw / **1 788 B gz** |
| **delta** | **−3 089 B raw / −1 032 B gz** | not downloaded unless opened |

The original ~4 kB estimate conflated the palette component with everything
its module graph happened to pull in — most of that (the search client, the
`createPortal` runtime) was already shared with other entry code, so only the
palette's own 1 kB gz actually left the critical path. Worth doing, but it is
a rounding error next to §1's image savings, and the doc should not have
implied otherwise.

Implementation notes:

- Splitting the trigger from the component was necessary. `CommandPalette`
  owned both the Cmd/Ctrl+K listener *and* the `onOpenCommandPalette`
  subscription, so it could not simply be unmounted lazily. The new
  `CommandPaletteLauncher` (eager, tiny) owns the triggers and mounts the real
  palette on first use.
- The palette became a **controlled** component (`open` + `onClose`). This is
  not cosmetic: the trigger that requests the palette always fires *before*
  the lazily-imported module has evaluated, so a palette that subscribed to the
  pub-sub itself would miss the very first open. The launcher captures the
  request synchronously and passes it down.
- Once mounted the palette stays mounted (it returns `null` while closed), so
  reopening never re-suspends.
- A scrim fallback renders during the first chunk download (gated on `open`,
  so a second Cmd/Ctrl+K during the download closes it again). Without it the
  trigger would appear to do nothing for a round-trip on a slow connection.
- **No idle prefetch of the chunk.** I tried one and removed it: it downloads
  1.8 kB gz for the majority of visitors who never open the palette, which
  cancels out the saving this split exists to win.
- `HEADER_ROUTE_TITLES` did **not** move out of the entry chunk. `Header`
  itself is eager (every page renders it), so the constant stays put; only the
  palette's *use* of it became lazy. The original note's second claim was
  wrong.

### 4.2 `AuthProvider`'s `/me` on the critical path

Covered in 2.2 — restated here because it is a *network* cost, not a CPU one.
On a 3G phone the extra RTT before `Header` settles can be 300–800 ms.

**Done** as part of §2.2 (sessionStorage cache + `requestIdleCallback`
revalidation). The order in that fix had to be inverted from the original plan
— see the §2.2 notes for why (a deferred fetch would bounce logged-in users
off `/blog/edit` to Discord OAuth).

### 4.3 `index.css` — verify before acting

Earlier in this investigation I suspected the global `index-*.css` (126 kB
raw / 22 kB gz) contained the full `@tailwindcss/typography` `.prose` set and
that moving it to blog chunks would save ~20 kB gz. **That is wrong.** Direct
measurement of `dist/assets/index-CGfA6Gsy.css` shows the typography block
(`.prose` → `.prose-blue`) is 12.3 kB raw and compresses to only **1.5 kB of
the 21.8 kB gzip total** (Tailwind's utility set compresses far better than
raw size suggests). The remaining ~20 kB gz is genuinely global custom CSS
plus Tailwind base/utilities that every route uses.

Conclusion: **do not spend effort here.** The `INDEX_CSS_BUDGET_KB = 135`
comment in `vite.config.ts:367-371` is accurate; the budget is a regression
tripwire, not a target. The only real CSS win would be shrinking the 96
`.prose` selectors, which is already tiny in gzip terms.

**Resolved as "no change needed"** — the section is a negative result, kept so
the disproved hypothesis isn't re-litigated. No code was changed for §4.3.

---

## 5. Low/medium impact — correctness-adjacent

### 5.1 `useIsMobile` first render is `undefined` → desktop layout flashes

`src/hooks/use-mobile.ts:4-18` returns `false` until the effect runs. Any
mobile-conditional rendering (e.g. `ArenaFight`'s `auto={!isMobile}`) therefore
starts in the desktop branch, does work, then flips — a wasted first frame and,
for `useHoloTilt`, an actually-started rAF loop. Initialise with
`matchMedia("(max-width: ...)").matches` in the `useState` initialiser.

**Done.** The hook now reads `matchMedia` synchronously in the `useState`
initialiser (returning a real `boolean`, not `undefined`) and derives both the
initial read and the change listener from one `BREAKPOINT_QUERY` helper. The
mount effect re-syncs once, in case the window was resized between the initial
render and the effect.

Behavioural note: the hook now returns `boolean` instead of coercing
`undefined` via `!!`. Callers all treat it as a boolean already, and the
synchronous read means the value is correct on the first render — which is the
point.

### 5.2 `useWindowSize` updates on `visualViewport` scroll

`src/hooks/use-window-size.ts:64-65` subscribes to `visualViewport` `scroll`,
which fires continuously while the URL bar collapses on mobile, each time
calling `setWindowSize` (guarded by equality, so re-renders are rare — but the
listener itself and the layout reads are not free). Only `use-cursor-visibility`
uses this, and only inside the editor; it can be scoped to the editor route
instead of being available app-wide.

**Done — by deletion, because the premise was wrong.** Both
`src/hooks/use-window-size.ts` and its only consumer
`src/hooks/use-cursor-visibility.ts` were **dead code**: nothing in `src/`
imported either one (only `use-cursor-visibility` imported `use-window-size`).
`useCursorVisibility` *was* used by the tiptap editor when it was first added
(commit 43135f3) but the editor no longer calls it. I confirmed nothing else
referenced them and that removing both left `tsc -b` clean.

The original note's suggestion — "scope it to the editor route" — would have
been busywork on a hook that never runs. Deleting is the correct fix, and it
also removes the `visualViewport` scroll listener from the codebase entirely.

### 5.3 `DeferredAnimatedImage` waits 1200 ms after LCP

`src/components/DeferredAnimatedImage.tsx:15` defaults `lcpSettledDelayMs` to
1200 ms and then schedules a `requestIdleCallback` with a 2500 ms timeout. On
mobile the animated hero is only shown on `(min-width: 1024px)`, so this
component never mounts on phones — but if that gate is ever relaxed, note the
double-delay (LCP settle + idle) and the fact that the poster is already the
LCP element.

**Done — the double-delay was not the bug; a double-upgrade race was.**
Investigating this surfaced a real defect rather than the timing concern the
note described:

`scheduleUpgrade()` is reachable from three places — the LCP observer's
settled-timeout, the never-reported-LCP 5 s fallback, and the `load` listener —
and two of them can legitimately fire in the same session. When the LCP path
won, `lcpFallbackTimeoutId` was **never cleared**, so the 5 s fallback fired
anyway, ran `preloadAnimatedImage` a second time, and overwrote
`idleCallbackId`. The consequence was not just a duplicate 100 kB+ image
fetch: the first idle callback was leaked, so `cancelIdleCallback` on unmount
could no longer cancel it and it would fire against an unmounted component.

Fixed with an `upgradeScheduled` latch that makes the first trigger win and
clears the losing fallback timer. `isCancelled` is also checked at the top of
`scheduleUpgrade`, so a timer that fires during teardown is a no-op.

The `lcpSettledDelayMs = 1200` default was left as-is: it is a deliberate
"let LCP finish before touching the network" cushion, and since the hero only
mounts at ≥1024px it never applies to phones.

### 5.4 Service worker registration is skipped on iOS

`src/main.tsx:147-151` skips SW registration on iOS because of the chunk-reload
guard (`main.tsx:73`). That means repeat visits on iPhone do not get the
`/assets/` stale-while-revalidate cache (`public/sw.js:73-106`) that Android
and desktop get — iPhones re-download route chunks on every deploy, and worse,
the SW cache is what makes second visits fast. Worth revisiting the
`SKIP_CHUNK_RELOAD` decision: the reload guard is about stale *entry* chunks;
the SW could still cache fingerprinted assets safely (they are immutable).

**Done — the gate was stale and is removed; `updateViaCache` restored.**

Tracing the history changed the conclusion:

- The `!isIOS()` gate was added in **June** (`2d60989`) — at the time the SW
  still cached the **app shell**, which is what produced stale page layouts
  (the bug fixed in `561c051`, "stop service worker from serving stale page
  layouts").
- In **September** (`b1cfdc4`) the SW was rewritten. Today
  `isCacheableStaticChunk` (`public/sw.js:24-40`) only ever caches
  `/assets/**` requests whose `destination` is `script` or `style`.
  `index.html` fails the `/assets/` path check, so it can **never** be served
  from cache — the failure mode the gate was written for no longer exists.
- iOS **already gets this worker** anyway: the push flows call
  `register("/sw.js")` unconditionally (`NotifyToggle.tsx:66`,
  `Twitch.tsx:848`). So the gate was only ever suppressing the passive
  repeat-visit cache — the exact thing Safari benefits from most, since it is
  the platform that re-downloads hashed chunks on every deploy.

Changes made:

1. Dropped `!isIOS()` from the registration in `main.tsx`.
2. Restored `{ updateViaCache: "none" }` plus an explicit
   `registration.update()`. The historical version of this call had both
   (`561c051`) and the current one had lost them — without them the browser can
   serve `sw.js` **itself** from the HTTP cache, so a deployed worker fix goes
   unnoticed for the script's cache lifetime. That is the same class of bug,
   re-introduced by the rewrite.

**Risk accepted, and why:** this is the one change in §5 that alters behaviour
on the platform that is hardest to debug, and iOS has no chunk-reload fallback
(`chunk-reload.ts:115` also returns false on iOS) if something goes wrong. The
mitigations are that the worker's cache surface is content-hashed and
immutable, that a *new* navigation always gets fresh HTML from the network, and
that iOS users who enabled push have already been running this worker anyway.
If stale-asset reports appear on iPhone, reverting is a two-line change and the
`!isIOS()` condition is preserved in this document.

---

## 6. Server / delivery (for the deploy config, outside this repo)

The frontend is served from `/var/www/mirabellier.com/current` via nginx
(`.github/workflows/deploy.yml:112-143`). Two things to verify on the VPS,
since they dominate mobile TTFB more than any code change above:

1. **Brotli/gzip on `/assets/*`** — Vite emits only pre-minified files; if
   nginx is not compressing `application/javascript`, mobile downloads the raw
   2.17 MB JS tree instead of ~727 kB.
2. **`Cache-Control: public, max-age=31536000, immutable` on
   `/assets/*`** — filenames are content-hashed (`vite.config.ts:577-579`), so
   a one-week cache is a measurable regression. The backend already does this
   for its own static middleware (`mirabellier-backend/app.js:425-430`); make
   sure the nginx `location /assets/` block matches.
3. **HTTP/2 (or HTTP/3)** — the app loads ~10 chunks per route; without
   multiplexing, mobile RTT dominates.

These are config, not code, but they should be checked before spending effort
on anything in §3.

**Checked against the live site — all three were already fine, but the check
uncovered a live incident. See §6.1.**

The site is fronted by **Cloudflare**, not the nginx VPS directly
(`Server: cloudflare`, and the origin identifies as `nginx/1.18.0 (Ubuntu)`
only on a cache miss). Verified live:

1. **Compression: working.** `Accept-Encoding: gzip` on
   `index-B9Xc5ltg.js` returns 13 273 B for a 42 734 B file (~69 % smaller).
   Brotli is served too but is marginally *larger* on these bundles
   (13 958 B) — pre-compressed/minified JS is exactly the input brotli's
   context modelling does not beat gzip on, and Cloudflare is negotiating it
   correctly either way.
2. **Immutable caching: working.** `/assets/*` returns
   `Cache-Control: public, max-age=31536000, immutable`.
3. **HTTP/2 and HTTP/3: both working.** `alt-svc: h3=":443"; ma=86400` is
   advertised, and a forced-version probe completes over HTTP/2 and HTTP/3.

So there is nothing to change on the VPS for §6 as originally written.

### 6.1 Live incident: Cloudflare cached a 404 for a hashed asset

**Resolved 2026-09-14** — the URL was purged from the Cloudflare cache and now
returns `200`. This section keeps the root cause and the config fix, because
the bug that caused it is **still present in four other location blocks**.

While verifying the above, the live homepage's only stylesheet was found to be
404-ing from the Cloudflare edge:

```
GET https://mirabellier.com/assets/index-CGfA6Gsy.css
HTTP/1.1 404 Not Found
Cache-Control: public, max-age=31536000, immutable
Age: 15084            <- cached ~4.2 h
cf-cache-status: HIT
```

That URL is what the live `index.html` references via
`<link rel="stylesheet" crossorigin href="/assets/index-CGfA6Gsy.css">`, so
every visitor was getting an unstyled page (no Tailwind at all) for as long as
that edge entry lived — up to a year, given the header. The same URL with a
throwaway query string returned `200` / 128 719 B, proving the origin had the
real file and only the edge copy was bad. After the purge, all 129 assets
referenced by the live entry chunk were re-checked and are `200`.

**Root cause (reproduced and fixed in a local nginx 1.18 container).** The
`/assets/` location sends its cache header with the `always` parameter:

```nginx
location ^~ /assets/ {
    try_files $uri =404;
    access_log off;
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}
```

`add_header ... always` emits the header on **every** response, including the
`404` that `try_files $uri =404` deliberately produces. `expires 1y` is *not*
the culprit — it only applies to 2xx/3xx. Reproduced locally: the 404 carried
the `add_header` value and no `Expires`, confirming `always` is solely
responsible. Cloudflare then stored that 404 as immutably cacheable, and since
the filename is content-hashed nothing ever invalidated it.

The deploy itself is what opens the window: `deploy.yml` flips `current` after
uploading, but any request for a newly-referenced asset that lands before the
file exists gets a 404 which is now cached for a year.

**The fix — remove `always` from the five cacheable blocks.** Verified in
nginx 1.18 that dropping it leaves every success path unchanged and strips the
header from 404s entirely:

| Block | Directive today | Change |
|---|---|---|
| `/assets/` | `add_header ... "public, max-age=31536000, immutable" always;` | drop `always` |
| `/fonts/` | `add_header ... "public, max-age=604800, stale-while-revalidate=86400" always;` | drop `always` |
| `/cursors/` | same as `/fonts/` | drop `always` |
| `^/[^/]+\.(webp\|png\|…)$` | same as `/fonts/` | drop `always` |
| `^/(feed\.xml\|feed.json\|sitemap\.xml)$` | `add_header ... "public, max-age=3600" always;` | drop `always` |

The three `no-cache, no-store` blocks (`/index.html`, `/sw.js`,
`/blog/index.html`) should **keep** `always`: emitting `no-store` on their 404s
is the correct, safe behaviour.

Verified locally after the change:

```
/assets/real-abc123.js   200  Cache-Control: public, max-age=31536000, immutable   Expires: +1y
/assets/missing-xyz.js   404  (no Cache-Control, no Expires)          <- was immutable
/fonts/real.woff2        200  Cache-Control: public, max-age=604800, stale-while-revalidate=86400
/fonts/missing.woff2     404  (no Cache-Control)
/real.png                200  Cache-Control: public, max-age=604800, stale-while-revalidate=86400
/miss.png                404  (no Cache-Control)
```

Two smaller things noticed in the same block that are worth doing while you're
in there:

1. **`/assets/` emits two `Cache-Control` headers on every 200** —
   `expires 1y` contributes `max-age=31536000` and `add_header` contributes
   `"public, max-age=31536000, immutable"`. Verified against the live site.
   Browsers pick the first and it happens to agree here, so this is cosmetic,
   but dropping the redundant `expires 1y;` (the `add_header` is the
   authoritative one) removes the ambiguity.
2. **Conditional requests still need the header.** Confirmed that a `304`
   keeps `immutable`, so the fix does not regress revalidation — worth
   re-checking after the edit.

**Applied and verified live, in two stages.**

Stage 1 — the nginx config was updated on the VPS (all five `always` parameters
removed, plus the redundant `expires 1y;` in `/assets/`) and reloaded. Re-probing
the live site:

| Request | Before | After nginx fix | After CF TTL change |
|---|---|---|---|
| `/assets/*.js` (200) | `public, max-age=31536000, immutable` | unchanged ✅ | unchanged ✅ |
| `/assets/<missing>.js` (404) | `public, max-age=31536000, immutable` | `max-age=14400` | **no `Cache-Control` at all** |
| `/fonts/<missing>.woff2` (404) | `public, max-age=604800, stale-while-revalidate=86400` | `max-age=14400` | no `Cache-Control` |
| `/cursors/<missing>.gif` (404) | same | `max-age=14400` | no `Cache-Control` |
| `/<missing>.png` (404) | same | `max-age=14400` | no `Cache-Control` |
| `/feed.xml` (200) | `public, max-age=3600` | unchanged ✅ | unchanged ✅ |
| `/index.html` (200) | `no-cache, no-store, must-revalidate` | unchanged ✅ | unchanged ✅ |

The duplicate `Cache-Control` on `/assets/` 200s is also gone — one header now,
confirming `expires 1y;` was removed.

Stage 2 — the residual `max-age=14400` seen after stage 1 was **not** from
nginx; it was Cloudflare's default Browser Cache TTL (exactly 4 h) applied
because the 404 carried no `Cache-Control` of its own. The Cloudflare Browser
Cache TTL was then lowered, and 404s now carry **no `Cache-Control` header at
all**, so a browser will not pin a bad 404 across reloads.

**One residual, deliberately left alone.** Cloudflare's *edge* cache still stores
the 404 (`cf-cache-status: HIT` with a growing `Age`), because edge TTL is a
separate setting from the browser TTL that was changed. So a bad 404 can still
live at the edge for Cloudflare's default edge lifetime. That is an acceptable
failure mode — bounded at the edge, and invisible to the browser's own cache —
and tightening it would mean either a Cache Rule or the tested-but-unused
`error_page` handler below. Not worth the machinery.

**Optional future hardening (not done):** the deploy window itself still exists
— `current` flips after upload, so a request can still beat a file. A smoke
check of `index.html`'s referenced assets before the symlink swap would catch
it at deploy time. Not needed while the 404 lifetime is short.

**Optional future hardening (not done):** the deploy window itself still exists
— `current` flips after upload, so a request can still beat a file. A smoke
check of `index.html`'s referenced assets before the symlink swap would catch
it at deploy time. Not needed while the 404 TTL is short.

---

## 7. Suggested order of work

| # | Change | Effort | Expected mobile win | Status |
|---|---|---|---|---|
| 1 | Static frame instead of animated sticker on mobile (§1.1 lever 1) | M | Removes 80–377 kB per sticker, not 33 % of it | **done** |
| 2 | `useHoloTilt`: coarse-pointer default + CSS-var writes (2.1) | M | Removes 20+ per-frame React renders on Arena | **done** |
| 3 | Re-encode `grain.webp` / `pin.png` (1.4) | S | ~100 kB + decode | **done** |
| 4 | `useVisibilityInterval` for all polls (2.3) | M | Background battery/CPU | **done** |
| 5 | `bg-fixed` → fixed `::before` on coarse pointers (1.3) | S | Scroll jank on all pages | **done** |
| 6 | Shrine `rossi-oa` srcSet + variants (1.5) | S | Correct candidate on mobile | **done** |
| 7 | Reduce `mix-blend-mode` stack on coarse pointers (3.1/3.2) | M | Arena scroll/paint | **done** |
| 8 | Verify nginx compression/caching (6) | S | TTFB, repeat visits | **done** (all three already correct) |
| 8b | Purge the poisoned CSS from the Cloudflare edge (§6.1) | S | Unstyled site for all visitors | **done** |
| 8c | Drop `always` from the 5 cacheable nginx blocks (§6.1) | S | Prevents the whole class recurring | **done** |
| 9 | Lazy `CommandPalette` (4.1) | S | ~1 kB gz off entry | **done** |
| 10 | Defer `/me` behind session cache (2.2) | S | One cross-origin RTT off boot | **done** |
| 11 | 1200×630 `og-image.jpg` for share cards (1.6) | S | Unfurl quality | **done** |
| 12 | 320 px `<picture>` variants for 1x/1.5x DPR (§1.1 lever 2) | M | 33 % for non-retina only | **skipped** (would soften 2x) |
| 13 | Guestbook drag via direct transform (2.5) | S | Board drag no longer O(n)/frame | **done** |
| 14 | Blog scroll listener early-return (2.4) | S | No setState per scroll frame | **done** |
| 15 | Drop `backdrop-blur` on scrims, coarse pointers (3.3) | S | Modal open cost | **done** |
| 16 | `.dark img` filter off on coarse pointers (3.4) | S | No per-image off-screen raster | **done** |
| 17 | `useIsMobile` initial value (5.1) | S | No desktop-layout flash | **done** |
| 18 | Delete dead `useWindowSize` / `useCursorVisibility` (5.2) | S | Removes a listener that never ran | **done** |
| 19 | `DeferredAnimatedImage` double-upgrade race (5.3) | S | One image fetch, no leaked idle cb | **done** |
| 20 | Service worker on iOS + `updateViaCache` (5.4) | S | Repeat-visit cache on iPhone | **done** |

Note: the Tailwind-typography idea from an earlier draft of this doc was
wrong — see §4.3. It is **not** in the list.

The only item still open is optional: the residual 4-hour Cloudflare default TTL
on 404s (§6.1). It is a deliberate non-action — bounded, self-healing, and
not worth extra nginx complexity.

---

## 8. Verification

- Lighthouse mobile (throttled) before/after on: `/` (home), `/arena/market`
  (worst card count), `/anime` (animated sticker), `/shrine/kanna`
  (image-heavy), `/pixies` (video feed). For §1.1 specifically, check the
  Network panel at a <1024px viewport: the `*-poster-*.webp` should be the
  only sticker requested.
- For §2.3, background the tab on `/anime` or `/arena/spectate` for a minute
  and confirm no further requests fire, then refocus and confirm exactly one
  refresh goes out.
- For §2.1, load `/arena/market` at a phone viewport and check the Performance
  panel: no per-frame scripting work, and no rAF activity from
  `use-holo-tilt` at all.
- For §2.2, confirm a signed-in reload of `/blog/edit` does not redirect to
  Discord (that is the failure mode the session cache exists to prevent).
- For §3.1/§3.2, load `/arena/market` on a phone (or an emulated coarse
  pointer) and open the Rendering panel: the card list should show no
  compositing layers at rest, and the Cards' `mix-blend-mode` layers should be
  gone. Compare against desktop, where the hover shimmer must still work.
- For §3.3, open any Arena modal on a phone and confirm the scrim still hides
  the page behind it; the Pixies search pill and tag chips over video should
  still be frosted (they were deliberately excluded).
- For §3.4, toggle dark mode on a phone and check the photos still look
  intentional — this one is a visible change, so it is worth an eyeball.
- For §4.1, load any page and confirm `CommandPalette-*.js` is **not**
  requested in the Network panel; then press Cmd/Ctrl+K and confirm it loads
  and opens on that first press (not the second). The nav "search" button must
  behave the same way, since it fires through the pub-sub rather than the
  keydown path.
- For §5.1, load `/arena/fight` on a phone and confirm the duel cards
  render without auto-tilting on the very first frame (the old behaviour was a
  one-frame desktop branch that started the rAF loop, then corrected).
- For §5.4, this one needs a real iPhone or an iOS Simulator: open the
  site, check Application > Service Workers shows an activated `/sw.js`, then
  background and reopen the app and confirm chunks are served from the worker
  (Network shows `(ServiceWorker)` as the source) rather than re-downloaded.
  If any stale-asset report appears on iOS, revert per the §5.4 note.
- The repo already beacons Core Web Vitals to `/telemetry/vitals`
  (`src/lib/telemetry.ts:86-130`, with `conn` = `effectiveType`), so compare
  p75 LCP/INP/CLS by `conn` bucket before and after — no extra tooling needed.
- `npm test` covers the new `shouldAllowAnimation` gate (6 cases) and
  `VisibilityTimer` (8 cases) — 62 tests total.
- `npm run build` enforces the chunk/CSS budgets in `vite.config.ts:377-412`;
  it passes clean after these changes. Against a clean production build of
  `HEAD`, every chunk is byte-for-byte the same size or marginally smaller
  (`ArenaTrade` 49.85 → 49.78 kB, `Twitch` 29.86 → 29.72 kB, entry
  93.41 → 92.5 kB); `react-vendor` (193.12 kB) and `vendor` (90.68 kB) are
  unchanged.
- After editing `src/assets/anime/*` or `public/*`, re-run
  `node optimize-anime-gifs.cjs`, `node convert-images.cjs` and
  `node convert-public-images.cjs` in that order so the posters, shrine
  variants and og card stay in sync with their sources.
