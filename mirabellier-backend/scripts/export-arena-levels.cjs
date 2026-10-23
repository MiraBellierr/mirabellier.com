const path = require("path");
const fs = require("fs");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const { db } = require("../lib/db");

const OUTPUT_DIR = path.resolve(__dirname, "..", "data", "exports");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// XP formula: 80 + 40 * level²
function xpToNext(level) {
  return 80 + 40 * level * level;
}

// Get actual average XP per fight from database
const winStats = db
  .prepare(
    `SELECT AVG(xpDelta) AS avgXpPerWin, COUNT(*) AS winCount
     FROM arena_fights WHERE result = 'win'`,
  )
  .get();
const lossStats = db
  .prepare(
    `SELECT AVG(xpDelta) AS avgXpPerLoss, COUNT(*) AS lossCount
     FROM arena_fights WHERE result = 'loss'`,
  )
  .get();

const avgXpPerWin = Math.round((winStats.avgXpPerWin || 0) * 100) / 100;
const avgXpPerLoss = Math.round((lossStats.avgXpPerLoss || 0) * 100) / 100;
const totalFights = (winStats.winCount || 0) + (lossStats.lossCount || 0);
const winRate = totalFights > 0 ? (winStats.winCount || 0) / totalFights : 0.5;

// Blended average XP per fight based on actual win rate
const avgXpPerFight = Math.round(
  (avgXpPerWin * winRate + avgXpPerLoss * (1 - winRate)) * 100,
) / 100;

// Also compute at various win-rate assumptions
function estimatedFights(xpNeeded, xpPerWin, xpPerLoss, winRate) {
  const avg = xpPerWin * winRate + xpPerLoss * (1 - winRate);
  return avg > 0 ? Math.ceil(xpNeeded / avg) : 0;
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Generate level table
const maxLevel = 200;
const rows = [];
let cumulativeXp = 0;

for (let level = 1; level <= maxLevel; level++) {
  const needed = xpToNext(level);
  cumulativeXp += needed;

  rows.push({
    level,
    xpToNext: needed,
    cumulativeXp,
    estFights_50pct: estimatedFights(needed, avgXpPerWin, avgXpPerLoss, 0.50),
    estFights_70pct: estimatedFights(needed, avgXpPerWin, avgXpPerLoss, 0.70),
    estFights_90pct: estimatedFights(needed, avgXpPerWin, avgXpPerLoss, 0.90),
    estFights_actualWinRate: estimatedFights(
      needed,
      avgXpPerWin,
      avgXpPerLoss,
      winRate,
    ),
    cumulativeFights_50pct: estimatedFights(
      cumulativeXp,
      avgXpPerWin,
      avgXpPerLoss,
      0.50,
    ),
  });
}

const columns = [
  "level",
  "xpToNext",
  "cumulativeXp",
  "estFights_50pct",
  "estFights_70pct",
  "estFights_90pct",
  "estFights_actualWinRate",
  "cumulativeFights_50pct",
];

const header = columns.map(escapeCsv).join(",");
const body = rows
  .map((row) => columns.map((col) => escapeCsv(row[col])).join(","))
  .join("\n");

// Metadata header rows
const meta = [
  `# Arena Level-Up Statistics`,
  `# Generated: ${new Date().toISOString()}`,
  `# XP formula: 80 + 40 × level²`,
  `# Avg XP per win: ${avgXpPerWin} (from ${winStats.winCount || 0} wins)`,
  `# Avg XP per loss: ${avgXpPerLoss} (from ${lossStats.lossCount || 0} losses)`,
  `# Actual win rate: ${(winRate * 100).toFixed(1)}% (${totalFights} total fights)`,
  `# Blended avg XP/fight: ${avgXpPerFight}`,
  `# Columns:`,
  `#   level              - Player level`,
  `#   xpToNext           - XP needed for next level`,
  `#   cumulativeXp       - Total XP from level 1 to reach this level`,
  `#   estFights_50pct    - Estimated fights at 50% win rate`,
  `#   estFights_70pct    - Estimated fights at 70% win rate`,
  `#   estFights_90pct    - Estimated fights at 90% win rate`,
  `#   estFights_actual   - Estimated fights at actual win rate (${(winRate * 100).toFixed(1)}%)`,
  `#   cumulativeFights   - Total fights from level 1 at 50% win rate`,
  "",
].join("\n");

const filePath = path.join(OUTPUT_DIR, `arena-levels-${timestamp}.csv`);
fs.writeFileSync(filePath, `${meta}${header}\n${body}\n`, "utf-8");

console.log(`Level table (1–${maxLevel}) → ${filePath}`);
console.log(`  Avg XP/win: ${avgXpPerWin} | Avg XP/loss: ${avgXpPerLoss}`);
console.log(`  Actual win rate: ${(winRate * 100).toFixed(1)}% | Blended XP/fight: ${avgXpPerFight}`);

// Quick reference milestones
const milestones = [10, 25, 50, 75, 100, 150, 200];
console.log("\nMilestone reference:");
for (const m of milestones) {
  const r = rows[m - 1];
  console.log(
    `  Lv${String(m).padStart(3)} | XP to next: ${String(r.xpToNext).padStart(7)} | Cumul. XP: ${String(r.cumulativeXp).padStart(12)} | ~${String(r.cumulativeFights_50pct).padStart(5)} fights total (50%)`,
  );
}
