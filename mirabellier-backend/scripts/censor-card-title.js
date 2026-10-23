/**
 * Censors a card title across all tables storing card JSON.
 * Replaces "Adolf Hitler" (case-insensitive) with "A.H." in the title field.
 *
 * Usage:  node scripts/censor-card-title.js
 * Dry run: node scripts/censor-card-title.js --dry
 */
const path = require("path");
const Database = require("better-sqlite3");

const DB_FILE =
  process.env.DB_FILE || path.join(__dirname, "..", "database.sqlite3");

const TARGET_PATTERN = /hitler,\s*adolf/i;
const REPLACEMENT = "A.H.";

const dryRun = process.argv.includes("--dry");

function censorTitle(title) {
  if (typeof title !== "string") return title;
  return title.replace(TARGET_PATTERN, REPLACEMENT);
}

function censorTable(db, table, idCol, cardCol, whereClause = "") {
  const rows = db.prepare(
    `SELECT ${idCol}, ${cardCol} FROM ${table} WHERE ${cardCol} IS NOT NULL ${whereClause}`,
  ).all();

  let updated = 0;

  const tx = db.transaction(() => {
    for (const row of rows) {
      let card;
      try {
        card = JSON.parse(row[cardCol]);
      } catch {
        continue;
      }

      if (!card || typeof card.title !== "string") continue;
      if (!TARGET_PATTERN.test(card.title)) continue;

      const oldTitle = card.title;
      card.title = censorTitle(card.title);

      if (!dryRun) {
        db.prepare(
          `UPDATE ${table} SET ${cardCol} = ?, updatedAt = ? WHERE ${idCol} = ?`,
        ).run(JSON.stringify(card), new Date().toISOString(), row[idCol]);
      }

      updated++;
      console.log(`  ${oldTitle} → ${card.title}  [${table}]`);
    }
  });

  tx();

  return updated;
}

function main() {
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");

  const tag = dryRun ? "[DRY RUN] " : "";
  console.log(`${tag}Censoring "${TARGET_PATTERN}" → "${REPLACEMENT}"`);

  let total = 0;

  total += censorTable(db, "arena_card_collection", "id", "cardJson");
  total += censorTable(db, "arena_profiles", "userId", "selectedCardJson");
  total += censorTable(db, "arena_market_listings", "id", "cardJson");
  total += censorTable(db, "arena_trade_listings", "id", "cardJson");
  total += censorTable(db, "arena_daily_card_offers", "offerId", "cardJson");

  console.log(`${tag}Done. ${total} card(s) censored.`);

  db.close();
}

main();
