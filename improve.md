# SEO / Discoverability Improvements — Round 2

Follow-up audit after the sitemap, canonical, and enrichment work landed
(2026-09-14/15). Findings below were verified against the live site with a
Googlebot/Bingbot User-Agent and a cache-busted fetch where relevant.

The round-1 work (CI-generated sitemap + feeds, self-referencing canonicals,
nginx `try_files $uri $uri/index.html`, image sitemap, breadcrumbs, homepage
schema, `noindex` on private routes, no-JS nav) is deployed. This file lists
what is left.

---

## High impact

### 1. Soft-404s return HTTP 200 with the generic homepage head

**Status: DONE (2026-09-16), not yet deployed.**

Any unknown path gets a 200 and the site-wide head:

```
GET /definitely-not-real-xyz            -> 200
GET /nope-xyz-123/extra/deep            -> 200
<title>Mirabellier ⭐ | Cute thoughts & cozy corners</title>
<link rel="canonical" href="https://mirabellier.com/" />
```

`location /` in `deploy/nginx/mirabellier.com.conf` is
`try_files $uri $uri/index.html /index.html;` — nginx cannot tell a real SPA
route from junk, so everything falls through to the SPA entry. Google will
either index these as duplicates of `/` or classify them as soft-404s, and the
client-side `robots: "noindex,follow"` in `src/pages/NotFound.tsx` never
reaches a crawler that does not execute the bundle (the same class of bug fixed
for `/login`, `/settings`, etc. in round 1).

**Fix (shipped):** unknown paths now answer a real `404` with a
`noindex,follow` document (`public/404.html`), while real client-side routes
still get the SPA entry.

How it works: a `$mirabellier_spa_route` map in
`deploy/nginx/mirabellier.com.conf` flags the route prefixes the SPA serves,
and `location /` falls back to a `@spa_fallback` named location instead of
`/index.html` directly. That location returns `404` for unflagged paths and
rewrites everything else to the entry. `error_page 404 =404 /404.html` serves
the document (the `=404` keeps it a 404 instead of letting it become a 302, and
`location = /404.html { internal; }` keeps the document from being crawlable at
its own URL).

Notes from implementing it:

- The patterns are case-insensitive (`~*`) because React Router defaults to
  `caseSensitive: false`; a case-sensitive map would have newly 404'd working
  URLs like `/About`.
- Paths under an allowed prefix but not a real route (`/arena/typo`) still
  render the SPA's own `NotFound` rather than an HTTP 404. That is narrower
  than before and the tradeoff is deliberate: the prefixes stay broad so a new
  sub-route is served instead of broken.
- `/question-of-the-day/archive/...` is allowed as a whole subtree on purpose.
  The per-day heads come from a build-time API fetch, and a flaky fetch must
  degrade to the SPA fallback rather than to an empty archive.
- The backend already returned real 404s for unknown blog and shrine slugs, so
  only the nginx-served fallback needed the change.

Verified against nginx 1.18.0 (the production version) with a local harness
covering 50 cases: unknown paths (`/definitely-not-real-xyz`, deep paths,
unknown nested paths) 404 with the noindex document, real routes and aliases
(`/home`, `/ar/tcg/decks`, `/poloroid`, `/staging/tcg`, `/admin/users`,
`/guestbook/sign`) fall back to the entry, prerendered heads still win, and
proxied routes plus their backend 404s pass through untouched. A route-coverage
check confirms all 95 `<Route>` paths in `src/App.tsx` are served. Regression
tests for the map live in
`mirabellier-backend/test/nginx-spa-fallback.test.js` (6 tests).

### 2. `www.mirabellier.com` serves a full 200 duplicate

**Status: DONE (2026-09-16), not yet deployed.**

```
GET https://www.mirabellier.com/        -> 200 (nginx/1.18.0)
canonical: https://mirabellier.com/
GET https://www.mirabellier.com/about   -> 200
canonical: https://mirabellier.com/about
```

The canonical is correct, so this will not outrank the apex, but every `www`
URL is a crawlable duplicate that spends crawl budget on your smallest site.

**Fix (shipped):** a dedicated `server` block for `www.mirabellier.com` now
`return 301 https://mirabellier.com$request_uri;` for every method and path,
and `www` was removed from the main block's `server_name` so that block stops
winning the match. `$request_uri` (not `$uri`) keeps the redirect target
byte-identical to the request, including the query string and percent-encoding.

Notes from implementing it:

