# Pixies — bug / smell audit

Scope: the "pixies" feature (formerly "reels"). Files reviewed:
`src/pages/Reels.tsx`, `src/pages/AdminReels.tsx`, `src/pages/ReelUpload.tsx`,
`src/pages/Profile.tsx` (video section), `src/lib/videos.ts`,
`src/parts/Navigation.tsx`, `src/parts/Header.tsx`,
`mirabellier-backend/routes/videos.js`.

Severity legend: **[bug]** wrong behaviour · **[dead]** unused code ·
**[dup]** duplication · **[style]** formatting / naming · **[perf]** scaling ·
**[ux]** minor user-facing wart.

---

## High-value bugs

### 1. [bug] ✅ FIXED — Admin progress timer & rotating tips are effectively frozen
`src/pages/AdminReels.tsx` — `ProgressBlock` (lines ~61–97).

```js
useEffect(() => {
  if (!job) return;
  const interval = window.setInterval(() => setTick((t) => t + 1), 1000);
  return () => window.clearInterval(interval);
}, [job]);
```

`job` is passed a **brand-new object literal on every poll**
(`setImportJob({ progress, message, state, stage })` / `setResolveJob({...})` in
`handleSubmit` / `handleResolve`). `pollVideoJob` polls every ~700 ms, and the
backend `startJobCreep` bumps the job every 700 ms too. So the effect tears down
and recreates the 1000 ms interval faster than it can ever fire →
`setTick` almost never runs.

Consequences:
- The elapsed clock `({formatElapsed(tick)})` stays near `0:00` for the whole
  import instead of counting up.
- `liveDescription = tips[tick % tips.length]` never rotates, so the
  reassurance messages ("Platforms throttle scrapes…", etc.) are dead weight.

Fix: drive the ticker off a stable dependency, e.g. `[Boolean(job)]` or
`[job?.stage]`, or hoist the interval out of the job-identity dependency.

**Fixed:** effect now keys on `const active = Boolean(job)` instead of `[job]`,
so the interval is created once per job lifetime; `tick` resets to `0` when the
job clears.

### 2. [bug] ✅ FIXED — Comment count drifts after add/delete + reopen
`src/pages/Reels.tsx` — `commentCountDeltas` (state at ~318), mutated in
`handleSubmitComment` (~859), `handleDeleteComment` (~894), read by
`commentCountFor` (~903).

`commentCountDeltas` only ever accumulates; it is **never reset** —
not in `closeComments`, not when the feed refetches. After you post a comment
the delta is `+1`; when the comments panel is reopened `fetchReelComments`
returns the already-persisted comment, and the pagination refetch replaces the
reel objects with fresh `commentsCount` from the server — but the stale `+1`
delta is still added on top. Result: the "Comments (N)" header and the rail
counter read one (or more) too high. Deleting/adding repeatedly compounds it.

Fix: clear `commentCountDeltas` when the reel list is replaced, or reconcile to
the server count instead of keeping an unbounded delta map.

**Fixed:** the feed effect now calls `setCommentCountDeltas({})` alongside
`setReels([])`, so the delta map is reset whenever the reel objects are thrown
away and refetched with fresh server `commentsCount`. The "load more" path only
appends genuinely-new reels (never replaces existing objects), so deltas for
already-seen reels stay valid there.

### 3. [bug] ✅ FIXED — Duplicate video import when the backend restarts mid-job
`src/lib/videos.ts` — `pollVideoJob` (~418–443) + `mirabellier-backend/routes/videos.js`
`performImportJob` (~1126) / in-memory `IMPORT_JOBS` (~32).

Jobs live only in `IMPORT_JOBS` (a `Map`). If the server restarts (or the job is
pruned after `IMPORT_JOB_MAX_AGE_MS` by a later unrelated job start) *after*
`performImportJob` has already run `insertVideo.run(...)` and downloaded the
file, the next status poll 404s with `"Job not found"`, and `pollVideoJob`
transparently calls `start()` again → a **second** `POST /videos/admin/import`
→ the video is re-downloaded, re-transcoded, and inserted a second time.

