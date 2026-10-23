"use strict";

/**
 * Indexability for the two roles the backend serves from one Express app:
 *
 *   1. the JSON API and preview HTML at https://api.mirabellier.com, reached
 *      through that host's nginx server block;
 *   2. the crawler/OG HTML for the main site's proxied routes, reached through
 *      nginx's main server block (e.g. https://mirabellier.com/blog/<slug>).
 *
 * nginx sets `proxy_set_header Host $host` on both blocks, so the app can tell
 * them apart. Only the main site should be indexable: without this, the API
 * host is fully crawlable, so engines index raw JSON responses
 * (`/v1/posts` answers `200 application/json`) and empty error bodies under a
 * second hostname (audit finding: "api.mirabellier.com is indexable").
 *
 * The policy is an allowlist, not a blocklist. Only the canonical site host
 * stays indexable; every other name that resolves to this app (the API host,
 * a stray preview hostname, the retired `penbot` record, a bare IP, local
 * dev) is noindex. That direction fails safe: a new hostname can never start
 * leaking API responses into the index, and the worst case for a mistake is a
 * missing index entry rather than an indexed one.
 *
 * Static media is deliberately exempt. Images, videos, and audio served from
 * the API host are referenced by the main site's pages (`/v1/images/...`
 * appears in post bodies, `/videos/...` in `og:video` tags), and Google Images
 * is a real acquisition channel for this site. A `noindex` on the media itself
 * would drop those results; the audit finding is about the JSON API, not the
 * media. Everything that is not a media path is API surface.
 *
 * `Host` is read from `req.get("host")` rather than `req.hostname`: with
 * `trust proxy` enabled, `req.hostname` prefers `X-Forwarded-Host`, which a
 * client can set, so it must not be what decides whether a response stays
 * indexable.
 */

const DEFAULT_INDEXABLE_HOSTNAME = "mirabellier.com";

// Media prefixes, checked after Express strips the `/v1` API prefix (and also
// matched with it, so the predicate is correct regardless of middleware order).
//
// `/og/post/` is a generated PNG (the blog title-card fallback for a post
// without a thumbnail) rather than an uploaded file, but it is still a media
// response the main site puts in `og:image` / `twitter:image`, so it belongs
// on the indexable side for the same reason the uploads do.
const MEDIA_PREFIXES = ["/images/", "/videos/", "/audio/", "/og/post/"];

const NOINDEX_HEADER = "X-Robots-Tag";
const NOINDEX_HEADER_VALUE = "noindex, nofollow";

/**
 * Lowercases and strips a port from a host value. Handles the bracketed IPv6
 * form (`[::1]:3000` -> `::1`) so a port can never make two hosts compare
 * equal when they are not.
 */
function normalizeHostname(value) {
  let hostname = String(value || "").trim().toLowerCase();
  if (!hostname) return "";

  if (hostname.startsWith("[")) {
    const end = hostname.indexOf("]");
    return end === -1 ? hostname : hostname.slice(1, end);
  }

  const colon = hostname.indexOf(":");
  return colon === -1 ? hostname : hostname.slice(0, colon);
}

/**
 * The one hostname whose responses stay indexable. Derived from
 * `WEBSITE_BASE` so production configuration has a single source of truth,
 * falling back to the apex when it is unset or unparseable.
 */
function getIndexableHostname() {
  const configured = String(process.env.WEBSITE_BASE || "").trim();
  if (!configured) return DEFAULT_INDEXABLE_HOSTNAME;

  try {
    const hostname = normalizeHostname(new URL(configured).hostname);
    return hostname || DEFAULT_INDEXABLE_HOSTNAME;
  } catch {
    return DEFAULT_INDEXABLE_HOSTNAME;
  }
}

function isIndexableHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  return Boolean(normalized) && normalized === getIndexableHostname();
}

/**
 * True for the static media paths the main site embeds from the API host
 * (`/images/...`, `/videos/...`, `/audio/...`, each optionally under the
 * normalized `/v1` prefix). A bare `/images` without the trailing slash is not
 * a media file, and is treated as API surface.
 */
function isMediaPath(pathname) {
  let value = String(pathname || "");
  if (!value.startsWith("/")) value = `/${value}`;
  if (value === "/v1" || value.startsWith("/v1/")) {
    value = value.slice("/v1".length) || "/";
  }

  return MEDIA_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function shouldNoindexRequest(req) {
  if (isIndexableHostname(req.get("host"))) return false;
  return !isMediaPath(req.path || "/");
}

/**
 * Marks every non-canonical-host response `noindex, nofollow`. Registered
 * before the rate limiters and routes so error and throttled responses carry
 * the directive too — a 429 is exactly the kind of body that should not end up
 * in an index.
 *
 * No `Vary` is needed: caches key on the host, and the decision only depends
 * on the host and path.
 */
function createApiHostNoindexMiddleware() {
  return function apiHostNoindex(req, res, next) {
    if (shouldNoindexRequest(req)) {
      res.setHeader(NOINDEX_HEADER, NOINDEX_HEADER_VALUE);
    }
    next();
  };
}

module.exports = {
  DEFAULT_INDEXABLE_HOSTNAME,
  NOINDEX_HEADER,
  NOINDEX_HEADER_VALUE,
  createApiHostNoindexMiddleware,
  getIndexableHostname,
  isIndexableHostname,
  isMediaPath,
  normalizeHostname,
  shouldNoindexRequest,
};
