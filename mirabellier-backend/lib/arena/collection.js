const { nowIso, makeId, clamp, toInt, toPositiveInt } = require("./utils");
const {
  normalizeSelectedCard, serializeSelectedCard,
  calculateCardSacrificePayout, getCardAffinityMap, getCardAffinity,
  attachCardAffinity, countCollectionCards, readCollectionCards,
  insertCollectionCard, buildAffinitySummary, getAffinityStatBonus,
} = require("./cards");
const { ensureArenaProfile, getArenaProfilePayload } = require("./profile");
const { ArenaHttpError } = require("./utils");
// findActiveTradeSessionUsingCard is lazy-required inside getCardSacrificeBlockReason to avoid circular dep


function getArenaCollectionPayload(db, userId, options = {}) {
  const page = Math.max(toPositiveInt(options.page, 1), 1);
  const perPage = clamp(toPositiveInt(options.perPage, 24), 1, 100);
  const offset = (page - 1) * perPage;
  const rawSort = String(options.sort || "").trim();
  // Single-column and combined (comma-separated) sorts are both valid.
  // Each token must be a known sort key.
  const VALID_SORT_TOKENS = ["recent", "rarity-desc", "rarity-asc", "iv-desc", "iv-asc", "RH", "RL", "IH", "IL", "affinity-desc", "affinity-asc", "power-desc", "guard-desc", "speed-desc", "effectHit-desc"];
  const sortTokens = rawSort.split(",").map(s => s.trim()).filter(Boolean);
  const sort = sortTokens.every(t => VALID_SORT_TOKENS.includes(t)) ? rawSort : "recent";
  const search = String(options.search || "").trim();
  const element = String(options.element || "").trim();
  const duplicates = options.duplicates === true || options.duplicates === "true" || options.duplicates === "1";

  const total = countCollectionCards(db, userId, search, element, {}, duplicates);
  const totalPages = Math.max(Math.ceil(total / perPage), 1);
  const cards = readCollectionCards(db, userId, { limit: perPage, offset, sort, search, element, duplicates });
  const affinityMap = getCardAffinityMap(db, userId, cards.map((card) => card.malId));
  const cardsWithAffinity = cards.map((card) =>
    attachCardAffinity(card, affinityMap.get(card.malId)),
  );

  return {
    profile: getArenaProfilePayload(db, userId),
    cards: cardsWithAffinity,
    page,
    perPage,
    totalPages,
    total,
    sort,
    search: search || undefined,
    element: element || undefined,
  };
}

function selectCollectionCard(db, userId, cardInstanceId) {
  const normalizedCardInstanceId = String(cardInstanceId || "").trim();
  if (!normalizedCardInstanceId) {
    throw new ArenaHttpError(
      400,
      "cardInstanceId is required.",
      "ARENA_CARD_INSTANCE_REQUIRED",
    );
  }

  ensureArenaProfile(db, userId);
  const row = db
    .prepare(
      `SELECT cardJson
       FROM arena_card_collection
       WHERE userId = ? AND cardInstanceId = ?
       LIMIT 1`,
    )
    .get(userId, normalizedCardInstanceId);

  if (!row) {
    throw new ArenaHttpError(
      404,
      "Card not found in your collection.",
      "ARENA_COLLECTION_CARD_NOT_FOUND",
    );
  }

  const selectedCard = normalizeSelectedCard(row.cardJson);
  if (!selectedCard) {
    throw new ArenaHttpError(
      409,
      "Stored card data is invalid.",
      "ARENA_COLLECTION_CARD_INVALID",
    );
  }

  db.prepare(
    `UPDATE arena_profiles
     SET selectedCardJson = ?, updatedAt = ?
     WHERE userId = ?`,
  ).run(serializeSelectedCard(selectedCard), nowIso(), userId);

  return {
    selectedCard,
    profile: getArenaProfilePayload(db, userId),
  };
}

function toggleCollectionCardFavorite(db, userId, cardInstanceId) {
  const normalizedId = String(cardInstanceId || "").trim();
  if (!normalizedId) {
    throw new ArenaHttpError(400, "cardInstanceId is required.", "ARENA_CARD_INSTANCE_REQUIRED");
  }

  const row = db
    .prepare(
      "SELECT isFavorite FROM arena_card_collection WHERE userId = ? AND cardInstanceId = ?",
    )
    .get(userId, normalizedId);

  if (!row) {
    throw new ArenaHttpError(404, "Card not found in collection.", "ARENA_CARD_NOT_FOUND");
  }

  const newValue = row.isFavorite ? 0 : 1;
  db.prepare(
    "UPDATE arena_card_collection SET isFavorite = ?, updatedAt = ? WHERE userId = ? AND cardInstanceId = ?",
  ).run(newValue, nowIso(), userId, normalizedId);

  return { cardInstanceId: normalizedId, isFavorite: !!newValue };
}