Resolve jobs are side-effect free so the restart logic is safe there; import
jobs are not. Consider persisting a short idempotency key, or having the client
check the feed for the just-imported URL before restarting an import job.

**Fixed:** persisted idempotency key.
- `src/lib/videos.ts`: `newImportKey()` generates one key per import attempt;
  `AdminReels.handleSubmit` creates it *outside* the `pollVideoJob` closure so
  every restart re-sends the same key. Threaded through `startSocialImport`.
- `mirabellier-backend/lib/db.js`: migration adds `user_videos.importKey` +
  a partial `UNIQUE` index (`WHERE importKey IS NOT NULL`).
- `mirabellier-backend/routes/videos.js`: `POST /admin/import` short-circuits to
  a synthetic `done` job (returning the existing `mapVideoRow`) when a row with
  that key already exists; `performImportJob` inserts via `insertImportedVideo`
  with the key and, if the unique constraint trips on a concurrent insert,
  discards its download and reuses the existing row.

### 4. [bug] ✅ FIXED — `w-21` is not a real Tailwind class
`src/pages/AdminReels.tsx` line ~458:

```jsx
className="h-14 w-21 rounded-lg border ... object-cover"
```

`tailwind.config.js` adds no custom spacing, and `21` is not in the default
scale (it jumps 20 → 24). The class is dropped silently, so the resolved-video
cover thumbnail has only `h-14` + `object-cover` and an unconstrained width.
Use `w-24` (or `w-20`, or an explicit `aspect-video`).

**Fixed:** `h-14 w-21` → `h-14 w-24` on the `resolvedInfo.coverUrl` thumbnail
(`AdminReels.tsx` ~473).

### 5. [bug] ✅ FIXED — Avatar-load-error fallback shows an empty circle, not the 😺
`src/pages/Reels.tsx` (author rail ~1090, comments ~1333, share popup ~1431),
`src/pages/AdminReels.tsx` (~460, ~555).

The pattern everywhere is:

```jsx
{avatar ? (
  <img ... onError={(e) => { e.currentTarget.style.display = "none"; }} />
) : ( "😺" )}
```

When the `<img>` exists but fails to load (expired social-CDN URL — exactly the
case the comments call out), it is hidden and nothing replaces it: you get a
bare pink circle instead of the emoji fallback. The `onError` handler should
also reveal a sibling emoji node (or swap `src` to a known-good placeholder).

**Fixed:** new `src/parts/AvatarImage.tsx` — renders a generic person-glyph
fallback (Feather-style inline SVG, colour set per call site via
`iconClassName`) both when `src` is missing and on `onError` (via `useState`,
reset on `src` change). Replaced the inline `avatar ? <img onError=hide> : "😺"`
pattern at all three `Reels.tsx` sites (comment rail, author caption, share
popup) and wrapped the `AdminReels.tsx` avatar-preview `<img>` in a fallback
circle using it too. Also swapped the remaining `😺` avatar fallbacks in
`Profile.tsx` and `Settings.tsx` for the same component. The `AdminReels`
`resolvedInfo.coverUrl` thumbnail is left as-is — it's a video still, not an
avatar, so an icon fallback there would be wrong; hiding a broken cover is
acceptable.

---

## Medium

### 6. [bug] ✅ FIXED — Wheel accumulator is not reset during the cooldown window
`src/pages/Reels.tsx` — wheel handler (~606–632).

```js
wheelAccumRef.current += event.deltaY;
const now = Date.now();
if (now - lastWheelNavRef.current < WHEEL_COOLDOWN_MS) return; // <-- accum keeps growing
```

During the 650 ms cooldown the accumulator keeps summing momentum-scroll
deltas, so the first event after the cooldown can be far past
`WHEEL_THRESHOLD_PX` and fire an immediate second navigation — trackpad
momentum scrolls skip a pixie. Reset `wheelAccumRef.current = 0` (or clamp it)
on the cooldown-return path.

