#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const BACKEND_ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND_ROOT, ".env") });

// ── balance caps (keep in sync with arena-constants.js) ──
const DMG_PCT_MAX = 20;
const DEFEND_PCT_MAX = 30;

// ── helpers ──

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
      options.backupFile = val; i += 1; continue;
    }
    if (arg.startsWith("--backup=")) { options.backupFile = arg.slice("--backup=".length); continue; }
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: node scripts/verify-balance-data.cjs [flags]",
        "",
        "Validates and optionally fixes user data to match current balance rules:",
        "  - Clamp equipment dmgPct  > " + DMG_PCT_MAX + "  (P11)",
        "  - Clamp equipment defendPct > " + DEFEND_PCT_MAX,
        "  - Migrate tutorialComplete=1 → 20 for old 10K bonus users (P12)",
        "",
        "Flags:",
        "  --apply         Apply fixes (default: dry-run only)",
        "  --dry-run       Report only, no writes",
        "  --backup <path> Backup DB file before applying",
        "  --help, -h      Show this help",
      ].join("\n"));
      process.exit(0);
    }
  }
  return options;
}

// ── checks ──

function checkEquipmentSubStats(db) {
  const rows = db.prepare("SELECT id, slot, subStats FROM arena_equipment_pieces").all();
  const fixes = [];
  for (const row of rows) {
    let subs;
    try { subs = JSON.parse(row.subStats || "[]"); } catch { continue; }
    if (!Array.isArray(subs)) continue;

    let changed = false;
    const clamped = subs.map((s) => {
      if (s.type === "dmgPct" && Number(s.value) > DMG_PCT_MAX) {
        fixes.push({ id: row.id, slot: row.slot, stat: "dmgPct", before: s.value, after: DMG_PCT_MAX });
        changed = true;
        return { ...s, value: DMG_PCT_MAX };
      }
      if (s.type === "defendPct" && Number(s.value) > DEFEND_PCT_MAX) {
        fixes.push({ id: row.id, slot: row.slot, stat: "defendPct", before: s.value, after: DEFEND_PCT_MAX });
        changed = true;
        return { ...s, value: DEFEND_PCT_MAX };
      }
      return s;
    });

    if (changed) {
      db.prepare("UPDATE arena_equipment_pieces SET subStats = ? WHERE id = ?").run(
        JSON.stringify(clamped), row.id,
      );
    }
  }
  return fixes;
}

function checkTutorialCoins(db) {
  const rows = db.prepare(
    "SELECT userId, level, tutorialComplete FROM arena_profiles WHERE tutorialComplete = 1"
  ).all();
  if (rows.length > 0) {
    db.prepare("UPDATE arena_profiles SET tutorialComplete = 20 WHERE tutorialComplete = 1").run();
  }
  return rows;
}

// ── main ──

function main() {
  const args = process.argv.slice(2);
  let options;
  try { options = parseArgs(args); } catch (err) {
    console.error("Error:", err.message); process.exit(1);
  }

  if (options.apply && !options.backupFile) {
    options.backupFile = path.dirname(options.dbFile) + "/database-backup-" + timestampForFile() + ".sqlite3";
  }
  if (options.apply) {
    fs.copyFileSync(options.dbFile, options.backupFile);
    console.log("Backed up database to:", options.backupFile);
  }

  const db = new Database(options.dbFile);
  db.pragma("journal_mode = WAL");

  let eqpFixes = [];
  let tcRows = [];

  try {
    eqpFixes = checkEquipmentSubStats(db);
    tcRows = checkTutorialCoins(db);
  } finally {
    if (!options.apply) {
      // Roll back any writes from dry-run
      db.close();
      // Reopen to re-read
      console.log("\n(DRY RUN — no changes written. Re-run with --apply to write.)\n");
      const db2 = new Database(options.dbFile);
      eqpFixes = [];
      const rows = db2.prepare("SELECT id, slot, subStats FROM arena_equipment_pieces").all();
      for (const row of rows) {
        let subs;
        try { subs = JSON.parse(row.subStats || "[]"); } catch { continue; }
        if (!Array.isArray(subs)) continue;
        for (const s of subs) {
          if (s.type === "dmgPct" && Number(s.value) > DMG_PCT_MAX) {
            eqpFixes.push({ id: row.id, slot: row.slot, stat: "dmgPct", before: s.value, after: DMG_PCT_MAX });
          }
          if (s.type === "defendPct" && Number(s.value) > DEFEND_PCT_MAX) {
            eqpFixes.push({ id: row.id, slot: row.slot, stat: "defendPct", before: s.value, after: DEFEND_PCT_MAX });
          }
        }
      }
      tcRows = db2.prepare("SELECT userId, level, tutorialComplete FROM arena_profiles WHERE tutorialComplete = 1").all();
      db2.close();
    } else {
      db.close();
    }
  }

  // ── report ──
  console.log("=== Equipment sub-stat bounds ===");
  if (eqpFixes.length === 0) {
    console.log("  ✅ All within limits (dmgPct ≤ " + DMG_PCT_MAX + ", defendPct ≤ " + DEFEND_PCT_MAX + ")");
  } else {
    for (const f of eqpFixes) {
      console.log("  ⚠ " + f.id + " (" + f.slot + "): " + f.stat + " " + f.before + " → " + f.after);
    }
  }

  console.log("\n=== Tutorial coin migration (P12) ===");
  if (tcRows.length === 0) {
    console.log("  ✅ No old-format tutorialComplete = 1 users");
  } else {
    for (const r of tcRows) {
      console.log("  ⚠ userId=" + r.userId + " lv=" + r.level + " tutorialComplete=1 → 20");
    }
  }

  const totalIssues = eqpFixes.length + tcRows.length;
  if (totalIssues === 0) {
    console.log("\n🎉 All user data consistent with current balance rules.");
  } else if (options.apply) {
    console.log("\n✅ Applied " + totalIssues + " fix(es).");
  } else {
    console.log("\n⚠ " + totalIssues + " issue(s) found. Re-run with --apply to fix.");
  }
}

main();
