#!/usr/bin/env node

// Sync Honkai: Star Rail characters, teams, and images from prydwen.gg.
//
//   node scripts/sync-hsr.cjs                 # incremental (only changes)
//   node scripts/sync-hsr.cjs --full          # re-fetch every character page
//   node scripts/sync-hsr.cjs --force         # alias of --full
//   node scripts/sync-hsr.cjs --slug=acheron  # one character
//   node scripts/sync-hsr.cjs --no-images     # JSON only
//   node scripts/sync-hsr.cjs --concurrency=4 # page loads in parallel
//
// A successful run stamps `external_sync_state` in the site database so the
// sitemap can date `/hsr`. Pass --no-db to skip that.

const path = require("path");

const BACKEND_ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND_ROOT, ".env") });

const { syncHsrData } = require("../lib/hsr-sync");
const { recordExternalSync } = require("../lib/external-sync-state");

function resolveDbFile() {
  const envVal = process.env.DB_FILE;
  if (!envVal) return path.join(BACKEND_ROOT, "database.sqlite3");
  return path.isAbsolute(envVal) ? envVal : path.resolve(BACKEND_ROOT, envVal);
}

function recordSyncTimestamp() {
  let db = null;
  try {
    const Database = require("better-sqlite3");
    db = new Database(resolveDbFile());
    return recordExternalSync(db, "hsr");
  } catch (error) {
    console.warn(
      `[hsr] could not record the sync timestamp: ${
        error instanceof Error ? error.message : error
      }`,
    );
    return false;
  } finally {
    db?.close();
  }
}

function parseArgs(argv) {
  const options = {
    force: false,
    full: false,
    slugs: [],
    images: true,
    concurrency: undefined,
    fullRefreshDays: undefined,
    retries: undefined,
    db: true,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--full") {
      options.full = true;
      continue;
    }
    if (arg === "--no-images") {
      options.images = false;
      continue;
    }
    if (arg === "--no-db") {
      options.db = false;
      continue;
    }
    if (!arg.startsWith("--")) continue;

    const [key, rawValue = ""] = arg.slice(2).split("=", 2);
    if (key === "slug" || key === "character") {
      const slug = rawValue.trim();
      if (slug) options.slugs.push(slug);
    }
    if (key === "concurrency") {
      const parsed = Number.parseInt(rawValue, 10);
      if (Number.isFinite(parsed) && parsed > 0) options.concurrency = parsed;
    }
    if (key === "full-refresh-days") {
      const parsed = Number.parseFloat(rawValue);
      if (Number.isFinite(parsed) && parsed > 0) options.fullRefreshDays = parsed;
    }
    if (key === "retries") {
      const parsed = Number.parseInt(rawValue, 10);
      if (Number.isFinite(parsed) && parsed >= 0) options.retries = parsed;
    }
    if (key === "images") {
      options.images = rawValue !== "false";
    }
  }

  return options;
}

function printHelp() {
  console.log(`Sync Honkai: Star Rail characters and teams from prydwen.gg.

Usage:
  node scripts/sync-hsr.cjs [options]

Options:
  --full                    Re-fetch every character page (not just changes)
  --force                   Alias for --full
  --slug=<slug>             Sync a single character (repeatable)
  --no-images               Skip mirroring images into images/hsr/
  --no-db                   Skip recording the sync timestamp for the sitemap
  --concurrency=<n>         Concurrent character page loads (default: 3)
  --full-refresh-days=<n>   Days between automatic full sweeps (default: 7)
  --retries=<n>             Retries per page before keeping old data (default: 1)
  --help, -h                Show this help

Outputs:
  data/hsr/characters.json  Roster (element, path, rarity, role, tier ratings)
  data/hsr/team-index.json  Every distinct team per mode, ranked
  data/hsr/characters/<slug>.json
  images/hsr/characters/    Card, icon, and full art
  images/hsr/icons/         Element and path icons

Examples:
  npm run sync:hsr
  npm run sync:hsr -- --full
  node scripts/sync-hsr.cjs --slug=acheron
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const result = await syncHsrData({
    force: options.force,
    full: options.full,
    slugs: options.slugs.length > 0 ? options.slugs : undefined,
    concurrency: options.concurrency,
    fullRefreshDays: options.fullRefreshDays,
    retries: options.retries,
    skipImages: options.images === false,
  });

  if (result.ok && options.db) {
    recordSyncTimestamp();
  }

  if (!result.ok) {
    console.error(
      `\nSync finished with failures: ` +
        result.errors.map((entry) => `${entry.slug} (${entry.error})`).join(", "),
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