**Fixed:** the cooldown check now runs *before* `wheelAccumRef.current +=
event.deltaY`, and zeroes the accumulator on the cooldown-return path, so
trailing momentum deltas are dropped instead of accumulating into an instant
second navigation.

### 7. [bug] ✅ FIXED — Pending single-tap can pause the wrong pixie after a swipe
`src/pages/Reels.tsx` — `handleTap` (~713–753).

A single tap schedules `togglePlayPause()` 300 ms later via `tapTimeoutRef`.
If the user swipes/scrolls to the next pixie inside that 300 ms, the timeout
still fires and `togglePlayPause()` acts on the *new* active video
(`videoRefs.current[activeIndexRef.current]`), pausing a video the user never
tapped. Clear `tapTimeoutRef` in `goTo` / the touch-end navigation path.

**Fixed:** `goTo` (the single funnel for every navigation — swipe, wheel,
keyboard, dot nav, `goNext`/`goPrev`) now clears `tapTimeoutRef` and resets
`lastTapRef` to `0`, so a pending single-tap is cancelled on navigation and a
tap on the old pixie can't pair with one on the new pixie into a stray
double-tap.

### 8. [bug] ✅ FIXED — `handleToggleMute` reads the state index, not the ref
`src/pages/Reels.tsx` line ~765:

```js
const video = videoRefs.current[activeIndex];      // state
...
startPlayback(activeIndexRef.current, () => {       // ref
  video.muted = true; ...
});
```

Every other gesture handler in the file deliberately uses
`activeIndexRef.current` to avoid a stale index. This one mixes both; if
`activeIndex` state ever lags the ref, the mute toggle and its
playback-blocked fallback act on different videos.

**Fixed:** `handleToggleMute` now looks up the video via
`videoRefs.current[activeIndexRef.current]`, matching `startPlayback` and the
rest of the gesture handlers.

### 9. [bug] ✅ FIXED — Controlled `muted` prop fights imperative `video.muted = …`
`src/pages/Reels.tsx` — `<video muted={muted} …>` (~1051) plus ~10 imperative
`video.muted = …` assignments.

React only syncs `muted` as a DOM *property* on mount; later prop changes are
unreliable, which is presumably why the code sets `.muted` by hand everywhere.
Keeping both is a desync trap (e.g. a re-render can silently re-mute a video
the gesture code just unmuted). Pick one model — drop the `muted` prop and own
it imperatively, or drop the imperative sets.

**Fixed:** dropped the `muted={muted}` prop from `<video>`. `muted` is now
owned imperatively end-to-end: the gesture handlers keep their `.muted` sets,
and a new effect (`[muted, reels]`) re-applies the current mute state to every
mounted `<video>` when it changes or when new videos mount — replacing what the
mount-only prop did.

### 10. [dead] ✅ FIXED — `resolveSocialVideo` / `isTikTokUrl` are unused
`src/lib/videos.ts` lines ~259–298.

`AdminReels.tsx` now uses the job-based `startVideoResolve` /
`fetchVideoResolveStatus`. The old direct `resolveSocialVideo` has no callers,
and its `res.status === 404 → /videos/admin/tiktok-resolve` legacy branch is
unreachable anyway because `POST /videos/admin/resolve` still exists (it now
returns `202 {jobId}`, never 404). Backend `POST /videos/admin/tiktok-resolve`
(routes/videos.js ~898–926) and the `../lib/tiktok` `fetchTikTokMetadata`
import are only reachable through this dead path.

**Fixed:**
- `src/lib/videos.ts`: removed `resolveSocialVideo` and its only helper
  `isTikTokUrl`. `ResolvedVideoInfo` / `VideoPlatform` stay — `AdminReels.tsx`
  still uses the type for its `resolvedInfo` state.
