const { generateSitemap } = require("../lib/sitemap");
const { generateFeeds } = require("../lib/feed");
const { isOwner } = require("../lib/authz");
const {
  getWebsiteBase,
  queueIndexNowSubmission,
} = require("../lib/indexnow");
const {
  handleHumanSpaRequest,
  sendFrontendRedirectConfigError,
} = require("../lib/spa-entry");
const { isLikelyCrawler } = require("../lib/share-preview-utils");
const { buildBreadcrumbList } = require("../lib/breadcrumbs");
const {
  OG_WIDTH,
  OG_HEIGHT,
  buildPostOgImagePath,
  buildPostOgState,
  buildPostOgVersion,
  renderPostOgBuffer,
} = require("../lib/post-og-image");
const { sanitizeSeries } = require("../lib/post-series");
const { sendToTopic, TOPIC_NEW_POST } = require("../lib/push-subscriptions");

const MAX_TAGS = 10;
// `/posts?view=list` excerpt length. Matches `buildPostExcerpt`'s default and
// the SPA's search/preview needs — long enough for a two-line card and a term
// match, short enough that the whole list stays ~7 kB even with many posts.
const SUMMARY_EXCERPT_LENGTH = 320;

function setNoStoreHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

// `?view=list` is public, cacheable data (titles/excerpts/counts — nothing
// viewer-specific and no drafts), so it gets a short shared TTL instead of
// `no-store`. A new post appears within a minute, `stale-while-revalidate`
// keeps repeat visits off origin while the edge refreshes in the background,
// and the CDN is free to hold it (no `Surrogate-Control` opt-out). The bare
// `/posts` route stays `no-store`: the editor reads it while editing.
function setListCacheHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "public, max-age=60, stale-while-revalidate=300",
  );
}

// A versioned card URL (`?v=<updatedAt digest>`) never changes meaning, so it can
// be cached hard; a bare URL might be a stale edit, so keep that one short-lived.
function setOgImageCacheHeaders(res, hasVersionQuery) {
  res.setHeader(
    "Cache-Control",
    hasVersionQuery
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300",
  );
}

function sanitizeTag(value) {
  return String(value)
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 20);
}

function normalizeTags(rawTags) {
  if (!Array.isArray(rawTags)) return [];

  return Array.from(new Set(rawTags.map(sanitizeTag).filter(Boolean))).slice(
    0,
    MAX_TAGS,
  );
}

function parseTagsInput(tagsInput) {
  if (Array.isArray(tagsInput)) return tagsInput;

  if (typeof tagsInput === "string") {
    if (!tagsInput) return [];
    return tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function parseStoredTags(tagsValue) {
  if (!tagsValue) return [];
  const parsed = JSON.parse(tagsValue);
  if (!Array.isArray(parsed)) return [];
  return normalizeTags(parsed);
}

function parseStoredContent(contentValue) {
  return contentValue ? JSON.parse(contentValue) : null;
}

function buildNestedComments(rawComments, getUserById, userPublic) {
  const commentsById = {};

  rawComments.forEach((comment) => {
    commentsById[comment.id] = {
      ...comment,
      children: [],
      user: comment.userId ? userPublic(getUserById(comment.userId)) : null,
    };
  });

  const nested = [];
  rawComments.forEach((comment) => {
    const node = commentsById[comment.id];
    if (!node) return;

    if (comment.parentId) {
      const parent = commentsById[comment.parentId];
      if (parent) {
        parent.children.push(node);
        return;
      }
    }

    nested.push(node);
  });

  return nested;
}

function parseLikesForList(likesValue) {
  try {
    if (!likesValue) return [];
    if (typeof likesValue === "string") {
      const parsed = JSON.parse(likesValue);
      return Array.isArray(parsed) ? parsed : [];
    }
    return Array.isArray(likesValue) ? likesValue : [];
  } catch {
    return [];
  }
}

function parseLikesForMutation(likesValue) {
  return Array.from(new Set(parseLikesForList(likesValue).map(String)));
}

function readSingleHeader(value) {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }

  return typeof value === "string" ? value : "";
}

// NOTE ON TRUST: the anonymous like identity below arrives in a client-set
// header (`x-like-anonymous-id` / `x-like-client-id`) that the browser generates
// and persists in localStorage. It is a dedup *hint*, not proof of a unique
// person — a caller can mint a fresh value per request and like a post
// repeatedly. The 60-writes/min per-IP cap (app.js) is the only hard limit.
// Blog like counts are treated as decorative here; if they ever need to be
// trustworthy, key anonymous actors on a signed cookie (`signSessionId` in
// lib/users.js) or an IP+user-agent hash instead of this header.
function normalizeAnonymousLikeId(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed.length > 128) return "";
  if (!/^anon:[a-z0-9-]{12,}$/i.test(trimmed)) return "";
  return trimmed;
}

