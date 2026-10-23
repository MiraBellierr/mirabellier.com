const fs = require("fs");
const path = require("path");
const { resolveDiscoveryOutputDir } = require("./discovery-output");
const { buildPostUrl: buildPostUrlShared } = require("./post-url");
const { resolveArchiveCutoffRecordedDate } = require("./sitemap");

/**
 * Generates the site's syndication feeds (Atom + JSON Feed).
 *
 * Modelled on `lib/sitemap.js`: same data sources (the `posts` and
 * `daily_questions` tables), same "regenerate on every content change and once
 * at boot" wiring, and the same output-path resolution
 * (`lib/discovery-output.js`). The feed files land next to `sitemap.xml` so the
 * frontend serves them straight off disk.
 *
 * Feeds produced:
 *   /feed.xml              - blog, Atom 1.0 (RFC 4287); auto-discovered by readers
 *   /feed.json             - blog, JSON Feed 1.1 (https://jsonfeed.org/version/1.1)
 *   /feed/questions.xml    - Question of the Day, Atom 1.0
 *   /feed/questions.json   - Question of the Day, JSON Feed 1.1
 */

const FEED_AUTHOR = "Mirabellier";

const BLOG_FEED = {
  title: "Mirabellier Blog",
  description:
    "Cute thoughts, cozy corners, and little projects. New posts from mirabellier.com.",
  homePath: "/blog",
  selfPathXml: "/feed.xml",
  selfPathJson: "/feed.json",
};

const QUESTIONS_FEED = {
  title: "Mirabellier Question of the Day",
  description:
    "One small question a day. This feed carries each day's prompt as it moves into the archive.",
  homePath: "/question-of-the-day/archive",
  selfPathXml: "/feed/questions.xml",
  selfPathJson: "/feed/questions.json",
};

// Each feed is a "latest N" view, not an archive (the sitemap already lists
// every post and every archived question for crawlers).
const MAX_ITEMS = 50;

function getWebsiteBase() {
  return (process.env.WEBSITE_BASE || "https://mirabellier.com").replace(
    /\/+$/,
    "",
  );
}

// Same slug shape as lib/sitemap.js and routes/posts.js so a feed link and a
// sitemap link for the same post are byte-identical. Delegates to the shared
// builder rather than re-deriving the slug.
function buildPostUrl(websiteBase, post) {
  return buildPostUrlShared(websiteBase, post);
}

// Walk a Tiptap document (stored as a JSON string) down to its text runs.
function extractPlainText(node) {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractPlainText).join(" ");
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (node.content) return extractPlainText(node.content);
  return "";
}

