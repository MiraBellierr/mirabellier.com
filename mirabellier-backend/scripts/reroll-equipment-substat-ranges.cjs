#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { SUB_STAT_POOL } = require("../lib/arena-constants");

const BACKEND_ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND_ROOT, ".env") });

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv) {
  const options = {
    apply: false,
    dbFile: process.env.DB_FILE || path.join(BACKEND_ROOT, "database.sqlite3"),
    backupFile: "",
    onlyOutOfRange: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.apply = false;
      continue;
    }
    if (arg === "--only-out-of-range") {
      options.onlyOutOfRange = true;
      continue;
    }
    if (arg === "--db") {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) {
        throw new Error("--db requires a file path.");
      }
      options.dbFile = val;
      i += 1;
      continue;
    }
    if (arg.startsWith("--db=")) {
      options.dbFile = arg.slice("--db=".length);
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
          "Usage: node scripts/reroll-equipment-substat-ranges.cjs [flags]",
          "",
          "Rerolls existing arena equipment substat values using the current SUB_STAT_POOL ranges.",
          "Legacy crit substats are renamed to critRate.",
          "",
          "Flags:",
          "  --apply              Apply changes (default: dry-run only)",
          "  --dry-run            Report only, no writes",
          "  --only-out-of-range  Only reroll values outside their current range; still renames crit",
          "  --db <path>          SQLite DB file (default: DB_FILE or database.sqlite3)",
          "  --backup <path>      Backup DB file before applying",
          "  --help, -h           Show this help",
        ].join("\n"),
      );
      process.exit(0);
    }
  }

  return options;
}

function normalizeSubStatType(type) {
  return type === "crit" ? "critRate" : type;
}

function rollInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isInRange(value, range) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= range[0] && numeric <= range[1];
}

function rerollEquipmentSubstatRanges(db, { apply = false, onlyOutOfRange = false } = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("A database connection is required.");
  }

  const rows = db
    .prepare("SELECT id, userId, slot, subStats FROM arena_equipment_pieces ORDER BY createdAt ASC")
    .all();

  const changedPieces = [];
  const changedSubstats = [];
  const warnings = [];

  const updatePiece = db.prepare("UPDATE arena_equipment_pieces SET subStats = ? WHERE id = ?");

  const tx = db.transaction(() => {
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

      let pieceChanged = false;
      const nextSubStats = subStats.map((subStat, index) => {
        const beforeType = String(subStat?.type || "");
        const type = normalizeSubStatType(beforeType);
        const range = SUB_STAT_POOL.ranges[type];
        if (!range) {
          warnings.push(`eqp ${row.id}: unsupported substat "${beforeType}", kept as-is`);
          return subStat;
        }

        const typeChanged = type !== beforeType;
        const shouldRerollValue =
          !onlyOutOfRange || !isInRange(subStat?.value, range);
        if (!shouldRerollValue && !typeChanged) return subStat;

        const beforeValue = Number(subStat?.value) || 0;
        const afterValue = shouldRerollValue
          ? rollInRange(range[0], range[1])
          : beforeValue;
        const next = { ...subStat, type, value: afterValue };

        changedSubstats.push({
          id: row.id,
          userId: row.userId,
          slot: row.slot,
          index,
          beforeType,
          afterType: type,
          beforeValue,
          afterValue,
          range,
        });
        pieceChanged = true;
        return next;
      });

      if (pieceChanged) {
        changedPieces.push({ id: row.id, userId: row.userId, slot: row.slot });
        if (apply) {
          updatePiece.run(JSON.stringify(nextSubStats), row.id);
        }
      }
    }
  });

  tx();

  return {
    apply,
    onlyOutOfRange,
    totalPieces: rows.length,
    changedPieces,
    changedSubstats,
    warnings,
  };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
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
    result = rerollEquipmentSubstatRanges(db, options);
  } finally {
    db.close();
  }

  console.log(`\nScanned ${result.totalPieces} equipment pieces.`);
  console.log(
    `${result.changedSubstats.length} substat(s) across ${result.changedPieces.length} piece(s) would change.`,
  );

  if (result.onlyOutOfRange) {
    console.log("Mode: only values outside current ranges were rerolled.");
  } else {
    console.log("Mode: all supported substat values were rerolled.");
  }

  if (result.changedSubstats.length > 0) {
    console.log("\nChanges:");
    for (const entry of result.changedSubstats.slice(0, 200)) {
      console.log(
        `  ${entry.id} (${entry.slot}) #${entry.index}: ` +
          `${entry.beforeType} ${entry.beforeValue} -> ` +
          `${entry.afterType} ${entry.afterValue} ` +
          `[${entry.range[0]}, ${entry.range[1]}]`,
      );
    }
    if (result.changedSubstats.length > 200) {
      console.log(`  ...and ${result.changedSubstats.length - 200} more`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of result.warnings) {
      console.log("  " + warning);
    }
  }

  if (result.apply) {
    console.log("\nApplied equipment substat reroll migration.");
  } else {
    console.log("\nDry run only. Re-run with --apply to write changes.");
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  normalizeSubStatType,
  rerollEquipmentSubstatRanges,
};
