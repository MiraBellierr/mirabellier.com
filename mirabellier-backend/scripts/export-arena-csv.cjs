const path = require("path");
const fs = require("fs");

// Load .env for DB_FILE
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { db } = require("../lib/db");

const OUTPUT_DIR = path.resolve(__dirname, "..", "data", "exports");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(columns, rows) {
  const header = columns.map(escapeCsv).join(",");
  const body = rows
    .map((row) => columns.map((col) => escapeCsv(row[col] ?? "")).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}

// ---- Fights export ----
console.log("Exporting fights...");
const fights = db
  .prepare(
    `SELECT
       f.id,
       f.userId,
       u.username AS playerName,
       f.opponentUserId,
       f.result,
       f.roundsJson,
       f.xpDelta,
       f.coinDelta,
       f.createdAt,
       f.fightSnapshotJson
     FROM arena_fights f
     LEFT JOIN users u ON u.id = f.userId
     ORDER BY f.createdAt ASC`,
  )
  .all();

const fightColumns = [
  "id", "userId", "playerName", "opponentUserId", "result",
  "xpDelta", "coinDelta", "createdAt",
];
const fightCsv = rowsToCsv(fightColumns, fights);
const fightPath = path.join(OUTPUT_DIR, `arena-fights-${timestamp}.csv`);
fs.writeFileSync(fightPath, fightCsv, "utf-8");
console.log(`  ${fights.length} fights → ${fightPath}`);

// ---- Profiles export ----
console.log("Exporting profiles...");
const profiles = db
  .prepare(
    `SELECT
       p.userId,
       u.username AS playerName,
       p.level,
       p.xp,
       p.coins,
       p.wins,
       p.losses,
       p.winStreak,
       p.hp,
       p.power,
       p.guard,
       p.speed,
       p.luck,
       p.eloRating,
       p.eloMatches,
       p.peakElo,
       p.lifetimeCoinsEarned,
       p.lastCardDrawDate,
       p.dailyCardDrawCount,
       p.catalogVersion,
       p.lastFightAt,
       p.createdAt,
       p.updatedAt
     FROM arena_profiles p
     LEFT JOIN users u ON u.id = p.userId
     ORDER BY p.level DESC, p.xp DESC`,
  )
  .all();

const profileColumns = [
  "userId", "playerName", "level", "xp", "coins",
  "wins", "losses", "winStreak",
  "hp", "power", "guard", "speed", "luck",
  "eloRating", "eloMatches", "peakElo",
  "lifetimeCoinsEarned", "lastCardDrawDate", "dailyCardDrawCount",
  "catalogVersion", "lastFightAt", "createdAt", "updatedAt",
];
const profileCsv = rowsToCsv(profileColumns, profiles);
const profilePath = path.join(OUTPUT_DIR, `arena-profiles-${timestamp}.csv`);
fs.writeFileSync(profilePath, profileCsv, "utf-8");
console.log(`  ${profiles.length} profiles → ${profilePath}`);

// ---- Summary ----
const summary = db
  .prepare(
    `SELECT
       COUNT(*) AS totalFights,
       SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS totalWins,
       SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS totalLosses,
       SUM(xpDelta) AS totalXp,
       SUM(coinDelta) AS totalCoins,
       COUNT(DISTINCT userId) AS uniquePlayers
     FROM arena_fights`,
  )
  .get();

const summaryPath = path.join(OUTPUT_DIR, `arena-summary-${timestamp}.csv`);
const summaryCsv = rowsToCsv(
  ["totalFights", "totalWins", "totalLosses", "totalXp", "totalCoins", "uniquePlayers"],
  [summary],
);
fs.writeFileSync(summaryPath, summaryCsv, "utf-8");
console.log(`  summary → ${summaryPath}`);

console.log("\nDone! Files saved to data/exports/");