function resolveLikeActors(req, authFromReq) {
  const user = authFromReq(req);
  const anonymousId = normalizeAnonymousLikeId(
    readSingleHeader(req.headers["x-like-anonymous-id"]),
  );

  if (user && user.id) {
    return {
      actorId: String(user.id),
      anonymousId,
    };
  }

  return {
    actorId: normalizeAnonymousLikeId(
      readSingleHeader(req.headers["x-like-client-id"]),
    ),
    anonymousId: "",
  };
}

function parseCommentsForMutation(commentsValue) {
  try {
    if (!commentsValue) return [];
    if (typeof commentsValue === "string") {
      const parsed = JSON.parse(commentsValue);
      return Array.isArray(parsed) ? parsed : [];
    }
    return Array.isArray(commentsValue) ? commentsValue : [];
  } catch {
    return [];
  }
}

function parseCommentsForList(commentsValue, getUserById, userPublic) {
  return buildNestedComments(
    parseCommentsForMutation(commentsValue),
    getUserById,
    userPublic,
  );
}

function mapPostRow(row, getUserById, userPublic) {
  return {
    id: row.id,
    title: row.title,
    content: parseStoredContent(row.content),
    tags: parseStoredTags(row.tags),
    likes: parseLikesForList(row.likes),
    comments: parseCommentsForList(row.comments, getUserById, userPublic),
    shortDescription: row.shortDescription || null,
    thumbnail: row.thumbnail || null,
    audioUrl: row.audioUrl || null,
    series: row.series || null,
    userId: row.userId,
    author: row.userId
      ? row.authorName || row.author || "Unknown"
      : row.author || "Unknown",
    authorAvatar: row.userId
      ? row.authorAvatar || null
      : row.authorAvatar || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt || row.createdAt,
  };
}

// Word counts per text node / image caption, mirroring the SPA's
// `countWords` in `src/lib/blog-reading.ts`. Counting per node (rather than
// splitting the flattened text) keeps words from merging across block joins.
function countWordsInNodes(nodes) {
  if (!Array.isArray(nodes)) return 0;

  let total = 0;
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;

    if (node.type === "text") {
      total += String(node.text || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      continue;
    }
    if (node.type === "image") {
      total += String((node.attrs && node.attrs.caption) || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      continue;
    }

    total += countWordsInNodes(node.content);
  }

  return total;
}

function toChildNodes(content) {
  if (Array.isArray(content)) return content;
  if (content && typeof content === "object" && content.type === "doc") {
    return content.content;
  }
  return [];
}

// The list projection: everything a blog index / latest-post widget needs and
// nothing else. Crucially, `content` (the full tiptap JSON — ~277 kB of the
// baseline payload for 12 posts) and the per-comment user objects are replaced
// by the derived fields below, so the whole archive serializes to a few kB.
function mapPostRowSummary(row) {
  const content = parseStoredContent(row.content);
  const excerpt = content
    ? extractPlainText(content).replace(/\s+/g, " ").trim()
    : "";
  const words = countWordsInNodes(toChildNodes(content));
  const commentCount = parseCommentsForMutation(row.comments).length;

  return {
    id: row.id,
    title: row.title,
    excerpt: excerpt.slice(0, SUMMARY_EXCERPT_LENGTH),
    readingMinutes: words ? Math.max(1, Math.round(words / 200)) : 0,
    shortDescription: row.shortDescription || null,
    thumbnail: row.thumbnail || null,
    audioUrl: row.audioUrl || null,
    series: row.series || null,
    tags: parseStoredTags(row.tags),
    likeCount: parseLikesForList(row.likes).length,
    commentCount,
    userId: row.userId,
    author: row.userId
      ? row.authorName || row.author || "Unknown"
      : row.author || "Unknown",
    authorAvatar: row.userId
      ? row.authorAvatar || null
      : row.authorAvatar || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt || row.createdAt,
  };
}

function extractPlainText(node) {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractPlainText).join(" ");
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (node.content) return extractPlainText(node.content);
  return "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(input) {
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

function parseBlogId(rawId) {
  if (!rawId) return "";
  if (!rawId.includes("-")) return rawId;
  return rawId.split("-").pop() || rawId;
}

function buildBlogPath(title, id) {
  const slug = slugify(title);
  return `/blog/${slug ? `${slug}-${id}` : id}`;
}

function buildSiteUrl(pathname) {
  const normalizedPath = String(pathname || "").startsWith("/")
    ? pathname
    : `/${pathname}`;
  return `${getWebsiteBase()}${normalizedPath}`;
}

function buildBlogUrl(title, id) {
  return buildSiteUrl(buildBlogPath(title, id));
}

function normalizeOrigin(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.origin;
  } catch {
    return "";
  }
}

