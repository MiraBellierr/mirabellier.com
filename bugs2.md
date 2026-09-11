# Blog post link — "stuck at the loading screen"

Investigated 2026-09-11 against the live site (`https://mirabellier.com`, build
`index-Cx32P1HI.js`) plus the source in this repo. Findings are ordered by how
directly they produce the reported symptom. Everything marked **CONFIRMED** was
reproduced and measured on the live site; **SUSPECTED** is code-read only.

---

## 1. No scroll reset on route change — CONFIRMED (this is the reported bug) — FIXED

**Symptom:** a reader scrolls down `/blog`, clicks a post, and lands on a screen
that does not show the post. For the first few seconds it is a near-empty page
(the "Loading post..." card is scrolled off the top); once the article arrives
they are dumped at the very bottom, below the comment box. The page never moves
to the top on its own, so it reads as "stuck at the loading screen".

**Where:** `src/App.tsx` — there is no scroll handling anywhere in the app.
`grep -rn "scrollTo|scrollRestoration|ScrollRestoration" src` only finds
per-page scrolling (`Fanart.tsx:417`, `Guestbook.tsx`, `use-cursor-visibility.ts`).
The app uses `BrowserRouter` (react-router-dom 7.18.3), which does not restore or
reset scroll, and `<ScrollRestoration>` is unavailable because it requires a data
router.

**Measured on the live site** (viewport 1536x726, `/blog` reached via the SPA nav,
scrolled to the bottom of the list, then the last post link clicked; the
`/v1/posts/:id` response was delayed 4s to make the loading window observable):

| moment | `scrollY` | `document.body.scrollHeight` | what fills the viewport |
|---|---|---|---|
| before the click | 598 | 1324 | bottom of the blog list |
| +0.6s .. +3.0s | 477 | 1203 | bottom of a mostly empty page; "Loading post..." is above the fold line |
| +3.6s | 11810 | 14101 | middle of the article |
| +4.2s onward | 11810 | 14860 | comment box + footer |

Two things compound:

- The stale offset is kept across the route change, so during the fetch the
  reader sits at the bottom of a ~1200px page whose only content (the loading
  card) is off-screen.
- When the article renders, Chrome's scroll anchoring keeps the anchored
  (bottom) element in view as ~13,000px of content is inserted above it, so
  `scrollY` is pushed from 477 to 11810 — the end of the post.

Clicking a post from the top of the list is fine, which is why this does not show
up in casual testing.

**Fix:** reset scroll on pathname change in `src/App.tsx`. `location` is already
in scope from `useLocation()`:

```ts
useEffect(() => {
  window.scrollTo(0, 0);
}, [location.pathname]);
```

That fixes both halves (no stale offset, and nothing for scroll anchoring to
anchor to). It applies to every route, not just `/blog/:slug` — the same jump
happens on any list-to-detail navigation in the app.

---

## 2. `/blog` is a hard 404 on any non-SPA load — CONFIRMED — FIXED

```
GET https://mirabellier.com/blog   -> 301  Location: /blog/
GET https://mirabellier.com/blog/  -> 404  "Not found"
```

So refreshing the blog list, opening it in a new tab, bookmarking it, or
following a shared `/blog` link gives a bare white "Not found" page — and from
there no post is reachable at all. Client-side navigation to `/blog` still works,
which is why the list looks fine while browsing.

Every other prerendered route is fine (`/about/`, `/now/`, `/links/`, `/arena/`,
`/quotes`, `/guestbook/`, `/projects/` all 200); `/blog/` is the only one that
fails.

**Cause is at the server, not in the React app.** The 404 carries the Express
backend's fingerprints (`access-control-allow-credentials: true`,
`server-timing: total;dur=0`, helmet's `content-security-policy-report-only`),
while a working static route like `/now/` returns a plain `last-modified` static
response with none of those. Individual posts (`/blog/<slug>-<id>`) also go
through the backend and return 200 — that is the OG/crawler prerender path. So
`/blog/` is being proxied to the Node app, which has no handler for it and falls
through to its own 404.

`vite.config.ts:112` does configure `/blog` for `routeSeoPlugin`, and
`dist/blog/index.html` exists in a local build — so the file the static host
should be serving is being produced. What is broken is the deploy/nginx routing
for that one path.

**Fix:** make the `/blog/` request fall through to the static
`dist/blog/index.html` (nginx `try_files $uri $uri/ /index.html`) instead of
being proxied to the backend, or give the backend an explicit handler for the
bare `/blog` path alongside the per-post one.

---

## 3. A single stale chunk kills the page and the auto-recovery never fires — CONFIRMED — FIXED

`src/main.tsx`:

```js
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadForUpdatedBuild();
});
```

Vite 7's `__vitePreload` (read out of the deployed bundle) is:

```js
function o(u){const p=new Event("vite:preloadError",{cancelable:!0});p.payload=u;
  window.dispatchEvent(p);if(!p.defaultPrevented)throw u}
return _.then(u=>{ ...; return t().catch(o)})
```

Calling `preventDefault()` means `o()` returns instead of throwing, so the failed
`import()` **resolves with `undefined`** rather than rejecting. Verified live in
the page console — importing a missing chunk resolved to `undefined`, and exactly
one failure was recorded.