- `www` resolves **straight to the VPS** (`45.77.34.249`, DNS-only) while the
  apex is Cloudflare-proxied, so nginx is the only place this could be fixed.
  The redirect target `mirabellier.com` therefore re-enters through
  Cloudflare, which is where the apex gets its edge caching and rules.
- The single `mirabellier.com` Let's Encrypt certificate already carries a
  `www` SAN (verified against the live cert), so the redirect completes over
  HTTPS with no second certificate and no TLS warning.
- Backend allowlists (`lib/turnstile.js`, `lib/websocket-server.js`, CORS in
  `app.js`) still list `www`. Deliberately left alone: they are harmless once
  the redirect lands, and removing them would break any page still open on the
  old origin during the deploy.
- **Port 80 was left untouched on purpose.** `http://www` currently serves the
  distro's default nginx page (and the apex does the same when the request
  bypasses Cloudflare). Certbot's HTTP-01 challenge is served by that default
  site, and how it is wired (webroot vs nginx plugin) is not visible from this
  repo, so a catch-all port-80 redirect could break renewals. Once the renewal
  path is confirmed, a port-80 block can redirect `http://www` too.

Verified against nginx 1.18.0 (the production version) with the real `dist/`
tree: with both blocks on one listener, `Host: mirabellier.com` still serves
200s for `/`, `/about`, `/blog`, SPA routes, prerendered heads, `/sitemap.xml`
and 404s correctly, while `Host: www.mirabellier.com` 301s `/`,
`/about?ref=x&a=1`, an unknown path, and even a POST with the path and query
preserved. Regression tests live in
`mirabellier-backend/test/nginx-www-redirect.test.js` (6 tests).


### 3. No Bing verification

**Status: repo-side DONE (2026-09-16) via `BingSiteAuth.xml`; verification
pending the next deploy.**

DNS TXT for the apex contains `google-site-verification=...` but no
`msvalidate.01`. IndexNow is already wired and firing, so Bing-side is cheap to
finish.

**What shipped:** Bing's XML-file verification method, which needs no DNS
record and no token in the HTML head.

- `public/BingSiteAuth.xml` — the file Bing Webmaster Tools generated, with the
  account's `user` id. Living in `public/` means Vite copies it into the
  release tree on every build.
- A CI step, "Verify static root files ship", asserts that `BingSiteAuth.xml`
  (plus `404.html`, `robots.txt`, `sitemap.xml`, `sw.js`, `feed.xml`,
  `feed.json`) is present in `dist/` before the artifact upload.

Notes from implementing it:

- **The file was originally saved to `dist/`, which cannot work.** `dist/` is
  gitignored and wiped by every build, so the file was never in a release and
  `https://mirabellier.com/BingSiteAuth.xml` answered the SPA HTML (HTTP 200
  with `<title>Mirabellier ⭐ ...`) instead of the XML. Moving it to `public/`
  is what makes it ship; the new CI step exists to catch that mistake class
  automatically, since the SPA fallback turns a missing root file into a
  misleading 200 rather than a 404.
- A meta-tag alternative was built first (a Vite plugin reading
  `VITE_BING_SITE_VERIFICATION`, injecting `msvalidate.01` into every built
  page). It was removed once the XML route was chosen, to avoid shipping two
  verification mechanisms and the CI variable it needed.
- The verification file is served with `Content-Type: text/xml` by nginx's
  `mime.types` and reaches Bingbot unchanged; verified against nginx 1.18.0
  with the real `dist/` tree for both a Bingbot UA and a browser UA.

**Remaining manual steps:**

1. Let the next deploy ship `public/BingSiteAuth.xml` (nothing else to change).
2. Confirm it is live and is XML, not the SPA:
   `curl -s https://mirabellier.com/BingSiteAuth.xml` should print the
   `<users>` document.
3. Click **Verify** in Bing Webmaster Tools.
4. Submit `https://mirabellier.com/sitemap.xml` in Bing Webmaster Tools.
5. Re-run `npm run indexnow:submit-all` once the sitemap reflects the new
   content — the script already builds a valid 22-URL payload for the current
   DB (verified by dry run: `isIndexNowEnabled: true`, key file serving 200
   at `/f2bae906942f4a0eb1396401775e641c.txt`).



### 4. `api.mirabellier.com` is indexable

**Status: DONE (2026-09-16), not yet deployed.**

```
GET https://api.mirabellier.com/robots.txt   -> 200 (Cloudflare content-signals
                                                block only; no site rules)
GET https://api.mirabellier.com/v1/posts     -> 200 application/json
```

Nothing stops an engine from crawling and indexing the JSON API.

