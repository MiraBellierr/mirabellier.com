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
2. **`⌘K` sitewide command palette** — the site has 50+ routes and no way to jump.
3. **Per-post generated OG images** — every link currently unfurls with the same picture.
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

### 6. Guestbook "on this day"

The guestbook is a draggable board with moods already (`GuestbookMood` in
`src/lib/guestbook-api.ts`). Add a widget that resurfaces entries left on this
date in past years. Costs one query, makes an old guestbook feel alive instead
of archived.

---

## ✍️ Blog quality-of-life

### 7. Per-post generated OG images  ⭐

`vite-plugin-route-seo.ts:102` and `src/lib/seo.ts:103` both set `og:image`, but
always to a **static** URL. So every blog post, every shrine, every QOTD unfurls
in Discord with the same picture.

The backend already has `sharp` (`lib/share-preview-utils.js`) and already does
crawler-side head injection in `lib/spa-entry.js`, so the pieces are in place:
render title + date + tag onto a card, cache by post slug + `updatedAt`, serve
from `/og/post/:slug.png`. This is the highest-impact social/SEO item left now
that `improvements.md` is mostly worked through.

### 8. Reading time + table of contents

Neither exists (grepped `readingTime`/`toc` — nothing). You're on Tiptap, so the
document is structured JSON, not a blob of HTML: walking it for headings is
genuinely easy, unlike on most blogs. Sticky TOC on desktop, reading time in the
post header and in the `/blog` list.

### 9. Post series / prev & next

`BlogPost.tsx` is a dead end — you read a post and the journey stops. Add
prev/next by date, plus optional `series` grouping. Cheapest possible increase in
pages-per-session.

### 10. Live word count in the editor

`BlogEdit.tsx` uses Tiptap; a status bar with word count, read time, and a
"last saved" indicator is a small addition that you personally would use every
time you write.

---

## 🔍 Navigation & discovery

### 11. `⌘K` command palette  ⭐

The README lists **50+ routes**. Search currently exists only *inside*
`Blog.tsx` (a client-side filter over already-fetched posts) and inside a few
Arena pages. There is no way to get from anywhere to anywhere.

Everything needed is already installed:

- `react-hotkeys-hook` — currently used **only** inside the Tiptap editor
- `@radix-ui/react-popover` + `@floating-ui/react` for the overlay
- `@tanstack/react-virtual` if the result list gets long

Index posts, shrines, QOTD archive days, projects, and every static route. Add
`?` for a keyboard-shortcuts overlay while you're in there.

### 12. Sitewide search endpoint

The palette is nicer with real backend search. SQLite's **FTS5** is built into
`better-sqlite3` — a virtual table over posts, shrines, quotes, and QOTD answers
is a small amount of code and would be very fast at this data size.

---

## 👥 Social layer

### 13. Extend web push beyond Twitch

`lib/twitch-push.js` already does "notify me when live" — the whole push
subscription plumbing exists and works, and it's currently spent on one feature.
Let people opt into: new blog post, new QOTD, someone you follow posted a Pixie.
The follow graph (`src/lib/user-follows.ts`) and the notification model
(`src/lib/pixie-notifications.ts`) are both already there.

### 14. A real activity feed on `/profile`

You have follows, blog comments, likes, guestbook entries, Pixies, and Arena
events — all separately. A merged per-user timeline turns a profile from a
static card into somewhere worth returning to.

### 15. Public site stats / "year in review"

`AdminArenaMetrics.tsx` and `routes/telemetry.js` mean you're already collecting
numbers, but only you can see them. A public `/stats` page — posts written,
guestbook signatures, QOTD answers, Arena fights fought, most-used guestbook
mood — is the kind of page people actually share. A December "wrapped" variant
writes itself.

---

## ⚔️ Arena / TCG

Only add these if Arena is still fun for you; it's the biggest surface already.

### 16. Spectator mode

Fights already stream over Socket.IO (`WebSocketProvider.tsx`,
`lib/websocket-events.js`). Letting a third party subscribe read-only to an
in-progress fight is mostly a room-join permission change, and it makes the
leaderboard and Hall of Fame *watchable* rather than just readable.

### 17. Replay links

If fights are deterministic given a seed — which the presence of
`lib/arena-fight-verification.js` suggests — store the seed and let
`/arena/fight/:id` re-play any historical fight. Very cheap storage, and it makes
Hall of Fame entries clickable.

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
2. **Command palette** — makes the other 50 routes reachable.
3. **Per-post OG images** — every link you've ever shared gets better retroactively.
4. ~~**`/now` + `/changelog` + `/uses`**~~ ✅ done 2026-09-10 (all three).
5. **Reading time + TOC + prev/next** — one focused pass on `BlogPost.tsx`.
6. **Push beyond Twitch**, then the profile activity feed.
7. Arena extras and the cursor decision, whenever they sound fun rather than owed.

## Progress log

- **2026-09-10**: Shipped #1 (blog + QOTD feeds), #2 (`/now` page + editor),
  #3 (`/changelog` + editor), #4 (`/uses` static colophon). Next up per the
  order: command palette, then OG images.
- **2026-09-10**: Shipped small-web #5 (`/links` blogroll + `Footer.tsx` webring
  widget). Now owner-editable: `site_links` table + `GET/PUT /links` +
  `src/pages/AdminLinks.tsx` at `/admin/links`. Webring only lights up once its
  hub/prev/next URLs are set, so no dead links. Command palette and OG images
  still next.