- `mirabellier-backend/routes/videos.js`: removed the now-unreachable
  `POST /admin/tiktok-resolve` route and pruned its now-unused imports
  (`fetchTikTokMetadata` from `../lib/tiktok`, `stripHashtags` from
  `../lib/social`). The `lib/tiktok` / `lib/social` functions themselves stay —
  `lib/social.js` still calls `fetchTikTokMetadata`, and the backend's own
  `resolveSocialVideo` (a different function from the deleted client one) is
  still used by `performImportJob` / `performResolveJob`.

### 11. [dead] ✅ FIXED — `destBaseFor` is never called
`mirabellier-backend/routes/videos.js` lines ~1239–1244. `performImportJob`
inlines its own `destBase`. Remove `destBaseFor`.

**Fixed:** deleted the `destBaseFor` function. `performImportJob` keeps its
inlined `destBase`; no other callers existed.

### 12. [dead] ✅ FIXED — `STAGE_TIPS.store` never displays
`src/pages/AdminReels.tsx` lines ~34–53. `performImportJob` walks
`resolve → download → process → done`; `performResolveJob` walks
`resolve → done`. No code path ever sets `stage === "store"`, so that tip array
is dead.

**Fixed:** removed the `store` entry from `STAGE_TIPS`. Confirmed the backend
only ever emits `queued` / `resolve` / `download` / `process` / `done`; the
`STAGE_TIPS[job.stage] || STAGE_TIPS.queued` fallback still covers any unknown
stage.

---

## Duplication

### 13. [dup] ✅ FIXED — `ReelUpload.tsx` and `AdminReels.tsx` share large verbatim blocks
- `readVideoDuration` — byte-for-byte identical (`ReelUpload` ~82–96,
  `AdminReels` ~177–191).
- `addTag` + `handleTagKeyDown` — identical logic (`ReelUpload` ~55–80,
  `AdminReels` ~150–175).
- `filteredSuggestions` + the tag-chip / suggestion-dropdown JSX — near
  identical.
- The "please log in / not authorized" full-page `Header/Navigation/Footer`
  wrapper — same skeleton repeated in `ReelUpload`, `AdminReels`, `Profile`.

Extract a `useVideoTagInput` hook + a `<TagInput>` component + an
`<AuthGateShell>` layout.

**Fixed:**
- `readVideoDuration` moved to `@/lib/videos` (exported); both pages import it.
- `src/parts/useVideoTagInput.ts` — owns `tags` / `tagInput` /
  `tagInputFocused` / `tagSuggestions` state, the suggestions fetch, and
  `addTag` / `removeTag` / `handleTagKeyDown` / `filteredSuggestions`. Takes an
  `onMessage` callback so the "too many tags" warning still lands in each
  page's error slot.
- `src/parts/TagInput.tsx` — the chips + input + suggestion-dropdown JSX,
  driven by a `VideoTagField`. Per-page differences (`required` asterisk,
  empty-state placeholder, help text) are props.
- `src/parts/AuthGateShell.tsx` — the full-page chrome + centred card for the
  "log in / not authorized / not found / loading" screens. Now used by
  `PixieUpload`, `AdminPixies`, and both of `Profile`'s gate returns (files
  renamed in #15). The admin gate picks up the shared card styling (dark-mode
  aware, icon) in the process.

### 14. [dup] ✅ FIXED — Three near-identical SQL SELECTs
`mirabellier-backend/routes/videos.js` — `selectAllVideos` (~244),
`selectUserVideos` (~253), `selectVideoById` (~263) repeat the same 14-column
projection + `commentsCount` correlated subquery, differing only by
`WHERE` / `ORDER BY`. Build from a shared column-list constant.

