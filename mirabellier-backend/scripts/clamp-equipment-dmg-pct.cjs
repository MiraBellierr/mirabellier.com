#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const BACKEND_ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND_ROOT, ".env") });

const DMG_PCT_MAX = 20;

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv) {
  const options = {
    apply: false,
    dbFile: process.env.DB_FILE || path.join(BACKEND_ROOT, "database.sqlite3"),
    backupFile: "",
  };

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
    if (arg === "--backup") {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) {
        throw new Error("--backup requires a file path.");
      }
      options.backupFile = val;
      i += 1;
      continue;
    }
    if (arg.startsWith("--backup=")) {
      options.backupFile = arg.slice("--backup=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: node scripts/clamp-equipment-dmg-pct.cjs [flags]",
          "",
          "Clamps all dmgPct sub-stats on equipment pieces down to " + DMG_PCT_MAX + ".",
          "",
          "Flags:",
          "  --apply         Apply changes (default: dry-run only)",
          "  --dry-run       Report only, no writes",
          "  --backup <path> Backup DB file before applying",
          "  --help, -h      Show this help",
        ].join("\n"),
      );
      process.exit(0);
    }
  }

  return options;
}

function clampDmgPct(db, { apply = false, backupFile = "" } = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("A database connection is required.");
  }

  const rows = db
    .prepare("SELECT id, slot, subStats FROM arena_equipment_pieces")
    .all();

  const affected = [];
  const warnings = [];
  let dirtyCount = 0;

  for (const row of rows) {
    let subStats;
    try {
      subStats = JSON.parse(row.subStats || "[]");
    } catch {
      warnings.push(`eqp ${row.id}: malformed subStats JSON, skipped`);
      continue;
    }

    if (!Array.isArray(subStats)) {
      warnings.push(`eqp ${row.id}: subStats is not an array, skipped`);
      continue;
    }

    let changed = false;
    const clamped = subStats.map((s) => {
      if (s.type === "dmgPct" && Number(s.value) > DMG_PCT_MAX) {
        const before = s.value;
        s = { ...s, value: DMG_PCT_MAX };
        affected.push({
          id: row.id,
          slot: row.slot,
          before,
          after: s.value,
        });
        changed = true;
      }
      return s;
    });

    if (changed) {
      dirtyCount++;
      if (apply) {
        db.prepare("UPDATE arena_equipment_pieces SET subStats = ? WHERE id = ?").run(
          JSON.stringify(clamped),
          row.id,
        );
      }
    }
  }

  return { affected, warnings, dirtyCount, totalPieces: rows.length, apply };
}

function main() {
  const args = process.argv.slice(2);
  let options;
  try {
    options = parseArgs(args);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }

  if (options.apply && !options.backupFile) {
    options.backupFile =
      path.dirname(options.dbFile) +
      "/database-backup-" +
      timestampForFile() +
      ".sqlite3";
  }

  if (options.apply) {
    fs.copyFileSync(options.dbFile, options.backupFile);
    console.log("Backed up database to:", options.backupFile);
  }

  const db = new Database(options.dbFile);
  db.pragma("journal_mode = WAL");

  let result;
  try {
    result = clampDmgPct(db, options);
  } finally {
    db.close();
  }

  console.log(
    `\nScanned ${result.totalPieces} equipment pieces. Found ${result.dirtyCount} with dmgPct > ${DMG_PCT_MAX}.`,
  );

  if (result.affected.length > 0) {
    console.log("\nAffected pieces:");
    for (const a of result.affected) {
      console.log(`  ${a.id} (${a.slot}): dmgPct ${a.before} → ${a.after}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of result.warnings) {
      console.log("  " + w);
    }
  }

  if (result.apply) {
    console.log(`\n✅ Applied ${result.affected.length} clamp(s) to the database.`);
  } else {
    console.log(
      "\n(DRY RUN — no changes were written. Re-run with --apply to write.)",
    );
  }
}

main();
