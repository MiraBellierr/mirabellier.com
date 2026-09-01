#!/usr/bin/env node

/**
 * Generates sitemap.xml for the Mirabellier.com website.
 * Includes static pages and dynamically fetches blog posts.
 *
 * Usage:
 *   node generate-sitemap.cjs
 *   VITE_API_BASE=https://api.mirabellier.com/v1 node generate-sitemap.cjs
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
const BACKEND_DIR = path.join(__dirname, "mirabellier-backend");

const STATIC_ROUTES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/about", priority: "0.8", changefreq: "monthly" },
  { path: "/projects", priority: "0.8", changefreq: "monthly" },
  { path: "/anime", priority: "0.8", changefreq: "daily" },
  { path: "/fanart", priority: "0.7", changefreq: "weekly" },
  { path: "/reels", priority: "0.8", changefreq: "daily" },
  { path: "/shrine", priority: "0.8", changefreq: "monthly" },
  { path: "/shrine/kanna", priority: "0.7", changefreq: "monthly" },
  { path: "/shrine/rossina", priority: "0.7", changefreq: "monthly" },
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
  { path: "/arena/inventory", priority: "0.5", changefreq: "monthly" },
  { path: "/arena/market", priority: "0.5", changefreq: "daily" },
  { path: "/arena/skill-tree", priority: "0.5", changefreq: "monthly" },
];

function fetchFromAPI(endpoint, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE);
    const protocol = url.protocol === "https:" ? https : http;

    const options = {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mirabellier-Sitemap/1.0 (+https://mirabellier.com)",
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
            fetchFromAPI(nextUrl.pathname + nextUrl.search, redirectsLeft - 1),
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

function generateSiteMap(entries) {
  const urls = entries
    .map(
      (entry) => `
  <url>
    <loc>${escapeXml(entry.url)}</loc>
    <lastmod>${entry.lastmod || new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>${entry.changefreq || "weekly"}</changefreq>
    <priority>${entry.priority || "0.5"}</priority>
  </url>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;
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
    const slug = post.title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
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
  if (!fs.existsSync(OUTPUT_PATH)) {
    return [];
  }

  const xml = fs.readFileSync(OUTPUT_PATH, "utf-8");
  const matches = xml.matchAll(/<url>([\s\S]*?)<\/url>/g);
  const entries = [];

  for (const match of matches) {
    const block = match[1];
    const loc = block.match(/<loc>(.*?)<\/loc>/)?.[1];

    if (!loc || !loc.startsWith(`${WEBSITE_BASE}/blog/`)) {
      continue;
    }

    entries.push({
      url: loc,
      lastmod: block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1],
      changefreq: block.match(/<changefreq>(.*?)<\/changefreq>/)?.[1] || "monthly",
      priority: block.match(/<priority>(.*?)<\/priority>/)?.[1] || "0.7",
    });
  }

  return entries;
}

function readExistingQuestionArchiveEntries() {
  if (!fs.existsSync(OUTPUT_PATH)) {
    return [];
  }

  const xml = fs.readFileSync(OUTPUT_PATH, "utf-8");
  const matches = xml.matchAll(/<url>([\s\S]*?)<\/url>/g);
  const entries = [];

  for (const match of matches) {
    const block = match[1];
    const loc = block.match(/<loc>(.*?)<\/loc>/)?.[1];

    if (!loc || !loc.startsWith(`${WEBSITE_BASE}/question-of-the-day/archive/`)) {
      continue;
    }

    const recordedDate = loc
      .replace(`${WEBSITE_BASE}/question-of-the-day/archive/`, "")
      .trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedDate)) {
      continue;
    }

    entries.push({
      url: loc,
      lastmod: block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1],
      changefreq: block.match(/<changefreq>(.*?)<\/changefreq>/)?.[1] || "monthly",
      priority: block.match(/<priority>(.*?)<\/priority>/)?.[1] || "0.6",
    });
  }

  return entries;
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

async function main() {
  try {
    console.log("Generating sitemap.xml...");
    console.log(`  API Base: ${API_BASE}`);
    console.log(`  Website: ${WEBSITE_BASE}`);

    const localBackendEntries = loadEntriesFromLocalBackend();
    const entries = [];

    if (localBackendEntries?.length) {
      entries.push(...localBackendEntries);
      console.log(
        `Loaded ${localBackendEntries.length} sitemap entries from local backend data.`,
      );
    } else {
      console.log("Local backend sitemap data unavailable; falling back to API fetches.");

      for (const route of STATIC_ROUTES) {
        entries.push({
          url: `${WEBSITE_BASE}${route.path}`,
          priority: route.priority,
          changefreq: route.changefreq,
        });
      }
    }

    try {
      console.log("Fetching blog posts...");
      const posts = await fetchFromAPI("/posts");
      if (Array.isArray(posts)) {
        posts.forEach((post) => {
          entries.push({
            url: getPostUrl(post),
            lastmod: getPostLastmod(post),
            priority: "0.7",
            changefreq: "monthly",
          });
        });
        console.log(`  Added ${posts.length} blog posts`);
      }
    } catch (error) {
      const existingBlogEntries = readExistingBlogEntries();
      existingBlogEntries.forEach((entry) => entries.push(entry));
      console.warn(
        `  Could not fetch blog posts: ${error.message}. Continuing with ${existingBlogEntries.length} preserved blog URLs...`,
      );
    }

    try {
      console.log("Fetching question archive...");
      const archiveEntries = await fetchFromAPI("/question-of-the-day/archive");
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
    const publicDir = path.join(__dirname, "public");

    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, sitemap, "utf-8");
    console.log("Sitemap generated successfully.");
    console.log(`  Total URLs: ${deduplicatedEntries.length}`);
    console.log(`  Output: ${OUTPUT_PATH}`);
  } catch (error) {
    console.error("Error generating sitemap:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateSiteMap, fetchFromAPI, getPostUrl };
