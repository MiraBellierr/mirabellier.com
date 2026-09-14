#!/usr/bin/env node

/**
 * Generates sitemap.xml for the Mirabellier.com website from the public API.
 *
 * Runs in CI before `npm run build` so every deploy ships a sitemap that
 * matches the routes and content that release actually serves. The static
 * route list mirrors `mirabellier-backend/lib/sitemap.js`; blog posts, shrine
 * pages, and archived question days are fetched from the API.
 *
 * Usage:
 *   node generate-sitemap.cjs
 *   VITE_API_BASE=https://api.mirabellier.com/v1 node generate-sitemap.cjs
 *
 * `SITEMAP_LOCAL_BACKEND=1` opts into reading the sibling
 * `mirabellier-backend/` SQLite database instead of the API (development
 * convenience only; CI always uses the API).
 *
 * On a fetch failure the already-committed sitemap is preserved so a flaky
 * API can never shrink the live sitemap.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const API_BASE = process.env.VITE_API_BASE || "https://api.mirabellier.com/v1";
const WEBSITE_BASE = (
  process.env.WEBSITE_BASE || "https://mirabellier.com"
).replace(/\/+$/, "");
const OUTPUT_PATH = path.join(__dirname, "public", "sitemap.xml");
const FEED_OUTPUT_DIR = path.join(__dirname, "public");
const BACKEND_DIR = path.join(__dirname, "mirabellier-backend");
const USE_LOCAL_BACKEND = process.env.SITEMAP_LOCAL_BACKEND === "1";

const STATIC_ROUTES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/about", priority: "0.8", changefreq: "monthly" },
  { path: "/now", priority: "0.6", changefreq: "weekly" },
  { path: "/changelog", priority: "0.5", changefreq: "weekly" },
  { path: "/uses", priority: "0.5", changefreq: "monthly" },
  { path: "/links", priority: "0.5", changefreq: "monthly" },
  { path: "/stats", priority: "0.5", changefreq: "daily" },
  { path: "/projects", priority: "0.8", changefreq: "monthly" },
  { path: "/anime", priority: "0.8", changefreq: "daily" },
  { path: "/fanart", priority: "0.7", changefreq: "weekly" },
  { path: "/twitch", priority: "0.7", changefreq: "hourly" },
  { path: "/pixies", priority: "0.8", changefreq: "daily" },
  { path: "/shrine", priority: "0.8", changefreq: "monthly" },
  { path: "/question-of-the-day", priority: "0.8", changefreq: "daily" },
  {
    path: "/question-of-the-day/archive",
    priority: "0.7",
    changefreq: "daily",
  },
  { path: "/quotes", priority: "0.8", changefreq: "daily" },
  { path: "/blog", priority: "0.9", changefreq: "daily" },
  { path: "/privacy", priority: "0.4", changefreq: "yearly" },
  { path: "/terms", priority: "0.4", changefreq: "yearly" },
  // Login-gated Arena subpages (inventory, market, shop, TCG, ...) are left out
  // on purpose; only the public hub and the skill-tree explainer are indexable.
  { path: "/arena", priority: "0.6", changefreq: "weekly" },
  { path: "/arena/skill-tree", priority: "0.5", changefreq: "monthly" },
];

// Shrine pages are backed by the database and served through the API, but the
// built-in rooms double as the offline fallback when the fetch fails.
const FALLBACK_SHRINE_ROUTES = [
  { path: "/shrine/kanna", priority: "0.7", changefreq: "monthly" },
  { path: "/shrine/rossina", priority: "0.7", changefreq: "monthly" },
];

const BUILD_USER_AGENT = "Mirabellier-Sitemap/1.0 (+https://mirabellier.com)";

// Cloudflare intermittently answers the API's bot challenge (HTTP 403, "Just a
// moment...") to CI runner IPs — it is not consistent run to run, and it has hit
// both this script and the Vite plugin. A couple of short retries get through
// in practice; a permanent failure falls back to the committed file, which is
// why the caller treats this as best-effort.
const FETCH_ATTEMPTS = 3;
const FETCH_RETRY_DELAY_MS = 1500;

function requestOnce(endpoint, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE);
    const protocol = url.protocol === "https:" ? https : http;

    const options = {
      headers: {
        Accept: "application/json",
        "User-Agent": BUILD_USER_AGENT,
      },
    };

    const req = protocol.request(url, options, (res) => {
      if (
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        res.headers.location &&
        redirectsLeft > 0
      ) {
        try {
          const nextUrl = new URL(res.headers.location, url);
          res.resume();
          resolve(
            requestOnce(nextUrl.pathname + nextUrl.search, redirectsLeft - 1),
          );
          return;
        } catch (error) {
          reject(new Error(`Redirect error from ${url.href}: ${error.message}`));
          return;
        }
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        let preview = "";
        res.on("data", (chunk) => {
          preview += chunk.toString();
        });
        res.on("end", () => {
          reject(
            new Error(
              `HTTP ${res.statusCode} from ${url.href}. Preview: ${preview.slice(0, 120)}`,
            ),
          );
        });
        return;
      }

      const contentType = (res.headers["content-type"] || "").toLowerCase();
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          if (!contentType.includes("application/json")) {
            throw new Error(`Unexpected content-type '${contentType}'`);
          }
          resolve(JSON.parse(data));
        } catch (error) {
          reject(
            new Error(
              `Failed to parse JSON from ${endpoint}: ${error.message}. Preview: ${String(data || "").slice(0, 120)}`,
            ),
          );
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error(`Request timed out for ${url.href}`));
    });
    req.end();
  });
}

async function fetchFromAPI(endpoint) {
  let lastError;

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await requestOnce(endpoint);
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS) {
        console.warn(
          `  Attempt ${attempt}/${FETCH_ATTEMPTS} for ${endpoint} failed (${error.message}); retrying...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, FETCH_RETRY_DELAY_MS * attempt),
        );
      }
    }
  }

  throw lastError;
}

function generateSiteMap(entries) {
  const urls = entries
    .map(
      (entry) => `
  <url>
    <loc>${escapeXml(entry.url)}</loc>
    <lastmod>${entry.lastmod || new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>${entry.changefreq || "weekly"}</changefreq>
    <priority>${entry.priority || "0.5"}</priority>${renderImages(entry.images)}
  </url>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;
}

// Google's image-sitemap extension. Posts and shrine pages supply an `images`
// array; everything else renders without the block.
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

function resolveImageUrl(thumbnail) {
  const value = String(thumbnail || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${WEBSITE_BASE}${value}`;
  return `${API_BASE}/images/${value}`;
}

function escapeXml(str) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  };
  return str.replace(/[&<>"']/g, (char) => map[char]);
}

function getPostUrl(post) {
  if (post.slug) {
    return `${WEBSITE_BASE}/blog/${post.slug}`;
  }

  if (post.title) {
    // Must match `slugify()` in mirabellier-backend/routes/posts.js and
    // `getPostUrl`/`slugifyTitle` in vite.config.ts byte for byte, otherwise
    // the sitemap and the prerendered canonical disagree on the URL.
    const slug = String(post.title)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);
    return `${WEBSITE_BASE}/blog/${slug ? `${slug}-${post.id}` : post.id}`;
  }

  return `${WEBSITE_BASE}/blog/${post.id}`;
}

function getPostLastmod(post) {
  const source = post.updatedAt || post.createdAt;
  return formatSitemapDate(source);
}

function getQuestionArchiveUrl(entry) {
  return `${WEBSITE_BASE}/question-of-the-day/archive/${entry.recordedDate}`;
}

function getQuestionArchiveLastmod(entry) {
  const source = entry.updatedAt || entry.createdAt;
  return formatSitemapDate(source);
}

function formatSitemapDate(value) {
  if (!value) return undefined;

  const normalized = String(value).trim();
  const isoDate = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  }

  const dayFirstDate = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dayFirstDate) {
    const [, day, month, year] = dayFirstDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString().split("T")[0];
}

function readExistingBlogEntries() {
  return readExistingEntries(
    (loc) => loc.startsWith(`${WEBSITE_BASE}/blog/`),
    "0.7",
  );
}

function readExistingQuestionArchiveEntries() {
  return readExistingEntries(
    (loc) =>
      loc.startsWith(`${WEBSITE_BASE}/question-of-the-day/archive/`) &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        loc.replace(`${WEBSITE_BASE}/question-of-the-day/archive/`, "").trim(),
      ),
    "0.6",
  );
}

/**
 * Parse the committed sitemap back into entries when a fetch fails. Image
 * blocks are carried through, otherwise a single flaky API call would strip
 * every <image:image> from the file it is supposed to preserve.
 */