React 19's `lazy` then reads `moduleObject.default` off `undefined` -> TypeError
during render -> the `ErrorBoundary` ("Something went wrong"). Meanwhile
`reloadForUpdatedBuild()` requires `CHUNK_FAILURE_THRESHOLD = 3` failures inside a
30s window before it will reload — but the page dies after the *first* one and
never issues another import, so the self-healing reload is unreachable in
practice. A visitor on a stale `index.html` after a deploy gets a dead page with
no recovery.

**Fix:** reload on the first failure (the existing 90s `CHUNK_RELOAD_COOLDOWN_MS`
guard already prevents reload loops), and only `preventDefault()` when a reload is
actually being issued — otherwise let the error propagate so the boundary reports
something real.

---

## 4. `swrJson` poisons its own cache entry on abort — CONFIRMED by code read — FIXED

`src/lib/api-cache.ts`:

```js
const inflight = runFetch(url, transform, opts, opts.signal)
  .then(...)
  .catch((err) => {
    if (err instanceof DOMException && err.name === "AbortError") throw err;  // <- returns here
    ...
    cache.delete(url);   // <- never reached for aborts
    throw err;
  });
store(url, { at: hit?.at ?? 0, value: hit?.value, inflight });
```

On abort the entry survives with `value: undefined` and an `inflight` that is a
permanently-rejected promise. Every later call takes
`if (hit?.inflight) return hit.inflight;` and gets that same rejection — no
network request is ever issued again for that URL for the life of the page.

Triggering it is routine: leave `/blog` before `GET /posts` settles and the
unmount cleanup aborts it. After that, `BlogPost`'s archive fetch
(`src/pages/BlogPost.tsx:344`) always rejects, so prev/next and the series
navigation silently never appear. `Blog.tsx` survives it only because its
`finally` clears `loading` regardless — it just shows an empty list with no error.

**Fix:** clear the entry in the abort branch too — treat abort the same as any
other failure for cache bookkeeping (`cache.delete(url)`) before re-throwing.

---

## 5. Service worker cache grows without bound — CONFIRMED — FIXED

`public/sw.js` hardcodes
`STATIC_CHUNK_CACHE = "mirabellier-static-chunks-v20260624"` and `activate` only
deletes caches whose name *differs*. The name has not changed since June, so every
deploy's chunks pile into the same cache forever.

Measured on an ordinary browser profile: **1090 entries, ~50 MB** in
`mirabellier-static-chunks-v20260624`, of which 100+ already 404 on the server.

Also, inside `event.respondWith`:

```js
const networkResponse = await fetch(request);
if (networkResponse.ok) { await cache.put(request, networkResponse.clone()); }
return networkResponse;
```

`cache.put` is unguarded. If it rejects (QuotaExceededError once the cache has
grown past the origin quota), `respondWith` rejects and the chunk request fails
even though the network response was fine — which feeds straight into #3.

**Fix:** wrap the `cache.put` in a `try/catch` (a failed cache write must not fail
the response), and either version the cache name per build or evict entries that
are no longer referenced.

---

## 6. `Post.tsx` can leave "Loading table support..." up permanently — SUSPECTED — FIXED

`src/parts/Post.tsx` gates the whole article body behind
`if (hasTableContent && tableSupportLoading) return <div>Loading table support...</div>`.
The effect that clears that flag has two escapes that skip the reset:

- `if (!hasTableContent || tableExtensions) return;` — early return, no reset;
- `.finally(() => { if (!cancelled) setTableSupportLoading(false); })` — a run
  that is cancelled never clears the flag it set.

If a cancelled run is not followed by another run that completes, the article is
replaced by a permanent "Loading table support..." — a second, post-specific
loading screen on exactly this page. I could not reproduce it (the Arena guide,
the only post with tables, renders fine), so this is a code-read finding, not a
confirmed repro. Worth making the reset unconditional regardless.

---

## Checked and ruled out

- **Backend API.** `GET /v1/posts` 200 in 0.3s; `GET /v1/posts/:id` 200 in 0.13s;
  unknown ids return a clean 404. No slow or hanging responses.
- **Slug to id extraction.** `BlogPost.tsx:263` takes the last `-` segment of the
  slug. Ran all 11 published titles through `slugify` + the extractor: every one
  round-trips to the right id, including the titles that produce a trailing `--`
  after the 80-char slice.
- **`BlogPost`'s own loading state.** `src/pages/BlogPost.tsx:447` clears
  `loading` in a `finally`, so "Loading post..." cannot hang on a fetch failure —
  it turns into the error card.
- **Route ordering.** `/blog/:slug` is declared before `/blog/edit` in `App.tsx`,
  but react-router ranks static segments above dynamic ones, so `/blog/edit` still
  wins. Confirmed working live.
- **Direct post loads.** Cold-loading a post URL with no service worker and no
  caches, and loading 6 of the 11 posts individually, all render correctly.
  Console is clean (two `[app boot]` / `[pageshow]` logs, no errors).

## Note

While testing I unregistered the service worker and cleared
localStorage/sessionStorage for `mirabellier.com` in the local Chrome profile, so
site preferences there (cursor, theme) were reset to defaults.