function postContentText(contentValue) {
  if (!contentValue) return "";
  try {
    const parsed = JSON.parse(contentValue);
    return extractPlainText(parsed).replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function parseTags(tagsValue) {
  if (!tagsValue) return [];
  try {
    const parsed = JSON.parse(tagsValue);
    return Array.isArray(parsed)
      ? parsed.filter((tag) => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function toIso(value, fallback) {
  const date = value ? new Date(value) : null;
  if (date && !Number.isNaN(date.getTime())) return date.toISOString();
  return fallback;
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function escapeXml(str) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  };
  return (
    String(str)
      // Drop characters XML 1.0 forbids even when escaped (control chars a
      // paste into the editor can smuggle in), then escape the markup set.
      .replace(/\p{Cc}/gu, (ch) => (ch === "\t" || ch === "\n" || ch === "\r" ? ch : ""))
      .replace(/[&<>"']/g, (char) => map[char] || char)
  );
}

/**
 * Pull the most recent posts and normalise them into feed items. Kept separate
 * from the file-writing so tests (and any future `/feed` route) can call it with
 * a stub db and assert on the shape.
 */
function collectFeedItems(db) {
  const websiteBase = getWebsiteBase();
  const nowIso = new Date().toISOString();

  let rows = [];
  try {
    rows = db
      .prepare(
        `SELECT p.id, p.title, p.content, p.shortDescription, p.thumbnail,
                p.tags, p.createdAt, p.updatedAt,
                u.username AS authorName, p.author AS legacyAuthor
         FROM posts p
         LEFT JOIN users u ON p.userId = u.id
         ORDER BY COALESCE(p.updatedAt, p.createdAt) DESC
         LIMIT ?`,
      )
      .all(MAX_ITEMS);
  } catch {
    // A missing/renamed posts table should degrade to an empty feed, never a
    // crash on boot; matches how sitemap.js swallows lookup failures.
    return [];
  }

  return rows.map((row) => {
    const published = toIso(row.createdAt, nowIso);
    const updated = toIso(row.updatedAt || row.createdAt, published);
    const contentText = postContentText(row.content);
    const summary =
      (row.shortDescription && String(row.shortDescription).trim()) ||
      (contentText ? truncate(contentText, 300) : "") ||
      row.title ||
      "Untitled";

    return {
      id: buildPostUrl(websiteBase, row),
      url: buildPostUrl(websiteBase, row),
      title: row.title || "Untitled",
      summary,
      contentText: contentText || summary,
      tags: parseTags(row.tags),
      image: row.thumbnail || null,
      author: row.authorName || row.legacyAuthor || FEED_AUTHOR,
      published,
      updated,
    };
  });
}

/**
 * Pull the most recent archived Question of the Day prompts. Uses the same
 * cutoff as the sitemap and the public archive route (shared through
 * `resolveArchiveCutoffRecordedDate`): only days *before* the active carried
 * question are public (their `/question-of-the-day/archive/<date>` route
 * resolves), while the active day itself lives on /question-of-the-day and any
 * queued later prompts must never leak.
 *
 * This previously re-derived the cutoff as "oldest unarchived row", which
 * disagrees with the route whenever a carried question has answers from an
 * earlier day — the live feed then carried zero entries while the archive
 * listed 26 public days.
 */
function collectQuestionFeedItems(db) {
  const websiteBase = getWebsiteBase();
  const today = new Date().toISOString().slice(0, 10);

  let rows = [];
  try {
    const archiveCutoffRecordedDate =
      resolveArchiveCutoffRecordedDate(db, today) || today;

    rows = db
      .prepare(
        `SELECT recordedDate, prompt, createdAt, updatedAt
         FROM daily_questions
         WHERE archivedAt IS NOT NULL OR recordedDate < ?
         ORDER BY recordedDate DESC
         LIMIT ?`,
      )
      .all(archiveCutoffRecordedDate, MAX_ITEMS);
  } catch {
    return [];
  }

  return rows.map((row) => {
    const prompt = String(row.prompt || "").trim() || "Question of the Day";
    // The bulk-imported createdAt/updatedAt are not meaningful publish dates;
    // the recordedDate is. Anchor both timestamps to noon UTC on that day so
    // readers order the entries the way the archive does.
    const published = `${row.recordedDate}T12:00:00.000Z`;
    const updated = toIso(
      row.updatedAt && row.updatedAt > published ? row.updatedAt : null,
      published,
    );
    const url = `${websiteBase}/question-of-the-day/archive/${row.recordedDate}`;

    return {
      id: url,
      url,
      title: truncate(prompt, 120),
      summary: prompt,
      contentText: prompt,
      tags: [],
      image: null,
      author: FEED_AUTHOR,
      published,
      updated,
    };
  });
}

function buildAtomFeed(items, meta) {
  const websiteBase = getWebsiteBase();
  const selfUrl = `${websiteBase}${meta.selfPathXml}`;
  const homeUrl = `${websiteBase}${meta.homePath}`;
  const updated = items.length ? items[0].updated : new Date().toISOString();

  const entries = items
    .map((item) => {
      const categories = item.tags
        .map((tag) => `\n    <category term="${escapeXml(tag)}" />`)
        .join("");
      return `
  <entry>
    <title>${escapeXml(item.title)}</title>
    <link href="${escapeXml(item.url)}" />
    <id>${escapeXml(item.id)}</id>
    <published>${item.published}</published>
    <updated>${item.updated}</updated>
    <author><name>${escapeXml(item.author)}</name></author>
    <summary>${escapeXml(item.summary)}</summary>${categories}
  </entry>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(meta.title)}</title>
  <subtitle>${escapeXml(meta.description)}</subtitle>
  <link href="${escapeXml(selfUrl)}" rel="self" type="application/atom+xml" />
  <link href="${escapeXml(homeUrl)}" />
  <id>${escapeXml(homeUrl)}</id>
  <updated>${updated}</updated>
  <author><name>${escapeXml(FEED_AUTHOR)}</name></author>${entries}
</feed>
`;
}

function buildJsonFeed(items, meta) {
  const websiteBase = getWebsiteBase();

  return `${JSON.stringify(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: meta.title,
      description: meta.description,
      home_page_url: `${websiteBase}${meta.homePath}`,
      feed_url: `${websiteBase}${meta.selfPathJson}`,
      authors: [{ name: FEED_AUTHOR, url: `${websiteBase}/` }],
      language: "en",
      items: items.map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title,
        summary: item.summary,
        content_text: item.contentText,
        date_published: item.published,
        date_modified: item.updated,
        authors: [{ name: item.author }],
        ...(item.tags.length ? { tags: item.tags } : {}),
        ...(item.image ? { image: item.image } : {}),
      })),
    },
    null,
    2,
  )}\n`;
}

function resolveOutputDir(publicDir) {
  return resolveDiscoveryOutputDir(publicDir);
}

function writeFeedPair(outputDir, relXmlPath, relJsonPath, items, meta) {
  const xmlTarget = path.join(outputDir, relXmlPath);
  const jsonTarget = path.join(outputDir, relJsonPath);
  fs.mkdirSync(path.dirname(xmlTarget), { recursive: true });
  fs.writeFileSync(xmlTarget, buildAtomFeed(items, meta), "utf-8");
  fs.writeFileSync(jsonTarget, buildJsonFeed(items, meta), "utf-8");
}

/**
 * Write every feed file. Returns true on success, false on any failure (same
 * contract as generateSitemap: callers treat feed generation as best-effort
 * and never let it break a request or boot).
 */
function generateFeeds(db, publicDir = null) {
  try {
    const outputDir = resolveOutputDir(publicDir);

    writeFeedPair(
      outputDir,
      "feed.xml",
      "feed.json",
      collectFeedItems(db),
      BLOG_FEED,
    );
    writeFeedPair(
      outputDir,
      path.join("feed", "questions.xml"),
      path.join("feed", "questions.json"),
      collectQuestionFeedItems(db),
      QUESTIONS_FEED,
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  generateFeeds,
  collectFeedItems,
  collectQuestionFeedItems,
  buildAtomFeed,
  buildJsonFeed,
  BLOG_FEED,
  QUESTIONS_FEED,
  MAX_ITEMS,
};
