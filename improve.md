# SEO / Discoverability Improvements

Investigation of mirabellier.com's discoverability, SEO, and search-engine crawlability.
Findings below are based on the repo state and live HTTP checks (2026-09-14).

---

## P0 — actively hurting indexing

### 1. Live `sitemap.xml` is ~3 months stale

**Status: DONE (2026-09-14).** The frontend CI build now runs
`npm run generate:sitemap` before `vite build`, which regenerates
`public/sitemap.xml` plus all four feed files against the API on every deploy.
The committed files were also regenerated (107 URLs, including all 15 posts and
the two current shrine pages). The backend half is fixed too
(`mirabellier-backend` commit `2269138`): `lib/sitemap.js`, `lib/feed.js`, and
`lib/indexnow.js` now resolve their output directory through
`lib/discovery-output.js`, which honors `FRONTEND_DEPLOY_PATH`
(`/var/www/mirabellier.com/current`), so admin-created posts refresh discovery
files immediately instead of only at the next frontend deploy.

- The live file is byte-identical to the committed `public/sitemap.xml`, whose last git change was 2026-06-21 (`8c6bf7b`). All `lastmod` values are clustered on `2026-04-04` (59 URLs) and `2026-06-20` (16 URLs), so every URL reports an old date and Google re-crawls everything on a wrong schedule.
- Missing routes: `/now`, `/changelog`, `/uses`, `/links`, `/stats`, `/twitch`, `/fanart`, `/arena`, `/guestbook`, all `/ar/...`, `/arenas` subpages except `/arena/market` + `/arena/skill-tree`, and every post published after June (e.g. "Arena: How to Play, How It Works, and How to Win", "You Are Bad at Statistics", "Fast Brain, Slow Brain", "Is Free Will Real?", "Determinism vs Compatibilism", "The Ethics of AI", "Libet's Experiment").
- **Root cause:** the backend regenerates sitemap/feeds into `/var/www/mirabellier/dist/`:
  - `mirabellier-backend/lib/sitemap.js:130` (`generateSitemap`)
  - `mirabellier-backend/lib/feed.js:305` (`generateFeeds`)
  - `mirabellier-backend/lib/indexnow.js:39` (`ensureIndexNowKeyFile`)
  - `mirabellier-backend/app.js:441-442` (boot-time generation)
- But the deploy now serves `/var/www/mirabellier.com/releases/<sha>/` via the `current` symlink (`.github/workflows/deploy.yml`), and the backend has no `FRONTEND_DEPLOY_PATH` configured. Those writes land in a directory nginx never serves. The only path to production today is a human manually running `npm run generate:sitemap` and committing the file.
- **Suggested fix:** run sitemap + feed generation in CI before `npm run build`, or serve `/sitemap.xml` and the feed routes from the backend with the correct `publicDir`. Also set `FRONTEND_DEPLOY_PATH=/var/www/mirabellier.com/current` in the backend env so runtime regeneration targets the live release.

### 2. Many routes declare `canonical = homepage`

**Status: DONE (2026-09-14).** Every sitemap URL now serves a self-referencing
canonical + real title. Added to `SEO_ROUTES` (`vite.config.ts`): `/about`,
`/projects`, `/twitch`, `/guestbook`, `/privacy`, `/terms`,
`/question-of-the-day/archive`, `/arena/skill-tree` (+ `/ar/skill-tree`
alias). A new `questionArchiveSeoRoutes()` build-time source prerenders a head
per `/question-of-the-day/archive/<date>` page (69 today) with the real prompt
as `<title>` and a `CollectionPage` node. The plugin now accepts
`dynamicRouteSources` so the blog-post and archive fetches fail independently.
Runtime fixes: `usePageSeo` on those pages gained matching `socialMeta` (so
the hydrated DOM matches), `QuestionOfTheDay` canonicalizes `/answers/:id` to
itself instead of the bare question page, and the backend's answer share-card
404s emit `noindex,follow` with a `/question-of-the-day` canonical instead of a
dead `.../answers/` URL. Prerendered heads went from 31 to 108. Login-gated
`/arena/*` subpages remain intentionally out of the sitemap.

`/about`, `/projects`, `/twitch`, `/guestbook`, `/privacy`, `/terms`, `/question-of-the-day/archive`, `/question-of-the-day/archive/<date>`, `/question-of-the-day/answers/<id>` served the generic SPA head:

```html
<title>Mirabellier ⭐ | Cute thoughts & cozy corners</title>
<link rel="canonical" href="https://mirabellier.com/" />
```