function getCardSacrificeBlockReason(db, userId, cardInstanceId, cardRow, selectedCard) {
  if (!cardRow) return "not_found";
  if (cardRow.isFavorite) return "favorite";
  if (selectedCard?.cardInstanceId === cardInstanceId) return "selected";

  const marketListing = db
    .prepare(
      `SELECT id
       FROM arena_market_listings
       WHERE cardInstanceId = ? AND status = 'active'
       LIMIT 1`,
    )
    .get(cardInstanceId);
  if (marketListing) return "market_listed";

  const tradeListing = db
    .prepare(
      `SELECT id
       FROM arena_trade_listings
       WHERE cardInstanceId = ? AND status = 'active'
       LIMIT 1`,
    )
    .get(cardInstanceId);
  if (tradeListing) return "trade_listed";

  // Lazy require to avoid circular dep with trade.js
  const { findActiveTradeSessionUsingCard } = require("./trade");
  if (findActiveTradeSessionUsingCard(db, cardInstanceId)) return "trade_session";

  const card = normalizeSelectedCard(cardRow.cardJson);
  if (!card) return "invalid";
  if (cardRow.userId && cardRow.userId !== userId) return "not_found";
  return null;
}

function buildCardSacrificePreview(db, userId, cardInstanceIds) {
  const ids = Array.isArray(cardInstanceIds)
    ? cardInstanceIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (ids.length === 0) {
    throw new ArenaHttpError(
      400,
      "At least one cardInstanceId is required.",
      "ARENA_SACRIFICE_CARD_REQUIRED",
    );
  }

  const seen = new Set();
  const duplicateIds = [];
  ids.forEach((id) => {
    if (seen.has(id)) duplicateIds.push(id);
    seen.add(id);
  });
  if (duplicateIds.length > 0) {
    throw new ArenaHttpError(
      400,
      "Duplicate card IDs cannot be sacrificed in the same request.",
      "ARENA_SACRIFICE_DUPLICATE_CARD",
      { duplicateIds: [...new Set(duplicateIds)] },
    );
  }

  const profile = ensureArenaProfile(db, userId);
  const selectedCard = normalizeSelectedCard(profile.selectedCard);
  const items = ids.map((cardInstanceId) => {
    const row = db
      .prepare(
        `SELECT userId, cardJson, isFavorite
         FROM arena_card_collection
         WHERE userId = ? AND cardInstanceId = ?
         LIMIT 1`,
      )
      .get(userId, cardInstanceId);
    const card = row ? normalizeSelectedCard(row.cardJson) : null;
    const blockedReason = getCardSacrificeBlockReason(db, userId, cardInstanceId, row, selectedCard);
    const coins = blockedReason || !card ? 0 : calculateCardSacrificePayout(card);
    return {
      cardInstanceId,
      card,
      coins,
      blockedReason,
      canSacrifice: !blockedReason,
    };
  });

  const blocked = items.filter((item) => item.blockedReason);
  const totalCoins = items.reduce((sum, item) => sum + item.coins, 0);
  return {
    items,
    blocked,
    totalCoins,
    canSacrifice: blocked.length === 0,
  };
}

function sacrificeCollectionCards(db, userId, input = {}) {
  const preview = buildCardSacrificePreview(db, userId, input.cardInstanceIds);
  const confirmed = input.confirm === true;

  if (!confirmed) {
    return {
      sacrificedCardInstanceIds: [],
      coinsGained: 0,
      preview,
      profile: getArenaProfilePayload(db, userId),
      collectionTotal: countCollectionCards(db, userId),
    };
  }

  if (!preview.canSacrifice) {
    throw new ArenaHttpError(
      409,
      "One or more cards cannot be sacrificed.",
      "ARENA_SACRIFICE_BLOCKED",
      { preview },
    );
  }

  const ids = preview.items.map((item) => item.cardInstanceId);
  const totalCoins = preview.totalCoins;
  const tx = db.transaction(() => {
    const current = ensureArenaProfile(db, userId);
    const now = nowIso();
    ids.forEach((cardInstanceId) => {
      const removed = db
        .prepare(
          `DELETE FROM arena_card_collection
           WHERE userId = ? AND cardInstanceId = ?`,
        )
        .run(userId, cardInstanceId);
      if (removed.changes !== 1) {
        throw new ArenaHttpError(
          409,
          "A card could not be sacrificed. Please refresh and try again.",
          "ARENA_SACRIFICE_DELETE_FAILED",
        );
      }
    });
    db.prepare(
      `UPDATE arena_profiles
       SET coins = ?, lifetimeCoinsEarned = ?, updatedAt = ?
       WHERE userId = ?`,
    ).run(
      current.coins + totalCoins,
      current.lifetimeCoinsEarned + totalCoins,
      now,
      userId,
    );
  });

  tx();
  return {
    sacrificedCardInstanceIds: ids,
    coinsGained: totalCoins,
    preview,
    profile: getArenaProfilePayload(db, userId),
    collectionTotal: countCollectionCards(db, userId),
  };
}

module.exports = {
  getArenaCollectionPayload,
  selectCollectionCard,
  toggleCollectionCardFavorite,
  getCardSacrificeBlockReason,
  buildCardSacrificePreview,
  sacrificeCollectionCards,
};
