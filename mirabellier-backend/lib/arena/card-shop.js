const {
  DAILY_CARD_DRAW_LIMIT,
} = require("../arena-constants");
const { drawArenaCard, ensureArenaCardPool } = require("../arena-characters");
const {
  nowIso, makeId, toInt, toPositiveInt,
  getCurrentRecordedDate, addDaysToRecordedDate,
  getCardShopPrice, isRandomCardOfferAvailable,
  getNextCardDrawAt,
  CARD_SHOP_DAILY_OFFER_COUNT, CARD_SHOP_PRICES,
  CARD_SHOP_RANDOM_PRICE, CARD_SHOP_GENERATION_ATTEMPTS,
} = require("./utils");
const { normalizeSelectedCard, createDrawnCard, createPurchasedCard, insertCollectionCard } = require("./cards");
const { ensureArenaProfile, getArenaProfilePayload, getDailyCardDrawsUsed } = require("./profile");
const { ArenaHttpError } = require("./utils");

const DEFAULT_PACK_SIZE = 5;

async function drawDailyCard(db, userId) {
  await ensureArenaCardPool(db);
  const malCard = await drawArenaCard(db);
  const drawnCard = createDrawnCard(malCard);
  const today = getCurrentRecordedDate();
  const tx = db.transaction(() => {
    const profile = ensureArenaProfile(db, userId);
    const drawsUsedToday = getDailyCardDrawsUsed(profile, today);

    if (drawsUsedToday >= DAILY_CARD_DRAW_LIMIT) {
      throw new ArenaHttpError(
        409,
        `You can only draw ${DAILY_CARD_DRAW_LIMIT} cards per day.`,
        "ARENA_DAILY_DRAW_LIMIT",
        { nextDrawAt: getNextCardDrawAt(profile.lastCardDrawDate) },
      );
    }

    const nextDrawCount = profile.lastCardDrawDate === today ? drawsUsedToday + 1 : 1;

    db.prepare(
      `UPDATE arena_profiles
       SET lastCardDrawDate = ?, dailyCardDrawCount = ?, updatedAt = ?
       WHERE userId = ?`,
    ).run(today, nextDrawCount, nowIso(), userId);

    insertCollectionCard(db, userId, drawnCard);
  });

  tx();
  return {
    card: drawnCard,
    profile: getArenaProfilePayload(db, userId),
  };
}

