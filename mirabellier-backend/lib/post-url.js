/**
 * Canonical blog URL builder.
 *
 * The slug shape has to match every other producer byte for byte — the SPA's
 * router (`blogPathFor` in vite.config.ts), the crawler HTML in
 * `routes/posts.js`, and `generate-sitemap.cjs` in the frontend repo. A
 * mismatch means the sitemap, the feed, and the page's own canonical point at
 * three different URLs for the same post, which is exactly what made long
 * titles disagree before this module existed.
 *
 * `routes/posts.js` keeps a local copy for its own use; this module is the
 * shared one for the discovery files (`lib/sitemap.js`, `lib/feed.js`).
 */

function slugifyTitle(input) {
  if (!input) return "";
  return String(input)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function buildPostPath(title, id) {
  const slug = slugifyTitle(title);
  return `/blog/${slug ? `${slug}-${id}` : id}`;
}

function buildPostUrl(websiteBase, post) {
  const base = String(websiteBase || "").replace(/\/+$/, "");
  return `${base}${buildPostPath(post?.title, post?.id)}`;
}

module.exports = { slugifyTitle, buildPostPath, buildPostUrl };
