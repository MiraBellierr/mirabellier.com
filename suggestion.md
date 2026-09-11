# Cool stuff to add to mirabellier.com

Written 2026-09-10, after reading the current tree. The site is already unusually
feature-dense (blog, shrines, guestbook, QOTD, quotes, anime, fanart, Twitch,
Pixies, Arena + TCG, profiles + follows, admin), so this list deliberately skips
"add a blog" style filler. Everything below is either **missing entirely** (I
checked) or a small extension of something that already exists.

`TODO.md` (security) and `improvements.md` (perf/SEO) cover the *engineering*
backlog. This file is the *fun* backlog.

---

## Top 5, if you only do five

1. ~~**RSS / Atom / JSON feed**~~ ✅ done (2026-09-10). Blog + QOTD feeds.
2. ~~**`⌘K` sitewide command palette**~~ ✅ done (2026-09-11).
3. ~~**Per-post generated OG images**~~ ✅ done (2026-09-10) for blog posts. Shrines/QOTD already have their own preview images.
4. ~~**A `/now` page**~~ ✅ done (2026-09-10). Public page + owner editor.
5. ~~**Public changelog page**~~ ✅ done (2026-09-10). `/changelog` + owner editor.

---

## 🌸 Small-web / cozy things

These fit the "soft internet things" framing in the README better than anything else.

### 1. RSS / Atom / JSON feeds  ⭐ highest value/effort ratio  ✅ DONE (2026-09-10)

**Shipped:** `lib/feed.js` (modelled on `sitemap.js`) writes `/feed.xml` + `/feed.json`
for the blog and `/feed/questions.xml` + `/feed/questions.json` for Question of the
Day, regenerated on every post/QOTD change and at boot. `<link rel="alternate">`
discovery tags in `index.html`; visible "Subscribe: RSS · JSON" links on `/blog`
and the QOTD archive. Tests in `mirabellier-backend/test/feed.test.js`.

There is **no feed anywhere** — I grepped `mirabellier-backend/app.js` and the
whole frontend; `rss` and `feed.xml` appear nowhere. A personal blog without a
feed is invisible to the part of the web that still uses readers, and it's the
thing that makes a site linkable from other people's blogrolls.

- Model it directly on `mirabellier-backend/lib/sitemap.js` — same shape of job,
  same data source, already wired into the app.
- Serve `/feed.xml` (Atom) and `/feed.json` (JSON Feed 1.1 — much nicer to
  generate, and readers support it).
- Add `<link rel="alternate" type="application/rss+xml">` to `index.html` and to
  the crawler head in `mirabellier-backend/lib/spa-entry.js`.
- Worth a second feed for Question of the Day — it's daily, serial content,
  which is exactly what feeds are for.

**Effort:** an afternoon. **Risk:** none.

### 2. A `/now` page  ✅ DONE (2026-09-10)

**Shipped:** `site_now` table + `GET/PUT /now`; public `src/pages/Now.tsx` (intro +
free-form sections, "Updated N days ago", auto-filled latest post / current anime /
latest Pixie); owner editor `src/pages/AdminNow.tsx`; nav entry, `/admin` card,
prerendered SEO head. Tests in `mirabellier-backend/test/site-now.test.js`.

The nownownow.com convention: what you're doing *right now*, not a résumé.
`src/pages/Home.tsx` already has `getHomeGreeting`, `getHomeStatus`, and a
Malaysia-timezone clock — the vibe is written, it just has nowhere to live. Pull
it into a real page with hand-edited sections (reading, watching, building,
listening) plus auto-filled bits from data you already have: latest post, current
anime from `/anime`, latest Pixie.

Give it an admin editor like `AdminQuestionOfTheDay.tsx` so updating it doesn't
need a deploy.

### 3. A public changelog at `/changelog`  ✅ DONE (2026-09-10)

**Shipped:** took a third route, a dedicated `site_changelog` table + `GET /changelog`
and owner-only `POST`/`PUT`/`DELETE` (no `scope` column bolted onto `arena_updates`,
so the Arena feature is untouched). Public `src/pages/Changelog.tsx` (dated entries
newest first; `- ` lines render as bullets, no markdown dep) and owner editor
`src/pages/AdminChangelog.tsx` (create/edit/delete). Nav entry, `/admin` card,
prerendered SEO head. `changes.md` was **not** migrated. Its bullets are all
Arena-specific and stale; Arena keeps its own log at `/arena/archive`.
Tests in `mirabellier-backend/test/site-changelog.test.js`.

`changes.md` is sitting in the repo root, dated July 6, formatted nicely, and
surfaced **nowhere** — nothing in `src/` references it. Arena gets
`/arena/archive` for its update posts; the rest of the site gets nothing.

Two ways, pick one:

- **Cheap:** ship `changes.md` as a static asset and render it. Zero backend.
- **Nicer:** reuse the Arena updates table (`AdminArenaUpdates.tsx` is already a
  full editor UI) with a `scope` column so it can post site-wide entries too.

### 4. `/uses` + colophon  ✅ DONE (2026-09-10)

