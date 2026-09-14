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

**Fix options**

- Allowlist the real route prefixes in nginx and return `404` for anything else
  (route list is in `src/App.tsx`; keep the fallback as the SPA for matches).
  Most precise, but the list needs maintaining.
- Or serve a dedicated noindex 404 document (`error_page 404 /404.html`) and
  have `sendSpaEntry` in `mirabellier-backend/lib/spa-entry.js` emit it with a
  real 404 status for unmatched paths.

Note the backend already returns real 404s for unknown blog and shrine slugs
(`/blog/does-not-exist-123`, `/shrine/not-a-real-room` both 404 correctly) — it
is only the nginx-served fallback that is wrong.

### 2. `www.mirabellier.com` serves a full 200 duplicate

```
GET https://www.mirabellier.com/        -> 200 (nginx/1.18.0)
canonical: https://mirabellier.com/
GET https://www.mirabellier.com/about   -> 200
canonical: https://mirabellier.com/about
```

The canonical is correct, so this will not outrank the apex, but every `www`
URL is a crawlable duplicate that spends crawl budget on your smallest site.

**Fix:** add a server block that 301s `www` to the apex and remove `www` from
`server_name` on the main TLS block (keep a certificate for the `www` host so
the redirect can complete over HTTPS).

### 3. No Bing verification

DNS TXT for the apex contains `google-site-verification=...` but no
`msvalidate.01`. IndexNow is already wired and firing, so Bing-side is cheap to
finish.

**Fix:** verify the site in Bing Webmaster Tools (DNS record or the
`msvalidate.01` meta tag in `index.html`), submit
`https://mirabellier.com/sitemap.xml`, and re-run
`npm run indexnow:submit-all` once the sitemap reflects the new content.

### 4. `api.mirabellier.com` is indexable

```
GET https://api.mirabellier.com/robots.txt   -> 200 (Cloudflare content-signals
                                                block only; no site rules)
GET https://api.mirabellier.com/v1/posts     -> 200 application/json
```

Nothing stops an engine from crawling and indexing the JSON API.

**Fix:** add `Disallow: /` to a robots.txt served on the API host, or set
`X-Robots-Tag: noindex` on API responses in `mirabellier-backend/app.js`. The
header is the more reliable of the two for a JSON service.

### 5. Sitemap `lastmod` is inaccurate in two places

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

**Fix:** drive static-route `lastmod` from real per-page change dates (or omit
`lastmod` for routes you do not track), and set each archive entry's `lastmod`
to its own `recordedDate`. Both generators need the change
(`generate-sitemap.cjs` and `mirabellier-backend/lib/sitemap.js`).

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

1. Soft-404 fallback (item 1) — the only finding here that is actively costing
   indexing.
2. `www` 301 (item 2) — removes a whole duplicate host from the index.
3. `lastmod` accuracy (item 5) — restores trust in the sitemap fields Google
   uses to schedule recrawls.
4. Bing verification (item 3) — cheap, and IndexNow is already in place.
5. API `noindex` + HSTS (items 4, 6) — hardening, do together.
6. Crawl-path and content items (the "smaller items" list) — incremental.