**Fix (shipped):** every response on a non-canonical host now carries
`X-Robots-Tag: noindex, nofollow`. The header is applied by
`lib/indexable-hosts.js` and registered in `app.js` before the rate limiters
and all routes, so 404s, 429s, and error bodies carry it too.

How it works: nginx sets `proxy_set_header Host $host` on both server blocks,
so the backend can tell the API host from the main site. The policy is an
allowlist — only the hostname in `WEBSITE_BASE` (default `mirabellier.com`)
stays indexable, and everything else that resolves to this app (the API host,
`penbot.mirabellier.com`, a bare IP, localhost) is noindex. That direction
fails safe: a new hostname can never leak API responses into the index.

Notes from implementing it:

- **The same Express app serves both hosts**, so the fix has to be host-gated,
  not blanket. A `noindex` on every response would deindex the main site's
  proxied pages (`/blog/<slug>`, `/shrine/<slug>`, `/question-of-the-day`),
  which are the site's real SEO surface.
- **Media is exempt**, because the main site embeds uploads from the API host:
  the frontend resolves `/images/...` and `/videos/...` against `API_BASE`, and
  3 of 16 current posts reference `/v1/images/...` in their body. Google Images
  is a real acquisition channel here, so a `noindex` on the media would drop
  those results. The exemption covers `/images/`, `/videos/`, `/audio/`, and
  `/og/post/` (the generated blog title card the main site puts in `og:image`).
- The audit's alternative — `robots.txt` with `Disallow: /` on the API host —
  was deliberately **not** used. Google's own docs are explicit that robots.txt
  "is not a mechanism for keeping a web page out of Google" (a disallowed URL
  can still be indexed, just without a snippet), and that media referenced by a
  disallowed page is excluded from crawling — which would block the images
  above. The header is the mechanism that actually removes the URLs.
- `req.get("host")` is used, not `req.hostname`: with `trust proxy` enabled,
  `req.hostname` prefers the client-settable `X-Forwarded-Host`, which would
  let a spoofed header mark the API host indexable. There is a test for it.

Verified end-to-end through real nginx 1.18.0 with the real `dist/` tree and a
live backend: `api` host `/v1/posts`, unknown paths, and `/` all carry
`X-Robots-Tag: noindex, nofollow` (including 404s and a 429 under a tiny rate
limit), while `/v1/images/...` and the main host stay clean. Also confirmed by
booting the real `app.js` (with the DB and discovery output redirected to a
temp dir): `/v1/posts`, `/v1/definitely-not-real`, and a bare-IP host are
noindex; media and every `mirabellier.com` request are not.
`mirabellier-backend/test/indexable-hosts.test.js` covers it (15 tests).


### 5. Sitemap `lastmod` is inaccurate in two places

**Status: DONE (2026-09-16), not yet deployed.**

```
69 URLs  lastmod=2026-04-04   <- every archived question day
24 URLs  lastmod=2026-09-14   <- includes all 19 static routes
```

- **Static routes** all report the build date, even though `/about`, `/uses`,
  `/links`, etc. did not change. A `lastmod` that moves on every deploy is the
  signal Google uses to decide the field is untrustworthy and ignore it
  entirely.
- **Archived question days** all report `2026-04-04` — the bulk-import
  `createdAt` — rather than the day the question actually ran. Every one of the
  69 archives claims it was last modified four months before most of them
  existed.

**Fix (shipped), in both generators:**

- **Archive days now report their own `recordedDate`.** After regenerating,
  the 71 archive URLs carry 71 distinct `lastmod` values instead of 1, spanning
  `2026-04-04 .. 2026-06-13`. A genuine owner edit still wins when
  `updatedAt` is later than the recorded day.
