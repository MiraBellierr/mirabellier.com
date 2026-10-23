const fs = require("fs");
const path = require("path");
const { getShrineSitemapRoutes } = require("./shrines");
const { resolveDiscoveryOutputDir } = require("./discovery-output");
const { buildPostUrl } = require("./post-url");
const { getExternalSyncTime } = require("./external-sync-state");

/**
 * Normalise a thumbnail value into an absolute URL for the image sitemap.
 * Values arrive as an absolute URL, a `/images/...` path, or a bare filename.
 */
function resolveImageUrl(thumbnail, websiteBase) {
  const value = String(thumbnail || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${websiteBase}${value}`;
  return `${websiteBase}/images/${value}`;
}

/**
 * The last day that is public in the question archive.
 *
 * Mirrors `getArchiveCutoffRecordedDate` in `routes/question-of-the-day.js`
 * exactly: the *currently carried* question, not literally today. The carried
 * question is the oldest unarchived day that either has no answers yet or was
 * locked today — a day whose answers exist and was locked on an earlier day has
 * been superseded, so it and everything before it are public. Using "today"
 * instead published URLs whose route 404s and leaked queued prompts (the live
 * sitemap once carried 94 such soft-404s).
 *
 * Returns null when there is no carried question at all, in which case the
 * caller falls back to today.
 */
function resolveArchiveCutoffRecordedDate(db, currentRecordedDate) {
  const carried = db
    .prepare(
      `SELECT q.recordedDate
       FROM daily_questions q
       LEFT JOIN daily_question_answers a ON a.recordedDate = q.recordedDate
       WHERE q.recordedDate <= ? AND q.archivedAt IS NULL
       GROUP BY q.recordedDate, q.prompt, q.lockedAt, q.archivedAt, q.createdAt, q.updatedAt
       HAVING COUNT(a.id) = 0 OR substr(q.lockedAt, 1, 10) = ?
       ORDER BY q.recordedDate ASC
       LIMIT 1`,
    )
    .get(currentRecordedDate, currentRecordedDate);

  return carried ? carried.recordedDate : null;
}

/**
 * The date a URL's content last actually changed, shaped for `<lastmod>`.
 *
 * The value has to be a real per-page date. A `lastmod` that simply repeats the
 * build date on every deploy is the signal Google uses to decide the field is
 * untrustworthy and ignore it entirely, and a bulk-import `createdAt` (every
 * archived question day shares one) is a date on which the page demonstrably
 * did not change.
 */
function toLastmodDate(value) {
  if (!value) return null;

  const normalized = String(value).trim();
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().split("T")[0];
}

/**
 * Static routes, with the database row that dates each one.
 *
 * `lastmodSource` names the query whose `updatedAt` reflects the page's last
 * real change:
 *   - `/now`, `/links`, `/changelog`, and `/stats` are single-row pages the
 *     owner edits from the admin UI;
 *   - `/anime` is dated by its MyAnimeList snapshot refresh and `/quotes` by
 *     its daily quote snapshot;
 *   - `/pixies` is dated by the newest uploaded video.
 *
 * Routes with no `lastmodSource` (`/`, `/about`, `/uses`, `/projects`,
 * `/fanart`, `/twitch`, `/question-of-the-day`, `/blog`, the archive index,
 * `/privacy`, `/terms`, `/shrine`, the arena explainer) are static files whose
 * content is tied to a deploy, not to a row. They deliberately omit `lastmod`:
 * Google treats an absent `lastmod` as "no information", which is honest,
 * whereas a build date that moves on every deploy trains it to ignore the
 * field for the whole file.
 */
const STATIC_ROUTES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/about", priority: "0.8", changefreq: "monthly" },
  { path: "/now", priority: "0.6", changefreq: "weekly", lastmodSource: "site_now" },
  {
    path: "/changelog",
    priority: "0.5",
    changefreq: "weekly",
    lastmodSource: "site_changelog",
  },
  { path: "/uses", priority: "0.5", changefreq: "monthly" },
  { path: "/links", priority: "0.5", changefreq: "monthly", lastmodSource: "site_links" },
  { path: "/stats", priority: "0.5", changefreq: "daily", lastmodSource: "site_stats" },
  { path: "/projects", priority: "0.8", changefreq: "monthly" },
  { path: "/anime", priority: "0.8", changefreq: "daily", lastmodSource: "anime" },
  // No `lastmodSource`: the sync writes JSON, not a SQLite row, so the date is
  // resolved by `resolveHsrLastmod()` below instead of `LASTMOD_QUERIES`.
  { path: "/hsr", priority: "0.8", changefreq: "daily" },
  { path: "/fanart", priority: "0.7", changefreq: "weekly" },
  { path: "/twitch", priority: "0.7", changefreq: "hourly" },
  { path: "/pixies", priority: "0.8", changefreq: "daily", lastmodSource: "pixies" },
  { path: "/question-of-the-day", priority: "0.8", changefreq: "daily", lastmodSource: "qotd_latest" },
  {
    path: "/question-of-the-day/archive",
    priority: "0.7",
    changefreq: "daily",
    lastmodSource: "qotd_latest",
  },
  { path: "/quotes", priority: "0.8", changefreq: "daily", lastmodSource: "quotes" },
  { path: "/blog", priority: "0.9", changefreq: "daily", lastmodSource: "blog_index" },
  { path: "/privacy", priority: "0.4", changefreq: "yearly" },
  { path: "/terms", priority: "0.4", changefreq: "yearly" },
  { path: "/arena/skill-tree", priority: "0.5", changefreq: "monthly" },
];

/**
 * One query per dynamic page, each returning a single ISO timestamp (or
 * nothing). `args` supplies bind parameters for the queries that take them —
 * better-sqlite3 throws on unbound extras, so the parameters have to be listed
 * per query rather than passed to all of them. Every lookup is wrapped by the
 * caller: a missing table means the route simply has no `lastmod`, never a
 * failed sitemap.
 */
const LASTMOD_QUERIES = {
  site_now: {
    sql: "SELECT COALESCE(updatedAt, createdAt) AS updatedAt FROM site_now LIMIT 1",
  },
  site_links: {
    sql: "SELECT COALESCE(updatedAt, createdAt) AS updatedAt FROM site_links LIMIT 1",
  },
  site_changelog: {
    sql: "SELECT COALESCE(MAX(updatedAt), MAX(entryDate)) AS updatedAt FROM site_changelog",
  },
  site_stats: {
    sql: `SELECT MAX(at) AS updatedAt FROM (
       SELECT MAX(createdAt) AS at FROM posts
       UNION ALL SELECT MAX(createdAt) FROM guestbook_entries
       UNION ALL SELECT MAX(createdAt) FROM daily_question_answers
     )`,
  },
  anime: {
    sql: `SELECT MAX(fetchedAt) AS updatedAt FROM myanimelist_anime_snapshots`,
  },
  quotes: {
    sql: `SELECT MAX(COALESCE(updatedAt, fetchedAt, createdAt)) AS updatedAt FROM quote_snapshots`,
  },
  pixies: {
    sql: `SELECT MAX(createdAt) AS updatedAt FROM user_videos`,
  },
  // The QOTD page and its archive index change when a new day becomes public,
  // so they are dated by the newest public day (resolved through the same
  // cutoff the archive route uses), not by `updatedAt` — which the bulk import
  // shares across every row.
  qotd_latest: {
    sql: `SELECT MAX(recordedDate) AS updatedAt FROM daily_questions
          WHERE archivedAt IS NOT NULL OR recordedDate < ?`,
    args: (archiveCutoffRecordedDate) => [archiveCutoffRecordedDate],
  },
  blog_index: {
    sql: `SELECT MAX(COALESCE(updatedAt, createdAt)) AS updatedAt FROM posts`,
  },
};

function resolveLastmodFrom(db, key, archiveCutoffRecordedDate) {
  const query = LASTMOD_QUERIES[key];
  if (!query) return null;

  try {
    const args = query.args ? query.args(archiveCutoffRecordedDate) : [];
    const row = db.prepare(query.sql).get(...args);
    return toLastmodDate(row && row.updatedAt);
  } catch {
    // Missing table/column: the page just has no tracked change date.
    return null;
  }
}

/**
 * Newest timestamp from the Honkai: Star Rail sync. Its data lives in JSON
 * files (`data/hsr/`) rather than SQLite rows, so the sync stamps the moment it
 * wrote them into `external_sync_state` (see lib/hsr-sync-scheduler.js). A DB
 * that predates the table simply yields no `lastmod`, never a failure.
 */
function resolveHsrLastmod(db) {
  return toLastmodDate(getExternalSyncTime(db, "hsr"));
}

/**
 * Generates sitemap.xml with all content
 * Call this after creating or updating blog posts
 *
 * Output path resolution lives in `lib/discovery-output.js`: production now
 * serves the frontend release tree (`FRONTEND_DEPLOY_PATH`, i.e.
 * `/var/www/mirabellier.com/current`) instead of the retired
 * `/var/www/mirabellier/dist`, and development writes to the frontend
 * `public/` directory.
 */
function collectSitemapEntries(db) {
  const WEBSITE_BASE = (
    process.env.WEBSITE_BASE || "https://mirabellier.com"
  ).replace(/\/+$/, "");

  const currentRecordedDate = new Date().toISOString().slice(0, 10);
  // Resolved once: the cutoff drives both the QOTD page's `lastmod` and the set
  // of archive URLs, and the two must agree or the sitemap lists days the route
  // will 404.
  let archiveCutoffRecordedDate = currentRecordedDate;
  try {
    archiveCutoffRecordedDate =
      resolveArchiveCutoffRecordedDate(db, currentRecordedDate) ||
      currentRecordedDate;
  } catch {
    // Table missing: fall back to today, matching the old behaviour.
  }

  const entries = [];

  for (const route of STATIC_ROUTES) {
    const lastmod =
      route.path === "/hsr"
        ? resolveHsrLastmod(db)
        : route.lastmodSource
          ? resolveLastmodFrom(db, route.lastmodSource, archiveCutoffRecordedDate)
          : null;

    entries.push({
      url: `${WEBSITE_BASE}${route.path}`,
      ...(lastmod ? { lastmod } : {}),
      priority: route.priority,
      changefreq: route.changefreq,
    });
  }

  // Shrine pages come from two sources and both are real:
  //   - `shrine_pages` in the database (owner-created rooms: kana, rimuru, ...)
  //   - the built-in rooms hardcoded in lib/shrines.js (kanna, rossina), which
  //     have dedicated components in the SPA (`src/pages/Kanna.tsx`, ...)
  // Merge them, preferring the database row when a path exists in both so an
  // owner edit wins over the built-in defaults.
  try {
    const shrineRows = db
      .prepare(
        "SELECT path, title, image, priority, changefreq, updatedAt, createdAt FROM shrine_pages ORDER BY path",
      )
      .all();

    const byPath = new Map();

    for (const route of getShrineSitemapRoutes()) {
      // Built-in rooms are shipped with the frontend bundle, so their content
      // changes with a deploy; there is no per-room row to date them and a
      // build date would be the untrustworthy kind, so they omit `lastmod`.
      byPath.set(route.path, {
        url: `${WEBSITE_BASE}${route.path}`,
        priority: route.priority || "0.7",
        changefreq: route.changefreq || "monthly",
      });
    }

    for (const shrine of shrineRows || []) {
      const lastmod = toLastmodDate(shrine.updatedAt || shrine.createdAt);
      const imageUrl = resolveImageUrl(shrine.image, WEBSITE_BASE);

      byPath.set(shrine.path, {
        url: `${WEBSITE_BASE}${shrine.path}`,
        ...(lastmod ? { lastmod } : {}),
        priority: shrine.priority || "0.7",
        changefreq: shrine.changefreq || "monthly",
        ...(imageUrl
          ? { images: [{ url: imageUrl, title: shrine.title || "Shrine" }] }
          : {}),
      });
    }

    entries.push(...byPath.values());
  } catch {
    // Table missing/renamed: keep the hardcoded built-in shrines.
    for (const route of getShrineSitemapRoutes()) {
      entries.push({
        url: `${WEBSITE_BASE}${route.path}`,
        priority: route.priority || "0.7",
        changefreq: route.changefreq || "monthly",
      });
    }
  }

  // Fetch and add blog posts
  try {
    const posts = db
      .prepare(
        "SELECT id, title, thumbnail, createdAt, updatedAt FROM posts ORDER BY COALESCE(updatedAt, createdAt) DESC",
      )
      .all();

    if (posts && Array.isArray(posts)) {
      posts.forEach((post) => {
        const postUrl = buildPostUrl(WEBSITE_BASE, post);
        const lastmod = toLastmodDate(post.updatedAt || post.createdAt);
        const imageUrl = resolveImageUrl(post.thumbnail, WEBSITE_BASE);

        entries.push({
          url: postUrl,
          ...(lastmod ? { lastmod } : {}),
          priority: "0.7",
          changefreq: "monthly",
          ...(imageUrl
            ? { images: [{ url: imageUrl, title: post.title || "Untitled" }] }
            : {}),
        });
      });
    }
  } catch {
    // Ignore post lookup failures and keep static sitemap entries.
  }

  try {
    const archivedQuestions = db
      .prepare(
        `SELECT recordedDate, createdAt, updatedAt
         FROM daily_questions
         WHERE archivedAt IS NOT NULL OR recordedDate < ?
         ORDER BY recordedDate DESC`,
      )
      .all(archiveCutoffRecordedDate);

    if (archivedQuestions && Array.isArray(archivedQuestions)) {
      archivedQuestions.forEach((question) => {
        // `recordedDate` is the day the question ran, which is the day the page
        // is *about* — the honest lastmod for an archive page. The alternative
        // (`updatedAt || createdAt`) is a bulk-import timestamp shared by every
        // row: one date for all 165 days, four months before most of them
        // existed. A real owner edit (updatedAt > recordedDate) still wins.
        const recordedDate = toLastmodDate(question.recordedDate);
        const editedAt = toLastmodDate(question.updatedAt);
        const lastmod =
          editedAt && recordedDate && editedAt > recordedDate
            ? editedAt
            : recordedDate;

        entries.push({
          url: `${WEBSITE_BASE}/question-of-the-day/archive/${question.recordedDate}`,
          ...(lastmod ? { lastmod } : {}),
          priority: "0.6",
          changefreq: "monthly",
        });
      });
    }
  } catch {
    // Ignore archive lookup failures and keep other sitemap entries.
  }

  return entries;
}

/**
 * Render a `<lastmod>` element for an entry, or "" when the entry has no
 * trustworthy date. See `STATIC_ROUTES` for why absent is preferred to a
 * rebuild timestamp.
 */
function renderLastmod(entry) {
  return entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : "";
}

function generateSitemap(db, publicDir = null) {
  try {
    const outputDir = resolveDiscoveryOutputDir(publicDir);
    const entries = collectSitemapEntries(db);

    // Generate XML
    const urls = entries
      .map(
        (entry) => `
  <url>
    <loc>${escapeXml(entry.url)}</loc>${renderLastmod(entry)}
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>${renderImages(entry.images)}
  </url>`,
      )
      .join("");

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;

    // Write to file
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(path.join(outputDir, "sitemap.xml"), sitemap, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Render Google's image-sitemap extension entries for a URL. Kept separate so
 * both the post and shrine branches produce identical markup.
 */
function renderImages(images) {
  if (!Array.isArray(images) || images.length === 0) return "";

  return images
    .filter((image) => image && image.url)
    .map(
      (image) => `
    <image:image>
      <image:loc>${escapeXml(image.url)}</image:loc>${
        image.title
          ? `
      <image:title>${escapeXml(image.title)}</image:title>`
          : ""
      }
    </image:image>`,
    )
    .join("");
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  };
  return str.replace(/[&<>"']/g, (char) => map[char] || char);
}

module.exports = {
  generateSitemap,
  collectSitemapEntries,
  resolveArchiveCutoffRecordedDate,
  resolveHsrLastmod,
  toLastmodDate,
  STATIC_ROUTES,
};
