/**
 * Fixes domain modules to import ArenaHttpError from utils.js instead of defining it locally.
 * This ensures instanceof checks work across modules.
 */
const fs = require("fs");
const path = require("path");

const ARENA_DIR = path.join(__dirname, "..", "mirabellier-backend", "lib", "arena");

// Files to fix (all domain modules except utils.js itself)
const files = [
  "effects.js", "cards.js", "collection.js", "archive.js",
  "equipment.js", "profile.js", "shop.js", "card-shop.js",
  "combat.js", "playback.js", "market.js", "trade.js",
  "notifications.js", "updates.js", "leaderboard.js",
  "hall-of-fame.js", "skill-tree.js", "mint.js",
];

for (const filename of files) {
  const filePath = path.join(ARENA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP ${filename} (not found)`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, "utf8");
  
  // Remove the local ArenaHttpError class definition
  // Pattern: class ArenaHttpError extends Error { ... }
  const classPattern = /class ArenaHttpError extends Error \{[^}]*constructor\(status, message, code = "ARENA_ERROR", details = \{\}\) \{[^}]*\}[^}]*\}/s;
  content = content.replace(classPattern, "// ArenaHttpError imported from ./utils\n");
  
  // Add the import after the first require line
  const firstRequireEnd = content.indexOf(";\n");
  if (firstRequireEnd !== -1) {
    content = content.slice(0, firstRequireEnd + 2) +
      `const { ArenaHttpError } = require("./utils");\n` +
      content.slice(firstRequireEnd + 2);
  }
  
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`Fixed ${filename}`);
}

console.log("Done!");