- **Static routes no longer claim a build date.** Routes with a real
  per-page source get one from the database: `/now`, `/links`, `/changelog`
  (`site_*` rows), `/stats` (newest post/guestbook/answer), `/anime` (MAL
  snapshot `fetchedAt`), `/quotes` (quote snapshot), `/pixies` (newest upload),
  `/blog` (newest post), and `/question-of-the-day` + its archive index (newest
  public day). The rest (`/`, `/about`, `/uses`, `/projects`, `/fanart`,
  `/twitch`, `/privacy`, `/terms`, `/arena/skill-tree`, `/shrine`, and the
  built-in shrine rooms) ship with the bundle and now **omit `<lastmod>`
  entirely** rather than stamping the build date. Omitting is honest ("no
  change information"); a date that moves every deploy trains Google to ignore
  the field for the whole file.

Notes from implementing it:

- `<lastmod>` is now omitted rather than defaulted, in `lib/sitemap.js`,
  `generate-sitemap.cjs`, and the committed-file fallback in
  `readExistingEntries` (which previously turned a preserved entry's missing
  date into `undefined` and would have re-stamped it).
- **Found and fixed two adjacent bugs in the same code path**, both from the
  archive cutoff being derived differently in each place:

  1. **`lib/sitemap.js` generated zero archive entries.** It resolved the
     cutoff as "oldest unarchived row" (`2026-04-04`) while the route uses the
     *carried* question (`2026-04-30`), so `recordedDate < 2026-04-04` matched
     nothing. That is why the live sitemap had 40 URLs and no archive days
     while the archive listed 71 — and the backend rewrites the live file on
     every boot, so the CI-generated one never survived. The cutoff now comes
     from one shared `resolveArchiveCutoffRecordedDate` that mirrors the route
     (`HAVING COUNT(a.id) = 0 OR substr(q.lockedAt, 1, 10) = ?`), and the
     archive predicate matches the route's `archivedAt IS NOT NULL OR
     recordedDate < ?`.
  2. **`lib/feed.js` had the same divergent cutoff**, so the live
     `feed/questions.xml` carried **zero** entries while the committed file had
     50. It now shares the same resolver and emits 26 items for the current
     database.
- Every `LASTMOD_QUERIES` entry declares its own bind parameters. Passing the
  archive cutoff to all of them made better-sqlite3 throw "too many parameter
  values" for the eight that take none, and the `catch` swallowed it — so those
  routes silently reported no `lastmod` at all until a test caught it.

Verified against the real database and by booting the real `app.js` (DB and
discovery output redirected to a temp dir): the written sitemap has 57 URLs, 26
archive days with 26 distinct dates, real dates for the eight owner-editable
pages, and `(none)` for the bundle-shipped ones. The CI generator produces 112
URLs with 71 archive days, all matching their recorded day, and zero entries
stamped with the build date. The question feed went from 0 to 26 entries and the
blog feed from 16 to 16 (unchanged). `test/sitemap.test.js` (20 tests) and
`test/feed.test.js` (9 tests) cover the behaviour; 460 backend tests pass.


### 6. No HSTS

```
Strict-Transport-Security    (absent)
X-Content-Type-Options       (absent)
Referrer-Policy              (absent)
```

Not a ranking factor on its own, but HSTS removes the redirect hop for repeat
visitors and the other two are cheap hardening. Cloudflare can set all three at
the edge, or add them to the nginx server block.

---

## Smaller items

- **`/blog` crawler HTML has no links to posts.** It is a 441-byte stub whose
  only anchors are the 14 nav links, so a non-JS crawler cannot walk from the
  blog index to any post; discovery depends entirely on the sitemap. Listing
  the published posts as links (title + URL) would give it a real crawl path.
  Same pattern exists for the QOTD archive index.
- **The homepage has no server-rendered content.** The SSR payload is the boot
  shell plus preload hints; the `h1` and copy only exist after hydration. The
  `WebSite`/`Person` schema and the nav anchors help, but a short `<noscript>`
  paragraph (or boot-shell copy that survives) gives a non-JS crawler actual
  text to index.
- **Shrine image `alt` text is a raw filename.** The `imageAlt` values coming
  from the shrine editor are slugs like `arima-kana`. Descriptive alt text
  feeds Google Images, which is where these pages can realistically rank.
- **No `SearchAction` in the `WebSite` schema.** Correctly omitted today —
  there is no site search. Add it only if one is built; a `SearchAction`
  pointing at nothing is worse than none.

---

## Suggested order

1. ~~Soft-404 fallback (item 1)~~ — **done** (see above). The only finding here
   that was actively costing indexing.
2. ~~`www` 301 (item 2)~~ — **done** (see above). Removes a whole duplicate
   host from the index.
3. ~~`lastmod` accuracy (item 5)~~ — **done** (see above). Restores trust in
   the sitemap fields Google uses to schedule recrawls, and fixed the archive
   cutoff bug that kept every archive day (and every question feed item) out of
   the discovery files.
4. ~~Bing verification (item 3)~~ — **repo-side done** (see above) via
   `BingSiteAuth.xml`; verification and sitemap submission are the two manual
   steps left, after the next deploy.
5. ~~API `noindex`~~ — **done** (see above). HSTS (item 6) still to do.
6. Crawl-path and content items (the "smaller items" list) — incremental.
