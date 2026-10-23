#!/usr/bin/env node

// Mirrors Discord-CDN avatar URLs of Discord-linked accounts into local PNG
// files and repoints the database at the local copy.
//
// discordapp.com avatar links do not expire, but pointing the browser at them
// means every Pixies feed render hits Discord's CDN. findOrCreateDiscordUser now
// mirrors on login for anyone signing in from here on; this script backfills the
// rows that predate that change instead of waiting for each user to log in
// again.
//
// Runs in dry-run mode by default. Add --apply to write changes (a timestamped
// database backup is created first).
//   node scripts/mirror-discord-avatars.cjs [--apply] [--dry-run]

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const BACKEND_ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND_ROOT, ".env") });

const { mirrorAvatarToPng } = require("../lib/avatar-png");

function resolveDir(envVar, defaultName) {
  const envVal = process.env[envVar];
  if (envVal) {
    return path.isAbsolute(envVal)
      ? envVal
      : path.resolve(BACKEND_ROOT, envVal);
  }
  return path.join(BACKEND_ROOT, defaultName);
}

function resolveDbFile() {
  const envVal = process.env.DB_FILE;
  if (!envVal) return path.join(BACKEND_ROOT, "database.sqlite3");
  return path.isAbsolute(envVal) ? envVal : path.resolve(BACKEND_ROOT, envVal);
}

function parseArgs(argv) {
  const options = { apply: false, dbFile: resolveDbFile() };
  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = new Database(options.dbFile);
  const IMAGES_DIR = resolveDir("IMAGES_DIR", "images");

  const rows = db
    .prepare(
      `SELECT id, username, avatar FROM users
       WHERE discordId IS NOT NULL AND discordId != ''
         AND avatar LIKE 'http%'`,
    )
    .all();
  const updateRow = db.prepare("UPDATE users SET avatar = ? WHERE id = ?");

  if (rows.length === 0) {
    console.log("No Discord accounts with a remote avatar — nothing to do.");
    db.close();
    return;
  }

  const changed = [];
  const skipped = [];

  for (const row of rows) {
    const avatar = String(row.avatar || "").trim();
    const mirrored = await mirrorAvatarToPng(avatar, IMAGES_DIR);
    if (mirrored === avatar || !mirrored.startsWith("/images/")) {
      skipped.push(`@${row.username}: mirror of ${avatar.slice(0, 90)} failed`);
      continue;
    }
    changed.push({ id: row.id, username: row.username, from: avatar, to: mirrored });
  }

  console.log(`\nDiscord accounts checked: ${rows.length}`);
  for (const entry of changed) {
    console.log(`\n[CHANGE] @${entry.username}`);
    console.log(`  was: ${entry.from}`);
    console.log(`  now: ${entry.to}`);
  }
  for (const line of skipped) {
    console.log(`\n[SKIP] ${line}`);
  }

  if (changed.length === 0) {
    console.log("\nNothing to change.");
    db.close();
    return;
  }

  if (!options.apply) {
    console.log(
      `\n${changed.length} avatar(s) would change. Re-run with --apply to write (a DB backup is made first).`,
    );
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
    for (const entry of changed) updateRow.run(entry.to, entry.id);
  });
  applyAll();
  db.close();
  console.log(`\nApplied ${changed.length} avatar update(s).`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