Confirmed with a Googlebot UA. They are neither in `SEO_ROUTES` (`vite.config.ts:46`) nor covered by the backend crawler-HTML prefixes (`mirabellier-backend/app.js:95` `USER_AGENT_VARY_PREFIXES`). Google will dedupe them into `/`, and the 59 archive URLs in the sitemap currently all point at such pages.

- **Suggested fix:** add these routes to `SEO_ROUTES` (build-time prerendered heads) and/or add backend crawler-HTML handlers, plus give each route a self-referencing canonical in `usePageSeo` (`src/lib/seo.ts`).

### 3. Canonical vs redirect mismatch (trailing slash)

**Status: DONE (2026-09-14).** Root cause was the live nginx `location /`:
`try_files $uri $uri/ /index.html` matched the bare directory for every
prerendered route and answered `301 /about/`, contradicting the slash-less
canonical. The site block now uses `try_files $uri $uri/index.html /index.html`
— the directory's index file is served at the canonical URL with no redirect,
and a directory without an `index.html` stays on the SPA fallback instead of
301-ing into a 403. Verified in a real nginx container against the built
`dist/` before applying.

The config was server-only; it now lives at
`mirabellier-backend/deploy/nginx/mirabellier.com.conf` and the backend deploy
syncs it, running `nginx -t` and restoring the previous file if validation
fails. Live check: all 107 sitemap URLs return 200 at their canonical
slash-less URL.

Two further bugs surfaced while verifying this and are also fixed:

- The build-time SEO fetches were challenged by Cloudflare (HTTP 403, "Just a
  moment...") from CI runner IPs, so the last deploy silently shipped only 24
  static prerendered heads instead of 108. The build now sends the same
  identifying User-Agent `generate-sitemap.cjs` already used.
- The backend sitemap/feed filtered question days on `recordedDate < today`
  while the public archive cuts off at the active carried question, publishing
  94 soft-404 URLs and leaking queued prompts. Both now share the archive's
  cutoff.

### 4. Feeds share the same staleness risk

**Status: DONE.** Regenerated on every build (see item 1); the backend also
refreshes them at runtime now that the output directory resolves correctly.

---

## P1 — quick wins

- **`/home` in sitemap** — it is a client-side alias of `/` (`src/App.tsx:84` `HOME_ALIAS_PATHS`), canonical `/`, so the sitemap entry is a duplicate. Remove it or make it a real 301.
- **Image sitemap unused** — `xmlns:image` is declared in both sitemap generators but there are zero `<image:image>` entries. Add post thumbnails and shrine art for Google Images traffic.
- **Structured data depth**
  - Add `BreadcrumbList` JSON-LD on blog posts and shrine pages.
  - Homepage JSON-LD is `Blog` only (`index.html:399`); add `WebSite` (with `SearchAction` if applicable) and `Person`/`Organization` with `sameAs` linking socials.
  - Sparse og tags: add `og:image:width` / `og:image:height` (og-image.jpg is 1200x630), `twitter:image:alt`, `og:locale` to `index.html`.
- **`noindex` on private/thin pages** — only `src/pages/NotFound.tsx:28` sets a robots override. `Login`, `Settings`, `BlogEdit`, `PixieUpload`, `AuthCallback` should be `noindex,follow` (and ideally excluded from any crawl path).
- **No-JS crawl paths** — the SPA entry has no `<a>` links outside the boot shell; non-JS crawlers get no navigable structure. Add a `<noscript>` nav (or a small server-rendered link block) linking to blog index, shrine hub, QOTD archive.
- **Robots.txt duplication** — two separate `User-agent: *` groups (Cloudflare-managed content signals block + the site block). Legal per REP, but consolidating avoids parser ambiguity.
- **Verification** — IndexNow is fully wired (key file live, HTTP 200, auto-fires on post create/edit/delete via `refreshSearchDiscovery` in `mirabellier-backend/routes/posts.js:551`). No `google-site-verification` / Bing meta is in the repo; confirm GSC and Bing Webmaster Tools are verified via DNS and the sitemap is submitted in both.
- **Trailing-slash canonical on backend HTML pages** — e.g. `/shrine/kanna` crawler HTML uses `https://mirabellier.com/shrine/kanna` while humans on `/shrine/kanna` get the SPA; the 307 behavior on the slash variant is inconsistent with other routes and worth normalizing.

---

## Suggested order of work

1. CI: generate sitemap + feeds in the frontend build (or set `FRONTEND_DEPLOY_PATH` on the backend).
2. Canonicals: add missing routes to `SEO_ROUTES` and backend crawler handling; make every canonical self-referencing.
3. Trailing-slash: align nginx + canonicals.
4. Enrich: image sitemap, breadcrumbs, og meta, noindex for private pages.
5. Submit/verify in GSC + Bing; re-run IndexNow after the sitemap is correct.
