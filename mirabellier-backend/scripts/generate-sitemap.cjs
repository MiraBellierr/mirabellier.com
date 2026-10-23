#!/usr/bin/env node

// Backend sitemap generator: reads DB and writes sitemap.xml
// Uses lib/sitemap.js which auto-detects dev vs production paths

const { db } = require("../lib/db");
const { generateSitemap, collectSitemapEntries } = require("../lib/sitemap");

(async () => {
  try {
    const WEBSITE_BASE = process.env.WEBSITE_BASE || "https://mirabellier.com";
    console.log("🗺️  Backend sitemap generation");
    console.log(`   Website: ${WEBSITE_BASE}`);

    const ok = generateSitemap(db);
    if (!ok) {
      console.error("❌ Failed to generate sitemap");
      process.exit(1);
    }
    // List all URLs in console
    const entries = collectSitemapEntries(db);
    console.log(`\n📄 URLs included in sitemap (${entries.length}):`);
    entries.forEach((e) => console.log(` - ${e.url}`));

    console.log("\n✅ Backend sitemap generation completed");
  } catch (err) {
    console.error("❌ Error in backend sitemap script:", err);
    process.exit(1);
  }
})();
