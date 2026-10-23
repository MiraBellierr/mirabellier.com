/**
 * Migrates old card JSON: renames iv.luck → iv.effectHit.
 * Recalculates iv.total after the rename.
 *
 * Usage:  node scripts/migrate-cards-effectHit.js
 * Dry run: node scripts/migrate-cards-effectHit.js --dry
 */
const path = require("path");
const Database = require("better-sqlite3");

const DB_FILE =
  process.env.DB_FILE || path.join(__dirname, "..", "database.sqlite3");

const dryRun = process.argv.includes("--dry");

function migrateCardIv(card) {
  if (!card || !card.iv || typeof card.iv !== "object") return false;

  const iv = card.iv;

  // Already migrated — no luck field present
  if (!("luck" in iv)) return false;

  // Rename iv.luck → iv.effectHit, preserving the value
  iv.effectHit = iv.luck;
  delete iv.luck;

  // Delete any leftover legacy field in stored cards that predates this migration
  // total is always recalculated below so we can discard any stale value.
  iv.total = (iv.power || 0) + (iv.guard || 0) + (iv.speed || 0) + (iv.effectHit || 0);

  return true;
}

function migrateTable(db, table, idCol, cardCol, whereClause = "") {
  const rows = db
    .prepare(
      `SELECT ${idCol}, ${cardCol} FROM ${table} WHERE ${cardCol} IS NOT NULL ${whereClause}`,
    )
    .all();

  let updated = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    for (const row of rows) {
      let card;
      try {
        card = JSON.parse(row[cardCol]);
      } catch {
        skipped++;
        continue;
      }

      const changed = migrateCardIv(card);
      if (!changed) {
        skipped++;
        continue;
      }

      if (!dryRun) {
        db.prepare(
          `UPDATE ${table} SET ${cardCol} = ?, updatedAt = ? WHERE ${idCol} = ?`,
        ).run(JSON.stringify(card), new Date().toISOString(), row[idCol]);
      }

      updated++;
      if (updated % 100 === 0) {
        console.log(`  ${table}: ${updated} updated...`);
      }
    }
  });

  tx();

  const tag = dryRun ? "[DRY RUN] " : "";
  console.log(
    `${tag}${table}: ${updated} migrated, ${skipped} skipped.`,
  );
}

function main() {
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");

  console.log("Migrating card iv.luck → iv.effectHit...\n");

  migrateTable(db, "arena_card_collection", "id", "cardJson");
  migrateTable(db, "arena_market_listings", "id", "cardJson");
  migrateTable(db, "arena_trade_listings", "id", "cardJson");
  migrateTable(db, "arena_profiles", "userId", "selectedCardJson");
  migrateTable(db, "arena_daily_card_offers", "offerId", "cardJson");

  db.close();

  if (dryRun) {
    console.log("\nThis was a dry run. Run without --dry to apply changes.");
  } else {
    console.log("\nDone.");
  }
}

main();