**Fixed:** added a `VIDEO_ROW_SELECT` template (the shared projection + FROM +
JOIN); `selectAllVideos`, `selectUserVideos`, `selectVideoById` and
`selectVideoByImportKey` (added in #3) are now `db.prepare(\`${VIDEO_ROW_SELECT}
<WHERE / ORDER BY tail>\`)`. Verified all four still prepare and run against the
schema; backend suite 210/210.

---

## Naming / consistency

### 15. [style] ✅ FIXED — The "reels → pixies" rename is only half done
Commit `beade65` renamed routes + SEO copy but the implementation is still
"reel" everywhere: component files `Reels.tsx` / `ReelUpload.tsx` /
`AdminReels.tsx`, exports `Reels` / `ReelUpload` / `AdminReels`, types `Reel` /
`ReelComment` / `ReelAuthor`, functions `uploadReel` / `uploadAdminReel` /
`deleteReel` / `fetchReelsFeed` / `markReelViewed` / `toggleReelLike` /
`fetchReelComments` / `postReelComment` / `deleteReelComment`, and error
strings like `throw new Error("Failed to load reels")` (`videos.ts` ~66, ~85).
Pick one term and finish the rename (or consciously keep `videos`/`reel`
internally and document that).

**Fixed:** full frontend + backend rename to "pixie".
- Files: `src/pages/{Reels,ReelUpload,AdminReels}.tsx` →
  `{Pixies,PixieUpload,AdminPixies}.tsx`; `src/lib/videos.ts` →
  `src/lib/pixies.ts`; `mirabellier-backend/routes/videos.js` →
  `routes/pixies.js` (+ `registerVideoRoutes` → `registerPixieRoutes`).
- Every `Reel*` symbol → `Pixie*` (components, `Pixie` / `PixieComment` /
  `PixieAuthor` types, `uploadPixie` / `fetchPixiesFeed` / `deletePixie` /
  `markPixieViewed` / … functions, the job `pixie` field, local vars) and the
  user-facing error strings. `App.tsx` lazy imports + route elements updated.
- API: router now mounts at `/pixies` **and** `/videos` (legacy alias);
  static video files served at both; `mapVideoRow` / `og:video` URLs emit
  `/pixies/…`. Frontend calls all use `/pixies`.
- Deliberately kept: `Video*` names for the generic medium plumbing (upload
  jobs, tag helpers, `VideoPlatform`), the `user_videos` DB table, the
  `/admin/reels` · `/reels` · `/reels/upload` redirect routes, and "Instagram
  reel" (Meta's product name) / `instagram.com/reel/` URLs. Naming rationale
  documented at the top of `src/lib/pixies.ts`.
- `tsc`, `eslint`, `vite build`, frontend 25/25, backend 211/211 all green.

### 16. [ux] ✅ FIXED — Singular/plural copy mismatch for a single clip
`src/pages/Reels.tsx`: `showToast("Pixies link copied to clipboard!")` (~820)
and `structuredData.name: "Pixies"` for one video, vs `"Share pixie"` (~1411),
`"Untitled pixie"` (~1444), `"Anyone with the link can watch this pixie."`
(~1465). A single item should read "pixie".

**Fixed** (`src/pages/Pixies.tsx`): copy toast now says "Pixie link copied to
clipboard!". `usePageSeo` structuredData is item-aware — a shared single pixie
(`/pixies/:id`, once the pixie is in state) emits a `VideoObject` named after
its caption (or `Pixie by @user`), with `contentUrl` / `uploadDate`; the plain
feed keeps the `WebPage` / "Pixies" collection entry.

### 17. [style] ✅ FIXED — Inconsistent share-URL origin
`src/pages/Reels.tsx`: `sharePageUrl` hardcodes
`https://mirabellier.com/pixies/…` (~351) while `shareUrlFor` uses
`window.location.origin` (~804). Fine in prod, diverges on staging/local.

**Fixed:** added `SITE_ORIGIN` to `src/lib/config.ts` — `VITE_SITE_ORIGIN`
override; in a production build it resolves to `https://mirabellier.com`, in
dev it falls back to `window.location.origin` so local share links still open
the running dev server. `Pixies.tsx` `sharePageUrl` and `shareUrlFor` both use
it, so the two are consistent in every environment.

### 18. [style] ✅ FIXED — Missing line break — two statements glued together
`src/pages/Reels.tsx` ~447:

```js
    [clampIndex, reels.length],
  );  const goNext = useCallback(() => {
```

`const goNext` sits on the closing line of `goTo`'s `useCallback`. Prettier
would split this; it currently reads as a formatting slip.

**Fixed:** `const goNext` moved to its own line with a blank line after `goTo`'s
closing `);` (`Pixies.tsx`).

### 19. [style] ✅ FIXED — Username length counted two different ways
`src/pages/AdminReels.tsx`: `<input maxLength={32}>` counts UTF-16 code units,
but the guard `Array.from(username.trim()).length > 32` (~201) and backend
`truncateCodePoints` / `validateAuthorUsername` count code points. An
astral-plane username can be clipped by the input before the code-point check
ever runs.

**Fixed:** dropped the `maxLength` attribute; the input's `onChange` now runs a
shared `truncateCodePoints(value, MAX_AUTHOR_USERNAME_LENGTH)` (both added to
`src/lib/pixies.ts`, mirroring the backend's code-point count of 32). The
submit-time guard and the resolve-time `Array.from(...).slice(0, 32)` now use
the same constant/helper, so every place counts code points identically.

---

## Perf / scaling

### 20. [perf] ✅ FIXED — `/feed` is O(all videos) per request and the exclude list is unbounded
`mirabellier-backend/routes/videos.js` `GET /feed` (~638): `selectAllVideos.all()`
loads every row (each with a correlated `COUNT(*)` comment subquery), scores
them all, then slices to `limit` — on *every* infinite-scroll batch fetch.

`src/pages/Reels.tsx` (~403) compounds it: each "load more" call passes
`exclude: reels.map(r => r.id)` — the full list of everything already seen — as
a comma-joined query string that grows without bound. A long session builds a
multi-kilobyte URL and re-sorts the entire table each scroll. Move to
keyset/offset pagination server-side.

**Fixed:**
- **Offset pagination.** `/feed`, `/search`, `/popular` now take an integer
  `offset` and `slice(offset, offset + limit)`. The client
  (`fetchPixiesFeed` / `searchPixies` / `fetchPopularPixies`) sends
  `offset: pixies.length` on "load more" instead of `exclude: [...allSeenIds]`
  — the URL stays tiny. `exclude` is still honoured server-side for old cached
  clients; `Pixies.tsx`'s existing `fresh` filter still dedupes any ordering
  drift.
- **Feed memo.** `/feed` splits its heavy scan+score into `computeFeed()` and
  caches the fully-mapped ordering per `viewerId|interests|includeId` for 8 s
  (max 200 entries, LRU-pruned). `offset === 0` always recomputes (fresh load /
  tab switch); `offset > 0` mid-scroll slices the memo, so a scroll session
  runs `selectAllVideos.all()` + scoring once, not per batch.
- Verified with a 25-row pagination smoke test (3 non-overlapping pages, 25
  unique) + `/search` / `/popular` offset; backend 211/211, `tsc` / `eslint` /
  `vite build` clean.

### 21. [perf] ✅ FIXED — `startJobCreep` interval never self-terminates
`mirabellier-backend/routes/videos.js` ~1059. The interval callback early-returns
when `job.state !== "running"` but does not `clearInterval` itself; it relies on
every caller path clearing it. Today they all do, but a future `return`/`throw`
added to `performImportJob` before the matching `clearInterval` leaks a 700 ms
timer for the life of the process. Have the callback clear its own handle on the
terminal state.

**Fixed:** the interval callback now `clearInterval(interval)`s itself once
`job.state` is `"done"` or `"error"` (non-terminal states keep the existing
`return`-only behaviour; callers still clear between stages — a double clear is
a no-op). Also added the missing `clearInterval(creep)` to `performImportJob`'s
"no username" early return, which was a real (not just latent) leak.

---

## Minor

### 22. [bug] ✅ FIXED — Double-tap heart key can collide
`src/pages/Reels.tsx` ~733: `const id = now;` (`Date.now()`) is the React
`key` and the removal id. Two double-taps in the same millisecond produce
duplicate keys and one heart won't animate out. Also the removal `setTimeout`
is 900 ms while the CSS animation `floatUp` is `0.8s` — 100 ms of dead frame.
Use a monotonic counter.

**Fixed** (`Pixies.tsx`): heart `id` is now `heartIdRef.current += 1` (a
monotonic per-component counter) instead of `Date.now()`, and the removal
`setTimeout` is 800 ms to match `floatUp 0.8s`.

### 23. [bug] ✅ FIXED — Tag requirement is inconsistent across upload paths
`POST /videos/` rejects an upload with zero tags (`"At least one tag is
required"`, and `ReelUpload.tsx` enforces it client-side), but `POST
/videos/admin` and `POST /videos/admin/import` accept zero tags silently. If
that asymmetry is intentional (admin convenience) it's undocumented; if not,
the admin paths are missing the check.

**Fixed:** made every path accept zero tags (matching the admin/import paths).
Backend `POST /pixies/` no longer 400s on empty tags. `PixieUpload.tsx` drops
the client-side check, the submit-button `tags.length === 0` disable, the
`required` asterisk, and rewors the placeholder / help text / tips copy to
"optional".

### 24. [bug] ✅ FIXED — Deleting a video from Profile doesn't update the shown stats
`src/pages/Profile.tsx` `handleDeleteReel` (~168) removes the row from `videos`
but leaves `stats.postsCount` / `stats.likesCount` untouched, so the header
counters stay stale until reload. (Note the "Posts" stat is blog posts, not
videos, so this only matters if stats ever start counting videos.)

**Fixed:** confirmed `/user/:id/stats` (`postsCount` / `likesCount` /
`commentsCount`) counts blog `posts` only — nothing to decrement on a video
delete (comment added in `handleDeletePixie`). The actual user-visible
staleness was the pager: deleting the last video on a page left `videosPage`
past `totalVideoPages`, showing an empty grid. Added an effect that clamps
`videosPage` down when the page count shrinks.

### 25. [ux] ✅ FIXED — `AdminReels` success banner is sticky
`src/pages/AdminReels.tsx` ~670: `{lastUpload && !message && (...)}` keeps
"Uploaded as X! 🎉" on screen indefinitely after a successful upload, through
the start of the next edit, until a `message` is set or the page reloads.
Also both a toast *and* the banner fire for the same event.

**Fixed:** removed the sticky banner and the `lastUpload` state; the (now
single) transient toast carries the useful detail —
`showToast(\`Uploaded as ${username}! 🎉\`)`.

### 26. [style] ✅ FIXED — `kanna-police.webp` used with conflicting dimensions/alt
`AdminReels.tsx` (~384): `width="320" height="427"`, alt `"kanna police"`.
`ReelUpload.tsx` (~189): same asset, `width="498" height="498"`, alt
`"kanna police gif"` (it's a `.webp`, not a gif). At least one set of intrinsic
dimensions is wrong, which hurts CLS.

**Fixed:** the file's real intrinsic size is 498×280 (animated WebP). Both
usages (`AdminPixies.tsx`, `PixieUpload.tsx`) now set `width="498" height="280"`
and `alt="Kanna police"`. Display size is still CSS-driven (`w-full` /
`max-w-[320px]`).

### 27. [style] ✅ FIXED — `videoRefs.current` array is never trimmed after a delete
`src/pages/Reels.tsx` `handleDeleteReel` (~871) filters `reels` but leaves
trailing stale entries in `videoRefs.current`. Harmless today (indices past
`reels.length` aren't read) but a latent foot-gun.

**Fixed:** `handleDeletePixie` now `splice`s the removed pixie's slot out of
`videoRefs.current` and sets `.length = next.length`, keeping the ref array
index-aligned with `pixies` (mirrors the `pixies.filter(...)`).
