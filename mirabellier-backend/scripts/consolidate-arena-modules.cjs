#!/usr/bin/env node

/**
 * Consolidates 18 arena module files (all sharing identical 274KB bodies)
 * into a single arena-core.js plus 18 thin re-export wrappers.
 *
 * Before: 18 files × ~268KB = ~4.8MB
 * After:  1 file × ~268KB + 18 files × 1 line = ~268KB
 */

const fs = require("fs");
const path = require("path");

const ARENA_DIR = path.resolve(__dirname, "..", "lib", "arena");
const FILES = [
  "combat.js", "updates.js", "archive.js", "shop.js",
  "equipment.js", "effects.js", "collection.js", "cards.js",
  "card-shop.js", "market.js", "leaderboard.js", "hall-of-fame.js",
  "notifications.js", "mint.js", "playback.js", "profile.js",
  "skill-tree.js", "trade.js",
];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = !apply;

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/consolidate-arena-modules.cjs [--apply]");
  console.log("  --apply   Write changes (default: dry-run)");
  process.exit(0);
}

// ── Step 1: Extract the shared body from combat.js ──────────────────────

const combatPath = path.join(ARENA_DIR, "combat.js");
const combatSrc = fs.readFileSync(combatPath, "utf-8");
const exportsMarker = "\nmodule.exports = {";
const bodyEnd = combatSrc.indexOf(exportsMarker);
if (bodyEnd === -1) {
  console.error("Could not find module.exports in combat.js");
  process.exit(1);
}
const sharedBody = combatSrc.substring(0, bodyEnd);

// ── Step 2: Collect all exported function names from all 18 files ───────

const allExports = new Set();
const fileExports = {}; // file -> [function names]

for (const file of FILES) {
  const filePath = path.join(ARENA_DIR, file);
  const src = fs.readFileSync(filePath, "utf-8");
  const expMatch = src.match(/module\.exports = \{([^}]+)\}/s);
  if (!expMatch) {
    console.error(`Could not parse exports from ${file}`);
    process.exit(1);
  }
  const names = expMatch[1]
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  fileExports[file] = names;
  for (const n of names) allExports.add(n);
}

console.log(`Total unique exported functions: ${allExports.size}`);
console.log(`Shared body size: ${(sharedBody.length / 1024).toFixed(1)} KB`);

// ── Step 3: Build arena-core.js ─────────────────────────────────────────

const sortedExports = [...allExports].sort();
const coreExports = sortedExports.map(n => `  ${n},`).join("\n");
const coreContent =
  sharedBody +
  "\nmodule.exports = {\n" +
  coreExports +
  "\n};\n" +
  'const { ArenaHttpError } = require("./utils");\n';

const corePath = path.join(ARENA_DIR, "arena-core.js");

if (apply) {
  fs.writeFileSync(corePath, coreContent, "utf-8");
  console.log(`\n✅ Created arena-core.js (${(coreContent.length / 1024).toFixed(1)} KB)`);
} else {
  console.log(`\n🔍 Would create arena-core.js (${(coreContent.length / 1024).toFixed(1)} KB)`);
}

// ── Step 4: Replace each file with a thin re-export wrapper ─────────────

for (const file of FILES) {
  const filePath = path.join(ARENA_DIR, file);
  const wrapper = "module.exports = require(\"./arena-core\");\n";

  if (apply) {
    fs.writeFileSync(filePath, wrapper, "utf-8");
  }
  console.log(`${apply ? "✅" : "🔍"} ${file}: 268 KB → ${wrapper.length} bytes (re-exports arena-core)`);
}

// ── Step 5: Report ──────────────────────────────────────────────────────

const oldTotal = FILES.length * combatSrc.length;
const newTotal = coreContent.length + FILES.length * 40; // ~40 bytes per wrapper
console.log(`\nSize reduction: ${((oldTotal - newTotal) / 1024).toFixed(0)} KB → ${(newTotal / 1024).toFixed(0)} KB (${((1 - newTotal / oldTotal) * 100).toFixed(1)}% smaller)`);

if (dryRun) {
  console.log("\n(DRY RUN — re-run with --apply to write changes)");
}
