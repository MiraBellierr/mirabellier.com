/**
 * Reset all arena players to provisional ELO (1000).
 *
 * Usage:  node scripts/reset-elo.cjs
 * Dry run: node scripts/reset-elo.cjs --dry
 */
const path = require("path");
const Database = require("better-sqlite3");

const DB_FILE =
  process.env.DB_FILE || path.join(__dirname, "..", "database.sqlite3");

const isDry = process.argv.includes("--dry");

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");

console.log(`Database: ${DB_FILE}`);
console.log(`Mode: ${isDry ? "DRY RUN (no changes)" : "LIVE"}`);
console.log("");

const before = db
  .prepare("SELECT COUNT(*) AS count FROM arena_profiles")
  .get();

console.log(`Total arena profiles: ${before.count}`);

const ratings = db
  .prepare(
    "SELECT eloRating, eloMatches, peakElo FROM arena_profiles ORDER BY eloRating DESC",
  )
  .all();

const top5 = ratings.slice(0, 5).map((r, i) => `  #${i + 1}: ${r.eloRating} ELO · ${r.eloMatches} matches · peak ${r.peakElo}`).join("\n");
console.log(`\nTop 5 before reset:\n${top5 || "  (none)"}`);

if (ratings.length > 0) {
  const avg =
    ratings.reduce((s, r) => s + (r.eloRating || 1000), 0) / ratings.length;
  console.log(`\nAverage ELO: ${Math.round(avg)}`);
}

if (isDry) {
  console.log("\n--- DRY RUN: no changes made ---");
} else {
  const result = db
    .prepare(
      "UPDATE arena_profiles SET eloRating = 1000, eloMatches = 0, peakElo = 1000",
    )
    .run();

  console.log(`\n✓ Reset ${result.changes} profiles to provisional (1000 / 0 matches)`);
}

db.close();
