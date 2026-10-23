/**
 * Retention policy for the ad-hoc SQLite snapshots that the migration / repair
 * scripts drop next to the live database (they contain a full copy of every
 * table, including `sessions`). Keeps the newest N and deletes the rest.
 *
 * Matches:  database-backup-*.sqlite3
 *           database.sqlite3.<name>-backup-*
 *
 * Dry run (default):  node scripts/prune-db-backups.js
 * Apply:              node scripts/prune-db-backups.js --apply
 * Keep a different count (default 3):  node scripts/prune-db-backups.js --keep=5 --apply
 *
 * These files should also live outside the app directory with restricted modes;
 * this script only bounds how many accumulate.
 */
const fs = require("fs");
const path = require("path");

const BACKUP_DIR =
  process.env.DB_BACKUP_DIR || path.join(__dirname, "..");
const apply = process.argv.includes("--apply");
const keepArg = process.argv.find((arg) => arg.startsWith("--keep="));
const keep = Math.max(0, Number.parseInt(keepArg?.split("=")[1] ?? "3", 10) || 0);

const PATTERNS = [
  /^database-backup-.*\.sqlite3$/i,
  /^database\.sqlite3\..*-backup-.*/i,
];

function isBackup(name) {
  return PATTERNS.some((re) => re.test(name));
}

function main() {
  const entries = fs
    .readdirSync(BACKUP_DIR)
    .filter(isBackup)
    .map((name) => {
      const full = path.join(BACKUP_DIR, name);
      return { name, full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const stale = entries.slice(keep);

  console.log(
    `${entries.length} backup file(s) in ${BACKUP_DIR}; keeping ${Math.min(
      keep,
      entries.length,
    )}, ${stale.length} to remove.`,
  );

  for (const file of stale) {
    if (apply) {
      fs.unlinkSync(file.full);
      console.log(`  deleted ${file.name}`);
    } else {
      console.log(`  would delete ${file.name}`);
    }
  }

  if (!apply && stale.length > 0) {
    console.log("\nDry run — re-run with --apply to delete.");
  }
}

main();
