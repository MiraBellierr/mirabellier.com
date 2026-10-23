/**
 * Removes "Hitler, Adolf" completely from the site:
 * 1. Removes the character from mal-characters.json
 * 2. Deletes all cards with that title from all DB tables
 *
 * Usage:  node scripts/remove-hitler.js
 * Dry run: node scripts/remove-hitler.js --dry
 */
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_FILE =
  process.env.DB_FILE || path.join(__dirname, "..", "database.sqlite3");
const CATALOG_FILE =
  process.env.MAL_CHARACTERS_FILE
    ? path.resolve(__dirname, "..", process.env.MAL_CHARACTERS_FILE)
    : path.resolve(__dirname, "..", "data", "mal-characters.json");

const TARGET_NAME = "Hitler, Adolf";
const CENSORED_NAME = "A.H.";
const dryRun = process.argv.includes("--dry");
const backupCatalog = !dryRun;

function main() {
  const tag = dryRun ? "[DRY RUN] " : "";

  // ---- Step 1: Remove from mal-characters.json ----
  console.log(`${tag}Removing from catalog: "${TARGET_NAME}"`);

  const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
  if (!raw || !Array.isArray(raw.characters)) {
    console.error("Catalog has no characters array.");
    process.exit(1);
  }

  const beforeCount = raw.characters.length;
  const removedIds = [];
  raw.characters = raw.characters.filter((entry) => {
    if (entry.name === TARGET_NAME || entry.name === CENSORED_NAME) {
      removedIds.push(Number(entry.id));
      return false;
    }
    return true;
  });

  const catalogRemoved = beforeCount - raw.characters.length;
  console.log(`${tag}  Removed ${catalogRemoved} character(s) from catalog.`);

  if (!dryRun && catalogRemoved > 0) {
    if (backupCatalog) {
      const backupPath = CATALOG_FILE + ".bak." + Date.now();
      fs.copyFileSync(CATALOG_FILE, backupPath);
      console.log(`  Backup saved: ${backupPath}`);
    }
    raw.generatedAt = new Date().toISOString();
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(raw, null, 2), "utf8");
  }

  // ---- Step 2: Remove from database ----
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");

  const COMPENSATION = 10000;

  const tables = [
    { table: "arena_card_collection", keyCol: "id", cardCol: "cardJson", ownerCol: "userId" },
    { table: "arena_profiles", keyCol: "userId", cardCol: "selectedCardJson", ownerCol: "userId" },
    { table: "arena_market_listings", keyCol: "id", cardCol: "cardJson", ownerCol: "sellerUserId" },
    { table: "arena_trade_listings", keyCol: "id", cardCol: "cardJson", ownerCol: "userId" },
    { table: "arena_daily_card_offers", keyCol: "offerId", cardCol: "cardJson", ownerCol: null },
  ];

  let totalRemoved = 0;
  let totalCompensated = 0;
  const compensatedUsers = new Map(); // userId → count

  for (const { table, keyCol, cardCol, ownerCol } of tables) {
    const selectCols = ownerCol
      ? `${keyCol}, ${cardCol}, ${ownerCol}`
      : `${keyCol}, ${cardCol}`;
    const rows = db.prepare(
      `SELECT ${selectCols} FROM ${table} WHERE ${cardCol} IS NOT NULL`,
    ).all();

    const toDelete = [];

    for (const row of rows) {
      let card;
      try { card = JSON.parse(row[cardCol]); } catch { continue; }
      if (!card) continue;

      if (
        card.title === TARGET_NAME ||
        card.title === CENSORED_NAME ||
        (removedIds.length > 0 && removedIds.includes(Number(card.malId)))
      ) {
        toDelete.push({
          key: row[keyCol],
          title: card.title,
          malId: card.malId,
          ownerId: ownerCol ? row[ownerCol] : null,
        });
      }
    }

    if (toDelete.length > 0) {
      const tx = db.transaction(() => {
        for (const entry of toDelete) {
          if (!dryRun) {
            if (table === "arena_profiles") {
              // Nullify selected card instead of deleting the profile row
              db.prepare(
                `UPDATE arena_profiles SET selectedCardJson = NULL, updatedAt = ? WHERE userId = ?`,
              ).run(new Date().toISOString(), entry.key);
            } else {
              db.prepare(
                `DELETE FROM ${table} WHERE ${keyCol} = ?`,
              ).run(entry.key);
            }

            // Compensate owner
            if (entry.ownerId) {
              const current = compensatedUsers.get(entry.ownerId) || 0;
              compensatedUsers.set(entry.ownerId, current + 1);
              db.prepare(
                `UPDATE arena_profiles SET coins = coins + ?, updatedAt = ? WHERE userId = ?`,
              ).run(COMPENSATION, new Date().toISOString(), entry.ownerId);
            }
          }
          console.log(`  ${tag}${table}: ${entry.title} (malId=${entry.malId}) +${COMPENSATION} coins`);
        }
      });
      tx();
      totalRemoved += toDelete.length;
    }
  }

  totalCompensated = [...compensatedUsers.values()].reduce((s, n) => s + n, 0);

  console.log(`${tag}Done. ${catalogRemoved} from catalog, ${totalRemoved} from database.`);
  if (totalCompensated > 0) {
    const totalCoins = totalCompensated * COMPENSATION;
    console.log(`  Compensated ${compensatedUsers.size} user(s) with ${totalCoins.toLocaleString()} coins (${COMPENSATION} per card).`);
  }

  db.close();
}

main();