function readExistingEntries(matchesLoc, fallbackPriority) {
  if (!fs.existsSync(OUTPUT_PATH)) {
    return [];
  }

  const xml = fs.readFileSync(OUTPUT_PATH, "utf-8");
  const matches = xml.matchAll(/<url>([\s\S]*?)<\/url>/g);
  const entries = [];

  for (const match of matches) {
    const block = match[1];
    const loc = block.match(/<loc>(.*?)<\/loc>/)?.[1];

    if (!loc || !matchesLoc(loc)) {
      continue;
    }

    const images = [...block.matchAll(/<image:image>([\s\S]*?)<\/image:image>/g)]
      .map((imageMatch) => ({
        url: imageMatch[1].match(/<image:loc>(.*?)<\/image:loc>/)?.[1],
        title: imageMatch[1].match(/<image:title>(.*?)<\/image:title>/)?.[1],
      }))
      .filter((image) => image.url)
      .map((image) => unescapeXml(image));

    entries.push({
      url: loc,
      lastmod: block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1],
      changefreq: block.match(/<changefreq>(.*?)<\/changefreq>/)?.[1] || "monthly",
      priority: block.match(/<priority>(.*?)<\/priority>/)?.[1] || fallbackPriority,
      ...(images.length ? { images } : {}),
    });
  }

  return entries;
}

function unescapeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function getShrineUrl(entry) {
  if (entry.path) {
    return `${WEBSITE_BASE}${entry.path}`;
  }
  return `${WEBSITE_BASE}/shrine/${entry.slug}`;
}

function readExistingShrineEntries() {
  // Shrines have a reliable built-in fallback (`FALLBACK_SHRINE_ROUTES`) plus
  // whatever the API returned, so a fetch failure needs no preserved entries.
  // Kept as a named function because the shared parser already preserves the
  // committed image blocks if this ever needs to change.
  return readExistingEntries(
    (loc) => loc.startsWith(`${WEBSITE_BASE}/shrine/`),
    "0.7",
  );
}

function loadEntriesFromLocalBackend() {
  const backendSitemapPath = path.join(BACKEND_DIR, "lib", "sitemap.js");
  const backendDbPath = path.join(BACKEND_DIR, "lib", "db.js");
  const backendDotenvPath = path.join(BACKEND_DIR, "node_modules", "dotenv");
  const backendEnvPath = path.join(BACKEND_DIR, ".env");

  if (!fs.existsSync(backendSitemapPath) || !fs.existsSync(backendDbPath)) {
    return null;
  }

  try {
    process.env.WEBSITE_BASE = WEBSITE_BASE;

    if (fs.existsSync(backendDotenvPath)) {
      require(backendDotenvPath).config({ path: backendEnvPath });
    }

    const { db } = require(backendDbPath);
    const { collectSitemapEntries } = require(backendSitemapPath);
    const entries = collectSitemapEntries(db);

    return Array.isArray(entries) ? entries : null;
  } catch (error) {
    console.warn(
      `  Could not read sitemap entries from local backend: ${error.message}`,
    );
    return null;
  }
}

const FEED_AUTHOR = "Mirabellier";
const FEED_MAX_ITEMS = 50;

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

function extractPlainText(node) {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractPlainText).join(" ");
  if (typeof node === "string") return node;
  if (typeof node !== "object") return "";
  if (node.type === "text") return node.text || "";
  if (node.content) return extractPlainText(node.content);
  return "";
}

function postContentText(contentValue) {
  if (!contentValue) return "";

  let parsed = contentValue;
  if (typeof contentValue === "string") {
    try {
      parsed = JSON.parse(contentValue);
    } catch {
      return "";
    }
  }

  if (!parsed || typeof parsed !== "object") return "";
  return extractPlainText(parsed).replace(/\s+/g, " ").trim();
}

