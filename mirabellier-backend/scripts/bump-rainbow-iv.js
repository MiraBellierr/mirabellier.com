/**
 * Adds 2 more IV points to all existing rainbow cards (previously minted with +3).
 * Now that minting gives +5, this retroactively brings old rainbows up to parity.
 *
 * Usage:  node scripts/bump-rainbow-iv.js
 * Dry run: node scripts/bump-rainbow-iv.js --dry
 */
const path = require("path");
const Database = require("better-sqlite3");

const DB_FILE =
  process.env.DB_FILE || path.join(__dirname, "..", "database.sqlite3");

const CARD_IV_MAX = 31;
const BONUS_POINTS = 2;
const STATS = ["power", "guard", "speed", "effectHit"];

const dryRun = process.argv.includes("--dry");

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addIvPoints(iv) {
  const result = {
    power: iv.power || 0,
    guard: iv.guard || 0,
    speed: iv.speed || 0,
    effectHit: iv.effectHit || 0,
  };

  for (let i = 0; i < BONUS_POINTS; i++) {
    const eligible = STATS.filter((s) => result[s] < CARD_IV_MAX);
    if (!eligible.length) break;
    const pick = eligible[randomInt(0, eligible.length - 1)];
    result[pick]++;
  }

  result.total = result.power + result.guard + result.speed + result.effectHit;
  return result;
}

function bumpTable(db, table, idCol, cardCol, whereClause = "") {
  const rows = db.prepare(
    `SELECT ${idCol}, ${cardCol} FROM ${table} WHERE ${cardCol} IS NOT NULL ${whereClause}`,
  ).all();

  let updated = 0;
  let skipped = 0;
  let already = 0;

  const tx = db.transaction(() => {
    for (const row of rows) {
      let card;
      try {
        card = JSON.parse(row[cardCol]);
      } catch {
        skipped++;
        continue;
      }

      if (!card || !card.rainbow) {
        skipped++;
        continue;
      }

      if (!card.iv || typeof card.iv !== "object") {
        skipped++;
        continue;
      }

      const newIv = addIvPoints(card.iv);

      // Only bump if something actually changed (all stats might be at cap)
      if (
        newIv.power === (card.iv.power || 0) &&
        newIv.guard === (card.iv.guard || 0) &&
        newIv.speed === (card.iv.speed || 0) &&
        newIv.effectHit === (card.iv.effectHit || 0)
      ) {
        already++;
        continue;
      }

      card.iv = newIv;

      if (!dryRun) {
        db.prepare(
          `UPDATE ${table} SET ${cardCol} = ?, updatedAt = ? WHERE ${idCol} = ?`,
        ).run(JSON.stringify(card), new Date().toISOString(), row[idCol]);
      }

      updated++;
      if (updated % 50 === 0) {
        console.log(`  ${table}: ${updated} updated...`);
      }
    }
  });

  tx();

  const tag = dryRun ? "[DRY RUN] " : "";
  if (whereClause) {
    console.log(
      `${tag}${table} (rainbow): ${updated} bumped, ${already} at cap, ${skipped} skipped.`,
    );
  } else {
    console.log(
      `${tag}${table}: ${updated} bumped, ${already} at cap, ${skipped} skipped.`,
    );
  }
}

function main() {
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");

  // arena_card_collection — only rainbow cards
  bumpTable(
    db,
    "arena_card_collection",
    "id",
    "cardJson",
    "AND json_extract(cardJson, '$.rainbow') = 1",
  );

  // arena_market_listings — rainbow cards
  bumpTable(
    db,
    "arena_market_listings",
    "id",
    "cardJson",
    "AND json_extract(cardJson, '$.rainbow') = 1",
  );

  // arena_trade_listings — rainbow cards
  bumpTable(
    db,
    "arena_trade_listings",
    "id",
    "cardJson",
    "AND json_extract(cardJson, '$.rainbow') = 1",
  );

  // arena_profiles — selectedCardJson
  bumpTable(
    db,
    "arena_profiles",
    "userId",
    "selectedCardJson",
    "AND json_extract(selectedCardJson, '$.rainbow') = 1",
  );

  // arena_daily_card_offers — rainbow cards
  bumpTable(
    db,
    "arena_daily_card_offers",
    "offerId",
    "cardJson",
    "AND json_extract(cardJson, '$.rainbow') = 1",
  );

  db.close();

  if (dryRun) {
    console.log("\nThis was a dry run. Run without --dry to apply changes.");
  } else {
    console.log("\nDone. All rainbow cards bumped +2 IV.");
  }
}

main();
