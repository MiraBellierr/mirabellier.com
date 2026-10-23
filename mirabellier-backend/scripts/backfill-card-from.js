/**
 * Backfills / updates the "from" field on existing cardJson entries in the database.
 * Reads the character catalog for each card's malId and sets the first anime appearance name.
 *
 * With --force, overwrites existing from values with the catalog's current title.
 *
 * Usage:  node scripts/backfill-card-from.js
 * Dry run: node scripts/backfill-card-from.js --dry
 * Force:   node scripts/backfill-card-from.js --force
 * Force + dry: node scripts/backfill-card-from.js --force --dry
 */
const path = require("path");
const Database = require("better-sqlite3");
const fs = require("fs");

const DB_FILE =
  process.env.DB_FILE || path.join(__dirname, "..", "database.sqlite3");
const CATALOG_FILE =
  process.env.MAL_CHARACTERS_FILE
    ? path.resolve(__dirname, "..", process.env.MAL_CHARACTERS_FILE)
    : path.resolve(__dirname, "..", "data", "mal-characters.json");

const dryRun = process.argv.includes("--dry");
const force = process.argv.includes("--force");

function buildCatalogMap() {
  const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
  const map = new Map();

  if (!raw || !Array.isArray(raw.characters)) {
    console.error("Catalog has no characters array.");
    process.exit(1);
  }

  for (const entry of raw.characters) {
    const malId = Number(entry.id);
    if (!Number.isFinite(malId) || malId <= 0) continue;
    const firstAnime = ((entry.appearances || [])
      .find((a) => a.type === "anime" && a.name)
      || (entry.appearances || [])[0]
      || {}).name || null;
    if (firstAnime) {
      map.set(malId, firstAnime);
    }
  }

  return map;
}

function main() {
  console.log("Building catalog map...");
  const catalogMap = buildCatalogMap();
  console.log(`Catalog: ${catalogMap.size} characters with appearance data.`);

  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");

  const rows = db.prepare(
    "SELECT id, userId, cardInstanceId, cardJson FROM arena_card_collection",
  ).all();

  let updated = 0;
  let skipped = 0;
  let already = 0;

  const tx = db.transaction(() => {
    for (const row of rows) {
      let card;
      try {
        card = JSON.parse(row.cardJson);
      } catch {
        skipped++;
        continue;
      }

      if (!card || !card.malId) {
        skipped++;
        continue;
      }

      const from = catalogMap.get(Number(card.malId));
      if (!from) {
        skipped++;
        continue;
      }

      if (card.from) {
        if (!force || card.from === from) {
          already++;
          continue;
        }
      }

      card.from = from;

      if (!dryRun) {
        db.prepare(
          "UPDATE arena_card_collection SET cardJson = ?, updatedAt = ? WHERE id = ?",
        ).run(JSON.stringify(card), new Date().toISOString(), row.id);
      }

      updated++;
      if (updated % 100 === 0) {
        console.log(`  ${updated} updated...`);
      }
    }
  });

  tx();

  const tag = dryRun ? "[DRY RUN] " : "";
  console.log(
    `${tag}Collection: ${updated} updated, ${already} already had from, ${skipped} skipped.`,
  );

  function backfillTable(table, idCol, cardCol, whereClause = "") {
    const rows = db.prepare(
      `SELECT ${idCol}, ${cardCol} FROM ${table} WHERE ${cardCol} IS NOT NULL ${whereClause}`,
    ).all();

    let up = 0;
    let sk = 0;
    let al = 0;

    const tx = db.transaction(() => {
      for (const row of rows) {
        let card;
        try {
          card = JSON.parse(row[cardCol]);
        } catch {
          sk++;
          continue;
        }

        if (!card || !card.malId) { sk++; continue; }

        const from = catalogMap.get(Number(card.malId));
        if (!from) { sk++; continue; }

        if (card.from) {
          if (!force || card.from === from) { al++; continue; }
        }

        card.from = from;

        if (!dryRun) {
          db.prepare(
            `UPDATE ${table} SET ${cardCol} = ?, updatedAt = ? WHERE ${idCol} = ?`,
          ).run(JSON.stringify(card), new Date().toISOString(), row[idCol]);
        }

        up++;
      }
    });

    tx();

    console.log(
      `${tag}${table}: ${up} updated, ${al} already had from, ${sk} skipped.`,
    );
  }

  // Also backfill selected cards in arena_profiles
  backfillTable("arena_profiles", "userId", "selectedCardJson");

  // Backfill market listings
  backfillTable("arena_market_listings", "id", "cardJson");

  // Backfill trade listings
  backfillTable("arena_trade_listings", "id", "cardJson");

  // Backfill daily card offers
  backfillTable("arena_daily_card_offers", "offerId", "cardJson");

  db.close();
}

main();
