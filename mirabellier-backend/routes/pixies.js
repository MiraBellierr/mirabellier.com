const express = require("express");
const path = require("path");
const fs = require("fs");
const { isOwner } = require("../lib/authz");
const {
  handleHumanSpaRequest,
  sendFrontendRedirectConfigError,
} = require("../lib/spa-entry");
const {
  escapeJsonForHtml,
  isDiscordCrawler,
  isLikelyCrawler,
} = require("../lib/share-preview-utils");
const {
  normalizeTikTokUrl,
  normalizeTikTokQueueEntry,
  readTikTokList,
  fetchTikTokOembed,
} = require("../lib/tiktok");
const {
  classifyPlatform,
  resolveSocialVideo,
  downloadSocialVideo,
  transcodeToH264,
  extractPosterFrame,
} = require("../lib/social");
const {
  mirrorAvatarToPng,
  localAvatarOrNull,
} = require("../lib/avatar-png");
const { createPixieImportQueue } = require("../lib/pixie-import-queue");
const {
  addAuthor: addFeedAuthor,
  isValidHandle: isValidFeedHandle,
  listAuthors: listFeedAuthors,
  normalizeHandle: normalizeFeedHandle,
  pollAuthorOnce: pollFeedAuthorOnce,
  removeAuthor: removeFeedAuthor,
  updateAuthor: updateFeedAuthor,
} = require("../lib/tiktok-feed-scheduler");
const {
  createPixieNotification,
  getPixieNotifications,
  getPixieNotificationUnreadCount,
  markPixieNotificationRead,
  markAllPixieNotificationsRead,
} = require("../lib/pixie-notifications");
const {
  PixieCommentError,
  listPixieComments,
  createPixieComment,
  togglePixieCommentLike,
  deletePixieComment,
  deletePixieCommentsForVideo,
} = require("../lib/pixie-comments");
const { getFollowingIds } = require("../lib/user-follows");
const { notifyFollowersOfNewPixie } = require("../lib/push-subscriptions");

const VIDEO_TITLE_MAX_LENGTH = 4000;
const MAX_VIDEO_TAGS = 10;
const MAX_TAG_LENGTH = 20;
const MAX_AUTHOR_USERNAME_LENGTH = 32;
const SEO_CAPTION_MAX_LENGTH = 200;

const IMPORT_JOBS = new Map();
const IMPORT_JOB_MAX_AGE_MS = 15 * 60 * 1000;
let importJobSequence = 0;

// Short-lived per-viewer memo of the fully computed + mapped `/feed` ordering,
// so an infinite-scroll session pays the O(all pixies) scan + scoring once
// instead of on every "load more" batch. `offset > 0` requests slice from here;
// `offset === 0` (fresh load / tab switch / refresh) always recomputes.
const FEED_CACHE = new Map();
const FEED_CACHE_TTL_MS = 8000;
const FEED_CACHE_MAX_ENTRIES = 200;

function pruneFeedCache(now) {
  for (const [key, entry] of FEED_CACHE) {
    if (now - entry.at > FEED_CACHE_TTL_MS) FEED_CACHE.delete(key);
  }
  while (FEED_CACHE.size > FEED_CACHE_MAX_ENTRIES) {
    FEED_CACHE.delete(FEED_CACHE.keys().next().value);
  }
}

function parseListOffset(raw) {
  const n = Number.parseInt(String(raw ?? "0"), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 0;
}

const TAG_LIKE_WEIGHT = 3;
const TAG_COMMENT_WEIGHT = 5;
const TAG_INTEREST_WEIGHT = 4;
const ENGAGEMENT_LIKE_WEIGHT = 1;
const ENGAGEMENT_COMMENT_WEIGHT = 2;

function parseLikes(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseTags(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sanitizeTag(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, MAX_TAG_LENGTH);
}

function sanitizeTags(raw) {
  const seen = new Set();
  const tags = [];
  for (const entry of parseTags(raw)) {
    const tag = sanitizeTag(entry);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= MAX_VIDEO_TAGS) break;
  }
  return tags;
}

function truncateCodePoints(value, maxLength) {
  const chars = Array.from(String(value || ""));
  if (chars.length <= maxLength) return String(value || "");
  return chars.slice(0, maxLength).join("");
}

function validateAuthorUsername(raw) {
  const value = String(raw || "").trim();
  if (!value) return "Username cannot be empty";
  if (Array.from(value).length > MAX_AUTHOR_USERNAME_LENGTH) {
    return "Username must be 32 characters or fewer";
  }
  return null;
}

function mapAuthor(row) {
  if (!row.authorId) return null;
  return {
    id: row.authorId,
    username: row.authorUsername || "unknown",
    avatar: localAvatarOrNull(row.authorAvatar),
    bio: row.authorBio || null,
    verified: row.authorVerified === 1,
  };
}

function mapVideoRow(row, viewerId) {
  const likes = parseLikes(row.likes);
  return {
    id: row.id,
    title: String(row.title || "").trim(),
    tags: parseTags(row.tags),
    // Raw media stays under /videos/ (a namespace with no route collisions);
    // only the JSON API moved to /pixies.
    url: `/videos/${row.filename}`,
    // First-frame still, shown by the player until the video paints a frame.
    poster: row.posterFilename ? `/videos/${row.posterFilename}` : null,
    mimeType: row.mimeType || "video/mp4",
    sizeBytes: row.sizeBytes || 0,
    durationSeconds: row.durationSeconds ?? null,
    width: row.width || null,
    height: row.height || null,
    likesCount: likes.length,
    likedByMe: Boolean(viewerId && likes.includes(viewerId)),
    commentsCount: row.commentsCount || 0,
    createdAt: row.createdAt,
    author: mapAuthor(row),
  };
}

function setNoStoreHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trimSeoCaption(raw) {
  const collapsed = String(raw || "").trim().replace(/\s+/g, " ");
  return collapsed.length > SEO_CAPTION_MAX_LENGTH
    ? `${collapsed.slice(0, SEO_CAPTION_MAX_LENGTH - 3)}…`
    : collapsed;
}

// Short-form pixies are shot vertical; these defaults let Discord / X render an
// inline player even though we don't persist the exact frame size.
const SEO_VIDEO_WIDTH = 720;
const SEO_VIDEO_HEIGHT = 1280;

function isoDuration(seconds) {
  const n = Math.max(0, Math.round(Number(seconds) || 0));
  return n > 0 ? `PT${n}S` : "";
}

// Discord folds the whole `<head>` into its unfurl: the `<title>` /
// `<meta name="description">` pair becomes the card text and a JSON-LD
// `VideoObject` supplies the thumbnail, so a share link lands as a full
// article card with the video tucked underneath. Answering `Discordbot` with
// just the player metadata makes Discord render the bare inline video exactly
// like a direct `.mp4` link, while every other unfurler (Slack, Twitter/X) and
// search engine still gets the full card below. `forDiscord` picks the shell.
function buildDiscordVideoPage({
  pageTitle,
  pageUrl,
  videoMeta,
}) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta property="og:type" content="video.other" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
${videoMeta}
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />
  </head>
  <body></body>
</html>`;
}

function buildVideoSeoPage({ row, protocol, host, requestPath, forDiscord }) {
  const username = String(row.authorUsername || "unknown");
  const pageTitle = `@${username} · Pixies`;
  const caption = trimSeoCaption(row.title);
  const description =
    caption || `Watch this pixie by @${username} on Mirabellier.`;
  const pageUrl = `${protocol}://${host}${requestPath}`;
  const videoUrl = `${protocol}://${host}/videos/${row.filename}`;
  const mimeType = row.mimeType || "video/mp4";
  const tags = parseTags(row.tags);
  const publishedAt = row.createdAt
    ? new Date(row.createdAt).toISOString()
    : "";
  const duration = isoDuration(row.durationSeconds);
  const videoWidth = row.width && row.width > 0 ? row.width : SEO_VIDEO_WIDTH;
  const videoHeight =
    row.height && row.height > 0 ? row.height : SEO_VIDEO_HEIGHT;
  const keywords = ["pixies", "mirabellier", `@${username}`, ...tags].join(", ");
  // The six tags Discord reads to build the inline player. Keeping the exact
  // frame size lets it lay the player out without a second fetch.
  const videoMeta = [
    `    <meta property="og:video" content="${escapeHtml(videoUrl)}" />`,
    `    <meta property="og:video:url" content="${escapeHtml(videoUrl)}" />`,
    `    <meta property="og:video:secure_url" content="${escapeHtml(videoUrl)}" />`,
    `    <meta property="og:video:type" content="${escapeHtml(mimeType)}" />`,
    `    <meta property="og:video:width" content="${videoWidth}" />`,
    `    <meta property="og:video:height" content="${videoHeight}" />`,
  ].join("\n");

  if (forDiscord) {
    return buildDiscordVideoPage({ pageTitle, pageUrl, videoMeta });
  }

  const tagMeta = tags
    .map(
      (tag) =>
        `    <meta property="og:video:tag" content="${escapeHtml(tag)}" />`,
    )
    .join("\n");
  const videoDetailMeta = [
    publishedAt
      ? `    <meta property="og:video:release_date" content="${escapeHtml(publishedAt)}" />`
      : "",
    tagMeta,
  ]
    .filter(Boolean)
    .join("\n");

  // Only a locally-hosted avatar is safe for the social card; an un-mirrored
  // social-CDN link 403s for crawlers just as it does in the browser.
  const localAvatar = localAvatarOrNull(row.authorAvatar);
  const avatarUrl = localAvatar ? `${protocol}://${host}${localAvatar}` : "";
  // Prefer the clip's own first-frame poster for the social card; fall back
  // to the author avatar, then the generic Pixies image.
  const posterUrl = row.posterFilename
    ? `${protocol}://${host}/videos/${row.posterFilename}`
    : "";
  const imageUrl = posterUrl || avatarUrl || `${protocol}://${host}/pixies.png`;
  const imageAlt = `@${username} on Pixies`;

  const imageTags = `    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />`;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: pageTitle,
    description,
    thumbnailUrl: imageUrl,
    contentUrl: videoUrl,
    embedUrl: pageUrl,
    uploadDate: String(row.createdAt || "").slice(0, 10),
    ...(duration ? { duration } : {}),
    ...(tags.length ? { keywords: tags.join(", ") } : {}),
    width: videoWidth,
    height: videoHeight,
    author: { "@type": "Person", name: username },
    publisher: {
      "@type": "Organization",
      name: "Mirabellier",
      url: `${protocol}://${host}`,
    },
  };

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="keywords" content="${escapeHtml(keywords)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-video-preview:-1" />
    <meta name="theme-color" content="#ec4899" />
    <meta property="og:type" content="video.other" />
    <meta property="og:site_name" content="Mirabellier" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