function parseTags(tagsValue) {
  if (!tagsValue) return [];
  try {
    const parsed =
      typeof tagsValue === "string" ? JSON.parse(tagsValue) : tagsValue;
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

function buildPostFeedItems(posts) {
  const nowIso = new Date().toISOString();

  return posts.slice(0, FEED_MAX_ITEMS).map((post) => {
    const url = getPostUrl(post);
    const published = toIso(post.createdAt, nowIso);
    const updated = toIso(post.updatedAt || post.createdAt, published);
    const contentText = postContentText(post.content);
    const summary =
      (post.shortDescription && String(post.shortDescription).trim()) ||
      (contentText ? truncate(contentText, 300) : "") ||
      post.title ||
      "Untitled";

    return {
      id: url,
      url,
      title: post.title || "Untitled",
      summary,
      contentText: contentText || summary,
      tags: parseTags(post.tags),
      image: post.thumbnail || null,
      author: post.author || FEED_AUTHOR,
      published,
      updated,
    };
  });
}

function buildQuestionFeedItems(entries) {
  return entries.slice(0, FEED_MAX_ITEMS).map((entry) => {
    const prompt = String(entry.prompt || "").trim() || "Question of the Day";
    // Anchor both timestamps to noon UTC on the recorded date so readers order
    // the entries the way the archive does.
    const published = `${entry.recordedDate}T12:00:00.000Z`;
    const updated = toIso(
      entry.updatedAt && entry.updatedAt > published ? entry.updatedAt : null,
      published,
    );
    const url = getQuestionArchiveUrl(entry);

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
  const selfUrl = `${WEBSITE_BASE}${meta.selfPathXml}`;
  const homeUrl = `${WEBSITE_BASE}${meta.homePath}`;
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
  return `${JSON.stringify(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: meta.title,
      description: meta.description,
      home_page_url: `${WEBSITE_BASE}${meta.homePath}`,
      feed_url: `${WEBSITE_BASE}${meta.selfPathJson}`,
      authors: [{ name: FEED_AUTHOR, url: `${WEBSITE_BASE}/` }],
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

function writeFeedPair(relXmlPath, relJsonPath, items, meta) {
  const xmlTarget = path.join(FEED_OUTPUT_DIR, relXmlPath);
  const jsonTarget = path.join(FEED_OUTPUT_DIR, relJsonPath);
  fs.mkdirSync(path.dirname(xmlTarget), { recursive: true });
  fs.writeFileSync(xmlTarget, buildAtomFeed(items, meta), "utf-8");
  fs.writeFileSync(jsonTarget, buildJsonFeed(items, meta), "utf-8");
}

// `generateFeeds` is exported for tests; the CLI writes feeds directly in
// `main()` so a failed posts fetch cannot clobber the committed blog feed.
function generateFeeds(posts, archiveEntries) {
  const blogItems = buildPostFeedItems(posts);
  const questionItems = buildQuestionFeedItems(archiveEntries);

  writeFeedPair("feed.xml", "feed.json", blogItems, BLOG_FEED);
  writeFeedPair(
    path.join("feed", "questions.xml"),
    path.join("feed", "questions.json"),
    questionItems,
    QUESTIONS_FEED,
  );

  return { blogItems: blogItems.length, questionItems: questionItems.length };
}

async function main() {
  try {
    console.log("Generating sitemap.xml and feeds...");
    console.log(`  API Base: ${API_BASE}`);
    console.log(`  Website: ${WEBSITE_BASE}`);

    const staticEntries = STATIC_ROUTES.map((route) => ({
      url: `${WEBSITE_BASE}${route.path}`,
      priority: route.priority,
      changefreq: route.changefreq,
    }));

    const entries = [];
    let posts = null;
    let archiveEntries = null;

    if (USE_LOCAL_BACKEND) {
      const localBackendEntries = loadEntriesFromLocalBackend();
      if (localBackendEntries?.length) {
        entries.push(...localBackendEntries);
        console.log(
          `Loaded ${localBackendEntries.length} sitemap entries from local backend data.`,
        );
      } else {
        console.warn(
          "Local backend sitemap data unavailable; falling back to API fetches.",
        );
      }
    }

    if (!entries.length) {
      entries.push(...staticEntries);
    }

    try {
      console.log("Fetching blog posts...");
      posts = await fetchFromAPI("/posts");
      if (Array.isArray(posts)) {
        posts.forEach((post) => {
          const imageUrl = resolveImageUrl(post.thumbnail);
          entries.push({
            url: getPostUrl(post),
            lastmod: getPostLastmod(post),
            priority: "0.7",
            changefreq: "monthly",
            ...(imageUrl
              ? { images: [{ url: imageUrl, title: post.title || "Untitled" }] }
              : {}),
          });
        });
        console.log(`  Added ${posts.length} blog posts`);
      }
    } catch (error) {
      posts = null;
      const existingBlogEntries = readExistingBlogEntries();
      existingBlogEntries.forEach((entry) => entries.push(entry));
      console.warn(
        `  Could not fetch blog posts: ${error.message}. Continuing with ${existingBlogEntries.length} preserved blog URLs...`,
      );
    }

    try {
      console.log("Fetching shrine pages...");
      const shrines = await fetchFromAPI("/shrines/pages");

      // Two independent sources, both real:
      //   - API rooms from the `shrine_pages` table (kana, rimuru, ...)
      //   - the built-in rooms (kanna, rossina) that have dedicated SPA pages
      //     and are served by the backend's hardcoded list.
      // Merge by URL so an API room sharing a built-in path wins.
      const shrineEntries = new Map();

      for (const route of FALLBACK_SHRINE_ROUTES) {
        shrineEntries.set(`${WEBSITE_BASE}${route.path}`, {
          url: `${WEBSITE_BASE}${route.path}`,
          priority: route.priority,
          changefreq: route.changefreq,
        });
      }

      if (Array.isArray(shrines)) {
        shrines.forEach((shrine) => {
          if (!shrine?.path && !shrine?.slug) {
            return;
          }

          const url = getShrineUrl(shrine);
          const imageUrl = resolveImageUrl(shrine.image);
          shrineEntries.set(url, {
            url,
            lastmod: formatSitemapDate(shrine.updatedAt || shrine.createdAt),
            priority: shrine.priority || "0.7",
            changefreq: shrine.changefreq || "monthly",
            ...(imageUrl
              ? {
                  images: [
                    { url: imageUrl, title: shrine.title || "Shrine page" },
                  ],
                }
              : {}),
          });
        });
      }

      entries.push(...shrineEntries.values());
      console.log(`  Added ${shrineEntries.size} shrine pages`);
    } catch (error) {
      const existingShrineEntries = readExistingShrineEntries();
      existingShrineEntries.forEach((entry) => entries.push(entry));
      if (!existingShrineEntries.length) {
        FALLBACK_SHRINE_ROUTES.forEach((route) => {
          entries.push({
            url: `${WEBSITE_BASE}${route.path}`,
            priority: route.priority,
            changefreq: route.changefreq,
          });
        });
      }
      console.warn(
        `  Could not fetch shrine pages: ${error.message}. Continuing with ${existingShrineEntries.length} preserved shrine URLs...`,
      );
    }

    try {
      console.log("Fetching question archive...");
      archiveEntries = await fetchFromAPI("/question-of-the-day/archive");
      if (Array.isArray(archiveEntries)) {
        archiveEntries.forEach((entry) => {
          if (!entry?.recordedDate) {
            return;
          }

          entries.push({
            url: getQuestionArchiveUrl(entry),
            lastmod: getQuestionArchiveLastmod(entry),
            priority: "0.6",
            changefreq: "monthly",
          });
        });
        console.log(`  Added ${archiveEntries.length} archived question days`);
      }
    } catch (error) {
      archiveEntries = null;
      const existingArchiveEntries = readExistingQuestionArchiveEntries();
      existingArchiveEntries.forEach((entry) => entries.push(entry));
      console.warn(
        `  Could not fetch question archive: ${error.message}. Continuing with ${existingArchiveEntries.length} preserved archive URLs...`,
      );
    }

    const deduplicatedEntries = Array.from(
      new Map(entries.map((entry) => [entry.url, entry])).values(),
    );
    const sitemap = generateSiteMap(deduplicatedEntries);

    if (!fs.existsSync(FEED_OUTPUT_DIR)) {
      fs.mkdirSync(FEED_OUTPUT_DIR, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, sitemap, "utf-8");
    console.log("Sitemap generated successfully.");
    console.log(`  Total URLs: ${deduplicatedEntries.length}`);
    console.log(`  Output: ${OUTPUT_PATH}`);

    // Feeds mirror `mirabellier-backend/lib/feed.js`: a "latest N" view, not an
    // archive. If the posts fetch failed, leave the committed feed untouched
    // rather than replacing it with a stale or partial one.
    if (Array.isArray(posts)) {
      try {
        const blogItems = buildPostFeedItems(posts);
        writeFeedPair("feed.xml", "feed.json", blogItems, BLOG_FEED);
        console.log(`  Wrote feed.xml / feed.json (${blogItems.length} items)`);
      } catch (error) {
        console.warn(`  Could not write blog feeds: ${error.message}`);
      }
    } else {
      console.warn("  Blog feeds left untouched (posts fetch failed).");
    }

    const archiveForFeed = Array.isArray(archiveEntries)
      ? archiveEntries
      : readExistingQuestionArchiveEntries();
    if (archiveForFeed.length) {
      try {
        const questionItems = buildQuestionFeedItems(archiveForFeed);
        writeFeedPair(
          path.join("feed", "questions.xml"),
          path.join("feed", "questions.json"),
          questionItems,
          QUESTIONS_FEED,
        );
        console.log(
          `  Wrote feed/questions.xml / questions.json (${questionItems.length} items)`,
        );
      } catch (error) {
        console.warn(`  Could not write question feeds: ${error.message}`);
      }
    } else {
      console.warn("  Question feeds left untouched (archive fetch failed).");
    }
  } catch (error) {
    console.error("Error generating sitemap:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  generateSiteMap,
  generateFeeds,
  fetchFromAPI,
  getPostUrl,
  buildPostFeedItems,
  buildQuestionFeedItems,
  buildAtomFeed,
  buildJsonFeed,
};
