#!/usr/bin/env node

/**
 * Fix: tutorialComplete milestone values were being collapsed to boolean (1/0)
 * on both DB read (!!row.tutorialComplete) and DB write (? 1 : 0).
 *
 * This script changes:
 *   Read:  tutorialComplete: !!row.tutorialComplete,    → tutorialComplete: toInt(row.tutorialComplete, 0),
 *   API:   tutorialComplete: !!profile.tutorialComplete, → tutorialComplete: profile.tutorialComplete || 0,
 *   Write: current.tutorialComplete ? 1 : 0,             → current.tutorialComplete || 0,
 *
 * Write-side matching uses surrounding UPDATE context to disambiguate
 * the PvE path (has lastFightAt) from the PvP path (doesn't).
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
  console.log("Usage: node scripts/fix-tutorial-milestone-persistence.cjs [--apply]");
  console.log("  --apply   Write changes (default: dry-run)");
  process.exit(0);
}

function countIn(str, sub) {
  return str.split(sub).length - 1;
}

// Ordered replacements — each applied sequentially, each matches exactly once per file
const REPLACEMENTS = [
  {
    name: "DB read: !!row.tutorialComplete → toInt(row.tutorialComplete, 0)",
    from: "tutorialComplete: !!row.tutorialComplete,",
    to: "tutorialComplete: toInt(row.tutorialComplete, 0),",
  },
  {
    name: "API response: !!profile.tutorialComplete → profile.tutorialComplete || 0",
    from: "tutorialComplete: !!profile.tutorialComplete,",
    to: "tutorialComplete: profile.tutorialComplete || 0,",
  },
  {
    // PvE path: UPDATE includes lastFightAt
    name: "DB write (PvE): ? 1 : 0 → || 0",
    from: `           tutorialComplete = ?
       WHERE userId = ?\`,
    ).run(
      current.level,
      current.xp,
      current.coins,
      current.wins,
      current.losses,
      current.winStreak,
      current.hp,
      current.power,
      current.guard,
      current.speed,
      current.effectHit,
      current.lifetimeCoinsEarned,
      serializeEffects(current.effects),
      current.lastFightAt,
      current.updatedAt,
      current.tutorialComplete ? 1 : 0,`,
    to: `           tutorialComplete = ?
       WHERE userId = ?\`,
    ).run(
      current.level,
      current.xp,
      current.coins,
      current.wins,
      current.losses,
      current.winStreak,
      current.hp,
      current.power,
      current.guard,
      current.speed,
      current.effectHit,
      current.lifetimeCoinsEarned,
      serializeEffects(current.effects),
      current.lastFightAt,
      current.updatedAt,
      current.tutorialComplete || 0,`,
  },
  {
    // PvP path: UPDATE does NOT include lastFightAt (single-line SET clause)
    name: "DB write (PvP): ? 1 : 0 → || 0",
    from: `           tutorialComplete = ?
       WHERE userId = ?\`,
    ).run(
      current.level,
      current.xp,
      current.coins,
      current.wins,
      current.losses,
      current.winStreak,
      current.hp,
      current.power,
      current.guard,
      current.speed,
      current.effectHit,
      current.lifetimeCoinsEarned,
      serializeEffects(current.effects),
      current.updatedAt,
      current.tutorialComplete ? 1 : 0,`,
    to: `           tutorialComplete = ?
       WHERE userId = ?\`,
    ).run(
      current.level,
      current.xp,
      current.coins,
      current.wins,
      current.losses,
      current.winStreak,
      current.hp,
      current.power,
      current.guard,
      current.speed,
      current.effectHit,
      current.lifetimeCoinsEarned,
      serializeEffects(current.effects),
      current.updatedAt,
      current.tutorialComplete || 0,`,
  },
];

let totalChanges = 0;
let totalFiles = 0;

for (const file of FILES) {
  const filePath = path.join(ARENA_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${file}: NOT FOUND, skipping`);
    continue;
  }

  let content = fs.readFileSync(filePath, "utf-8");
  // Normalize CRLF → LF so patterns match regardless of platform
  const origLineEndings = content.includes("\r\n") ? "\r\n" : "\n";
  content = content.replace(/\r\n/g, "\n");
  let fileChanges = 0;

  for (const rep of REPLACEMENTS) {
    const before = countIn(content, rep.from);
    if (before === 0) {
      console.log(`  ⚠️  ${rep.name}: NOT FOUND in ${file}`);
      continue;
    }
    if (before > 1) {
      console.log(`  ⚠️  ${rep.name}: found ${before} matches in ${file} (expected 1)`);
    }
    content = content.replace(rep.from, rep.to);
    const after = countIn(content, rep.from);
    if (after === before - 1) {
      fileChanges++;
    }
  }

  // Restore original line endings
  if (origLineEndings === "\r\n") {
    content = content.replace(/\n/g, "\r\n");
  }

  if (apply && fileChanges > 0) {
    fs.writeFileSync(filePath, content, "utf-8");
  }

  if (fileChanges > 0) {
    console.log(`${apply ? "✅" : "🔍"} ${file}: ${fileChanges} change(s)`);
    totalFiles++;
    totalChanges += fileChanges;
  }
}

console.log(`\n${apply ? "Applied" : "Would apply"} ${totalChanges} changes across ${totalFiles} files.`);
if (dryRun) {
  console.log("(DRY RUN — re-run with --apply to write changes)");
}
