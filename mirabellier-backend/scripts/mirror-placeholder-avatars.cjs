#!/usr/bin/env node

// Mirrors social-platform avatar URLs of placeholder pixie authors into local
// PNG files and repoints the database at the local copy.
//
// Social CDN avatars (TikTok/Instagram) carry expiring tokens that later 403
// for site visitors, and some author rows already point at a local avatar
// file that is missing on disk. This script:
//   - for placeholder authors with a remote http(s) avatar: mirrors the image
//     server-side (mirrorAvatarToPng) and updates the row to the local path;
//   - for placeholder authors whose local avatar file is missing: finds the
//     origin URL in the avatar cache by md5 of the URL and mirrors it again.
//
// Runs in dry-run mode by default. Add --apply to write changes (a timestamped
// database backup is created first).
//   node scripts/mirror-placeholder-avatars.cjs [--apply] [--dry-run]

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const BACKEND_ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND_ROOT, ".env") });

const { mirrorAvatarToPng } = require("../lib/avatar-png");

const AVATAR_CACHE_FILE =
  process.env.AVATAR_CACHE_FILE ||
  path.join(BACKEND_ROOT, "data", "avatar-cache.json");

function resolveDir(envVar, defaultName) {
  const envVal = process.env[envVar];
  if (envVal) {
    const resolved = path.isAbsolute(envVal)
      ? envVal
      : path.resolve(BACKEND_ROOT, envVal);
    return resolved;
  }
  return path.join(BACKEND_ROOT, defaultName);
}

function resolveDbFile() {
  const envVal = process.env.DB_FILE;
  if (!envVal) return path.join(BACKEND_ROOT, "database.sqlite3");
  return path.isAbsolute(envVal)
    ? envVal
    : path.resolve(BACKEND_ROOT, envVal);
}

function parseArgs(argv) {
  const options = { apply: false, dbFile: resolveDbFile() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.apply = false;
      continue;
    }
  }
  return options;
}

function readAvatarCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(AVATAR_CACHE_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// url -> local basename mapping from the avatar cache (same md5 scheme
// mirrorAvatarToPng uses), so a missing local file can be re-mirrored.
function buildCacheIndex(cache) {
  const index = new Map();
  for (const [key, entry] of Object.entries(cache)) {
    const url = String(entry?.url || "").trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const hash = crypto.createHash("md5").update(url).digest("hex");
    if (!index.has(hash)) index.set(hash, { url, key });
  }
  return index;
}

function platformForUrl(url) {
  const host = String(url || "").toLowerCase();
  if (/tiktok\.com|tiktokcdn/i.test(host)) return "tiktok";
  if (/instagram|fbcdn/i.test(host)) return "instagram";
  return null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = new Database(options.dbFile);
  const IMAGES_DIR = resolveDir("IMAGES_DIR", "images");
  const AVATARS_DIR = path.join(IMAGES_DIR, "avatars");

  const rows = db
    .prepare(
      `SELECT id, username, avatar FROM users
       WHERE (passwordHash IS NULL OR passwordHash = '')
         AND (discordId IS NULL OR discordId = '')
         AND avatar IS NOT NULL AND avatar != ''`,
    )
    .all();
  const updateRow = db.prepare("UPDATE users SET avatar = ? WHERE id = ?");

  if (rows.length === 0) {
    console.log("No placeholder authors with avatars found — nothing to do.");
    db.close();
    return;
  }

  const cache = readAvatarCache();
  const cacheIndex = buildCacheIndex(cache);

  const changed = [];
  const skipped = [];
  const missingCache = [];

  for (const row of rows) {
    const avatar = String(row.avatar || "").trim();
    const isRemote = /^https?:\/\//i.test(avatar);
    const localMatch = avatar.match(/^\/images\/avatars\/([a-f0-9]{32}\.png)$/);
    let originUrl = avatar;
    let reason = "";

    if (isRemote) {
      reason = "mirror remote avatar";
    } else if (localMatch) {
      const fileName = localMatch[1];
      if (fs.existsSync(path.join(AVATARS_DIR, fileName))) {
        skipped.push(`${row.username}: local avatar file exists (${avatar})`);
        continue;
      }
      const found = cacheIndex.get(fileName.replace(/\.png$/, ""));
      if (!found) {
        missingCache.push(
          `${row.username}: missing file ${avatar} and no cache entry to restore it`,
        );
        continue;
      }
      originUrl = found.url;
      reason = `restore missing file ${fileName} from cache (${found.key})`;
    } else {
      skipped.push(`${row.username}: avatar is neither remote nor local (${avatar})`);
      continue;
    }

    let reasonText = reason;
    let mirrored = await mirrorAvatarToPng(originUrl, IMAGES_DIR);
    if (
      isRemote &&
      (mirrored === originUrl || !mirrored.startsWith("/images/"))
    ) {
      // The stored CDN link expired — fetch a fresh avatar from the
      // creator's profile instead of giving up.
      const platform = platformForUrl(originUrl);
      if (platform) {
        const { resolveCreatorAvatar } = require("../lib/social");
        const freshUrl = await resolveCreatorAvatar(
          platform,
          String(row.username).trim(),
        ).catch(() => null);
        if (freshUrl && /^https?:\/\//i.test(freshUrl)) {
          mirrored = await mirrorAvatarToPng(freshUrl, IMAGES_DIR);
          if (mirrored.startsWith("/images/")) {
            reasonText = `${reason}; stored link expired, refetched from profile`;
          }
        }
      }
    }
    if (mirrored === originUrl || !mirrored.startsWith("/images/")) {
      skipped.push(
        `${row.username}: mirror of ${originUrl.slice(0, 90)}... failed (token may be expired or the platform is throttling scrapes)`,
      );
      continue;
    }
    if (mirrored === avatar) {
      skipped.push(`${row.username}: already local (${mirrored})`);
      continue;
    }
    changed.push({
      id: row.id,
      username: row.username,
      from: avatar,
      to: mirrored,
      reason: reasonText,
    });
  }

  console.log(`\nPlaceholder authors checked: ${rows.length}`);
  for (const entry of changed) {
    console.log(`\n[CHANGE] @${entry.username}`);
    console.log(`  reason: ${entry.reason}`);
    console.log(`  was:    ${String(entry.from).slice(0, 130)}`);
    console.log(`  now:    ${entry.to}`);
  }
  for (const line of skipped) {
    console.log(`\n[SKIP] ${line}`);
  }
  for (const line of missingCache) {
    console.log(`\n[UNFIXABLE] ${line}`);
  }

  if (changed.length === 0) {
    console.log("\nNothing to change.");
    db.close();
    return;
  }

  if (!options.apply) {
    console.log(`\n${changed.length} avatar(s) would change. Re-run with --apply to write (a DB backup is made first).`);
    db.close();
    return;
  }

  const backupPath = path.join(
    BACKEND_ROOT,
    `database-backup-avatar-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite3`,
  );
  fs.copyFileSync(options.dbFile, backupPath);
  console.log(`\nDatabase backup: ${backupPath}`);

  const applyAll = db.transaction(() => {
    for (const entry of changed) {
      updateRow.run(entry.to, entry.id);
    }
  });
  applyAll();
  db.close();
  console.log(`\nApplied ${changed.length} avatar update(s).`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