async function drawArenaPack(db, userId, count = DEFAULT_PACK_SIZE) {
  const drawCount = Math.max(1, Math.min(count, DAILY_CARD_DRAW_LIMIT));
  await ensureArenaCardPool(db);
  const today = getCurrentRecordedDate();

  const malCards = [];
  for (let i = 0; i < drawCount; i++) {
    malCards.push(await drawArenaCard(db));
  }

  const drawnCards = malCards.map((mal) => createDrawnCard(mal));

  let pulled = [];
  const tx = db.transaction(() => {
    const profile = ensureArenaProfile(db, userId);
    const drawsUsedToday = getDailyCardDrawsUsed(profile, today);
    const remaining = DAILY_CARD_DRAW_LIMIT - drawsUsedToday;

    if (remaining <= 0) {
      throw new ArenaHttpError(
        409,
        `You can only draw ${DAILY_CARD_DRAW_LIMIT} cards per day.`,
        "ARENA_DAILY_DRAW_LIMIT",
        { nextDrawAt: getNextCardDrawAt(profile.lastCardDrawDate) },
      );
    }

    const actualCount = Math.min(drawnCards.length, remaining);
    pulled = drawnCards.slice(0, actualCount);

    const nextDrawCount = profile.lastCardDrawDate === today
      ? drawsUsedToday + actualCount
      : actualCount;

    db.prepare(
      `UPDATE arena_profiles
       SET lastCardDrawDate = ?, dailyCardDrawCount = ?, updatedAt = ?
       WHERE userId = ?`,
    ).run(today, nextDrawCount, nowIso(), userId);

    for (const card of pulled) {
      insertCollectionCard(db, userId, card);
    }
  });

  tx();
  const cardsWithOwned = pulled.map((card) => {
    const ownedCount = Number(
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM arena_card_collection
           WHERE userId = ?
             AND json_extract(cardJson, '$.malId') = ?`,
        )
        .get(userId, card.malId).count || 0,
    );
    return { ...card, ownedCount };
  });
  return {
    cards: cardsWithOwned,
    profile: getArenaProfilePayload(db, userId),
  };
}

function readDailyCardShopOffers(db, userId, offerDate) {
  return db
    .prepare(
      `SELECT offerId, offerDate, slot, malId, cardJson, createdAt
       FROM arena_daily_card_offers
       WHERE userId = ? AND offerDate = ?
       ORDER BY slot ASC`,
    )
    .all(userId, offerDate)
    .map((row) => ({
      offerId: row.offerId,
      offerDate: row.offerDate,
      slot: toPositiveInt(row.slot, 0),
      malId: toPositiveInt(row.malId, 0),
      card: normalizeSelectedCard(row.cardJson),
      createdAt: row.createdAt,
    }))
    .filter((offer) => offer.card);
}

async function ensureDailyCardShopOffers(
  db,
  userId,
  offerDate = getCurrentRecordedDate(),
  options = {},
) {
  await ensureArenaCardPool(db);
  const excludedMalIds = new Set(
    Array.isArray(options.excludedMalIds)
      ? options.excludedMalIds.map((id) => toPositiveInt(id, 0)).filter(Boolean)
      : [],
  );
  const drawCard =
    typeof options.drawCard === "function" ? options.drawCard : drawArenaCard;

  for (
    let attempt = 0;
    attempt < CARD_SHOP_GENERATION_ATTEMPTS;
    attempt += 1
  ) {
    const offers = readDailyCardShopOffers(db, userId, offerDate);
    if (offers.length >= CARD_SHOP_DAILY_OFFER_COUNT) {
      return offers.slice(0, CARD_SHOP_DAILY_OFFER_COUNT);
    }

    const usedMalIds = new Set([
      ...offers.map((offer) => offer.malId),
      ...excludedMalIds,
    ]);
    const usedSlots = new Set(offers.map((offer) => offer.slot));
    const slot = Array.from(
      { length: CARD_SHOP_DAILY_OFFER_COUNT },
      (_, index) => index,
    ).find((candidate) => !usedSlots.has(candidate));
    if (slot === undefined) break;

    const malCard = await drawCard(db);
    const malId = toPositiveInt(malCard?.malId, 0);
    if (!malId || usedMalIds.has(malId)) continue;

    const card = createDrawnCard(malCard);
    const now = nowIso();
    db.prepare(
      `INSERT OR IGNORE INTO arena_daily_card_offers (
        offerId, userId, offerDate, slot, malId, cardJson, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `card-offer-${offerDate}-${userId}-${slot}-${malId}`,
      userId,
      offerDate,
      slot,
      malId,
      JSON.stringify(card),
      now,
      now,
    );
  }

  const offers = readDailyCardShopOffers(db, userId, offerDate);
  if (offers.length < CARD_SHOP_DAILY_OFFER_COUNT) {
    throw new ArenaHttpError(
      503,
      "Daily card offers could not be prepared. Please try again shortly.",
      "ARENA_CARD_SHOP_UNAVAILABLE",
    );
  }
  return offers.slice(0, CARD_SHOP_DAILY_OFFER_COUNT);
}

function buildArenaCardShopPayload(db, userId, offerDate, forceRandomPack = false) {
  const profile = ensureArenaProfile(db, userId);
  const offers = readDailyCardShopOffers(db, userId, offerDate).slice(
    0,
    CARD_SHOP_DAILY_OFFER_COUNT,
  );
  const soldOfferIds = new Set(
    db
      .prepare(
        `SELECT DISTINCT offerId
         FROM arena_daily_card_purchases
         WHERE offerDate = ?`,
      )
      .all(offerDate)
      .map((row) => row.offerId),
  );

  return {
    offerDate,
    nextRefreshAt: `${addDaysToRecordedDate(offerDate, 1)}T00:00:00.000Z`,
    prices: CARD_SHOP_PRICES,
    profile: getArenaProfilePayload(db, userId),
    dailyOffers: offers.map((offer) => {
      const sold = soldOfferIds.has(offer.offerId);
      const price = getCardShopPrice(offer.card.rarity);
      const ownedCount = Number(
        db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM arena_card_collection
             WHERE userId = ?
               AND json_extract(cardJson, '$.malId') = ?`,
          )
          .get(userId, offer.card.malId).count || 0,
      );
      return {
        offerId: offer.offerId,
        card: offer.card,
        price,
        sold,
        canBuy: !sold && profile.coins >= price,
        ownedCount,
      };
    }),
    randomOffer: forceRandomPack || isRandomCardOfferAvailable(offerDate)
      ? {
          offerId: "random-card",
          price: CARD_SHOP_RANDOM_PRICE,
          canBuy: profile.coins >= CARD_SHOP_RANDOM_PRICE,
          endsAt: `${addDaysToRecordedDate(offerDate, 1)}T00:00:00.000Z`,
        }
      : null,
  };
}

async function getArenaCardShopPayload(db, userId, options = {}) {
  const offerDate =
    typeof options.recordedDate === "string" && options.recordedDate
      ? options.recordedDate
      : getCurrentRecordedDate();
  await ensureDailyCardShopOffers(db, userId, offerDate, {
    drawCard: options.drawCard,
  });
  return buildArenaCardShopPayload(db, userId, offerDate, options.forceRandomPack);
}

async function rerollArenaCardShopOffers(db, options = {}) {
  const offerDate =
    typeof options.recordedDate === "string" && options.recordedDate
      ? options.recordedDate
      : getCurrentRecordedDate();
  const clearOffers = db.transaction(() => {
    const deletedPurchases = db
      .prepare("DELETE FROM arena_daily_card_purchases WHERE offerDate = ?")
      .run(offerDate).changes;
    const deletedOffers = db
      .prepare("DELETE FROM arena_daily_card_offers WHERE offerDate = ?")
      .run(offerDate).changes;
    return { deletedOffers, deletedPurchases };
  });

  const deleted = clearOffers();

  return {
    offerDate,
    nextRefreshAt: `${addDaysToRecordedDate(offerDate, 1)}T00:00:00.000Z`,
    rerolledAt: nowIso(),
    deletedOffers: deleted.deletedOffers,
    deletedPurchases: deleted.deletedPurchases,
    dailyOffers: [],
  };
}

async function buyArenaShopCard(db, userId, input = {}, options = {}) {
  const kind = input.kind === "daily" ? "daily" : input.kind === "random" ? "random" : "";
  if (!kind) {
    throw new ArenaHttpError(
      400,
      "Card purchase kind must be daily or random.",
      "ARENA_CARD_SHOP_KIND_REQUIRED",
    );
  }

  const offerDate =
    typeof options.recordedDate === "string" && options.recordedDate
      ? options.recordedDate
      : getCurrentRecordedDate();
  const currentProfile = ensureArenaProfile(db, userId);
  let offer = null;
  let purchasedCard = null;
  let purchasedCards = null;
  let purchasePrice = CARD_SHOP_RANDOM_PRICE;

  if (kind === "daily") {
    const offerId = String(input.offerId || "").trim();
    if (!offerId) {
      throw new ArenaHttpError(
        400,
        "offerId is required for a daily card.",
        "ARENA_CARD_SHOP_OFFER_REQUIRED",
      );
    }
    await ensureDailyCardShopOffers(db, userId, offerDate);
    offer = readDailyCardShopOffers(db, userId, offerDate).find(
      (candidate) => candidate.offerId === offerId,
    );
    if (!offer) {
      throw new ArenaHttpError(
        404,
        "This daily card offer is no longer available.",
        "ARENA_CARD_SHOP_OFFER_NOT_FOUND",
      );
    }
    purchasedCard = createPurchasedCard(offer.card);
    purchasePrice = getCardShopPrice(offer.card.rarity);
  } else {
    if (!isRandomCardOfferAvailable(offerDate) && !options.forceRandomPack) {
      throw new ArenaHttpError(
        410,
        "Random pack is only available on Sunday, Tuesday, Thursday, and Saturday (UTC).",
        "ARENA_RANDOM_CARD_NOT_TODAY",
      );
    }
    if (currentProfile.coins < CARD_SHOP_RANDOM_PRICE) {
      throw new ArenaHttpError(
        400,
        "Not enough coins.",
        "ARENA_NOT_ENOUGH_COINS",
        { requiredCoins: CARD_SHOP_RANDOM_PRICE },
      );
    }
    await ensureArenaCardPool(db);
    const malCards = [];
    for (let i = 0; i < 5; i++) {
      const drawCard =
        typeof options.drawCard === "function" ? options.drawCard : drawArenaCard;
      malCards.push(await drawCard(db));
    }
    purchasedCards = malCards.map((mal) => createDrawnCard(mal));
  }

  if (!purchasedCard && !purchasedCards) {
    throw new ArenaHttpError(
      503,
      "The pack could not be prepared. Please try again shortly.",
      "ARENA_CARD_SHOP_UNAVAILABLE",
    );
  }
  if (currentProfile.coins < purchasePrice) {
    throw new ArenaHttpError(
      400,
      "Not enough coins.",
      "ARENA_NOT_ENOUGH_COINS",
      { requiredCoins: purchasePrice },
    );
  }

  const tx = db.transaction(() => {
    const profile = ensureArenaProfile(db, userId);
    if (profile.coins < purchasePrice) {
      throw new ArenaHttpError(
        400,
        "Not enough coins.",
        "ARENA_NOT_ENOUGH_COINS",
        { requiredCoins: purchasePrice },
      );
    }

    if (kind === "daily") {
      const existingPurchase = db
        .prepare(
          `SELECT id, userId
           FROM arena_daily_card_purchases
           WHERE offerId = ? AND offerDate = ?
           LIMIT 1`,
        )
        .get(offer.offerId, offerDate);
      if (existingPurchase) {
        throw new ArenaHttpError(
          409,
          existingPurchase.userId === userId
            ? "This daily card was already bought."
            : "This daily card was already bought by another player.",
          "ARENA_CARD_SHOP_ALREADY_SOLD",
        );
      }

      db.prepare(
        `INSERT INTO arena_daily_card_purchases (
          id, userId, offerId, offerDate, purchasedAt
        ) VALUES (?, ?, ?, ?, ?)`,
      ).run(
        makeId("card-purchase"),
        userId,
        offer.offerId,
        offerDate,
        nowIso(),
      );
    }

    const updatedAt = nowIso();
    db.prepare(
      `UPDATE arena_profiles
       SET coins = ?, updatedAt = ?
       WHERE userId = ?`,
    ).run(profile.coins - purchasePrice, updatedAt, userId);
    if (purchasedCard) {
      insertCollectionCard(db, userId, purchasedCard);
    }
    if (purchasedCards) {
      for (const card of purchasedCards) {
        insertCollectionCard(db, userId, card);
      }
    }
  });

  tx();
  const cardShop = await getArenaCardShopPayload(db, userId, {
    recordedDate: offerDate,
  });
  return {
    kind,
    purchasedOfferId: kind === "daily" ? offer.offerId : "random-pack",
    pricePaid: purchasePrice,
    card: purchasedCard || undefined,
    cards: purchasedCards || undefined,
    profile: cardShop.profile,
    cardShop,
  };
}

module.exports = {
  drawDailyCard,
  drawArenaPack,
  readDailyCardShopOffers,
  ensureDailyCardShopOffers,
  buildArenaCardShopPayload,
  getArenaCardShopPayload,
  rerollArenaCardShopOffers,
  buyArenaShopCard,
};
