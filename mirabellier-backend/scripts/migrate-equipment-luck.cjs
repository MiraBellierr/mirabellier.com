#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

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
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") { options.apply = true; continue; }
    if (arg === "--dry-run") { options.apply = false; continue; }
    if (arg === "--backup") {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) throw new Error("--backup requires a file path.");
      options.backupFile = val;
      i += 1;
      continue;
    }
    if (arg.startsWith("--backup=")) {
      options.backupFile = arg.slice("--backup=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: node scripts/migrate-equipment-luck.cjs [flags]",
        "",
        "Renames 'luck' → 'effectHit' in equipment piece sub-stats and main stats.",
        "",
        "Flags:",
        "  --apply         Apply changes (default: dry-run only)",
        "  --dry-run       Report only, no writes",
        "  --backup <path> Backup DB file before applying",
        "  --help, -h      Show this help",
      ].join("\n"));
      process.exit(0);
    }
  }

  return options;
}

function migrateEquipmentLuck(db, { apply = false, backupFile = "" } = {}) {
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
    const migrated = subStats.map((s) => {
      if (s.type === "luck") {
        const before = s.type;
        s = { ...s, type: "effectHit" };
        affected.push({ id: row.id, slot: row.slot, stat: before, value: s.value });
        changed = true;
      }
      return s;
    });

    if (changed) {
      dirtyCount++;
      if (apply) {
        db.prepare("UPDATE arena_equipment_pieces SET subStats = ? WHERE id = ?").run(
          JSON.stringify(migrated),
          row.id,
        );
      }
    }
  }

  // Also migrate any luck references in the user profiles (base stat)
  // The db.js migrateLuckToEffectHit handles the column-level rename,
  // but we also check for luck in the profile's selectedCardJson-equipment-like blobs.
  const profileRows = db.prepare("SELECT userId, effectsJson FROM arena_profiles WHERE effectsJson IS NOT NULL").all();
  let profileDirty = 0;

  for (const row of profileRows) {
    let effects;
    try {
      effects = JSON.parse(row.effectsJson || "null");
    } catch { continue; }

    if (!effects || typeof effects !== "object") continue;

    let changed = false;
    // effects could contain equipment-derived data with luck keys
    const fixLuck = (obj) => {
      if (!obj || typeof obj !== "object") return;
      for (const key of Object.keys(obj)) {
        if (key === "luck") {
          obj.effectHit = (obj.effectHit || 0) + (obj.luck || 0);
          delete obj.luck;
          changed = true;
        }
        if (typeof obj[key] === "object" && obj[key] !== null) {
          fixLuck(obj[key]);
        }
      }
    };
    fixLuck(effects);

    if (changed) {
      profileDirty++;
      if (apply) {
        db.prepare("UPDATE arena_profiles SET effectsJson = ? WHERE userId = ?").run(
          JSON.stringify(effects),
          row.userId,
        );
      }
    }
  }

  return { affected, warnings, dirtyCount, profileDirty, totalPieces: rows.length, apply };
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

  console.log("Migrating equipment 'luck' → 'effectHit'...\n");
  const result = migrateEquipmentLuck(db, options);

  console.log(`Total equipment pieces scanned: ${result.totalPieces}`);
  console.log(`Pieces with luck sub-stats:    ${result.dirtyCount}`);
  console.log(`Profiles with luck in effects: ${result.profileDirty}`);
  console.log(`Warnings:                      ${result.warnings.length}`);
  console.log("");

  if (result.affected.length > 0) {
    console.log("Affected pieces:");
    for (const a of result.affected) {
      console.log(`  ${a.id} (${a.slot}) — ${a.stat}=${a.value} → effectHit`);
    }
    console.log("");
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const w of result.warnings) {
      console.log(`  ${w}`);
    }
    console.log("");
  }

  if (result.apply) {
    console.log("Changes applied.");
  } else {
    console.log("DRY RUN — no changes written. Use --apply to commit.");
  }

  db.close();
}

main();
