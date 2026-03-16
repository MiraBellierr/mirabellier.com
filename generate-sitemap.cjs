#!/usr/bin/env node

/**
 * Generates sitemap.xml for the Mirabellier.com website.
 * Includes static pages and dynamically fetches blog posts.
 *
 * Usage:
 *   node generate-sitemap.cjs
 *   VITE_API_BASE=https://custom-domain.com/api node generate-sitemap.cjs
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const API_BASE = process.env.VITE_API_BASE || "https://mirabellier.com/api";
const WEBSITE_BASE = process.env.WEBSITE_BASE || "https://mirabellier.com";
const OUTPUT_PATH = path.join(__dirname, "public", "sitemap.xml");

const STATIC_ROUTES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/home", priority: "0.8", changefreq: "weekly" },
  { path: "/about", priority: "0.8", changefreq: "monthly" },
  { path: "/projects", priority: "0.8", changefreq: "monthly" },
  { path: "/shrine", priority: "0.8", changefreq: "monthly" },
  { path: "/shrine/kanna", priority: "0.7", changefreq: "monthly" },
  { path: "/shrine/rossina", priority: "0.7", changefreq: "monthly" },
  { path: "/quotes", priority: "0.8", changefreq: "daily" },
  { path: "/blog", priority: "0.9", changefreq: "daily" },
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
  return source ? new Date(source).toISOString().split("T")[0] : undefined;
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

async function main() {
  try {
    console.log("Generating sitemap.xml...");
    console.log(`  API Base: ${API_BASE}`);
    console.log(`  Website: ${WEBSITE_BASE}`);

    const entries = [];

    for (const route of STATIC_ROUTES) {
      entries.push({
        url: `${WEBSITE_BASE}${route.path}`,
        priority: route.priority,
        changefreq: route.changefreq,
      });
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

    const sitemap = generateSiteMap(entries);
    const publicDir = path.join(__dirname, "public");

    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, sitemap, "utf-8");
    console.log("Sitemap generated successfully.");
    console.log(`  Total URLs: ${entries.length}`);
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