${videoMeta}
${videoDetailMeta}
${
  publishedAt
    ? `    <meta property="article:published_time" content="${escapeHtml(publishedAt)}" />`
    : ""
}
${imageTags}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@mirabellier" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />
    <script type="application/ld+json">${escapeJsonForHtml(structuredData)}</script>
  </head>
  <body></body>
</html>`;
}

// Crawler-facing SEO shell for the Pixies feed itself (`/pixies`).
function buildPixiesFeedSeoPage({ protocol, host }) {
  const pageUrl = `${protocol}://${host}/pixies`;
  const imageUrl = `${protocol}://${host}/pixies.png`;
  const title = "Pixies · Mirabellier";
  const description = "Pixies - Short videos and clips from the community";
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: pageUrl,
    isPartOf: {
      "@type": "WebSite",
      name: "Mirabellier",
      url: `${protocol}://${host}`,
    },
  };
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="keywords" content="pixies, mirabellier, short video, clips, feed" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta name="theme-color" content="#ec4899" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Mirabellier" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />
    <script type="application/ld+json">${escapeJsonForHtml(structuredData)}</script>
  </head>
  <body></body>
</html>`;
}

module.exports = function registerPixieRoutes(app, deps) {
  const { db, authFromReq, VIDEOS_DIR, IMAGES_DIR, videoUpload } = deps;
  const router = express.Router();

  // Auth guards that run *before* multer, so an unauthenticated request is
  // rejected before up to 250 MB is written to VIDEOS_DIR.
  function requireUserMw(req, res, next) {
    const user = authFromReq(req);
    if (!user) return res.status(401).json({ error: "unauthenticated" });
    req.authUser = user;
    next();
  }
  function requireOwnerMw(req, res, next) {
    const user = authFromReq(req);
    if (!user) return res.status(401).json({ error: "unauthenticated" });
    if (!isOwner(user)) return res.status(403).json({ error: "forbidden" });
    req.authUser = user;
    next();
  }

  // ── Inbox: real-time notifications (likes, comments, replies, moderation) ──
  // Declared before the `/:id/*` routes below so `/notifications*` can never be
  // captured as a video id.

  router.get("/notifications", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });
      const payload = getPixieNotifications(db, user.id, {
        page: req.query?.page,
        limit: req.query?.limit,
      });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  router.get("/notifications/unread-count", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });
      setNoStoreHeaders(res);
      res.json({ count: getPixieNotificationUnreadCount(db, user.id) });
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  router.post("/notifications/read-all", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });
      setNoStoreHeaders(res);
      res.json(markAllPixieNotificationsRead(db, user.id));
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  router.post("/notifications/:notificationId/read", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });
      setNoStoreHeaders(res);
      res.json(
        markPixieNotificationRead(db, user.id, String(req.params.notificationId)),
      );
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  function isValidAvatarUrl(raw) {
    const value = String(raw || "").trim();
    if (!value) return true;
    if (/^\/images\/[A-Za-z0-9._/+-]+$/.test(value)) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  // Shared projection for a "video row" — the columns `mapVideoRow` reads
  // plus the correlated comment count. Only the WHERE / ORDER BY tail varies.
  const VIDEO_ROW_SELECT = `
    SELECT v.id, v.userId, v.title, v.tags, v.filename, v.posterFilename, v.mimeType, v.sizeBytes, v.durationSeconds, v.width, v.height, v.likes, v.createdAt,
           u.id AS authorId, u.username AS authorUsername, u.avatar AS authorAvatar, u.bio AS authorBio,
           u.verified AS authorVerified,
           (SELECT COUNT(*) FROM user_video_comments c WHERE c.videoId = v.id) AS commentsCount
    FROM user_videos v
    LEFT JOIN users u ON u.id = v.userId`;

  const selectAllVideos = db.prepare(
    `${VIDEO_ROW_SELECT}
     ORDER BY v.createdAt DESC`,
  );

  const selectUserVideos = db.prepare(
    `${VIDEO_ROW_SELECT}
     WHERE v.userId = ?
     ORDER BY v.createdAt DESC`,
  );

  const selectVideoById = db.prepare(
    `${VIDEO_ROW_SELECT}
     WHERE v.id = ?`,
  );

  const insertVideo = db.prepare(
    `INSERT INTO user_videos (id, userId, title, tags, filename, mimeType, sizeBytes, durationSeconds, likes, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
  );

  // Social-import insert carries an idempotency key (see POST /admin/import).
  const insertImportedVideo = db.prepare(
    `INSERT INTO user_videos (id, userId, title, tags, filename, mimeType, sizeBytes, durationSeconds, likes, createdAt, importKey)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`,
  );

  const selectVideoByImportKey = db.prepare(
    `${VIDEO_ROW_SELECT}
     WHERE v.importKey = ?`,
  );

  const selectDistinctTags = db.prepare(
    `SELECT DISTINCT tags FROM user_videos WHERE tags IS NOT NULL`,
  );

  const selectCommentedVideoTags = db.prepare(
    `SELECT v.tags
     FROM user_video_comments c
     JOIN user_videos v ON v.id = c.videoId
     WHERE c.userId = ?`,
  );

  const selectViewedVideoIds = db.prepare(
    `SELECT videoId FROM user_video_views WHERE userId = ?`,
  );

  const insertVideoView = db.prepare(
    `INSERT OR IGNORE INTO user_video_views (id, videoId, userId, createdAt)
     VALUES (?, ?, ?, ?)`,
  );

  const selectUserByUsername = db.prepare(
    `SELECT id, username, avatar, passwordHash, discordId FROM users WHERE username = ?`,
  );

  const insertUser = db.prepare(
    `INSERT INTO users (id, username, avatar, createdAt, verified) VALUES (?, ?, ?, ?, ?)`,
  );

  const updateUserAvatar = db.prepare(
    `UPDATE users SET avatar = ? WHERE id = ?`,
  );

  const markUserVerified = db.prepare(
    `UPDATE users SET verified = 1 WHERE id = ?`,
  );

  function resolveAuthorWithAvatar({ username, avatar, verified }) {
    const isVerified = verified === true;
    const existing = selectUserByUsername.get(username);
    if (!existing) {
      const authorId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const now = new Date().toISOString();
      insertUser.run(authorId, username, avatar, now, isVerified ? 1 : 0);
      return { id: authorId, username, avatar };
    }
    // Placeholder authors (created by earlier admin imports/uploads) have no
    // password or Discord link — refresh their avatar to the real one and, if
    // this import came from a verified account, flag them verified (once set,
    // it stays — a later failed scrape shouldn't strip the badge). Real
    // registered accounts always keep their own avatar and badge.
    const isPlaceholder = !existing.passwordHash && !existing.discordId;
    if (isPlaceholder && isVerified) {
      markUserVerified.run(existing.id);
    }
    if (isPlaceholder && avatar) {
      updateUserAvatar.run(avatar, existing.id);
      return { id: existing.id, username: existing.username, avatar };
    }
    return {
      id: existing.id,
      username: existing.username,
      avatar: existing.avatar,
    };
  }

  const updateVideoLikes = db.prepare(
    `UPDATE user_videos SET likes = ? WHERE id = ?`,
  );

  const deleteVideoById = db.prepare(`DELETE FROM user_videos WHERE id = ?`);

  // Comment CRUD lives in ../lib/pixie-comments.js (same style as the inbox
  // module) — the routes below are thin wrappers around it.

  const selectStoredVideoId = db.prepare(
    `SELECT id FROM user_videos WHERE id = ?`,
  );

  const updateVideoFile = db.prepare(
    `UPDATE user_videos SET filename = ?, mimeType = ?, sizeBytes = ? WHERE id = ?`,
  );

  const updateVideoPoster = db.prepare(
    `UPDATE user_videos SET posterFilename = ? WHERE id = ?`,
  );

  // Frame size + duration of the stored rendition, learned from ffprobe once
  // the delivery encode has settled. COALESCE keeps an existing value when a
  // later probe comes back blank.
  const updateVideoDimensions = db.prepare(
    `UPDATE user_videos
        SET width = ?, height = ?,
            durationSeconds = COALESCE(?, durationSeconds)
      WHERE id = ?`,
  );

  // Extract a first-frame poster for `videoPath` and attach it to the row.
  // Best-effort: a failure just leaves the row with no poster (the player
  // falls back to its own first painted frame), and the backfill script can
  // fill it in later.
  async function attachPosterFrame(rowId, videoPath) {
    try {
      const poster = await extractPosterFrame(videoPath);
      if (!selectStoredVideoId.get(rowId)) {
        await fs.promises.unlink(poster.filePath).catch(() => {});
        return;
      }
      updateVideoPoster.run(poster.filename, rowId);
    } catch (err) {
      console.error(
        "Could not generate a poster frame:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Direct uploads are stored as-is so the original quality is never touched,
  // then this background pass probes the file and — only when needed —
  // remuxes or re-encodes it (H.264/AAC + faststart, same resolution and
  // frame rate) so every device can stream it. The DB row is repointed to the
  // new file when one is produced, and a first-frame poster is attached.
  function finalizeUploadedVideo(rowId, originalFilePath) {
    void (async () => {
      let storedFilePath = originalFilePath;
      try {
        const result = await transcodeToH264(originalFilePath);
        if (!selectStoredVideoId.get(rowId)) {
          if (result.converted) {
            await fs.promises.unlink(result.filePath).catch(() => {});
          }
          return;
        }
        if (result.converted) {
          updateVideoFile.run(
            path.basename(result.filePath),
            result.mimeType,
            result.sizeBytes,
            rowId,
          );
          storedFilePath = result.filePath;
          if (result.filePath !== originalFilePath) {
            await fs.promises.unlink(originalFilePath).catch(() => {});
          }
        }
        if (result.width && result.height) {
          updateVideoDimensions.run(
            result.width,
            result.height,
            result.durationSeconds ?? null,
            rowId,
          );
        }
      } catch (err) {
        // Keep the original file so nothing is lost; the pixie stays as
        // uploaded and the repair script can convert it later.
        console.error(
          "Could not make uploaded video playable everywhere:",
          err instanceof Error ? err.message : err,
        );
      }
      await attachPosterFrame(rowId, storedFilePath);
    })();
  }

  function buildViewerTagWeights(viewerId, videoRows) {
    const weights = new Map();
    const addTags = (rawTags, weight) => {
      for (const tag of parseTags(rawTags)) {
        weights.set(tag, (weights.get(tag) || 0) + weight);
      }
    };

    for (const row of videoRows) {
      if (parseLikes(row.likes).includes(viewerId)) {
        addTags(row.tags, TAG_LIKE_WEIGHT);
      }
    }

    const commentedRows = selectCommentedVideoTags.all(viewerId);
    for (const row of commentedRows) {
      addTags(row.tags, TAG_COMMENT_WEIGHT);
    }

    return weights;
  }

  function tagAffinity(row, weights) {
    let affinity = 0;
    for (const tag of parseTags(row.tags)) {
      affinity += weights.get(tag) || 0;
    }
    return affinity;
  }

  function scoreVideo(row, weights) {
    const likes = parseLikes(row.likes).length;
    const comments = row.commentsCount || 0;

    return (
      tagAffinity(row, weights) +
      ENGAGEMENT_LIKE_WEIGHT * Math.log1p(likes) +
      ENGAGEMENT_COMMENT_WEIGHT * Math.log1p(comments)
    );
  }

  // ── Upload a video ──
  router.post("/", requireUserMw, videoUpload.single("video"), (req, res) => {
    try {
      const user = req.authUser;

      if (!req.file) {
        return res.status(400).json({ error: "No video provided" });
      }

      const rawTitle = String(req.body?.title || "").trim();
      const title = rawTitle.slice(0, VIDEO_TITLE_MAX_LENGTH);

      // Tags are optional on every upload path (user, admin, social import).
      const tags = sanitizeTags(req.body?.tags);

      let durationSeconds = null;
      const rawDuration = Number.parseFloat(req.body?.durationSeconds);
      if (Number.isFinite(rawDuration) && rawDuration > 0) {
        durationSeconds = rawDuration;
      }

      const id = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const createdAt = new Date().toISOString();

      insertVideo.run(
        id,
        user.id,
        title,
        JSON.stringify(tags),
        req.file.filename,
        req.file.mimetype || "video/mp4",
        req.file.size || 0,
        durationSeconds,
        createdAt,
      );

      finalizeUploadedVideo(id, path.join(VIDEOS_DIR, req.file.filename));

      void notifyFollowersOfNewPixie(db, {
        posterId: user.id,
        posterUsername: user.username,
        videoId: id,
        title,
      });

      setNoStoreHeaders(res);
      res.status(201).json(mapVideoRow(selectVideoById.get(id), user.id));
    } catch (err) {
      if (req.file) {
        const filePath = path.join(VIDEOS_DIR, req.file.filename);
        fs.promises.unlink(filePath).catch(() => {});
      }
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // ── Admin upload with custom author (owner only) ──
  router.post("/admin", requireOwnerMw, videoUpload.single("video"), async (req, res) => {
    try {
      const user = req.authUser;

      const cleanupFile = () => {
        if (!req.file) return;
        const filePath = path.join(VIDEOS_DIR, req.file.filename);
        fs.promises.unlink(filePath).catch(() => {});
      };

      if (!req.file) {
        return res.status(400).json({ error: "No video provided" });
      }

      const rawUsername = String(req.body?.username || "").trim();
      const usernameError = validateAuthorUsername(rawUsername);
      if (usernameError) {
        cleanupFile();
        return res.status(400).json({ error: usernameError });
      }

      const rawAvatar = String(req.body?.avatarUrl || "").trim();
      let avatar = null;
      if (rawAvatar) {
        if (!isValidAvatarUrl(rawAvatar)) {
          cleanupFile();
          return res.status(400).json({ error: "Invalid avatar URL" });
        }
        // Social CDN avatar links carry expiring tokens that 403 for browsers
        // later — store a local PNG mirror, just like the social import path.
        avatar = /^https?:\/\//i.test(rawAvatar)
          ? await mirrorAvatarToPng(rawAvatar, IMAGES_DIR)
          : rawAvatar;
      }

      const tags = sanitizeTags(req.body?.tags);

      const title = String(req.body?.title || "")
        .trim()
        .slice(0, VIDEO_TITLE_MAX_LENGTH);

      let durationSeconds = null;
      const rawDuration = Number.parseFloat(req.body?.durationSeconds);
      if (Number.isFinite(rawDuration) && rawDuration > 0) {
        durationSeconds = rawDuration;
      }

      const authorUser = resolveAuthorWithAvatar({
        username: rawUsername,
        avatar,
        verified: req.body?.verified === "true" || req.body?.verified === true,
      });

      const id = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const createdAt = new Date().toISOString();

      insertVideo.run(
        id,
        authorUser.id,
        title,
        JSON.stringify(tags),
        req.file.filename,
        req.file.mimetype || "video/mp4",
        req.file.size || 0,
        durationSeconds,
        createdAt,
      );

      finalizeUploadedVideo(id, path.join(VIDEOS_DIR, req.file.filename));

      setNoStoreHeaders(res);
      res.status(201).json(mapVideoRow(selectVideoById.get(id), user.id));
    } catch (err) {
      if (req.file) {
        const filePath = path.join(VIDEOS_DIR, req.file.filename);
        fs.promises.unlink(filePath).catch(() => {});
      }
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // ── TikTok import queue (owner only) ──
  router.get("/admin/tiktok/queue", async (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });
      if (!isOwner(user)) return res.status(403).json({ error: "forbidden" });

      const entries = readTikTokList()
        .map(normalizeTikTokQueueEntry)
        .filter(Boolean);

      const shuffled = entries
        .map((entry) => ({ entry, order: Math.random() }))
        .sort((a, b) => a.order - b.order)
        .map(({ entry }) => entry);

      const rawLimit = Number.parseInt(String(req.query.limit || "12"), 10);
      const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 12, 1), 50);

      const selected = shuffled.slice(0, limit);

      const enriched = await Promise.all(
        selected.map(async (entry) => {
          const needsMeta =
            !entry.username || !entry.caption || !entry.thumbnailUrl;
          if (!needsMeta) return entry;
          try {
            const oembed = await fetchTikTokOembed(entry.url);
            if (!oembed) return entry;
            return {
              ...entry,
              username: entry.username || oembed.username || undefined,
              caption: entry.caption || oembed.caption || undefined,
              thumbnailUrl:
                entry.thumbnailUrl || oembed.thumbnailUrl || undefined,
            };
          } catch {
            return entry;
          }
        }),
      );

      setNoStoreHeaders(res);
      res.json(enriched);
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Public feed (personalized for authenticated viewers) ──
  // Compute the fully ordered + mapped feed for a viewer (the expensive path).
  function computeFeed(viewer, includeId, interestTags) {
    const rows = selectAllVideos.all();

    let ordered = rows;
    const weights = viewer ? buildViewerTagWeights(viewer.id, rows) : new Map();
    for (const tag of interestTags) {
      weights.set(tag, (weights.get(tag) || 0) + TAG_INTEREST_WEIGHT);
    }

    if (viewer || weights.size > 0) {
      const seenIds = new Set();
      if (viewer) {
        for (const row of rows) {
          if (parseLikes(row.likes).includes(viewer.id)) {
            seenIds.add(row.id);
          }
        }
        for (const view of selectViewedVideoIds.all(viewer.id)) {
          seenIds.add(view.videoId);
        }
      }
      if (includeId) seenIds.delete(includeId);

      const unwatched = rows.filter((row) => !seenIds.has(row.id));
      const watched = rows.filter((row) => seenIds.has(row.id));

      if (weights.size > 0) {
        const scored = unwatched.map((row) => ({
          row,
          affinity: tagAffinity(row, weights),
          score: scoreVideo(row, weights),
        }));
        const hasSuitableTags = scored.some((entry) => entry.affinity > 0);
        if (hasSuitableTags) {
          scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.row.createdAt > b.row.createdAt) return -1;
            if (a.row.createdAt < b.row.createdAt) return 1;
            return 0;
          });
        }
        ordered = [...scored.map((entry) => entry.row), ...watched];
      } else {
        ordered = [...unwatched, ...watched];
      }
    }

    if (includeId) {
      ordered = ordered.filter((row) => row.id !== includeId);
      const includeRow = rows.find((row) => row.id === includeId);
      if (includeRow) ordered = [includeRow, ...ordered];
    }

    return ordered.map((row) => mapVideoRow(row, viewer?.id));
  }

  router.get("/feed", (req, res) => {
    try {
      const viewer = authFromReq(req);
      const includeId =
        typeof req.query.include === "string" ? req.query.include : null;
      // Legacy: older clients paginate with an ever-growing `exclude` id list.
      // New clients send `offset` (see below); both are honoured.
      const excludeIds = new Set(
        typeof req.query.exclude === "string"
          ? req.query.exclude
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean)
          : [],
      );
      const offset = parseListOffset(req.query.offset);
      const rawLimit = Number.parseInt(String(req.query.limit || "10"), 10);
      const limit = Math.min(
        Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1),
        50,
      );
      // Onboarding interests: tags the viewer picked before they have any
      // like/comment history. They also personalize the feed for signed-out
      // viewers, who otherwise get a purely chronological list.
      const interestTags = sanitizeTags(
        typeof req.query.interests === "string"
          ? req.query.interests.split(",")
          : [],
      );

      const cacheKey = `${viewer?.id || "anon"}|${interestTags.join(",")}|${
        includeId || ""
      }`;
      const now = Date.now();
      let cached = FEED_CACHE.get(cacheKey);
      // Only reuse the memo mid-scroll (offset > 0); a fresh load always
      // recomputes so new pixies / likes show up.
      if (!(offset > 0 && cached && now - cached.at <= FEED_CACHE_TTL_MS)) {
        cached = { items: computeFeed(viewer, includeId, interestTags), at: now };
        FEED_CACHE.set(cacheKey, cached);
        pruneFeedCache(now);
      }

      const source =
        excludeIds.size > 0
          ? cached.items.filter((item) => !excludeIds.has(item.id))
          : cached.items;

      setNoStoreHeaders(res);
      res.json(source.slice(offset, offset + limit));
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Search pixies by caption, #tag, or @author ──
  router.get("/search", (req, res) => {
    try {
      const viewer = authFromReq(req);
      const rawQuery = String(req.query.q || "")
        .trim()
        .toLowerCase();
      const rawLimit = Number.parseInt(String(req.query.limit || "10"), 10);
      const limit = Math.min(
        Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1),
        50,
      );
      const excludeIds = new Set(
        typeof req.query.exclude === "string"
          ? req.query.exclude
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean)
          : [],
      );
      const offset = parseListOffset(req.query.offset);

      if (!rawQuery) {
        setNoStoreHeaders(res);
        return res.json([]);
      }

      const terms = rawQuery.split(/\s+/).filter(Boolean).slice(0, 8);
      const rows = selectAllVideos.all();
      const scored = [];

      for (const row of rows) {
        if (excludeIds.has(row.id)) continue;

        const title = String(row.title || "").toLowerCase();
        const tags = parseTags(row.tags).map((tag) =>
          String(tag).toLowerCase(),
        );
        const username = String(row.authorUsername || "").toLowerCase();

        let score = 0;
        let matchedEveryTerm = true;
        for (const term of terms) {
          let termScore = 0;
          if (tags.includes(term)) termScore += 12;
          else if (tags.some((tag) => tag.includes(term))) termScore += 5;
          if (username === term) termScore += 10;
          else if (username.includes(term)) termScore += 6;
          if (title.includes(term)) termScore += 3;
          if (termScore === 0) matchedEveryTerm = false;
          score += termScore;
        }
        if (!matchedEveryTerm || score === 0) continue;

        const likes = parseLikes(row.likes).length;
        const comments = row.commentsCount || 0;
        score +=
          ENGAGEMENT_LIKE_WEIGHT * Math.log1p(likes) +
          ENGAGEMENT_COMMENT_WEIGHT * Math.log1p(comments);
        scored.push({ row, score });
      }

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.row.createdAt > b.row.createdAt) return -1;
        if (a.row.createdAt < b.row.createdAt) return 1;
        return 0;
      });

      setNoStoreHeaders(res);
      res.json(
        scored
          .slice(offset, offset + limit)
          .map((entry) => mapVideoRow(entry.row, viewer?.id)),
      );
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Popular / trending pixies (engagement-ranked, recency-decayed) ──
  const POPULAR_WINDOWS_MS = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    all: null,
  };
  const POPULAR_DECAY_DAYS = 30;

  router.get("/popular", (req, res) => {
    try {
      const viewer = authFromReq(req);
      const requestedWindow = String(req.query.window || "7d");
      const windowKey = Object.prototype.hasOwnProperty.call(
        POPULAR_WINDOWS_MS,
        requestedWindow,
      )
        ? requestedWindow
        : "7d";
      const windowMs = POPULAR_WINDOWS_MS[windowKey];
      const rawLimit = Number.parseInt(String(req.query.limit || "10"), 10);
      const limit = Math.min(
        Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1),
        50,
      );
      const excludeIds = new Set(
        typeof req.query.exclude === "string"
          ? req.query.exclude
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean)
          : [],
      );
      const offset = parseListOffset(req.query.offset);

      const now = Date.now();
      const rows = selectAllVideos.all();
      const scored = [];

      for (const row of rows) {
        if (excludeIds.has(row.id)) continue;
        const createdMs = Date.parse(row.createdAt) || 0;
        if (windowMs != null && now - createdMs > windowMs) continue;

        const likes = parseLikes(row.likes).length;
        const comments = row.commentsCount || 0;
        const engagement =
          ENGAGEMENT_LIKE_WEIGHT * likes + ENGAGEMENT_COMMENT_WEIGHT * comments;
        const ageDays = Math.max(0, (now - createdMs) / (24 * 60 * 60 * 1000));
        const score = (engagement + 1) * Math.exp(-ageDays / POPULAR_DECAY_DAYS);
        scored.push({ row, score });
      }

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.row.createdAt > b.row.createdAt) return -1;
        if (a.row.createdAt < b.row.createdAt) return 1;
        return 0;
      });

      setNoStoreHeaders(res);
      res.json(
        scored
          .slice(offset, offset + limit)
          .map((entry) => mapVideoRow(entry.row, viewer?.id)),
      );
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Following feed: newest clips from accounts the viewer follows ──
  router.get("/following", (req, res) => {
    try {
      const viewer = authFromReq(req);
      if (!viewer) return res.status(401).json({ error: "unauthenticated" });

      const offset = parseListOffset(req.query.offset);
      const rawLimit = Number.parseInt(String(req.query.limit || "10"), 10);
      const limit = Math.min(
        Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1),
        50,
      );

      const followingIds = getFollowingIds(db, viewer.id);
      if (followingIds.length === 0) {
        setNoStoreHeaders(res);
        return res.json([]);
      }

      const placeholders = followingIds.map(() => "?").join(",");
      const rows = db
        .prepare(
          `${VIDEO_ROW_SELECT}
           WHERE v.userId IN (${placeholders})
           ORDER BY v.createdAt DESC
           LIMIT ? OFFSET ?`,
        )
        .all(...followingIds, limit, offset);

      setNoStoreHeaders(res);
      res.json(rows.map((row) => mapVideoRow(row, viewer.id)));
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Tag suggestions (video-only corpus) ──
  router.get("/tags", (_req, res) => {
    try {
      const rows = selectDistinctTags.all();
      const counts = new Map();
      for (const row of rows) {
        for (const tag of parseTags(row.tags)) {
          counts.set(tag, (counts.get(tag) || 0) + 1);
        }
      }
      const sorted = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([tag]) => tag);
      setNoStoreHeaders(res);
      res.json(sorted);
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Videos by user ──
  router.get("/user/:userId", (req, res) => {
    try {
      const viewer = authFromReq(req);
      const rows = selectUserVideos.all(String(req.params.userId));
      setNoStoreHeaders(res);
      res.json(rows.map((row) => mapVideoRow(row, viewer?.id)));
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Record a view (marks the video as watched for this user) ──
  router.post("/:id/view", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });

      const row = selectVideoById.get(String(req.params.id));
      if (!row) return res.status(404).json({ error: "not found" });

      const id = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      insertVideoView.run(id, row.id, user.id, new Date().toISOString());

      setNoStoreHeaders(res);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Toggle like ──
  router.post("/:id/like", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });

      const row = selectVideoById.get(String(req.params.id));
      if (!row) return res.status(404).json({ error: "not found" });

      const likes = parseLikes(row.likes);
      const existingIndex = likes.indexOf(user.id);
      let liked = false;

      if (existingIndex >= 0) {
        likes.splice(existingIndex, 1);
      } else {
        likes.push(user.id);
        liked = true;
      }

      updateVideoLikes.run(JSON.stringify(likes), row.id);

      // Only notify on a fresh like (not on unlike), and never self-notify.
      if (liked && row.userId && row.userId !== user.id) {
        try {
          createPixieNotification(db, {
            userId: row.userId,
            type: "like",
            actor: { id: user.id, username: user.username, avatar: user.avatar },
            videoId: row.id,
            preview: row.title,
          });
        } catch {
          // A notification failure must never fail the like itself.
        }
      }

      setNoStoreHeaders(res);
      res.json({ liked, likesCount: likes.length });
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // Map a thrown PixieCommentError to its HTTP status; anything else is a 500.
  function handleCommentError(err, res) {
    if (err instanceof PixieCommentError) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(500).json({ error: "failed" });
  }

  // ── List comments (top-level + one level of replies, flat) ──
  router.get("/:id/comments", (req, res) => {
    try {
      const viewer = authFromReq(req);
      const comments = listPixieComments(db, {
        videoId: req.params.id,
        viewerId: viewer?.id ?? null,
      });
      setNoStoreHeaders(res);
      res.json(comments);
    } catch (err) {
      handleCommentError(err, res);
    }
  });

  // ── Add a comment or a reply ──
  router.post("/:id/comments", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });

      const comment = createPixieComment(db, {
        videoId: req.params.id,
        user,
        content: req.body?.content,
        parentId: req.body?.parentId,
      });
      setNoStoreHeaders(res);
      res.status(201).json(comment);
    } catch (err) {
      handleCommentError(err, res);
    }
  });

  // ── Toggle a like on a comment ──
  router.post("/:id/comments/:commentId/like", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });

      const result = togglePixieCommentLike(db, {
        commentId: req.params.commentId,
        user,
      });
      setNoStoreHeaders(res);
      res.json(result);
    } catch (err) {
      handleCommentError(err, res);
    }
  });

  // ── Delete a comment (author, video owner, or site owner) ──
  router.delete("/:id/comments/:commentId", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });

      const result = deletePixieComment(db, {
        commentId: req.params.commentId,
        user,
      });
      setNoStoreHeaders(res);
      res.json(result);
    } catch (err) {
      handleCommentError(err, res);
    }
  });

  // ── Delete a video ──
  router.delete("/:id", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });

      const row = selectVideoById.get(String(req.params.id));
      if (!row) return res.status(404).json({ error: "not found" });

      const isVideoOwner = row.userId === user.id;
      if (!isVideoOwner && !isOwner(user)) {
        return res.status(403).json({ error: "forbidden" });
      }

      deleteVideoById.run(row.id);
      deletePixieCommentsForVideo(db, row.id);

      const filePath = path.join(VIDEOS_DIR, row.filename);
      fs.promises.unlink(filePath).catch(() => {});
      if (row.posterFilename) {
        fs.promises
          .unlink(path.join(VIDEOS_DIR, row.posterFilename))
          .catch(() => {});
      }

      // A moderator (site owner) removing someone else's clip — let the author
      // know, with an optional reason. Self-deletes stay silent.
      if (!isVideoOwner && row.userId) {
        const rawReason = String(req.body?.reason || req.query?.reason || "").trim();
        try {
          createPixieNotification(db, {
            userId: row.userId,
            type: "video_removed",
            actor: { id: user.id, username: user.username, avatar: user.avatar },
            videoId: row.id,
            preview:
              rawReason ||
              String(row.title || "").trim() ||
              "This clip did not meet the community guidelines.",
          });
        } catch {
          // Non-fatal.
        }
      }

      setNoStoreHeaders(res);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Avatar preview proxy (owner only) ──
  // IG/TikTok CDN avatar links are token-bound to the server's IP and 403
  // from the browser. Mirror server-side and redirect to the local copy so
  // the admin form's avatar preview renders.
  router.get("/admin/avatar-proxy", async (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });
      if (!isOwner(user)) return res.status(403).json({ error: "forbidden" });

      const rawUrl = String(req.query.url || "").trim();
      let parsed = null;
      try {
        parsed = new URL(rawUrl);
      } catch {
        parsed = null;
      }
      if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
        return res.status(400).json({ error: "Invalid avatar URL" });
      }

      const mirrored = await mirrorAvatarToPng(rawUrl, IMAGES_DIR);
      if (mirrored !== rawUrl) {
        return res.redirect(mirrored);
      }

      // Mirroring failed (source refused) — stream what the server can reach.
      try {
        const remote = await fetch(rawUrl, {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(12000),
        });
        if (!remote.ok || !remote.body) {
          return res.status(502).json({ error: "Avatar unavailable" });
        }
        res.setHeader("Content-Type", remote.headers.get("content-type") || "image/jpeg");
        setNoStoreHeaders(res);
        const reader = remote.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } catch {
        res.status(502).json({ error: "Avatar unavailable" });
      }
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Resolve TikTok / Instagram / YouTube metadata (owner only). Runs as a
  // background job so the admin form can show progress while TikTok/IG
  // throttle; poll GET /admin/resolve/status/:jobId. ──
  router.post("/admin/resolve", async (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });
      if (!isOwner(user)) return res.status(403).json({ error: "forbidden" });

      const rawUrl = String(req.body?.url || "").trim();
      if (!classifyPlatform(rawUrl)) {
        return res.status(400).json({
          error:
            "Unsupported URL — paste a TikTok, Instagram reel, or YouTube Shorts link",
        });
      }

      pruneImportJobs();
      importJobSequence += 1;
      const job = {
        jobId: `resolve-${Date.now()}-${importJobSequence}`,
        ownerId: user.id,
        state: "queued",
        stage: "queued",
        message: "Starting…",
        progress: 0,
        error: null,
        result: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      IMPORT_JOBS.set(job.jobId, job);
      performResolveJob(job, rawUrl).catch((err) => {
        Object.assign(job, {
          state: "error",
          error: err instanceof Error ? err.message : "Failed to fetch details",
          updatedAt: Date.now(),
        });
      });

      setNoStoreHeaders(res);
      res.status(202).json({ jobId: job.jobId });
    } catch {
      res.status(500).json({ error: "Failed to fetch details" });
    }
  });

  // ── Resolve job status (owner only) ──
  router.get("/admin/resolve/status/:jobId", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });
      if (!isOwner(user)) return res.status(403).json({ error: "forbidden" });

      const job = IMPORT_JOBS.get(String(req.params.jobId));
      if (!job) return res.status(404).json({ error: "Job not found" });
      setNoStoreHeaders(res);
      res.json(importJobSnapshot(job));
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Social import jobs: run in the background so the admin form can show
  // real-time progress while the video resolves/downloads. ──

  function pruneImportJobs() {
    const now = Date.now();
    for (const [id, job] of IMPORT_JOBS) {
      if (now - job.createdAt > IMPORT_JOB_MAX_AGE_MS) IMPORT_JOBS.delete(id);
    }
  }

  // "Creep" the bar inside long stages (resolve/download can take minutes
  // while TikTok/IG throttle) so progress never looks frozen.
  function startJobCreep(job, from, to) {
    job.progress = from;
    const interval = setInterval(() => {
      // Self-terminate once the job reaches a terminal state, so an early
      // return/throw in the caller before its `clearInterval` can't leak a
      // 700 ms timer for the life of the process. Callers still clear it
      // between stages (clearing twice is a harmless no-op).
      if (job.state === "done" || job.state === "error") {
        clearInterval(interval);
        return;
      }
      if (job.state !== "running" || job.progress >= to) return;
      job.progress = Math.min(
        to,
        job.progress + 0.7 + Math.random() * 1.4,
      );
      job.updatedAt = Date.now();
    }, 700);
    return interval;
  }

  function importJobSnapshot(job) {
    return {
      jobId: job.jobId,
      state: job.state,
      stage: job.stage,
      message: job.message,
      progress: Math.round(job.progress),
      error: job.error || null,
      result: job.result || null,
      pixie: job.pixie || null,
    };
  }

  async function performResolveJob(job, rawUrl) {
    const update = (stage, message, progress) => {
      Object.assign(job, {
        state: "running",
        stage,
        message,
        progress,
        updatedAt: Date.now(),
      });
    };
    const creep = startJobCreep(job, 3, 92);
    try {
      update("resolve", "Fetching video details…", 3);
      const resolved = await resolveSocialVideo(rawUrl);
      Object.assign(job, {
        state: "done",
        stage: "done",
        message: "Details ready!",
        progress: 100,
        result: {
          platform: resolved.platform,
          username: resolved.username || "",
          avatarUrl: String(resolved.avatarUrl || "").trim(),
          verified: resolved.verified === true,
          caption: resolved.caption || "",
          hashtags: resolved.hashtags || [],
          durationSeconds: resolved.durationSeconds ?? null,
          coverUrl: resolved.coverUrl || "",
        },
        updatedAt: Date.now(),
      });
    } catch (err) {
      Object.assign(job, {
        state: "error",
        error: err instanceof Error ? err.message : "Failed to fetch details",
        updatedAt: Date.now(),
      });
    } finally {
      clearInterval(creep);
    }
  }

  // Run one social import to completion. Reports progress through
  // `onProgress({ stage, message, progress })` and returns { videoId } on
  // success; throws on failure. Used by the durable import queue below.
  async function runSocialImport(params, onProgress = () => {}) {
    const rawUrl = String(params.url || "").trim();
    let progress = 0;
    let curStage = "queued";
    let curMessage = "Starting import…";
    let creepTimer = null;

    const emit = () => {
      onProgress({ stage: curStage, message: curMessage, progress });
    };
    const step = (stage, message, value) => {
      stopCreep();
      curStage = stage;
      curMessage = message;
      progress = value;
      emit();
    };
    // Ease progress toward `to` inside a slow stage so the bar never looks
    // frozen while a platform throttles the scrape / download.
    const creepTo = (to) => {
      stopCreep();
      creepTimer = setInterval(() => {
        if (progress >= to) return;
        progress = Math.min(to, progress + 0.6 + Math.random() * 1.1);
        emit();
      }, 800);
    };
    function stopCreep() {
      if (creepTimer) {
        clearInterval(creepTimer);
        creepTimer = null;
      }
    }

    let downloadedFilePath = null;
    try {
      step("resolve", "Fetching video details…", 4);
      creepTo(30);
      let resolved = null;
      try {
        // The form resolved the video moments ago (username, avatar, caption
        // are known). Re-resolving here refreshes the download address and
        // fills gaps; the TikTok avatar lookup is a single quick attempt
        // either way so the bot wall never stalls the download.
        resolved = await resolveSocialVideo(rawUrl);
      } catch {
        resolved = null;
      }

      const username = truncateCodePoints(
        String(params.username || "").trim() ||
          String(resolved?.username || "").trim(),
        MAX_AUTHOR_USERNAME_LENGTH,
      );
      if (!username) {
        throw new Error(
          "Could not determine an author username — set the username and retry",
        );
      }

      step("download", "Downloading video…", 34);
      creepTo(82);
      const destBase = path.join(
        VIDEOS_DIR,
        `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      );
      const downloaded = await downloadSocialVideo(rawUrl, destBase, {
        metadata: resolved,
      });
      downloadedFilePath = downloaded.filePath;

      step("process", "Making the video playable on every device…", 86);
      creepTo(94);
      const converted = await transcodeToH264(downloaded.filePath);
      if (converted.converted && converted.filePath !== downloaded.filePath) {
        await fs.promises.unlink(downloaded.filePath).catch(() => {});
        downloadedFilePath = converted.filePath;
      }
      const sizeBytes = converted.sizeBytes;
      const mimeType = converted.mimeType;
      let avatar =
        String(params.avatarUrl || "").trim() ||
        String(resolved?.avatarUrl || "").trim() ||
        null;
      if (avatar && /^https?:\/\//i.test(avatar)) {
        avatar = await mirrorAvatarToPng(avatar, IMAGES_DIR);
      }
      const durationSeconds =
        resolved?.durationSeconds ?? converted.durationSeconds ?? null;
      const id = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

      const authorUser = resolveAuthorWithAvatar({
        username,
        avatar,
        // Trust either the flag the admin saw at fetch time or a fresh positive
        // from the re-resolve above.
        verified: params.verified === true || resolved?.verified === true,
      });
      const createdAt = new Date().toISOString();
      let storedId = id;
      try {
        insertImportedVideo.run(
          id,
          authorUser.id,
          String(params.title || ""),
          JSON.stringify(Array.isArray(params.tags) ? params.tags : []),
          path.basename(downloadedFilePath),
          mimeType,
          sizeBytes,
          durationSeconds,
          createdAt,
          params.importKey || null,
        );
      } catch (err) {
        // A retry (or a crash after the insert) with the same importKey — the
        // row is already there. Drop this download and reuse the existing video.
        const existing = params.importKey
          ? selectVideoByImportKey.get(params.importKey)
          : null;
        if (!existing) throw err;
        storedId = existing.id;
        if (downloadedFilePath) {
          fs.promises.unlink(downloadedFilePath).catch(() => {});
          downloadedFilePath = null;
        }
      }

      // First-frame poster for a freshly imported clip (skipped when an
      // importKey collision made us reuse an existing row above).
      if (storedId === id && downloadedFilePath) {
        if (converted.width && converted.height) {
          updateVideoDimensions.run(
            converted.width,
            converted.height,
            durationSeconds,
            id,
          );
        }
        await attachPosterFrame(id, downloadedFilePath);
      }

      stopCreep();
      step("done", "Video imported!", 100);
      return { videoId: storedId };
    } catch (err) {
      stopCreep();
      if (downloadedFilePath) {
        fs.promises.unlink(downloadedFilePath).catch(() => {});
      }
      throw err instanceof Error ? err : new Error("Import failed");
    }
  }

  // ── Durable "download & import" queue (owner only) ──────────────────────
  // The admin adds links to this queue and can then close or refresh the
  // page — imports run one at a time in the background, their progress is
  // persisted per row, and a backend restart re-queues whatever was mid-run.
  const importQueue = createPixieImportQueue({
    db,
    runImport: (params, onProgress) => runSocialImport(params, onProgress),
  });
  importQueue.recover();

  // Auto-import scheduler hook: enqueue a scraped TikTok home-feed clip on the
  // admin's behalf. See lib/tiktok-feed-scheduler.js.
  app.locals.pixieImport = {
    enqueue: (params) =>
      importQueue.enqueue({ ...params, enqueuedBy: params.enqueuedBy || null }),
    list: (limit) => importQueue.list(limit),
  };

  function requireOwner(req, res) {
    const user = authFromReq(req);
    if (!user) {
      res.status(401).json({ error: "unauthenticated" });
      return null;
    }
    if (!isOwner(user)) {
      res.status(403).json({ error: "forbidden" });
      return null;
    }
    return user;
  }

  // List the queue (running + waiting first, then recently finished).
  router.get("/admin/import/queue", (req, res) => {
    if (!requireOwner(req, res)) return;
    setNoStoreHeaders(res);
    res.json({ items: importQueue.list(50) });
  });

  // Add a link to the queue.
  router.post("/admin/import/queue", (req, res) => {
    const user = requireOwner(req, res);
    if (!user) return;
    try {
      const rawUrl = String(req.body?.url || "").trim();
      const platform = classifyPlatform(rawUrl);
      if (!platform) {
        return res.status(400).json({
          error:
            "Unsupported URL — paste a TikTok, Instagram reel, or YouTube Shorts link",
        });
      }

      const providedUsername = String(req.body?.username || "").trim();
      const usernameError = providedUsername
        ? validateAuthorUsername(providedUsername)
        : null;
      if (usernameError) return res.status(400).json({ error: usernameError });

      const providedAvatar = String(req.body?.avatarUrl || "").trim();
      if (providedAvatar && !isValidAvatarUrl(providedAvatar)) {
        return res.status(400).json({ error: "Invalid avatar URL" });
      }

      const importKey = String(req.body?.importKey || "")
        .trim()
        .slice(0, 100);

      const item = importQueue.enqueue({
        url: rawUrl,
        platform,
        title: String(req.body?.title || "")
          .trim()
          .slice(0, VIDEO_TITLE_MAX_LENGTH),
        tags: sanitizeTags(req.body?.tags),
        username: providedUsername,
        avatarUrl: providedAvatar,
        verified: req.body?.verified === true,
        importKey: importKey || null,
        enqueuedBy: user.id,
      });

      setNoStoreHeaders(res);
      res.status(202).json({ item });
    } catch {
      res.status(500).json({ error: "Could not queue the import" });
    }
  });

  router.post("/admin/import/queue/:id/cancel", (req, res) => {
    if (!requireOwner(req, res)) return;
    const item = importQueue.cancel(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    setNoStoreHeaders(res);
    res.json({ item });
  });

  router.post("/admin/import/queue/:id/retry", (req, res) => {
    if (!requireOwner(req, res)) return;
    const item = importQueue.retry(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    setNoStoreHeaders(res);
    res.json({ item });
  });

  // Drop every finished / failed / canceled row.
  router.post("/admin/import/queue/clear", (req, res) => {
    if (!requireOwner(req, res)) return;
    setNoStoreHeaders(res);
    res.json({ removed: importQueue.clearFinished() });
  });

  // ── TikTok feed authors (owner only) ────────────────────────────────────
  // Creators whose newest clip is auto-imported by lib/tiktok-feed-scheduler.

  function mapFeedAuthor(row) {
    if (!row) return null;
    return {
      id: row.id,
      handle: row.handle,
      displayName: row.displayName || "",
      avatarUrl: localAvatarOrNull(row.avatarUrl) || "",
      enabled: row.enabled === 1,
      profileUrl: `https://www.tiktok.com/@${row.handle}`,
      lastCheckedAt: row.lastCheckedAt || null,
      lastVideoId: row.lastVideoId || null,
      lastStatus: row.lastStatus || null,
      lastError: row.lastError || null,
      importedCount: Number(row.importedCount) || 0,
      createdAt: row.createdAt,
    };
  }

  router.get("/admin/tiktok/authors", (req, res) => {
    if (!requireOwner(req, res)) return;
    setNoStoreHeaders(res);
    try {
      res.json({ authors: listFeedAuthors(db).map(mapFeedAuthor) });
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  router.post("/admin/tiktok/authors", (req, res) => {
    const user = requireOwner(req, res);
    if (!user) return;
    setNoStoreHeaders(res);
    try {
      const handle = normalizeFeedHandle(req.body?.handle);
      if (!isValidFeedHandle(handle)) {
        return res.status(400).json({
          error:
            "Enter a TikTok handle (letters, numbers, underscore or dot) — e.g. @mira",
        });
      }

      const result = addFeedAuthor(db, { handle, addedBy: user.id });
      if (result.error === "already-tracked") {
        return res
          .status(409)
          .json({ error: `@${handle} is already being tracked` });
      }
      if (result.error) {
        return res.status(400).json({ error: "Could not add that handle" });
      }

      res.status(201).json({ author: mapFeedAuthor(result.author) });
    } catch {
      res.status(500).json({ error: "Could not add that handle" });
    }
  });

  router.patch("/admin/tiktok/authors/:id", (req, res) => {
    if (!requireOwner(req, res)) return;
    setNoStoreHeaders(res);
    try {
      const fields = {};
      if (req.body?.enabled !== undefined) {
        fields.enabled = req.body.enabled === true || req.body.enabled === 1;
      }
      if (req.body?.displayName !== undefined) {
        fields.displayName = req.body.displayName;
      }
      if (req.body?.avatarUrl !== undefined) {
        fields.avatarUrl = req.body.avatarUrl;
      }

      const result = updateFeedAuthor(db, req.params.id, fields);
      if (result.error === "not-found") {
        return res.status(404).json({ error: "Not found" });
      }
      res.json({ author: mapFeedAuthor(result.author) });
    } catch {
      res.status(500).json({ error: "Could not update that handle" });
    }
  });

  router.delete("/admin/tiktok/authors/:id", (req, res) => {
    if (!requireOwner(req, res)) return;
    setNoStoreHeaders(res);
    try {
      const result = removeFeedAuthor(db, req.params.id);
      if (result.error === "not-found") {
        return res.status(404).json({ error: "Not found" });
      }
      res.json({ ok: true, handle: result.handle });
    } catch {
      res.status(500).json({ error: "Could not remove that handle" });
    }
  });

  // Poll one author immediately instead of waiting for the next tick — handy
  // for verifying a handle works before leaving the page.
  router.post("/admin/tiktok/authors/:id/poll", async (req, res) => {
    if (!requireOwner(req, res)) return;
    setNoStoreHeaders(res);
    try {
      const author = listFeedAuthors(db).find(
        (row) => String(row.id) === String(req.params.id),
      );
      if (!author) return res.status(404).json({ error: "Not found" });

      const result = await pollFeedAuthorOnce({
        db,
        importQueue,
        author,
        logger: console,
      });
      const fresh = listFeedAuthors(db).find(
        (row) => String(row.id) === String(req.params.id),
      );
      res.json({ result, author: mapFeedAuthor(fresh) });
    } catch {
      res.status(500).json({ error: "Could not poll that handle" });
    }
  });

  // Mount the API router BEFORE the SPA/share `app.get` routes below, so the
  // specific API paths (`/pixies/feed`, `/pixies/search`, …) win over the
  // catch-all `GET /pixies/:videoId` share-link handler. `/pixies` is the
  // current surface; `/videos` stays as a legacy alias for links already
  // published (e.g. `og:video` meta URLs, cached app HTML).
  app.use("/pixies", router);
  app.use("/videos", router);

  // ── Pixies SPA handoffs (humans get the frontend app) ──
  app.get("/pixies", (req, res) => {
    // Crawlers / link unfurlers get a lightweight SEO shell for the feed.
    if (isLikelyCrawler(req.get("user-agent"))) {
      const protocol =
        req.headers["x-forwarded-proto"] || req.protocol || "http";
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(
        buildPixiesFeedSeoPage({ protocol, host: req.get("host") }),
      );
    }
    if (handleHumanSpaRequest(req, res, "/pixies")) return;
    sendFrontendRedirectConfigError(req, res, "/pixies");
  });

  app.get("/pixies/upload", (req, res) => {
    if (handleHumanSpaRequest(req, res, "/pixies/upload")) return;
    sendFrontendRedirectConfigError(req, res, "/pixies/upload");
  });

  app.get("/admin/pixies", (req, res) => {
    if (handleHumanSpaRequest(req, res, "/admin/pixies")) return;
    sendFrontendRedirectConfigError(req, res, "/admin/pixies");
  });

  app.get("/admin/tiktok", (req, res) => {
    if (handleHumanSpaRequest(req, res, "/admin/tiktok")) return;
    sendFrontendRedirectConfigError(req, res, "/admin/tiktok");
  });

  // ── Pixie share links: SEO preview for crawlers, SPA for humans ──
  app.get("/pixies/:videoId", (req, res) => {
    try {
      const videoId = String(req.params.videoId || "");
      const row = selectVideoById.get(videoId);
      const spaPath = row ? `/pixies/${videoId}` : "/pixies";
      if (!isLikelyCrawler(req.get("user-agent"))) {
        if (handleHumanSpaRequest(req, res, spaPath)) return;
        return sendFrontendRedirectConfigError(req, res, spaPath);
      }
      if (!row) return res.status(404).send("Video not found");
      const protocol =
        req.headers["x-forwarded-proto"] || req.protocol || "http";
      const host = req.get("host");
      const requestPath = req.originalUrl || req.path || spaPath;
      const userAgent = req.get("user-agent");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        buildVideoSeoPage({
          row,
          protocol,
          host,
          requestPath,
          // Discord gets the player-only shell so a shared pixie unfurls as
          // just the video; everyone else gets the full card.
          forDiscord: isDiscordCrawler(userAgent),
        }),
      );
    } catch {
      res.status(500).send("Server error");
    }
  });

};
