const { nowIso, makeId, toInt, toPositiveInt, randomInt, CARD_IV_MAX } = require("./utils");
const { normalizeSelectedCard, insertCollectionCard } = require("./cards");
const { ensureArenaProfile, getArenaProfilePayload } = require("./profile");
const { findActiveTradeSessionUsingCard } = require("./trade");
const { ArenaHttpError } = require("./utils");


function mintRainbowCard(db, userId, id1, id2) {
  const card1Id = String(id1 || "").trim();
  const card2Id = String(id2 || "").trim();

  if (!card1Id || !card2Id) {
    throw new ArenaHttpError(400, "Two card instance IDs are required.", "ARENA_MINT_TWO_CARDS_REQUIRED");
  }
  if (card1Id === card2Id) {
    throw new ArenaHttpError(400, "You must select two different cards.", "ARENA_MINT_DUPLICATE_CARD");
  }

  const card1Row = db.prepare(
    "SELECT cardJson FROM arena_card_collection WHERE userId = ? AND cardInstanceId = ? LIMIT 1",
  ).get(userId, card1Id);
  const card2Row = db.prepare(
    "SELECT cardJson FROM arena_card_collection WHERE userId = ? AND cardInstanceId = ? LIMIT 1",
  ).get(userId, card2Id);

  if (!card1Row) {
    throw new ArenaHttpError(404, "First card not found in your collection.", "ARENA_MINT_CARD_NOT_FOUND");
  }
  if (!card2Row) {
    throw new ArenaHttpError(404, "Second card not found in your collection.", "ARENA_MINT_CARD_NOT_FOUND");
  }

  const card1 = normalizeSelectedCard(card1Row.cardJson);
  const card2 = normalizeSelectedCard(card2Row.cardJson);
  if (!card1 || !card2) {
    throw new ArenaHttpError(409, "Stored card data is invalid.", "ARENA_COLLECTION_CARD_INVALID");
  }

  if (card1.malId !== card2.malId) {
    throw new ArenaHttpError(400, "Both cards must be the same character to mint.", "ARENA_MINT_DIFFERENT_CHARACTERS");
  }
  // Check neither card is in an active market listing
  const marketCheck = db.prepare(
    "SELECT id FROM arena_market_listings WHERE cardInstanceId IN (?, ?) AND status = 'active' LIMIT 1",
  ).get(card1Id, card2Id);
  if (marketCheck) {
    throw new ArenaHttpError(409, "A card is currently listed on the market.", "ARENA_MINT_CARD_LISTED");
  }

  // Check neither card is in an active trade listing
  const tradeListingCheck = db.prepare(
    "SELECT id FROM arena_trade_listings WHERE cardInstanceId IN (?, ?) AND status = 'active' LIMIT 1",
  ).get(card1Id, card2Id);
  if (tradeListingCheck) {
    throw new ArenaHttpError(409, "A card is currently in an active trade listing.", "ARENA_MINT_CARD_TRADED");
  }

  // Check neither card is in an active trade session
  if (
    findActiveTradeSessionUsingCard(db, card1Id) ||
    findActiveTradeSessionUsingCard(db, card2Id)
  ) {
    throw new ArenaHttpError(409, "A card is currently in an active trade session.", "ARENA_MINT_CARD_TRADED");
  }

  // Always use the first (left) card's IVs as the base, then randomly distribute 5 bonus points (capped at CARD_IV_MAX)
  const baseIv = {
    power: card1.iv.power,
    guard: card1.iv.guard,
    speed: card1.iv.speed,
    effectHit: card1.iv.effectHit,
  };
  const stats = ["power", "guard", "speed", "effectHit"];
  const mintedIv = { ...baseIv, total: 0 };
  for (let i = 0; i < 5; i++) {
    const eligible = stats.filter((s) => mintedIv[s] < CARD_IV_MAX);
    if (!eligible.length) break;
    const pick = eligible[randomInt(0, eligible.length - 1)];
    mintedIv[pick]++;
  }
  mintedIv.total = mintedIv.power + mintedIv.guard + mintedIv.speed + mintedIv.effectHit;

  const now = nowIso();
  const newCard = {
    ...card1,
    cardInstanceId: makeId("card"),
    iv: mintedIv,
    rainbow: true,
    title: card1.title.replace(/\s*\(rainbow\)\s*$/, "") + " (rainbow)",
    drawnAt: now,
  };

  // Delete input cards from collection
  db.prepare(
    "DELETE FROM arena_card_collection WHERE userId = ? AND cardInstanceId IN (?, ?)",
  ).run(userId, card1Id, card2Id);

  // If the selected card was one of the consumed cards, reset selection
  const profile = db.prepare("SELECT selectedCardJson FROM arena_profiles WHERE userId = ?").get(userId);
  if (profile) {
    const selected = normalizeSelectedCard(profile.selectedCardJson);
    if (selected && (selected.cardInstanceId === card1Id || selected.cardInstanceId === card2Id)) {
      db.prepare("UPDATE arena_profiles SET selectedCardJson = NULL, updatedAt = ? WHERE userId = ?").run(now, userId);
    }
  }

  // Insert the minted card
  insertCollectionCard(db, userId, newCard);

  return {
    card: newCard,
    profile: getArenaProfilePayload(db, userId),
  };
}

function getMintDuplicates(db, userId) {
  const dupRows = db.prepare(`
    SELECT CAST(json_extract(cardJson, '$.malId') AS INTEGER) AS malId, COUNT(*) AS cnt
    FROM arena_card_collection
    WHERE userId = ?
    GROUP BY malId
    HAVING cnt >= 2
    ORDER BY cnt DESC
  `).all(userId);

  if (!dupRows.length) return [];

  const malIds = dupRows.map(r => r.malId);
  const placeholders = malIds.map(() => "?").join(",");

  const cardRows = db.prepare(`
    SELECT cardJson
    FROM arena_card_collection
    WHERE userId = ? AND CAST(json_extract(cardJson, '$.malId') AS INTEGER) IN (${placeholders})
    ORDER BY CAST(json_extract(cardJson, '$.malId') AS INTEGER) DESC, createdAt DESC
  `).all(userId, ...malIds);

  const groups = new Map();
  for (const row of cardRows) {
    const card = JSON.parse(row.cardJson);
    const list = groups.get(card.malId);
    if (list) {
      list.push(card);
    } else {
      groups.set(card.malId, [card]);
    }
  }

  return Array.from(groups.entries()).map(([malId, cards]) => ({
    malId,
    cards,
    total: cards.length,
  }));
}

module.exports = {
  mintRainbowCard,
  getMintDuplicates,
};