**Shipped:** static page (no backend; content changes rarely, so it lives in
`src/lib/uses.ts` like `src/lib/projects.ts`, not a DB). `src/pages/Uses.tsx`
renders sections for the frontend/backend stack, hosting & the atomic-symlink
deploy, type & theme, tooling, and desk. Nav entry, `/projects` cross-link,
`/uses` in the sitemap + a prerendered SEO head. The "desk" section has a
`TODO(mira)`: fill in editor / keyboard / anything personal.

`/projects` covers *what you built*. `/uses` covers *what you build with* —
editor, keyboard, theme, hosting, the fonts on this site, the fact that the whole
thing is React 19 + Vite 7 on a VPS with atomic symlink deploys. It's a genre
page, people link to them, and yours would be more interesting than most because
the deploy story is actually good.

### 5. Webring + blogroll  ✅ DONE (2026-09-10)

**Shipped:** owner-editable, backed by a `site_links` table (one JSON row,
`GET /links` public + `PUT /links` owner-only — same "seed then DB" pattern as
`/now`). `src/pages/Links.tsx` renders a blogroll of sections ("friends &
neighbours", "small-web corners") — each entry name + optional `rss` link +
blurb — a webring section, and a "want a link back?" pointer to the guestbook;
empty sections are hidden. `src/lib/links.ts` now only holds the pre-save
default list. Owner editor `src/pages/AdminLinks.tsx` (`/admin/links`,
`/admin` card): add/remove/rename sections, add/remove link rows, and a webring
form. The webring only "enables" once its hub + prev + next URLs are all set;
until then the `Footer.tsx` widget (`‹ prev · ring · rand · next ›`) and the
on-page panel stay hidden, so there are never dead links. The footer reads the
live webring via `useWebring()` (shares the `/links` SWR fetch). All URL fields
run through the backend `sanitize-website` helper. Also wired into
`Navigation.tsx`, the `vite.config.ts` SEO route list (prerendered head), and
`lib/sitemap.js`. Tests in `mirabellier-backend/test/site-links.test.js`.

Pure small-web. A `/links` page of sites you like, and a webring widget in
`Footer.tsx`. Low effort, high "this is a real personal site" signal. Pairs
naturally with #1 — you can only be in someone's reader if you have a feed.

### 6. Guestbook "on this day"  ✅ DONE (2026-09-10)

**Shipped:** `mirabellier-backend/lib/guestbook-on-this-day.js` (UTC month-day key +
limit clamp + the one query) behind `GET /guestbook/on-this-day`, which returns
`{ date, entries }` for notes pinned on today's calendar date in a strictly
earlier year (matched with `substr(createdAt, …)` so it doesn't depend on the
bundled SQLite's `strftime` "Z" handling). Reuses the route's existing
`mapEntryRow`. Frontend: `fetchGuestbookOnThisDay` in `src/lib/guestbook-api.ts`
and `src/parts/GuestbookOnThisDay.tsx`, a right-side panel on `/guestbook` that
renders nothing when there are no memories or the fetch fails. Tests in
`mirabellier-backend/test/guestbook-on-this-day.test.js`.

The guestbook is a draggable board with moods already (`GuestbookMood` in
`src/lib/guestbook-api.ts`). Add a widget that resurfaces entries left on this
date in past years. Costs one query, makes an old guestbook feel alive instead
of archived.

---

## ✍️ Blog quality-of-life

### 7. Per-post generated OG images  ⭐  ✅ DONE (2026-09-10) — blog posts

**Shipped:** `mirabellier-backend/lib/post-og-image.js` (modelled on
`quote-embed.js`) renders a 1200x630 SVG title card — `mirabellier.com` / `blog`
wordmark, the post title auto-sized down through four steps to fit four lines,
a `Month D, YYYY · #tag #tag` meta row, the site sky background + flower — and
rasterises it with `sharp`. Served from **`GET /og/post/:slug.png`** in
`routes/posts.js` (the `:slug` carries the full `<slug>-<id>` from the blog URL;
only the trailing id is looked up). Cache is `immutable` when the URL carries
`?v=<updatedAt digest>` and `max-age=300` otherwise. The crawler HTML in
`buildBlogRedirectPage` now falls back to this card (with `og:image:width/height`)
whenever a post has **no hand-picked `thumbnail`**; a real thumbnail still wins.
`src/pages/BlogPost.tsx` mirrors the same URL for the SPA `og:image` (shared
`getPostOgVersion` digest so both request the identical asset). Tests:
`mirabellier-backend/test/post-og-image.test.js` (helpers + a real `sharp`
render) and `test/post-og-route.test.js` (Express 5 routing, cache headers,
crawler HTML, 404).

**Still static:** shrines and QOTD — their embed builders already emit dedicated
preview images, so they were out of scope here. Extend `post-og-image.js` to
them later if the plain cards ever feel worth it.

`vite-plugin-route-seo.ts:102` and `src/lib/seo.ts:103` both set `og:image`, but
always to a **static** URL. So every blog post, every shrine, every QOTD unfurls
in Discord with the same picture.

The backend already has `sharp` (`lib/share-preview-utils.js`) and already does
crawler-side head injection in `lib/spa-entry.js`, so the pieces are in place:
render title + date + tag onto a card, cache by post slug + `updatedAt`, serve
from `/og/post/:slug.png`. This is the highest-impact social/SEO item left now
that `improvements.md` is mostly worked through.

### 8. Reading time + table of contents  ✅ DONE (2026-09-11)

**Shipped:** `src/lib/blog-reading.ts` — a config-free module (so it's unit
testable under `node --test`) holding the moved-out `extractTextFromContent` +
`slugify`, plus `countWords` (per-text-node, so paragraph joins don't merge
words), `readingTimeMinutes` (200 wpm, min 1, 0 when empty), `formatReadingTime`
("N min read"), and `extractHeadings` (walks the doc for `<h2>`–`<h4>` — this
blog jumps h2→h4 — returning `{ id, text, level }` with slug ids deduped
`slug-2`, `slug-3`). `blog-utils.ts` re-exports all of it so existing importers
are untouched. `BlogPost.tsx`: reading time in the byline; a right-hand sticky
`<aside>` TOC on desktop (`hidden lg:block`, scroll-spy highlights the section
scrolled past) and a `<details>` version on mobile, both hidden below 2
headings; a `useEffect` assigns `extractHeadings`' ids to the rendered
`<h2>`–`<h4>` by document order (skipping empties) and re-syncs via
`MutationObserver` since the Tiptap editor mounts async. `Blog.tsx`: reading
time in each card's meta line. `blog.css` adds `scroll-margin-top` on post
headings. Tests: `src/lib/blog-reading.test.ts` (8).

Neither exists (grepped `readingTime`/`toc` — nothing). You're on Tiptap, so the
document is structured JSON, not a blob of HTML: walking it for headings is
genuinely easy, unlike on most blogs. Sticky TOC on desktop, reading time in the
post header and in the `/blog` list.

### 9. Post series / prev & next  ✅ DONE (2026-09-11)

**Shipped:** `src/lib/blog-navigation.ts` (config-free, +6 tests) — `getPostNeighbors`
(chronological older/newer, null at the ends) and `getSeriesContext` (posts sharing
a `series`, matched case-insensitively on the trimmed value, sorted oldest→newest,
with the current post's index + prev/next part; null below 2 members).
`BlogPost.tsx` renders a "Keep reading" card between the article and the
interaction box: when the post is in a series, a "Part N of M · {name}" panel with
the numbered part list (current marked `aria-current`) plus part-to-part prev/next;
otherwise date-based "← Older post / Newer post →". Backend: a nullable `series`
column (`ensureColumn`), `lib/post-series.js` `sanitizeSeries` (trim, collapse
whitespace, strip control chars, cap 80; +5 tests), threaded through `mapPostRow`
+ POST + PUT (PUT clears it when sent `null`). `BlogEdit.tsx` gets a "Series"
input; `normalizePost` + the `Post` type carry `series`. Verified end-to-end in
the browser (series panel, date prev/next, editor round-trip with whitespace
normalisation).

`BlogPost.tsx` is a dead end — you read a post and the journey stops. Add
prev/next by date, plus optional `series` grouping. Cheapest possible increase in
pages-per-session.

### 10. Live word count in the editor  ✅ DONE (2026-09-11)

**Shipped:** `BlogEdit.tsx` shows a live "N words · M min read" line on the
Content label row, recomputed with `useMemo` on every editor change (the
existing `onContentChange` → `content` state) and reusing `countWords` +
`readingTimeMinutes` from `blog-reading.ts` — no new helpers. The "last saved"
indicator was **skipped**: the form is a manual publish with no autosave, so
there is nothing to time; the Publish button already shows its own
"Publishing..." state. Add it if autosave ever lands.

`BlogEdit.tsx` uses Tiptap; a status bar with word count, read time, and a
"last saved" indicator is a small addition that you personally would use every
time you write.

---

## 🔍 Navigation & discovery

### 11. `⌘K` command palette  ⭐  ✅ DONE (2026-09-11)

**Shipped:** `src/parts/CommandPalette.tsx`, mounted once in `App.tsx`. A
manual `document.addEventListener("keydown", …)` (same pattern as
`ConfirmDialog.tsx`, so `⌘K`/`Ctrl+K` works even while a form input or the
Tiptap editor has focus) toggles it open; a "search ⌘K" button in
`Navigation.tsx` opens it too, via a tiny pub-sub (`src/lib/command-palette.ts`)
rather than threading a new Context through the app. Static route list is
**reused, not reinvented** — `Header.tsx`'s existing `HEADER_ROUTE_TITLES`
(now exported) is filtered down to real, non-parameterized, non-`/ar/`-alias
paths. Blog posts, shrine pages, and QOTD archive days are fetched lazily on
first open via the already-existing `fetchPosts` / `fetchShrinePages` /
`fetchQuestionOfTheDayArchive` (all backed by the `swrJson` cache, so repeat
opens are free). Plain substring filter, grouped by section, arrow keys +
Enter + Escape, click-outside to close. Individual **projects** were left out
of the index — `/projects` has no per-project route, so a project result
would just point at the same page the "projects" static entry already covers.
The `?` shortcuts overlay was also skipped — one discoverable shortcut didn't
need a help screen. `react-hotkeys-hook` / Radix popover / floating-ui /
virtualized list were all skipped too — none were needed for a ~60-item,
non-virtualized list with a manual keydown handler.

### 12. Sitewide search endpoint  ✅ DONE (2026-09-11)

**Shipped:** `mirabellier-backend/lib/search-index.js` — one FTS5 virtual table
(`search_index`) over post bodies, shrine blurbs, QOTD prompts, and QOTD
answers, served from the new public **`GET /search?q=…`**
(`mirabellier-backend/routes/search.js`). The index is kept in sync by SQLite
**triggers** on `posts`/`shrine_pages`/`daily_questions`/`daily_question_answers`
(installed once from `initializeSchema`), so every existing insert/update/delete
route — `routes/posts.js`, `routes/shrines.js`, the QOTD routes — keeps working
completely unmodified; nothing outside `search-index.js` knows the index
exists. A custom SQL function (`db.function("mb_extract_post_text", …)`) walks
each post's Tiptap JSON for the trigger to call, and a generous rowid-offset
scheme (`kind offset + source-table rowid`) lets four tables share one FTS5
table without collisions. User input is wrapped as quoted, prefix-matched
phrases (`"word"*`) before hitting `MATCH`, so it can never be read as FTS5
query syntax (`AND`/`OR`/column filters). Snippets use FTS5's own `snippet()`
— no manual highlighting code. 9 tests in
`mirabellier-backend/test/search-index.test.js` (trigger insert/update/delete,
query sanitisation, the Tiptap text walker). **`quote_snapshots` was left out**
of the index — those are externally-fetched BrainyQuote-of-the-day snapshots,
not authored content, so searching them has little value and they don't fit
the four "your own content" tables cleanly.

`src/parts/CommandPalette.tsx` (#11) now calls this endpoint instead of
fetching whole posts/shrines/QOTD-archive lists client-side and substring
matching in the browser: static pages still filter client-side (instant, no
network needed for ~60 rows), but any non-empty query is also sent to
`/search` (250ms debounce, `AbortController` per keystroke) via the new
`src/lib/search-api.ts`. This is a real capability upgrade, not just a
refactor — search now reaches inside post **bodies** and QOTD **answers**,
which the old client-side title-only filter could never do.

---

## 👥 Social layer

### 13. Extend web push beyond Twitch  ✅ DONE (2026-09-11)

**Shipped:** a generic Web Push layer alongside Twitch's (untouched — it
already had real subscriber rows, so it keeps its own table/routes/module).

- `mirabellier-backend/lib/push-config.js` — the shared VAPID env/`web-push`
  client, extracted from `lib/twitch-push.js` (which now delegates to it;
  zero behavior change, same exports).
- `mirabellier-backend/lib/push-subscriptions.js` — one new `push_subscriptions`
  table keyed by an opaque `topic` string instead of a feature column, so it
  covers all three asks without three tables: `"blog:new-post"`, `"qotd:new"`,
  and one per account, `"pixie:follows:<userId>"`, fanned out to every
  follower (`getFollowerIds`, added to `lib/user-follows.js`) on upload.
- `mirabellier-backend/routes/push.js` — generic `/push/vapid-public-key`,
  `/push/subscribe`, `/push/status`. A "follow" topic is authorization-checked
  server-side: only the signed-in account matching that topic's userId may
  subscribe to it (otherwise anyone could register push endpoints against
  someone else's followers) — sitewide topics stay open, same as Twitch.
- Triggers: `routes/posts.js` fires on a new post; a new
  `lib/question-of-the-day-push.js` mirrors `question-of-the-day-discord.js`'s
  "which question is active" detection (reused via an additive export,
  `createNotifier`/`getCurrentRecordedDate`) with its own `pushNotifiedAt`
  gate column so it fires whether or not the Discord webhook is configured,
  wired into the same reactive call sites *and* its own 60s poller for the
  midnight-rollover case Discord's scheduler already needed. `routes/pixies.js`
  fans out on direct user uploads only (not admin/social imports).
- 21 new backend tests (`test/push-subscriptions.test.js`,
  `test/question-of-the-day-push.test.js`, `test/push-routes.test.js` —
  including the follow-topic authorization boundary). Full suite: 369 pass.

**Frontend:** `src/lib/push-support.ts` (browser helpers — including the
Brave "push service error" message fix from earlier this session) and
`src/lib/push-api.ts` (generic fetch layer) were extracted so
`src/pages/Twitch.tsx`'s already-shipped `NotifyButton` and the new
`src/parts/NotifyToggle.tsx` share one implementation instead of three
copies. `NotifyToggle` is dropped into `/blog` and the QOTD archive page next
to the existing "Subscribe: RSS · JSON" line, and into `/settings` as a
"Notifications" card for the follow-topic (only shown when signed in).
Verified against the real local backend: full subscribe → status →
unsubscribe round-trips for all three topic shapes, and the sitewide toggles
rendered correctly in the browser. The actual browser permission-prompt →
`pushManager.subscribe()` leg couldn't be driven through browser automation
(a native Chrome dialog, not page JS — same constraint that would block any
test of the pre-existing Twitch button), but that code path is an unmodified,
parameterized copy of Twitch's already-working flow.

### 14. A real activity feed on `/profile`  ✅ DONE (2026-09-11)

**Shipped:** `mirabellier-backend/lib/user-activity.js` merges posts,
guestbook signatures, Pixie uploads, Pixie comments, blog comments (walked
recursively out of the nested `posts.comments` JSON, same shape as
`routes/auth.js`'s existing stats scan, cached the same way — TTL + keyed to
the `db` instance so it can't go stale across a schema swap), new follows,
and Arena fights into one chronologically sorted timeline, from
`GET /user/:id/activity` (`routes/auth.js`, next to the existing
`/user/:id/stats`). **Likes were left out** — neither `posts.likes` nor
`user_videos.likes` records *when* a like happened, just a bare array of
liker ids, so there's no timestamp to sort a like into a timeline by; fixing
that would mean a schema change to every like path, out of scope for a
read-only feed. Two new indexes (`user_video_comments`, `guestbook_entries`,
both `(userId, createdAt DESC)`) so every source query is a plain indexed
lookup except the necessarily-scanned comment blobs. 6 new backend tests.

`src/pages/Profile.tsx`'s "Recent Activity Section" was already there —
except it only ever showed the user's own posts (`stats.recentPosts`, now
removed as dead weight). It's now a real merged feed via the new
`src/lib/user-activity.ts` client and a `describeActivityEvent` renderer
(icon + verb + optional preview per event type), reusing the section's
existing card/loading/empty-state styling as-is. Verified in the browser
against the real local backend: guestbook, posts, Arena fights, Pixie
comments, and follows all appear correctly interleaved and sorted.

### 15. Public site stats / "year in review"  ✅ DONE (2026-09-11)

**Shipped:** `mirabellier-backend/lib/site-stats.js` — sitewide counts (blog
posts, guestbook signatures + full mood breakdown, QOTD questions/answers,
Arena fights + win count, Pixies, registered accounts) plus a `sinceDate`
derived from the earliest post/guestbook-entry/question rather than a
hardcoded launch date, so it can't drift out of sync. Every query is a
single indexed `COUNT`/`GROUP BY` — no caching needed at this data size.
Served from public **`GET /stats`** (`routes/site-stats.js`, 60s
`Cache-Control`). 5 backend tests.

`src/pages/Stats.tsx` at **`/stats`**: a tile grid of the headline numbers
plus the guestbook mood breakdown (reusing the existing `guestbookMoodMeta`
kaomoji labels from `/guestbook` — no new copy to write), wired into
`App.tsx`, `Navigation.tsx`, `Header.tsx`'s route-title list, the
prerendered-SEO route list in `vite.config.ts`, and `lib/sitemap.js` —
the same five places every other top-level page in this list has gotten
wired into. Verified live: real counts (8 posts, 27 guestbook signatures,
76 QOTD answers, 561 questions asked, 16 Pixies, "cozy" the most popular
mood) render correctly, tie-breaking in the mood list is alphabetical and
tested.

**Left out:** the December "wrapped" variant — genuinely a separate feature
(date-range filtering across every one of these queries, plus its own
design), not a natural extension of a live counts page. Worth its own pass
closer to December rather than speculative code sitting unused for months.

---

## ⚔️ Arena / TCG

Only add these if Arena is still fun for you; it's the biggest surface already.

### 16. Spectator mode  ✅ DONE (2026-09-11)

**Turned out more subtle than "a room-join permission change":** the actual
fighter flow is REST-driven (`POST /arena/fight/start|advance|skip` via
`src/lib/arena/combat.ts`) — the WS `ARENA_FIGHT_*` messages in `app.js`
exist but nothing calls them. And every WS connection requires a one-time
token from `/auth/ws-token`, which 401s when signed out — so real-time push
can only ever reach *logged-in* spectators, not "any third party."

**Shipped, working within those constraints:**

- `lib/arena/playback.js`: the raw `startPlaybackFight` / `advancePlaybackFightTurn`
  / `skipPlaybackFightToEnd` are wrapped once, at their `module.exports`
  entries, to broadcast the new fight state to a `arena:fight:<fighterUserId>`
  Socket.IO room — one hook point covers both the REST routes *and* the
  (currently dormant) WS messages, instead of duplicating the broadcast at
  every call site. A failed broadcast (no WS manager, e.g. in tests) is
  swallowed — it must never break the fighter's own turn.
- `lib/websocket-server.js`: `handleMessage` now also receives the raw
  `socket`, and a new `broadcastToRoom` was added alongside the existing
  `broadcast`/`sendToUser`. `app.js` handles two new C2S messages,
  `ARENA_FIGHT_SPECTATE_JOIN`/`_LEAVE`, so a **signed-in** viewer's socket
  can join/leave a fighter's room and gets pushed every future turn — this
  is real, tested, working infra, just not wired to a frontend yet (see
  below).
- Two public REST endpoints (`routes/arena/index.js`, no auth) so *anyone*
  can spectate: `GET /arena/spectate/active` (who's fighting right now —
  `getActiveArenaFighters`, a new query joining `arena_active_fights` with
  `users`) and `GET /arena/spectate/:userId` (that fighter's current state,
  reusing `getPlaybackFightState` — the exact same shape already sent to the
  fighter's own client, so nothing new to leak).
- `src/pages/ArenaSpectate.tsx` at `/arena/spectate` (+ `/:userId`, both also
  mounted under `/ar/...`): a list of who's fighting, and a read-only view
  (HP bars, round score, the turn console log) that works for **every**
  visitor via a 2s poll of the public endpoint — not the WS room, since that
  needs a login the suggestion's "any third party" didn't assume. Added to
  `ArenaSubNav`'s Community group and `Header.tsx`'s route titles.
- 3 new backend tests (`test/arena-service.test.js`): `getActiveArenaFighters`
  filtering/ordering, the broadcast firing with the right room/payload, and
  broadcast failures not breaking the fighter's turn.

**Update (same day):** the frontend is now wired to the WS room too.
`ArenaSpectate.tsx` checks `useOptionalAuth()` — logged in sends
`arena:fight:spectate:join`/`:leave` over the shared `WebSocketProvider`
connection and drives the view entirely off `arena:fight:spectator-update`
pushes (no poll at all; a "🔴 live" badge replaces "updates every few
seconds"); logged out keeps the original 2s REST poll, since that's the only
thing that works without a session. `arena:fight:error` is shared with the
fighter's *own* action errors (rate limits, verification), so the handler
only reacts to the join-specific `ARENA_FIGHT_NOT_FOUND` code — otherwise a
viewer who happens to be fighting themselves in another tab could have this
page misread their own unrelated error as "this fight ended." Verified
end-to-end against the real dev server: joined as a logged-in viewer, no
REST polling for 6+ seconds (confirmed via network tab), then advanced the
watched fight through the *real* authenticated REST route (Turnstile-bypassed
via `TURNSTILE_DEV_BYPASS`) and watched the page update instantly, no
refresh — the full path (route → wrapped `advancePlaybackFightTurn` →
`broadcastSpectatorUpdate` → Socket.IO room → shared WS client → re-render)
genuinely works.

**A caution for future you:** verifying this meant creating real rows on the
local dev database twice. The first pass used the actual owner account as
the test fighter — its poll reaching "finished" triggered the real
reward-finalization path against that live profile (+3 XP, a phantom loss),
by-hand reverted from the numbers in the fight's own stored `simulationJson`,
then the fight row deleted. Lesson learned: the second pass (this update)
created a fully disposable throwaway user/profile/session instead, deleted
after — the safer way to do this kind of live check, worth doing from the
start next time.

### 17. Replay links  ✅ DONE (2026-09-11)

**Both of this suggestion's premises were wrong, checked before writing any
code:** `lib/arena-fight-verification.js` is Cloudflare Turnstile "are you
human" tracking, nothing to do with fight determinism — there's no seed
scheme and none was needed, because `arena_fights.roundsJson` already stores
every turn's full result (attacker/defender names, damage, crit, HP) the
moment a fight ends. And Hall of Fame (`lib/arena/hall-of-fame.js`) turned
out to be a monthly top-3-by-ELO *player ranking* snapshot with no reference
to any individual fight — there was nothing on that page to make clickable.

**What actually needed building:** a public read of already-stored data, and
somewhere to click into it from. `lib/arena/profile.js` already had
`readRecentFights` bundling full round data into every profile fetch — and
the frontend type `ArenaProfile.recentFights` already existed for it — but
nothing rendered it; it was fetched and silently thrown away on every single
profile load.

- `lib/arena/profile.js`: new `getArenaFightById` (+ extracted
  `parseFightRounds`, shared with `readRecentFights`) — a public lookup by
  fight id, joined with `users` for the fighter's name.
- `routes/arena/index.js`: public `GET /arena/fights/:id`.
- `src/pages/ArenaFightReplay.tsx` at **`/arena/fight/:id`** (co-existing
  with the existing exact-match `/arena/fight` live Battle route) — HP bars
  derived from the max HP seen across the stored rounds, a turn-by-turn
  play/pause/skip auto-advancing console reconstructed client-side from each
  round's fields (the human-readable log lines themselves only ever existed
  on the short-lived *active*-fight row, not the permanent one, so replay
  rebuilds the same "X is attacking Y" / "X dealt N damage" text from the
  numbers instead of re-deriving it server-side).
- `ArenaFight.tsx` (the player's own Battle page) gained a "recent fights"
  collapsible sidebar panel — pure addition, zero risk to that file's
  already-complex resume-state-machine, and it needed no new fetch: the data
  was already sitting in `profile.recentFights` unused.
- `lib/user-activity.js`'s `arena_fight` activity events (#14) now link to
  the real replay instead of the generic `/arena` hub — a concrete example
  of one suggestion completing another.
- Shared `src/parts/ArenaHpBar.tsx`, extracted out of `ArenaSpectate.tsx`'s
  local copy (#16) rather than writing a third one — `ArenaFight.tsx` keeps
  its own richer version (shield rendering) untouched, on purpose.
- 2 new backend tests; the existing `user-activity` test updated for the new
  href. Full suite: 384 pass.

Verified against the real dev server: a genuine historical fight
(`fight-1788767959989-ly9824v`, a real win from 2026-09-07) replayed
correctly end to end — matching HP/damage numbers, auto-advanced to
"Turn 11 of 11 · +13 XP, +16 coins" matching the stored `xpDelta`/`coinDelta`
exactly, and the profile Activity feed's "won an Arena fight" entry linked
straight into it.

add cards display in replay

### 18. Daily quest / login streak

The pieces are all there: scheduler patterns in
`arena-hall-of-fame-scheduler.js`, an inbox in `ArenaInbox.tsx`, a shop to spend
in. A simple daily objective is the standard fix for "I logged in, now what?".

---

## 🛠️ Plumbing worth having

### 19. `prefers-reduced-motion` audit

The site leans on custom cursors (`src/parts/cursor/`), holo tilt
(`use-holo-tilt.ts`), pack-opening animations, and a deferred animated hero. None
of that should run for someone who asked their OS for less motion. One shared
hook, applied in a few places.

### 20. Bring the custom cursor to a decision

`CursorContext` + `ToggleCursor` + three cursor components is a lot of surface
for a feature many visitors turn off immediately. Either make it a first-class
delight (trail, per-page variants, a cursor picker in `/settings`) or retire it.
Right now it sits in between.

---

## Suggested order

1. ~~**RSS/JSON feed**~~ ✅ done 2026-09-10.
2. ~~**Command palette**~~ ✅ done 2026-09-11.
3. ~~**Per-post OG images**~~ ✅ done 2026-09-10 (blog posts).
4. ~~**`/now` + `/changelog` + `/uses`**~~ ✅ done 2026-09-10 (all three).
5. ~~Reading time + TOC + prev/next~~ ✅ done 2026-09-11 (#8 + #9).
6. ~~**Push beyond Twitch**~~ ✅ done 2026-09-11.
7. ~~**Profile activity feed**~~ ✅ done 2026-09-11.
8. ~~**Site stats page**~~ ✅ done 2026-09-11.
9. ~~**Spectator mode**~~ ✅ done 2026-09-11 (#16, including the live-push
   follow-up).
10. ~~**Replay links**~~ ✅ done 2026-09-11 (#17). The daily quest / login
    streak idea (#18), the rest of Arena, and the cursor decision are all
    that's left, whenever they sound fun rather than owed.

## Progress log

- **2026-09-10**: Shipped #1 (blog + QOTD feeds), #2 (`/now` page + editor),
  #3 (`/changelog` + editor), #4 (`/uses` static colophon). Next up per the
  order: command palette, then OG images.
- **2026-09-10**: Shipped small-web #5 (`/links` blogroll + `Footer.tsx` webring
  widget). Now owner-editable: `site_links` table + `GET/PUT /links` +
  `src/pages/AdminLinks.tsx` at `/admin/links`. Webring only lights up once its
  hub/prev/next URLs are set, so no dead links. Command palette and OG images
  still next.
- **2026-09-10**: Shipped small-web #6 (guestbook "on this day"):
  `GET /guestbook/on-this-day` + `GuestbookOnThisDay.tsx` side panel on
  `/guestbook`, hidden until there is history to show. Command palette and OG
  images still next.
- **2026-09-10**: Shipped #7 (per-post OG images) for blog posts:
  `lib/post-og-image.js` renders a 1200x630 title card, served from
  `GET /og/post/:slug.png`; crawler HTML + the SPA fall back to it for any post
  with no hand-picked thumbnail. Shrines/QOTD left alone (they already emit their
  own preview images). Command palette is the last of the top-5 still open.
- **2026-09-11**: Moved the blog post `<h1>` out of the site header band into the
  article, above the byline (`Header` gained `ownsPageHeading`). Then shipped #8
  (reading time + TOC): `src/lib/blog-reading.ts` (+8 tests), sticky desktop TOC
  with scroll-spy / mobile `<details>` on `BlogPost.tsx`, "N min read" in the
  byline and the `/blog` list.
- **2026-09-11**: Shipped #9 (series + prev/next): `src/lib/blog-navigation.ts`
  (+6 tests) + a "Keep reading" card on `BlogPost.tsx` — a numbered series panel
  when the post names one, date-based older/newer otherwise. New nullable `series`
  column + `lib/post-series.js` `sanitizeSeries` (+5 tests) on the backend, plus a
  "Series" field in `BlogEdit.tsx`. Command palette is now the last of the top-5.
- **2026-09-11**: Shipped #10 (live word count): "N words · M min read" on the
  `BlogEdit.tsx` Content label, `useMemo` over the `content` state reusing
  `countWords` / `readingTimeMinutes`. "Last saved" skipped — no autosave to
  time. Also on `/blog`: tags in cards are now clickable (set the search) and
  the search filter matches tags; the search box moved to the right column.
- **2026-09-11**: Shipped #11 (`⌘K` command palette), the last of the top-5:
  `src/parts/CommandPalette.tsx`, reusing `Header.tsx`'s route-title list for
  static pages and the existing `fetchPosts`/`fetchShrinePages`/
  `fetchQuestionOfTheDayArchive` calls (lazily, on first open) for posts,
  shrines, and QOTD archive days. No new dependencies.
- **2026-09-11**: Shipped #12 (sitewide search endpoint): an FTS5 virtual
  table (`mirabellier-backend/lib/search-index.js`) over post bodies, shrine
  blurbs, QOTD prompts, and QOTD answers, kept in sync by SQLite triggers on
  the existing tables — no other route had to change. Served from
  `GET /search`; the command palette now queries it (debounced) instead of
  fetching whole lists and substring-filtering client-side.
- **2026-09-11**: Shipped #13 (push beyond Twitch): a generic `push_subscriptions`
  table keyed by topic (`blog:new-post`, `qotd:new`,
  `pixie:follows:<userId>`), generic `/push/*` routes, and a shared frontend
  `NotifyToggle` used on `/blog`, the QOTD archive, and `/settings`. Twitch's
  own push table/routes were left untouched. Also added the same
  Subscribe/notify line to `/question-of-the-day` itself (matching `/blog`),
  reusing everything from #13 with no new code.
- **2026-09-11**: Shipped #14 (profile activity feed): `lib/user-activity.js`
  merges posts, guestbook signatures, Pixie uploads/comments, blog comments
  (recursively walked out of the nested JSON), follows, and Arena fights into
  one sorted timeline from `GET /user/:id/activity`. Likes excluded — no
  per-like timestamp exists anywhere to sort by. Replaced `/profile`'s old
  "Recent Posts"-only block with the real merged feed. Its item styling was
  later changed from per-item cards to a bordered list (matching `/anime`),
  paginated 10/page, reusing the same page-number control as the Videos
  section below it.
- **2026-09-11**: Shipped #15 (public site stats): `lib/site-stats.js` —
  posts, guestbook signatures + mood breakdown, QOTD questions/answers,
  Arena fights + wins, Pixies, accounts, and a derived (not hardcoded)
  "running since" date, all single-query counts. New `/stats` page, wired
  into every place a top-level route needs to register (nav, header
  titles, sitemap, prerendered SEO). The December "wrapped" variant was
  left for its own pass nearer December rather than built speculatively
  now.
- **2026-09-11**: Shipped #16 (Arena spectator mode). The real fighter flow
  turned out to be REST-driven, not the dormant WS `ARENA_FIGHT_*` messages
  the suggestion assumed — and WS itself requires a login. Built both
  halves anyway: real Socket.IO room broadcast infra (`arena:fight:<userId>`,
  join/leave, tested) for a future logged-in-only live-push upgrade, and a
  public `/arena/spectate` page that works for anyone today via a 2s poll of
  two new public REST endpoints. `lib/user-activity.js`'s new "no per-like
  timestamp" and #16's "WS needs a login" are the same kind of finding —
  suggestions read simpler from outside the code than the actual
  architecture allows, so budget for a real read before estimating one of
  these as small.
- **2026-09-11 (later)**: #16 got its follow-up: `ArenaSpectate.tsx` now
  actually uses the room-broadcast infra for logged-in viewers (join on
  mount, drive the whole view off `arena:fight:spectator-update`, no poll —
  a "🔴 live" badge replaces "updates every few seconds"), falling back to
  the original 2s poll only when signed out. Verified against the real
  server: zero REST polling for 6+ seconds while logged in, then watched a
  turn advance reach the page instantly with no refresh.
- **2026-09-11**: Shipped #17 (replay links) — turned out both of its
  premises (a fight "seed", Hall of Fame entries meaning individual fights)
  were wrong, caught before writing any code. What actually shipped: a
  public `GET /arena/fights/:id` over data that was already fully stored
  (`arena_fights.roundsJson`), a new `/arena/fight/:id` replay page with a
  turn-by-turn auto-play, a "recent fights" panel on the player's own Battle
  page surfacing a profile field (`recentFights`) that was already being
  fetched and silently unused, and a real fix-forward for #14's activity
  feed (`arena_fight` events now link to the actual replay instead of the
  generic `/arena` hub). That's #1 through #17 — everything left (#18 daily
  quest/streak, spectator/Hall-of-Fame-adjacent Arena extras, the cursor
  decision) is opt-in, not owed.