function resolveFrontendOrigin(protocol, host) {
  const frontendOrigin = normalizeOrigin(process.env.FRONTEND_URL);
  if (frontendOrigin) return frontendOrigin;

  const websiteOrigin = normalizeOrigin(getWebsiteBase());
  if (websiteOrigin) return websiteOrigin;

  return `${protocol}://${host}`;
}

function buildIndexNowUrlsForPost(title, id) {
  return [buildBlogUrl(title, id), buildSiteUrl("/blog")];
}

function buildImageUrl(thumbnail, protocol, host) {
  if (!thumbnail) return "";
  if (/^https?:\/\//i.test(thumbnail)) return thumbnail;
  if (thumbnail.startsWith("/")) return `${protocol}://${host}${thumbnail}`;
  return `${protocol}://${host}/images/${thumbnail}`;
}

function buildProfileUrl(authorName, origin) {
  if (!authorName) return "";
  return `${origin}/profile/${encodeURIComponent(authorName)}`;
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function buildPostDescription(post) {
  if (post.shortDescription) {
    return String(post.shortDescription).trim();
  }

  if (post.content) {
    try {
      const parsed = JSON.parse(post.content);
      if (parsed && typeof parsed === "object") {
        const extracted = extractPlainText(parsed).trim();
        if (extracted) {
          return extracted.slice(0, 160);
        }
      }
    } catch {
      // Ignore malformed rich text and fall back to title.
    }
  }

  return post.title || "Untitled";
}

function buildPostExcerpt(post, maxLength = 320) {
  if (!post.content) return "";

  try {
    const parsed = JSON.parse(post.content);
    if (parsed && typeof parsed === "object") {
      const extracted = extractPlainText(parsed)
        .replace(/\s+/g, " ")
        .trim();
      if (extracted) {
        return extracted.slice(0, maxLength);
      }
    }
  } catch {
    // Ignore malformed content and return no excerpt.
  }

  return "";
}

function shouldRedirectToSpa(req) {
  return !isLikelyCrawler(req.get("user-agent"));
}

function buildBlogRedirectPage({
  title,
  description,
  excerpt,
  imageUrl,
  imageWidth,
  imageHeight,
  authorName,
  authorUrl,
  publishedTime,
  modifiedTime,
  tags,
  canonicalUrl,
}) {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    datePublished: publishedTime,
    dateModified: modifiedTime || publishedTime,
    author: {
      "@type": "Person",
      name: authorName,
      ...(authorUrl ? { url: authorUrl } : {}),
    },
    publisher: {
      "@type": "Person",
      name: "Mirabellier",
      url: "https://mirabellier.com/",
    },
    ...(imageUrl ? { image: [imageUrl] } : {}),
    ...(tags && tags.length ? { keywords: tags.join(", ") } : {}),
    breadcrumb: buildBreadcrumbList([
      { name: "Home", url: "https://mirabellier.com/" },
      { name: "Blog", url: "https://mirabellier.com/blog" },
      { name: title, url: canonicalUrl },
    ]),
  };
  const articleTagMeta = (tags || [])
    .map(
      (tag) =>
        `<meta property="article:tag" content="${escapeHtml(tag)}" />`,
    )
    .join("\n    ");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:site_name" content="Mirabellier" />
    ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />` : ""}
    ${imageUrl ? `<meta property="og:image:alt" content="${escapeHtml(title)}" />` : ""}
    ${imageUrl && imageWidth ? `<meta property="og:image:width" content="${escapeHtml(String(imageWidth))}" />` : ""}
    ${imageUrl && imageHeight ? `<meta property="og:image:height" content="${escapeHtml(String(imageHeight))}" />` : ""}
    <meta property="og:url" content="${canonicalUrl}" />
    ${publishedTime ? `<meta property="article:published_time" content="${escapeHtml(publishedTime)}" />` : ""}
    ${modifiedTime ? `<meta property="article:modified_time" content="${escapeHtml(modifiedTime)}" />` : ""}
    ${authorName ? `<meta property="article:author" content="${escapeHtml(authorName)}" />` : ""}
    ${articleTagMeta}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : ""}
    ${imageUrl ? `<meta name="twitter:image:alt" content="${escapeHtml(title)}" />` : ""}
    <link rel="canonical" href="${canonicalUrl}" />
    <script type="application/ld+json">${escapeJsonForHtml(articleJsonLd)}</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      ${excerpt && excerpt !== description ? `<p>${escapeHtml(excerpt)}</p>` : ""}
      <p><a href="${escapeHtml(canonicalUrl)}">Read full post</a></p>
    </main>
  </body>
</html>`;
}

function resolvePostAuthor(existingUserId, user, fallbackAuthor) {
  if (!existingUserId) return fallbackAuthor || "Unknown";
  return user ? user.username : fallbackAuthor || "Unknown";
}

function resolveAuthorAvatar(existingUserId, user) {
  if (!existingUserId) return null;
  return user ? user.avatar : null;
}

function refreshSearchDiscovery(db, urls = []) {
  generateSitemap(db);
  generateFeeds(db);
  if (urls.length) {
    void queueIndexNowSubmission(urls);
  }
}

module.exports = function registerPostsRoutes(app, deps) {
  const { db, getUserById, userPublic, authFromReq } = deps;

  app.get("/posts", (req, res) => {
    try {
      const rows = db
        .prepare(
          "SELECT p.*, u.username as authorName, u.avatar as authorAvatar FROM posts p LEFT JOIN users u ON p.userId = u.id ORDER BY createdAt DESC",
        )
        .all();

      // `?view=list` returns lightweight summaries (no tiptap `content`, no
      // comment bodies) for the blog index, Home's latest-post card and
      // BlogPost's prev/next. The bare route keeps the full documents for the
      // editor and the build-time SEO fetch.
      const listView =
        String(req.query.view || "").toLowerCase() === "list";
      const posts = listView
        ? rows.map(mapPostRowSummary)
        : rows.map((row) => mapPostRow(row, getUserById, userPublic));
      if (listView) {
        setListCacheHeaders(res);
      } else {
        setNoStoreHeaders(res);
      }
      res.json(posts);
    } catch {
      res.status(500).json({ error: "failed to fetch posts" });
    }
  });

  app.get("/posts/:id", (req, res) => {
    try {
      const row = db
        .prepare(
          "SELECT p.*, u.username as authorName, u.avatar as authorAvatar FROM posts p LEFT JOIN users u ON p.userId = u.id WHERE p.id = ?",
        )
        .get(req.params.id);

      if (!row) return res.status(404).json({ error: "Not found" });

      const post = mapPostRow(row, getUserById, userPublic);
      setNoStoreHeaders(res);
      res.json(post);
    } catch {
      res.status(500).json({ error: "failed to fetch post" });
    }
  });

  app.post("/posts/:id/comments", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });

      const postId = req.params.id;
      const text = (req.body.text || "").toString().trim().slice(0, 2000);
      const parentId = req.body.parentId ? String(req.body.parentId) : null;

      if (!text) return res.status(400).json({ error: "text required" });

      const row = db.prepare("SELECT comments FROM posts WHERE id = ?").get(postId);
      if (!row) return res.status(404).json({ error: "post not found" });

      const comments = parseCommentsForMutation(row.comments);
      const comment = {
        id: Date.now().toString(),
        userId: user.id,
        text,
        parentId,
        createdAt: new Date().toISOString(),
      };

      comments.push(comment);
      db.prepare("UPDATE posts SET comments = ? WHERE id = ?").run(
        JSON.stringify(comments),
        postId,
      );

      res
        .status(201)
        .json({ ...comment, user: userPublic(user), children: [] });
    } catch {
      res.status(500).json({ error: "failed to add comment" });
    }
  });

  app.post("/posts/:id/like", (req, res) => {
    try {
      const { actorId, anonymousId } = resolveLikeActors(req, authFromReq);
      if (!actorId) {
        return res.status(400).json({ error: "missing like identity" });
      }

      const postId = req.params.id;
      const action = req.body && req.body.action ? req.body.action : "like";
      const row = db.prepare("SELECT likes FROM posts WHERE id = ?").get(postId);
      if (!row) return res.status(404).json({ error: "post not found" });

      let likes = parseLikesForMutation(row.likes);

      if (action === "like") {
        if (anonymousId && anonymousId !== actorId) {
          likes = likes.filter((id) => id !== anonymousId);
        }
        if (!likes.includes(actorId)) likes.push(actorId);
      } else if (action === "unlike") {
        likes = likes.filter(
          (id) => id !== actorId && (!anonymousId || id !== anonymousId),
        );
      } else {
        return res.status(400).json({ error: "invalid action" });
      }

      db.prepare("UPDATE posts SET likes = ? WHERE id = ?").run(
        JSON.stringify(likes),
        postId,
      );

      res.json({ likes, liked: likes.includes(actorId) });
    } catch {
      res.status(500).json({ error: "failed to update likes" });
    }
  });

  // Bare /blog list page. Without this, requests land on the terminal 404
  // handler in app.js instead of reaching the SPA — same fix as the sibling
  // list routes (/anime, /fanart, /quotes, etc.).
  app.get("/blog", (req, res) => {
    if (!isLikelyCrawler(req.get("user-agent"))) {
      if (handleHumanSpaRequest(req, res, "/blog")) return;
      return sendFrontendRedirectConfigError(req, res, "/blog");
    }

    const canonicalUrl = buildSiteUrl("/blog");
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Blog | Mirabellier</title>
    <meta name="description" content="Blog posts from Mirabellier." />
    <meta name="robots" content="index,follow" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Blog | Mirabellier" />
    <meta property="og:description" content="Blog posts from Mirabellier." />
    <meta property="og:site_name" content="Mirabellier" />
    <meta property="og:url" content="${canonicalUrl}" />
    <link rel="canonical" href="${canonicalUrl}" />
  </head>
  <body>
    <main>
      <h1>Blog</h1>
      <p><a href="${canonicalUrl}">View all posts</a></p>
    </main>
  </body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    setNoStoreHeaders(res);
    res.send(html);
  });

  // Server-side SEO page for individual blog post (for social crawlers)
  app.get("/blog/:id", (req, res) => {
    try {
      const rawId = req.params.id || "";
      const id = parseBlogId(rawId) || rawId;
      const post = db
        .prepare(
          "SELECT p.*, u.username as authorName, u.avatar as authorAvatar FROM posts p LEFT JOIN users u ON p.userId = u.id WHERE p.id = ?",
        )
        .get(id);

      if (!post) return res.status(404).send("Not found");

      const title = post.title || "Untitled";
      const description = buildPostDescription(post);
      const excerpt = buildPostExcerpt(post);
      const tags = parseStoredTags(post.tags);
      const publishedTime = post.createdAt || new Date().toISOString();
      const modifiedTime = post.updatedAt || post.createdAt || publishedTime;
      const authorName = post.userId
        ? post.authorName || post.author || "Unknown"
        : post.author || "Unknown";

      const host = req.get("host") || "mirabellier.com";
      const protocol =
        req.headers["x-forwarded-proto"] || req.protocol || "http";
      const frontendOrigin = resolveFrontendOrigin(protocol, host);
      const authorUrl = post.userId
        ? buildProfileUrl(authorName, frontendOrigin)
        : "";

      const spaPath = buildBlogPath(title, id);

      // Hand-picked thumbnail wins; otherwise fall back to a generated title
      // card so the link never unfurls with just the site background.
      const thumbnailUrl = buildImageUrl(post.thumbnail || null, protocol, host);
      const ogSlug = spaPath.replace(/^\/blog\//, "");
      const generatedOgUrl = `${protocol}://${host}${buildPostOgImagePath(
        ogSlug,
        buildPostOgVersion({ updatedAt: modifiedTime, createdAt: publishedTime }),
      )}`;
      const imageUrl = thumbnailUrl || generatedOgUrl;
      const generatedImage = !thumbnailUrl;

      if (shouldRedirectToSpa(req)) {
        if (handleHumanSpaRequest(req, res, spaPath)) return;
        return sendFrontendRedirectConfigError(req, res, spaPath);
      }

      const canonicalUrl = `${frontendOrigin}${spaPath}`;

      const html = buildBlogRedirectPage({
        title,
        description,
        excerpt,
        imageUrl,
        imageWidth: generatedImage ? OG_WIDTH : undefined,
        imageHeight: generatedImage ? OG_HEIGHT : undefined,
        authorName,
        authorUrl,
        publishedTime,
        modifiedTime,
        tags,
        canonicalUrl,
      });

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      setNoStoreHeaders(res);
      res.send(html);
    } catch {
      res.status(500).send("Server error");
    }
  });

  // Generated Open Graph title card for a post. The `:slug` carries the full
  // human-readable `<slug>-<id>` from the blog URL (plus a `.png` suffix); only
  // the trailing id is used to look the post up.
  app.get("/og/post/:slug", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").replace(/\.png$/i, "");
      const id = parseBlogId(slug) || slug;
      const post = db
        .prepare(
          "SELECT p.*, u.username as authorName FROM posts p LEFT JOIN users u ON p.userId = u.id WHERE p.id = ?",
        )
        .get(id);

      if (!post) return res.status(404).send("Not found");

      const state = buildPostOgState({
        title: post.title,
        tags: parseStoredTags(post.tags),
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        author: post.userId
          ? post.authorName || post.author || ""
          : post.author || "",
      });
      const imageBuffer = await renderPostOgBuffer(state);

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Length", String(imageBuffer.length));
      res.setHeader("X-Preview-Version", state.version);
      setOgImageCacheHeaders(
        res,
        typeof req.query.v === "string" && req.query.v.trim().length > 0,
      );
      res.send(imageBuffer);
    } catch {
      res.status(500).send("Failed to render post preview image");
    }
  });

  // Return all unique tags used across posts
  app.get("/tags", (req, res) => {
    try {
      const rows = db
        .prepare("SELECT tags FROM posts WHERE tags IS NOT NULL")
        .all();

      const allTags = [];
      rows.forEach((row) => {
        try {
          const parsed = JSON.parse(row.tags);
          if (Array.isArray(parsed)) {
            parsed.forEach((tag) => allTags.push(sanitizeTag(tag)));
          }
        } catch {
          // Ignore invalid tag entries to keep endpoint resilient.
        }
      });

      const uniqueTags = Array.from(new Set(allTags))
        .filter(Boolean)
        .slice(0, 1000);
      res.json(uniqueTags);
    } catch {
      res.status(500).json({ error: "failed to fetch tags" });
    }
  });

  app.post("/posts", (req, res) => {
    try {
      const userFromToken = authFromReq(req);
      if (!userFromToken) {
        return res.status(401).json({ error: "unauthorized" });
      }
      if (!isOwner(userFromToken)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const userId = userFromToken.id;

      const id = Date.now().toString();
      const title = req.body.title || req.body.name || "Untitled";
      const contentObj = req.body.content || req.body.body || {};
      const shortDescription =
        req.body.shortDescription || req.body.description || null;
      const thumbnail = req.body.thumbnail || null;
      const audioUrl = req.body.audioUrl || null;
      const series = sanitizeSeries(req.body.series);
      const tags = normalizeTags(parseTagsInput(req.body.tags));
      const createdAt = new Date().toISOString();
      const updatedAt = createdAt;

      db.prepare(
        "INSERT INTO posts (id, title, content, userId, author, shortDescription, thumbnail, audioUrl, series, tags, likes, comments, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        id,
        title,
        JSON.stringify(contentObj),
        userId,
        null,
        shortDescription,
        thumbnail,
        audioUrl,
        series,
        JSON.stringify(tags),
        JSON.stringify([]),
        JSON.stringify([]),
        createdAt,
        updatedAt,
      );

      const user = getUserById(userId);
      const response = {
        id,
        title,
        content: contentObj,
        shortDescription,
        thumbnail,
        audioUrl,
        series,
        tags,
        likes: [],
        comments: [],
        userId,
        author: user ? user.username : "Unknown",
        authorAvatar: user ? user.avatar : null,
        createdAt,
        updatedAt,
      };

      refreshSearchDiscovery(db, buildIndexNowUrlsForPost(title, id));
      void sendToTopic(db, TOPIC_NEW_POST, {
        title: "New post on Mirabellier",
        body: title,
        url: `https://mirabellier.com/blog/${id}`,
      });
      res.status(201).json(response);
    } catch {
      res.status(500).json({ error: "failed to save post" });
    }
  });

  app.put("/posts/:id", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const id = req.params.id;
      const existing = db.prepare("SELECT * FROM posts WHERE id = ?").get(id);
      if (!existing) return res.status(404).json({ error: "Not found" });

      if (!existing.userId || existing.userId !== user.id) {
        return res.status(403).json({ error: "forbidden" });
      }

      const title = req.body.title || existing.title;
      const contentObj =
        req.body.content !== undefined
          ? req.body.content
          : existing.content
            ? JSON.parse(existing.content)
            : {};
      const shortDescription =
        req.body.shortDescription !== undefined
          ? req.body.shortDescription
          : existing.shortDescription;
      const thumbnail =
        req.body.thumbnail !== undefined
          ? req.body.thumbnail
          : existing.thumbnail;
      const audioUrl =
        req.body.audioUrl !== undefined
          ? req.body.audioUrl
          : existing.audioUrl;
      const series =
        req.body.series !== undefined
          ? sanitizeSeries(req.body.series)
          : existing.series || null;
      const rawTags =
        req.body.tags !== undefined
          ? parseTagsInput(req.body.tags)
          : existing.tags
            ? JSON.parse(existing.tags)
            : [];
      const tags = normalizeTags(rawTags);
      const updatedAt = new Date().toISOString();

      db.prepare(
        "UPDATE posts SET title = ?, content = ?, shortDescription = ?, thumbnail = ?, audioUrl = ?, series = ?, tags = ?, updatedAt = ? WHERE id = ?",
      ).run(
        title,
        JSON.stringify(contentObj),
        shortDescription,
        thumbnail,
        audioUrl,
        series,
        JSON.stringify(tags),
        updatedAt,
        id,
      );

      const authorUser = getUserById(user.id);
      const response = {
        id,
        title,
        content: contentObj,
        shortDescription: shortDescription || null,
        thumbnail: thumbnail || null,
        audioUrl: audioUrl || null,
        series,
        tags: tags || [],
        likes: parseLikesForList(existing.likes),
        comments: parseCommentsForList(
          existing.comments,
          getUserById,
          userPublic,
        ),
        userId: existing.userId || null,
        author: resolvePostAuthor(existing.userId, authorUser, existing.author),
        authorAvatar: resolveAuthorAvatar(existing.userId, authorUser),
        createdAt: existing.createdAt,
        updatedAt,
      };

      refreshSearchDiscovery(db, buildIndexNowUrlsForPost(title, id));
      res.json(response);
    } catch {
      res.status(500).json({ error: "failed to update post" });
    }
  });

  app.delete("/posts/:id", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const id = req.params.id;
      const existing = db.prepare("SELECT * FROM posts WHERE id = ?").get(id);
      if (!existing) return res.status(404).json({ error: "Not found" });

      if (!existing.userId || existing.userId !== user.id) {
        return res.status(403).json({ error: "forbidden" });
      }

      db.prepare("DELETE FROM posts WHERE id = ?").run(id);
      refreshSearchDiscovery(db, buildIndexNowUrlsForPost(existing.title, id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "failed to delete post" });
    }
  });
};
