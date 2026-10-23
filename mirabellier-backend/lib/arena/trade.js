const { ELEMENTS } = require("../arena-constants");
const {
  nowIso, makeId, clamp, toInt, toPositiveInt,
  RARITY_TO_RANK, MARKET_MAX_PAGE_SIZE, MAX_TRADE_LISTINGS,
  CARD_IV_MAX, MARKET_SALE_COMMISSION_RATE, ARENA_TRADE_MIN_LEVEL,
} = require("./utils");
const { normalizeSelectedCard, insertCollectionCard } = require("./cards");
const { ensureArenaProfile, getArenaProfilePayload } = require("./profile");
const { hasActiveFight } = require("./playback");
const { createArenaNotification } = require("./notifications");
const { ArenaHttpError } = require("./utils");
const { S2C } = require("../websocket-events");
const { getWantedTradeCard, cardFromCatalogCharacter } = require("./archive");

// WS helpers
function _wsEmit() { return require("../websocket-server").getWebSocketManager(); }
function _notifyUser(userId, type, data) { const w = _wsEmit(); if (w) w.sendToUser(userId, { type, data }); }
function _notifyUsers(userIds, type, data) { const w = _wsEmit(); if (w) w.sendToUsers(userIds, { type, data }); }

// Direct trade is level-gated just like the market (improve.md §7).
function assertTradeLevel(profile) {
  if (toInt(profile?.level, 1) < ARENA_TRADE_MIN_LEVEL) {
    throw new ArenaHttpError(
      403,
      `Reach level ${ARENA_TRADE_MIN_LEVEL} to trade with other players.`,
      "ARENA_TRADE_LEVEL_LOCKED",
      { requiredLevel: ARENA_TRADE_MIN_LEVEL },
    );
  }
}

// Commission burned on a completed trade's coin transfer.
function tradeCoinCommission(amount) {
  return Math.round(Math.max(toPositiveInt(amount, 0), 0) * MARKET_SALE_COMMISSION_RATE);
}


function parseTradeCardIds(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function uniqueTradeCardIds(ids) {
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

function tradeCardIdsForSide(row, side) {
  const legacyKey = `${side}CardInstanceId`;
  const jsonKey = `${side}CardInstanceIdsJson`;
  return uniqueTradeCardIds([
    ...parseTradeCardIds(row?.[jsonKey]),
    row?.[legacyKey],
  ]);
}

function serializeTradeCardIds(ids) {
  const normalized = uniqueTradeCardIds(ids);
  return normalized.length ? JSON.stringify(normalized) : null;
}

function primaryTradeCardId(ids) {
  return uniqueTradeCardIds(ids)[0] || null;
}

function findActiveTradeSessionUsingCard(db, cardInstanceId, excludeSessionId = "") {
  const normalizedCardId = String(cardInstanceId || "").trim();
  if (!normalizedCardId) return null;
  const rows = db
    .prepare(
      `SELECT id, askerCardInstanceId, responderCardInstanceId,
              askerCardInstanceIdsJson, responderCardInstanceIdsJson
       FROM arena_trade_sessions
       WHERE status = 'active' AND id != ?`,
    )
    .all(String(excludeSessionId || "").trim());
  return rows.find((row) =>
    tradeCardIdsForSide(row, "asker").includes(normalizedCardId) ||
    tradeCardIdsForSide(row, "responder").includes(normalizedCardId),
  ) || null;
}

function loadTradeCardsForOwner(db, ownerId, cardInstanceIds) {
  // Compiled once per call rather than once per card (better-sqlite3 does not
  // cache prepared statements).
  const selectCardJsonStmt = db.prepare(
    `SELECT cardJson
     FROM arena_card_collection
     WHERE userId = ? AND cardInstanceId = ?
     LIMIT 1`,
  );
  return uniqueTradeCardIds(cardInstanceIds)
    .map((cardInstanceId) => {
      const row = selectCardJsonStmt.get(ownerId, cardInstanceId);
      return row ? normalizeSelectedCard(row.cardJson) : null;
    })
    .filter(Boolean);
}

function createArenaTradeListing(db, userId, input = {}) {
  const cardInstanceId = String(input.cardInstanceId || "").trim();
  const wantedCardInstanceId = String(input.wantedCardInstanceId || "").trim();
  const wantedCardMalId = toPositiveInt(input.wantedCardMalId, 0);
  const wantedRarity = String(input.wantedRarity || "").trim().toUpperCase() || null;
  const wantedElement = String(input.wantedElement || "").trim() || null;
  const note = String(input.note || "").trim() || null;
  if (!cardInstanceId) {
    throw new ArenaHttpError(
      400,
      "cardInstanceId is required.",
      "ARENA_CARD_INSTANCE_REQUIRED",
    );
  }
  if (wantedRarity && !RARITY_TO_RANK.has(wantedRarity)) {
    throw new ArenaHttpError(
      400,
      "Invalid wanted rarity.",
      "ARENA_TRADE_RARITY_INVALID",
    );
  }
  if (wantedElement && !ELEMENTS.includes(wantedElement)) {
    throw new ArenaHttpError(
      400,
      "Invalid wanted element.",
      "ARENA_TRADE_ELEMENT_INVALID",
    );
  }

  const listingId = makeId("tradelisting");
  const tx = db.transaction(() => {
    const profile = ensureArenaProfile(db, userId);
    assertTradeLevel(profile);
    if (hasActiveFight(db, userId)) {
      throw new ArenaHttpError(
        409,
        "Finish your active fight before listing a card.",
        "ARENA_TRADE_FIGHT_ACTIVE",
      );
    }

    const activeCount = toPositiveInt(
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM arena_trade_listings
           WHERE userId = ? AND status = 'active'`,
        )
        .get(userId)?.count,
      0,
    );
    if (activeCount >= MAX_TRADE_LISTINGS) {
      throw new ArenaHttpError(
        409,
        `You can have at most ${MAX_TRADE_LISTINGS} active trade listings.`,
        "ARENA_TRADE_LISTING_LIMIT",
        { maxActiveListings: MAX_TRADE_LISTINGS },
      );
    }

    const alreadyListed = db
      .prepare(
        `SELECT id
         FROM arena_trade_listings
         WHERE cardInstanceId = ? AND status = 'active'
         LIMIT 1`,
      )
      .get(cardInstanceId);
    if (alreadyListed) {
      throw new ArenaHttpError(
        409,
        "This card is already in an active trade listing.",
        "ARENA_TRADE_CARD_ALREADY_LISTED",
      );
    }

    const alreadyInSession = findActiveTradeSessionUsingCard(db, cardInstanceId);
    if (alreadyInSession) {
      throw new ArenaHttpError(
        409,
        "This card is already in an active trade session.",
        "ARENA_TRADE_CARD_IN_SESSION",
      );
    }

    const collectionRow = db
      .prepare(
        `SELECT cardJson
         FROM arena_card_collection
         WHERE userId = ? AND cardInstanceId = ?
         LIMIT 1`,
      )
      .get(userId, cardInstanceId);
    if (!collectionRow) {
      throw new ArenaHttpError(
        404,
        "Card not found in your collection.",
        "ARENA_COLLECTION_CARD_NOT_FOUND",
      );
    }
    const card = normalizeSelectedCard(collectionRow.cardJson);
    if (!card) {
      throw new ArenaHttpError(
        409,
        "Stored card data is invalid.",
        "ARENA_COLLECTION_CARD_INVALID",
      );
    }
    let wantedCard = wantedCardMalId ? getWantedTradeCard(wantedCardMalId) : null;
    if (wantedCardMalId && !wantedCard) {
      throw new ArenaHttpError(
        404,
        "Requested card was not found.",
        "ARENA_TRADE_WANTED_CARD_NOT_FOUND",
      );
    }
    if (!wantedCard && wantedCardInstanceId) {
      const wantedRow = db
        .prepare(
          `SELECT cardJson
           FROM arena_card_collection
           WHERE userId = ? AND cardInstanceId = ?
           LIMIT 1`,
        )
        .get(userId, wantedCardInstanceId);
      if (!wantedRow) {
        throw new ArenaHttpError(
          404,
          "Requested card not found in your collection.",
          "ARENA_TRADE_WANTED_CARD_NOT_FOUND",
        );
      }
      wantedCard = normalizeSelectedCard(wantedRow.cardJson);
      if (!wantedCard) {
        throw new ArenaHttpError(
          409,
          "Requested card data is invalid.",
          "ARENA_TRADE_WANTED_CARD_INVALID",
        );
      }
    }

    const ivTotal = clamp(toPositiveInt(card.iv?.total, 0), 0, CARD_IV_MAX * 4);
    const now = nowIso();
    db.prepare(
      `INSERT INTO arena_trade_listings (
        id, userId, cardInstanceId, cardJson,
        cardTitle, malId, rarity, ivTotal, element,
        wantedRarity, wantedElement, wantedCardJson, note, status,
        createdAt, updatedAt, cancelledAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)`,
    ).run(
      listingId,
      userId,
      card.cardInstanceId,
      JSON.stringify(card),
      card.title,
      card.malId,
      card.rarity,
      ivTotal,
      card.element || null,
      wantedRarity,
      wantedElement,
      wantedCard ? JSON.stringify(wantedCard) : null,
      note,
      now,
      now,
    );

    const removed = db
      .prepare(
        `DELETE FROM arena_card_collection
         WHERE userId = ? AND cardInstanceId = ?`,
      )
      .run(userId, cardInstanceId);
    if (removed.changes !== 1) {
      throw new ArenaHttpError(
        409,
        "The card could not be moved into trade escrow.",
        "ARENA_TRADE_ESCROW_FAILED",
      );
    }

    if (profile.selectedCard?.cardInstanceId === cardInstanceId) {
      db.prepare(
        `UPDATE arena_profiles
         SET selectedCardJson = NULL, updatedAt = ?
         WHERE userId = ?`,
      ).run(now, userId);
    }
  });

  tx();
  const w = _wsEmit();
  if (w) w.broadcast({ type: S2C.ARENA_TRADE_LISTING_CHANGED, data: {} });
  return {
    listing: normalizeTradeListingRow(db, listingId, userId),
    profile: getArenaProfilePayload(db, userId),
  };
}

function normalizeTradeListingRow(db, listingId, userId) {
  const row = db
    .prepare(
      `SELECT listing.*, u.username, u.avatar,
        (SELECT COUNT(*) > 0 FROM arena_trade_sessions
         WHERE (askerId = listing.userId OR responderId = listing.userId)
           AND status = 'active') AS hasActiveSession,
        (SELECT COUNT(*) > 0 FROM arena_trade_requests
         WHERE ((askerId = ? AND responderId = listing.userId) OR (askerId = listing.userId AND responderId = ?))
           AND status = 'pending') AS hasPendingRequest
       FROM arena_trade_listings listing
       LEFT JOIN users u ON u.id = listing.userId
       WHERE listing.id = ?
       LIMIT 1`,
    )
    .get(userId, userId, listingId);
  if (!row) return null;

  const card = normalizeSelectedCard(row.cardJson);
  const wantedCard = row.wantedCardJson
    ? normalizeSelectedCard(row.wantedCardJson)
    : null;
  return {
    id: row.id,
    userId: row.userId,
    username: row.username || "Unknown",
    avatar: row.avatar || null,
    card: card || { title: row.cardTitle, malId: row.malId, rarity: row.rarity, imageUrl: "" },
    wantedCard,
    wantedRarity: row.wantedRarity || null,
    wantedElement: row.wantedElement || null,
    note: row.note || null,
    status: row.status,
    hasActiveSession: row.hasActiveSession === 1,
    hasPendingRequest: row.hasPendingRequest === 1,
    createdAt: row.createdAt,
  };
}

function getArenaTradeListings(db, userId, options = {}) {
  ensureArenaProfile(db, userId);
  const page = Math.max(toPositiveInt(options.page, 1), 1);
  const limit = clamp(
    toPositiveInt(options.limit, 12) || 12,
    1,
    MARKET_MAX_PAGE_SIZE,
  );
  const clauses = ["listing.status = 'active'"];
  const params = [];
  const wantedRarity = String(options.wantedRarity || "").trim().toUpperCase();
  const wantedElement = String(options.wantedElement || "").trim();
  const search = String(options.search || "").trim();

  if (search) {
    clauses.push("listing.cardTitle LIKE ? COLLATE NOCASE");
    params.push(`%${search}%`);
  }
  if (RARITY_TO_RANK.has(wantedRarity)) {
    clauses.push("listing.wantedRarity = ?");
    params.push(wantedRarity);
  }
  if (ELEMENTS.includes(wantedElement)) {
    clauses.push("listing.wantedElement = ?");
    params.push(wantedElement);
  }
  if (options.userId) {
    clauses.push("listing.userId = ?");
    params.push(String(options.userId));
  }

  const whereSql = clauses.join(" AND ");
  const total = toPositiveInt(
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM arena_trade_listings listing
         WHERE ${whereSql}`,
      )
      .get(...params)?.count,
    0,
  );
  const rows = db
    .prepare(
      `SELECT
         listing.*,
         u.username,
         u.avatar,
         (SELECT COUNT(*) > 0 FROM arena_trade_sessions
          WHERE (askerId = listing.userId OR responderId = listing.userId)
            AND status = 'active') AS hasActiveSession,
         (SELECT COUNT(*) > 0 FROM arena_trade_requests
          WHERE ((askerId = ? AND responderId = listing.userId) OR (askerId = listing.userId AND responderId = ?))
            AND status = 'pending') AS hasPendingRequest
       FROM arena_trade_listings listing
       LEFT JOIN users u ON u.id = listing.userId
       WHERE ${whereSql}
       ORDER BY listing.createdAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(userId, userId, ...params, limit, (page - 1) * limit);

  return {
    profile: getArenaProfilePayload(db, userId),
    listings: rows.map((row) => {
      const card = normalizeSelectedCard(row.cardJson);
      const wantedCard = row.wantedCardJson
        ? normalizeSelectedCard(row.wantedCardJson)
        : null;
      return {
        id: row.id,
        userId: row.userId,
        username: row.username || "Unknown",
        avatar: row.avatar || null,
        card: card || { title: row.cardTitle, malId: row.malId, rarity: row.rarity, imageUrl: "" },
        wantedCard,
        wantedRarity: row.wantedRarity || null,
        wantedElement: row.wantedElement || null,
        note: row.note || null,
        status: row.status,
        hasActiveSession: row.hasActiveSession === 1,
        hasPendingRequest: row.hasPendingRequest === 1,
        createdAt: row.createdAt,
      };
    }),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function getMyArenaTradeListings(db, userId) {
  return getArenaTradeListings(db, userId, {
    userId,
    page: 1,
    limit: MAX_TRADE_LISTINGS,
  });
}

function cancelArenaTradeListing(db, userId, listingId) {
  const normalizedListingId = String(listingId || "").trim();
  const tx = db.transaction(() => {
    ensureArenaProfile(db, userId);
    const row = db
      .prepare(
        `SELECT *
         FROM arena_trade_listings
         WHERE id = ?
         LIMIT 1`,
      )
      .get(normalizedListingId);
    if (!row) {
      throw new ArenaHttpError(
        404,
        "Trade listing not found.",
        "ARENA_TRADE_LISTING_NOT_FOUND",
      );
    }
    if (row.userId !== userId) {
      throw new ArenaHttpError(
        403,
        "You can only cancel your own listings.",
        "ARENA_TRADE_NOT_OWNER",
      );
    }
    if (row.status !== "active") {
      throw new ArenaHttpError(
        409,
        "This listing is no longer active.",
        "ARENA_TRADE_LISTING_INACTIVE",
      );
    }

    const card = normalizeSelectedCard(row.cardJson);
    if (!card) {
      throw new ArenaHttpError(
        409,
        "Stored listing card data is invalid.",
        "ARENA_TRADE_CARD_INVALID",
      );
    }
    const now = nowIso();
    const updated = db
      .prepare(
        `UPDATE arena_trade_listings
         SET status = 'cancelled', cancelledAt = ?, updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      )
      .run(now, now, normalizedListingId);
    if (updated.changes !== 1) {
      throw new ArenaHttpError(
        409,
        "This listing is no longer active.",
        "ARENA_TRADE_LISTING_INACTIVE",
      );
    }
    insertCollectionCard(db, userId, card);

    // Cancel pending trade requests where this user is the responder
    db.prepare(
      `UPDATE arena_trade_requests
       SET status = 'cancelled', cancelledAt = ?, updatedAt = ?
       WHERE responderId = ? AND status = 'pending'`,
    ).run(now, now, userId);

    // Cancel active trade sessions tied to this listing's owner via trade requests
    const activeSessions = db
      .prepare(
        `SELECT s.id, s.askerId, s.responderId
         FROM arena_trade_sessions s
         JOIN arena_trade_requests r ON r.id = s.requestId
         WHERE s.status = 'active'
           AND r.responderId = ?`,
      )
      .all(userId);
    // better-sqlite3 recompiles on every db.prepare(); hoist the loop-invariant
    // statement so it is compiled once regardless of how many sessions match.
    const cancelSessionStmt = db.prepare(
      `UPDATE arena_trade_sessions
       SET status = 'cancelled', updatedAt = ?
       WHERE id = ? AND status = 'active'`,
    );
    for (const session of activeSessions) {
      cancelSessionStmt.run(now, session.id);

      const otherId = session.askerId === userId ? session.responderId : session.askerId;
      createArenaNotification(
        db, otherId, "trade_denied",
        "Trade session cancelled",
        `The trade listing was removed, so the session was cancelled.`,
        "/arena/trade",
      );
    }
  });

  tx();
  const w = _wsEmit();
  if (w) w.broadcast({ type: S2C.ARENA_TRADE_LISTING_CHANGED, data: {} });
  return {
    listing: normalizeTradeListingRow(db, normalizedListingId, userId),
    profile: getArenaProfilePayload(db, userId),
  };
}

function sendTradeRequest(db, askerId, responderId, cardInstanceId, options = {}) {
  const listingId = String(options.listingId || "").trim() || null;
  if (!responderId) {
    throw new ArenaHttpError(
      400,
      "responderId is required.",
      "ARENA_TRADE_RESPONDER_REQUIRED",
    );
  }
  if (askerId === responderId) {
    throw new ArenaHttpError(
      400,
      "You cannot trade with yourself.",
      "ARENA_TRADE_SELF",
    );
  }

  const responder = db
    .prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
    .get(responderId);
  if (!responder) {
    throw new ArenaHttpError(
      404,
      "User not found.",
      "ARENA_TRADE_USER_NOT_FOUND",
    );
  }

  const tx = db.transaction(() => {
    assertTradeLevel(ensureArenaProfile(db, askerId));
    assertTradeLevel(ensureArenaProfile(db, responderId));

    let listingRow = null;
    if (listingId) {
      listingRow = db
        .prepare(
          `SELECT *
           FROM arena_trade_listings
           WHERE id = ? AND userId = ? AND status = 'active'
           LIMIT 1`,
        )
        .get(listingId, responderId);
      if (!listingRow) {
        throw new ArenaHttpError(
          404,
          "Trade listing not found.",
          "ARENA_TRADE_LISTING_NOT_FOUND",
        );
      }
      // Listing trades require the asker to offer a card (instant swap)
      if (!cardInstanceId) {
        throw new ArenaHttpError(
          400,
          "You must offer a card to respond to a trade listing.",
          "ARENA_TRADE_CARD_REQUIRED_FOR_LISTING",
        );
      }
    }

    const existingPending = db
      .prepare(
        `SELECT id
         FROM arena_trade_requests
         WHERE ((askerId = ? AND responderId = ?) OR (askerId = ? AND responderId = ?))
           AND status = 'pending'
         LIMIT 1`,
      )
      .get(askerId, responderId, responderId, askerId);
    if (existingPending) {
      throw new ArenaHttpError(
        409,
        "A trade request already exists between you and this user.",
        "ARENA_TRADE_REQUEST_EXISTS",
      );
    }

    if (cardInstanceId) {
      const collectionRow = db
        .prepare(
          `SELECT cardJson
           FROM arena_card_collection
           WHERE userId = ? AND cardInstanceId = ?
           LIMIT 1`,
        )
        .get(askerId, cardInstanceId);
      if (!collectionRow) {
        throw new ArenaHttpError(
          404,
          "Card not found in your collection.",
          "ARENA_COLLECTION_CARD_NOT_FOUND",
        );
      }
      if (listingRow?.wantedCardJson) {
        const offeredCard = normalizeSelectedCard(collectionRow.cardJson);
        const wantedCard = normalizeSelectedCard(listingRow.wantedCardJson);
        if (
          !offeredCard ||
          !wantedCard ||
          toPositiveInt(offeredCard.malId, 0) !== toPositiveInt(wantedCard.malId, 0)
        ) {
          throw new ArenaHttpError(
            400,
            "This listing is requesting a specific card.",
            "ARENA_TRADE_WANTED_CARD_REQUIRED",
          );
        }
      }
    } else if (listingRow?.wantedCardJson) {
      throw new ArenaHttpError(
        400,
        "This listing is requesting a specific card.",
        "ARENA_TRADE_WANTED_CARD_REQUIRED",
      );
    }

    const requestId = makeId("tradereq");
    const now = nowIso();

    // Cancel any active sessions between these two users
    db.prepare(
      `UPDATE arena_trade_sessions
       SET status = 'cancelled', updatedAt = ?
       WHERE ((askerId = ? AND responderId = ?) OR (askerId = ? AND responderId = ?))
         AND status = 'active'`,
    ).run(now, askerId, responderId, responderId, askerId);

    db.prepare(
      `INSERT INTO arena_trade_requests (
        id, askerId, responderId, listingId, askerCardInstanceId,
        status, createdAt, updatedAt, respondedAt, cancelledAt
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL, NULL)`,
    ).run(requestId, askerId, responderId, listingId, cardInstanceId || null, now, now);

    const askerUser = db.prepare("SELECT username FROM users WHERE id = ?").get(askerId);
    const askerName = askerUser?.username || "Someone";

    let metadata = null;
    if (cardInstanceId) {
      const cardRow = db
        .prepare("SELECT cardJson FROM arena_card_collection WHERE userId = ? AND cardInstanceId = ? LIMIT 1")
        .get(askerId, cardInstanceId);
      if (cardRow) {
        const card = normalizeSelectedCard(cardRow.cardJson);
        if (card) {
          const listedRow = listingRow || db
            .prepare("SELECT cardJson FROM arena_trade_listings WHERE userId = ? AND status = 'active' LIMIT 1")
            .get(responderId);
          const responderCard = listedRow ? normalizeSelectedCard(listedRow.cardJson) : null;
          const wantedCard = listedRow?.wantedCardJson
            ? normalizeSelectedCard(listedRow.wantedCardJson)
            : null;
          metadata = JSON.stringify({
            requestId,
            listingId,
            askerCard: card,
            responderCard: responderCard || null,
            wantedCard: wantedCard || null,
          });
        }
      }
    } else {
      metadata = JSON.stringify({ requestId, listingId });
    }

    createArenaNotification(
      db,
      responderId,
      "trade_request",
      `${askerName} wants to trade`,
      `${askerName} sent you a trade request.`,
      "/arena/trade",
      metadata || JSON.stringify({ requestId }),
    );

    return requestId;
  });

  const requestId = tx();
  _notifyUser(responderId, S2C.ARENA_TRADE_REQUEST_NEW, { requestId, askerId });
  return { requestId };
}

function getIncomingTradeRequests(db, userId) {
  const rows = db
    .prepare(
      `SELECT
         r.*,
         asker.username AS askerUsername,
         asker.avatar AS askerAvatar
       FROM arena_trade_requests r
       LEFT JOIN users asker ON asker.id = r.askerId
       WHERE r.responderId = ? AND r.status = 'pending'
       ORDER BY r.createdAt DESC
       LIMIT 10`,
    )
    .all(userId);

  return rows.map((row) => ({
    id: row.id,
    askerId: row.askerId,
    askerUsername: row.askerUsername || "Unknown",
    askerAvatar: row.askerAvatar || null,
    responderId: row.responderId,
    status: row.status,
    createdAt: row.createdAt,
  }));
}

function getTradeRequestForUser(db, userId, requestId) {
  const row = db
    .prepare(
      `SELECT r.*, s.id AS sessionId
       FROM arena_trade_requests r
       LEFT JOIN arena_trade_sessions s ON s.requestId = r.id
       WHERE r.id = ? AND (r.askerId = ? OR r.responderId = ?)
       LIMIT 1`,
    )
    .get(String(requestId || "").trim(), userId, userId);
  if (!row) {
    throw new ArenaHttpError(
      404,
      "Trade request not found.",
      "ARENA_TRADE_REQUEST_NOT_FOUND",
    );
  }
  return {
    id: row.id,
    askerId: row.askerId,
    responderId: row.responderId,
    status: row.status,
    createdAt: row.createdAt,
    sessionId: row.sessionId || null,
  };
}

function acceptTradeRequest(db, userId, requestId) {
  const normalizedId = String(requestId || "").trim();
  const tx = db.transaction(() => {
    assertTradeLevel(ensureArenaProfile(db, userId));
    const row = db
      .prepare(
        `SELECT *
         FROM arena_trade_requests
         WHERE id = ?
         LIMIT 1`,
      )
      .get(normalizedId);
    if (!row) {
      throw new ArenaHttpError(
        404,
        "Trade request not found.",
        "ARENA_TRADE_REQUEST_NOT_FOUND",
      );
    }
    if (row.responderId !== userId) {
      throw new ArenaHttpError(
        403,
        "This request is not for you.",
        "ARENA_TRADE_NOT_RESPONDER",
      );
    }
    if (row.status !== "pending") {
      throw new ArenaHttpError(
        409,
        "This trade request is no longer pending.",
        "ARENA_TRADE_REQUEST_NOT_PENDING",
      );
    }

    const now = nowIso();

    // ── Listing-based trade: execute instantly (no session) ──
    if (row.listingId) {
      const listingRow = db
        .prepare("SELECT * FROM arena_trade_listings WHERE id = ? AND userId = ? AND status = 'active' LIMIT 1")
        .get(row.listingId, userId);
      if (!listingRow) {
        throw new ArenaHttpError(
          409,
          "This trade listing is no longer active.",
          "ARENA_TRADE_LISTING_INACTIVE",
        );
      }

      const responderCard = normalizeSelectedCard(listingRow.cardJson);
      if (!responderCard || !responderCard.cardInstanceId) {
        throw new ArenaHttpError(409, "Your listing card data is invalid.", "ARENA_TRADE_INVALID_LISTING_CARD");
      }

      if (!row.askerCardInstanceId) {
        throw new ArenaHttpError(
          400,
          "The asker did not offer a card.",
          "ARENA_TRADE_NO_ASKER_CARD",
        );
      }

      const askerCardRow = db
        .prepare("SELECT cardJson FROM arena_card_collection WHERE userId = ? AND cardInstanceId = ? LIMIT 1")
        .get(row.askerId, row.askerCardInstanceId);
      if (!askerCardRow) {
        throw new ArenaHttpError(
          409,
          "The asker's card is no longer available.",
          "ARENA_COLLECTION_CARD_NOT_FOUND",
        );
      }
      const askerCard = normalizeSelectedCard(askerCardRow.cardJson);
      if (!askerCard) {
        throw new ArenaHttpError(
          409,
          "The asker's card data is invalid.",
          "ARENA_COLLECTION_CARD_INVALID",
        );
      }

      // Execute the swap
      // ── Transfer asker's card to responder ──
      db.prepare(
        `DELETE FROM arena_card_collection
         WHERE userId = ? AND cardInstanceId = ?`,
      ).run(row.askerId, askerCard.cardInstanceId);
      insertCollectionCard(db, userId, askerCard);

      // ── Transfer listing card to asker ──
      insertCollectionCard(db, row.askerId, responderCard);

      // ── Clean up: cancel listing, mark request, cancel stale sessions ──
      db.prepare(
        `UPDATE arena_trade_listings
         SET status = 'cancelled', cancelledAt = ?, updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(now, now, listingRow.id);

      db.prepare(
        `UPDATE arena_trade_requests
         SET status = 'accepted', respondedAt = ?, updatedAt = ?
         WHERE id = ? AND status = 'pending'`,
      ).run(now, now, normalizedId);

      // Cancel other pending requests for this responder
      db.prepare(
        `UPDATE arena_trade_requests
         SET status = 'cancelled', cancelledAt = ?, updatedAt = ?
         WHERE responderId = ? AND status = 'pending' AND id != ?`,
      ).run(now, now, userId, normalizedId);

      // Cancel any stale sessions for these users
      db.prepare(
        `UPDATE arena_trade_sessions
         SET status = 'cancelled', updatedAt = ?
         WHERE (askerId = ? OR responderId = ? OR askerId = ? OR responderId = ?)
           AND status = 'active'`,
      ).run(now, userId, userId, row.askerId, row.askerId);

      // Clear selected cards if they were traded
      const askerProfile = db.prepare("SELECT selectedCardJson FROM arena_profiles WHERE userId = ?").get(row.askerId);
      if (askerProfile) {
        const askerSelected = normalizeSelectedCard(askerProfile.selectedCardJson);
        if (askerSelected?.cardInstanceId === askerCard.cardInstanceId) {
          db.prepare("UPDATE arena_profiles SET selectedCardJson = NULL, updatedAt = ? WHERE userId = ?")
            .run(now, row.askerId);
        }
      }
      const responderProfile = db.prepare("SELECT selectedCardJson FROM arena_profiles WHERE userId = ?").get(userId);
      if (responderProfile) {
        const responderSelected = normalizeSelectedCard(responderProfile.selectedCardJson);
        if (responderSelected?.cardInstanceId === responderCard.cardInstanceId) {
          db.prepare("UPDATE arena_profiles SET selectedCardJson = NULL, updatedAt = ? WHERE userId = ?")
            .run(now, userId);
        }
      }

      // ── Notifications ──
      const askerUser = db.prepare("SELECT username FROM users WHERE id = ?").get(row.askerId);
      const askerName = askerUser?.username || "Someone";
      const responderUser = db.prepare("SELECT username FROM users WHERE id = ?").get(userId);
      const responderName = responderUser?.username || "Someone";

      createArenaNotification(
        db, row.askerId, "trade_completed",
        `${responderName} accepted your trade!`,
        `You traded ${askerCard.title} for ${responderCard.title}.`,
        "/arena/trade",
        JSON.stringify({ requestId: normalizedId, listingId: row.listingId, askerCard, responderCard }),
      );

      createArenaNotification(
        db, userId, "trade_completed",
        `Trade with ${askerName} completed!`,
        `You traded ${responderCard.title} for ${askerCard.title}.`,
        "/arena/trade",
        JSON.stringify({ requestId: normalizedId, listingId: row.listingId, askerCard, responderCard }),
      );

      // Update the original trade_request notification
      const responderNotifRow = db.prepare(
        `SELECT id FROM arena_notifications
         WHERE userId = ? AND type = 'trade_request' AND metadata LIKE '%' || ? || '%'
         ORDER BY createdAt DESC LIMIT 1`,
      ).get(userId, normalizedId);
      if (responderNotifRow) {
        db.prepare(
          `UPDATE arena_notifications SET title = ?, body = ?, type = 'trade_completed' WHERE id = ?`,
        ).run(`Trade with ${askerName} completed!`, null, responderNotifRow.id);
      }

      _notifyUser(row.askerId, S2C.ARENA_TRADE_COMPLETED, { requestId: normalizedId, askerCard, responderCard });
      _notifyUser(userId, S2C.ARENA_TRADE_COMPLETED, { requestId: normalizedId, askerCard, responderCard });

      return { completed: true, askerCard, responderCard };
    }

    // ── Direct user-to-user trade: create session (existing flow) ──
    // Helper to create a session
    const createSession = (sessionCardInstanceId, sessionCardOwnerId, extraCards = {}) => {
      // Cancel any previous active sessions between these two users
      db.prepare(
        `UPDATE arena_trade_sessions
         SET status = 'cancelled', updatedAt = ?
         WHERE ((askerId = ? AND responderId = ?) OR (askerId = ? AND responderId = ?))
           AND status = 'active'`,
      ).run(now, row.askerId, userId, userId, row.askerId);

      const askerCardIds = uniqueTradeCardIds([
        sessionCardOwnerId === row.askerId ? sessionCardInstanceId : null,
        extraCards.askerCardInstanceId,
      ]);
      const responderCardIds = uniqueTradeCardIds([
        sessionCardOwnerId === userId ? sessionCardInstanceId : null,
        extraCards.responderCardInstanceId,
      ]);

      const sessionId = makeId("tradesess");
      db.prepare(
        `INSERT INTO arena_trade_sessions (id, requestId, askerId, responderId,
           askerCardInstanceId, responderCardInstanceId,
           askerCardInstanceIdsJson, responderCardInstanceIdsJson,
           status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      ).run(
        sessionId, normalizedId, row.askerId, userId,
        primaryTradeCardId(askerCardIds),
        primaryTradeCardId(responderCardIds),
        serializeTradeCardIds(askerCardIds),
        serializeTradeCardIds(responderCardIds),
        now, now,
      );

      db.prepare(
        `UPDATE arena_trade_requests
         SET status = 'accepted', respondedAt = ?, updatedAt = ?
         WHERE id = ? AND status = 'pending'`,
      ).run(now, now, normalizedId);

      // Cancel other pending requests for this responder
      db.prepare(
        `UPDATE arena_trade_requests
         SET status = 'cancelled', cancelledAt = ?, updatedAt = ?
         WHERE responderId = ? AND status = 'pending' AND id != ?`,
      ).run(now, now, userId, normalizedId);

      // Cancel other pending sessions involving this responder
      db.prepare(
        `UPDATE arena_trade_sessions
         SET status = 'cancelled', updatedAt = ?
         WHERE (askerId = ? OR responderId = ?) AND status = 'active' AND id != ?`,
      ).run(now, userId, userId, sessionId);

      const responderUser = db.prepare("SELECT username FROM users WHERE id = ?").get(userId);
      const responderName = responderUser?.username || "Someone";
      const askerUser = db.prepare("SELECT username FROM users WHERE id = ?").get(row.askerId);
      const askerName = askerUser?.username || "Someone";

      createArenaNotification(
        db, row.askerId, "trade_accepted",
        `${responderName} accepted your trade request!`,
        "Go to the trade page to offer cards.",
        "/arena/trade",
        JSON.stringify({ requestId: normalizedId, sessionId }),
      );

      createArenaNotification(
        db, userId, "trade_accepted",
        `You accepted ${askerName} trade request`,
        "Go to the trade page to offer cards.",
        "/arena/trade",
        JSON.stringify({ requestId: normalizedId, sessionId }),
      );

      const responderNotifRow = db.prepare(
        `SELECT id FROM arena_notifications
         WHERE userId = ? AND type = 'trade_request' AND metadata LIKE '%' || ? || '%'
         ORDER BY createdAt DESC LIMIT 1`,
      ).get(userId, normalizedId);
      if (responderNotifRow) {
        db.prepare(
          `UPDATE arena_notifications SET type = 'trade_accepted', title = ?, body = NULL WHERE id = ?`,
        ).run(`You accepted ${askerName} trade request`, responderNotifRow.id);
      }

      _notifyUser(row.askerId, S2C.ARENA_TRADE_REQUEST_UPDATE, { requestId: normalizedId, status: "accepted", sessionId });
      return { sessionId };
    };

    // Case A: No asker card → create empty session
    if (!row.askerCardInstanceId) {
      return createSession(null, null);
    }

    // Case C: Asker has card, no listing → session with asker card pre-placed
    const askerCardRow = db
      .prepare("SELECT cardJson FROM arena_card_collection WHERE userId = ? AND cardInstanceId = ? LIMIT 1")
      .get(row.askerId, row.askerCardInstanceId);
    if (!askerCardRow) {
      throw new ArenaHttpError(409, "The asker's card is no longer available.", "ARENA_COLLECTION_CARD_NOT_FOUND");
    }
    const askerCard = normalizeSelectedCard(askerCardRow.cardJson);
    if (!askerCard || !askerCard.cardInstanceId) {
      throw new ArenaHttpError(409, "The asker's card data is invalid.", "ARENA_COLLECTION_CARD_INVALID");
    }
    return createSession(askerCard.cardInstanceId, row.askerId);
  });

  return tx();
}

function denyTradeRequest(db, userId, requestId) {
  const normalizedId = String(requestId || "").trim();
  const tx = db.transaction(() => {
    ensureArenaProfile(db, userId);
    const row = db
      .prepare(
        `SELECT *
         FROM arena_trade_requests
         WHERE id = ?
         LIMIT 1`,
      )
      .get(normalizedId);
    if (!row) {
      throw new ArenaHttpError(
        404,
        "Trade request not found.",
        "ARENA_TRADE_REQUEST_NOT_FOUND",
      );
    }
    if (row.responderId !== userId) {
      throw new ArenaHttpError(
        403,
        "This request is not for you.",
        "ARENA_TRADE_NOT_RESPONDER",
      );
    }
    if (row.status !== "pending") {
      throw new ArenaHttpError(
        409,
        "This trade request is no longer pending.",
        "ARENA_TRADE_REQUEST_NOT_PENDING",
      );
    }

    const now = nowIso();
    db.prepare(
      `UPDATE arena_trade_requests
       SET status = 'denied', respondedAt = ?, updatedAt = ?
       WHERE id = ? AND status = 'pending'`,
    ).run(now, now, normalizedId);

    // Notify asker
    const responderUser = db.prepare("SELECT username FROM users WHERE id = ?").get(userId);
    const responderName = responderUser?.username || "Someone";
    const denyMeta = { askerCard: null, responderCard: null };
    if (row.askerCardInstanceId) {
      const askerCardRow = db.prepare("SELECT cardJson FROM arena_card_collection WHERE userId = ? AND cardInstanceId = ? LIMIT 1")
        .get(row.askerId, row.askerCardInstanceId);
      if (askerCardRow) denyMeta.askerCard = normalizeSelectedCard(askerCardRow.cardJson);
    }
    const responderListedRow = row.listingId
      ? db.prepare("SELECT cardJson FROM arena_trade_listings WHERE id = ? AND userId = ? AND status = 'active' LIMIT 1")
        .get(row.listingId, userId)
      : db.prepare("SELECT cardJson FROM arena_trade_listings WHERE userId = ? AND status = 'active' LIMIT 1")
        .get(userId);
    if (responderListedRow) denyMeta.responderCard = normalizeSelectedCard(responderListedRow.cardJson);
    createArenaNotification(
      db, row.askerId, "trade_denied",
      `${responderName} denied your trade request`,
      null,
      "/arena/trade",
      JSON.stringify(denyMeta),
    );

    const askerUser = db.prepare("SELECT username FROM users WHERE id = ?").get(row.askerId);
    const askerName = askerUser?.username || "Someone";
    const responderNotif = db.prepare(
      `SELECT id FROM arena_notifications
       WHERE userId = ? AND type = 'trade_request' AND metadata LIKE '%' || ? || '%'
       ORDER BY createdAt DESC LIMIT 1`,
    ).get(userId, normalizedId);
    if (responderNotif) {
      db.prepare(
        `UPDATE arena_notifications SET type = 'trade_denied', title = ?, body = NULL WHERE id = ?`,
      ).run(`You denied ${askerName} trade request`, responderNotif.id);
    }
    _notifyUser(row.askerId, S2C.ARENA_TRADE_REQUEST_UPDATE, { requestId: normalizedId, status: "denied" });
  });

  tx();
  return { status: "denied" };
}

function cancelTradeRequest(db, userId, requestId) {
  const normalizedId = String(requestId || "").trim();
  const tx = db.transaction(() => {
    ensureArenaProfile(db, userId);
    const row = db
      .prepare(
        `SELECT *
         FROM arena_trade_requests
         WHERE id = ?
         LIMIT 1`,
      )
      .get(normalizedId);
    if (!row) {
      throw new ArenaHttpError(
        404,
        "Trade request not found.",
        "ARENA_TRADE_REQUEST_NOT_FOUND",
      );
    }
    if (row.askerId !== userId) {
      throw new ArenaHttpError(
        403,
        "You can only cancel your own trade requests.",
        "ARENA_TRADE_NOT_ASKER",
      );
    }
    if (row.status !== "pending") {
      throw new ArenaHttpError(
        409,
        "This trade request is no longer pending.",
        "ARENA_TRADE_REQUEST_NOT_PENDING",
      );
    }

    const now = nowIso();
    db.prepare(
      `UPDATE arena_trade_requests
       SET status = 'cancelled', cancelledAt = ?, updatedAt = ?
       WHERE id = ? AND status = 'pending'`,
    ).run(now, now, normalizedId);

    // Update the responder's notification so buttons don't linger
    const askerUser = db.prepare("SELECT username FROM users WHERE id = ?").get(userId);
    const askerName = askerUser?.username || "Someone";
    const responderNotif = db.prepare(
      `SELECT id FROM arena_notifications
       WHERE userId = ? AND type = 'trade_request' AND metadata LIKE '%' || ? || '%'
       ORDER BY createdAt DESC LIMIT 1`,
    ).get(row.responderId, normalizedId);
    if (responderNotif) {
      db.prepare(
        `UPDATE arena_notifications SET type = 'trade_denied', title = ?, body = NULL WHERE id = ?`,
      ).run(`${askerName} canceled their trade request`, responderNotif.id);
    }

    _notifyUser(row.responderId, S2C.ARENA_TRADE_REQUEST_UPDATE, { requestId: normalizedId, status: "cancelled" });
  });

  tx();
  return { status: "cancelled" };
}

function getTradeSession(db, userId, sessionId) {
  const normalizedId = String(sessionId || "").trim();
  const row = db
    .prepare(
      `SELECT
         s.*,
         asker.username AS askerUsername,
         responder.username AS responderUsername
       FROM arena_trade_sessions s
       LEFT JOIN users asker ON asker.id = s.askerId
       LEFT JOIN users responder ON responder.id = s.responderId
       WHERE s.id = ?
       LIMIT 1`,
    )
    .get(normalizedId);
  if (!row) return null;

  if (row.askerId !== userId && row.responderId !== userId) {
    throw new ArenaHttpError(
      403,
      "You are not a participant in this trade.",
      "ARENA_TRADE_NOT_PARTICIPANT",
    );
  }

  const askerCardIds = tradeCardIdsForSide(row, "asker");
  const responderCardIds = tradeCardIdsForSide(row, "responder");

  // Auto-cancel if either participant no longer has their placed cards
  if (row.status === "active") {
    let cardsMissing = false;
    const ownsCardStmt = db.prepare(
      "SELECT id FROM arena_card_collection WHERE userId = ? AND cardInstanceId = ? LIMIT 1",
    );
    for (const cardInstanceId of askerCardIds) {
      if (!ownsCardStmt.get(row.askerId, cardInstanceId)) cardsMissing = true;
    }
    for (const cardInstanceId of responderCardIds) {
      if (!ownsCardStmt.get(row.responderId, cardInstanceId)) cardsMissing = true;
    }
    if (cardsMissing) {
      const now = nowIso();
      db.prepare(
        `UPDATE arena_trade_sessions
         SET status = 'cancelled', updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(now, normalizedId);
      row.status = "cancelled";
    }
  }

  const askerCards = loadTradeCardsForOwner(
    db,
    row.status === "completed" ? row.responderId : row.askerId,
    askerCardIds,
  );
  const responderCards = loadTradeCardsForOwner(
    db,
    row.status === "completed" ? row.askerId : row.responderId,
    responderCardIds,
  );

  return {
    id: row.id,
    askerId: row.askerId,
    askerUsername: row.askerUsername || "Unknown",
    responderId: row.responderId,
    responderUsername: row.responderUsername || "Unknown",
    askerCard: askerCards[0] || null,
    responderCard: responderCards[0] || null,
    askerCards,
    responderCards,
    askerCoins: typeof row.askerCoins === "number" ? row.askerCoins : 0,
    responderCoins: typeof row.responderCoins === "number" ? row.responderCoins : 0,
    askerConfirmed: row.askerConfirmed === 1,
    responderConfirmed: row.responderConfirmed === 1,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function clearSelectedCardsForCompletedTrade(db, session, now) {
  const clearIfSelected = (ownerId, cardInstanceIds) => {
    const ids = uniqueTradeCardIds(cardInstanceIds);
    if (!ownerId || ids.length === 0) return;
    const profile = db
      .prepare("SELECT selectedCardJson FROM arena_profiles WHERE userId = ? LIMIT 1")
      .get(ownerId);
    const selectedCard = normalizeSelectedCard(profile?.selectedCardJson);
    if (!selectedCard?.cardInstanceId || !ids.includes(selectedCard.cardInstanceId)) return;
    db.prepare("UPDATE arena_profiles SET selectedCardJson = NULL, updatedAt = ? WHERE userId = ?")
      .run(now, ownerId);
  };

  clearIfSelected(session.askerId, tradeCardIdsForSide(session, "asker"));
  clearIfSelected(session.responderId, tradeCardIdsForSide(session, "responder"));
}

function offerCardInTrade(db, userId, sessionId, cardInstanceId) {
  const normalizedSessionId = String(sessionId || "").trim();
  const normalizedCardId = String(cardInstanceId || "").trim();
  if (!normalizedCardId) {
    throw new ArenaHttpError(
      400,
      "cardInstanceId is required.",
      "ARENA_CARD_INSTANCE_REQUIRED",
    );
  }

  const tx = db.transaction(() => {
    ensureArenaProfile(db, userId);
    const session = db
      .prepare(
        `SELECT *
         FROM arena_trade_sessions
         WHERE id = ?
         LIMIT 1`,
      )
      .get(normalizedSessionId);
    if (!session) {
      throw new ArenaHttpError(
        404,
        "Trade session not found.",
        "ARENA_TRADE_SESSION_NOT_FOUND",
      );
    }
    if (session.status !== "active") {
      throw new ArenaHttpError(
        409,
        "This trade session is no longer active.",
        "ARENA_TRADE_SESSION_INACTIVE",
      );
    }
    if (session.askerId !== userId && session.responderId !== userId) {
      throw new ArenaHttpError(
        403,
        "You are not a participant in this trade.",
        "ARENA_TRADE_NOT_PARTICIPANT",
      );
    }

    const collectionRow = db
      .prepare(
        `SELECT cardJson
         FROM arena_card_collection
         WHERE userId = ? AND cardInstanceId = ?
         LIMIT 1`,
      )
      .get(userId, normalizedCardId);
    if (!collectionRow) {
      throw new ArenaHttpError(
        404,
        "Card not found in your collection.",
        "ARENA_COLLECTION_CARD_NOT_FOUND",
      );
    }

    const otherCardInSession = findActiveTradeSessionUsingCard(db, normalizedCardId, normalizedSessionId);
    if (otherCardInSession) {
      throw new ArenaHttpError(
        409,
        "This card is already in another active trade session.",
        "ARENA_TRADE_CARD_IN_SESSION",
      );
    }

    const now = nowIso();
    if (session.askerId === userId) {
      const nextIds = uniqueTradeCardIds([
        ...tradeCardIdsForSide(session, "asker"),
        normalizedCardId,
      ]);
      db.prepare(
        `UPDATE arena_trade_sessions
         SET askerCardInstanceId = ?,
             askerCardInstanceIdsJson = ?,
             askerConfirmed = 0,
             responderConfirmed = 0,
             updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(
        primaryTradeCardId(nextIds),
        serializeTradeCardIds(nextIds),
        now,
        normalizedSessionId,
      );
    } else {
      const nextIds = uniqueTradeCardIds([
        ...tradeCardIdsForSide(session, "responder"),
        normalizedCardId,
      ]);
      db.prepare(
        `UPDATE arena_trade_sessions
         SET responderCardInstanceId = ?,
             responderCardInstanceIdsJson = ?,
             askerConfirmed = 0,
             responderConfirmed = 0,
             updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(
        primaryTradeCardId(nextIds),
        serializeTradeCardIds(nextIds),
        now,
        normalizedSessionId,
      );
    }
  });

  tx();
  const session = getTradeSession(db, userId, normalizedSessionId);
  _notifyUsers([session.askerId, session.responderId].filter(Boolean), S2C.ARENA_TRADE_SESSION_UPDATE, session);
  return session;
}

function removeCardFromTrade(db, userId, sessionId, cardInstanceId = null) {
  const normalizedSessionId = String(sessionId || "").trim();
  const normalizedCardId = String(cardInstanceId || "").trim();
  const tx = db.transaction(() => {
    ensureArenaProfile(db, userId);
    const session = db
      .prepare(
        `SELECT *
         FROM arena_trade_sessions
         WHERE id = ?
         LIMIT 1`,
      )
      .get(normalizedSessionId);
    if (!session) {
      throw new ArenaHttpError(
        404,
        "Trade session not found.",
        "ARENA_TRADE_SESSION_NOT_FOUND",
      );
    }
    if (session.status !== "active") {
      throw new ArenaHttpError(
        409,
        "This trade session is no longer active.",
        "ARENA_TRADE_SESSION_INACTIVE",
      );
    }
    if (session.askerId !== userId && session.responderId !== userId) {
      throw new ArenaHttpError(
        403,
        "You are not a participant in this trade.",
        "ARENA_TRADE_NOT_PARTICIPANT",
      );
    }

    const now = nowIso();
    if (session.askerId === userId) {
      const currentIds = tradeCardIdsForSide(session, "asker");
      const nextIds = normalizedCardId
        ? currentIds.filter((id) => id !== normalizedCardId)
        : [];
      db.prepare(
        `UPDATE arena_trade_sessions
         SET askerCardInstanceId = ?,
             askerCardInstanceIdsJson = ?,
             askerConfirmed = 0,
             responderConfirmed = 0,
             updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(
        primaryTradeCardId(nextIds),
        serializeTradeCardIds(nextIds),
        now,
        normalizedSessionId,
      );
    } else {
      const currentIds = tradeCardIdsForSide(session, "responder");
      const nextIds = normalizedCardId
        ? currentIds.filter((id) => id !== normalizedCardId)
        : [];
      db.prepare(
        `UPDATE arena_trade_sessions
          SET responderCardInstanceId = ?,
              responderCardInstanceIdsJson = ?,
              askerConfirmed = 0,
              responderConfirmed = 0,
              updatedAt = ?
          WHERE id = ? AND status = 'active'`,
      ).run(
        primaryTradeCardId(nextIds),
        serializeTradeCardIds(nextIds),
        now,
        normalizedSessionId,
      );
    }
  });

  tx();
  const session = getTradeSession(db, userId, normalizedSessionId);
  _notifyUsers([session.askerId, session.responderId].filter(Boolean), S2C.ARENA_TRADE_SESSION_UPDATE, session);
  return session;
}

function offerCoinInTrade(db, userId, sessionId, amount) {
  const normalizedSessionId = String(sessionId || "").trim();
  const coinAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (coinAmount <= 0) {
    throw new ArenaHttpError(
      400,
      "You must offer a positive amount of coins.",
      "ARENA_COINS_INVALID_AMOUNT",
    );
  }

  const tx = db.transaction(() => {
    const profile = ensureArenaProfile(db, userId);
    if (profile.coins < coinAmount) {
      throw new ArenaHttpError(
        400,
        "You do not have enough coins.",
        "ARENA_COINS_INSUFFICIENT",
      );
    }
    const session = db
      .prepare(
        `SELECT *
         FROM arena_trade_sessions
         WHERE id = ?
         LIMIT 1`,
      )
      .get(normalizedSessionId);
    if (!session) {
      throw new ArenaHttpError(
        404,
        "Trade session not found.",
        "ARENA_TRADE_SESSION_NOT_FOUND",
      );
    }
    if (session.status !== "active") {
      throw new ArenaHttpError(
        409,
        "This trade session is no longer active.",
        "ARENA_TRADE_SESSION_INACTIVE",
      );
    }
    if (session.askerId !== userId && session.responderId !== userId) {
      throw new ArenaHttpError(
        403,
        "You are not a participant in this trade.",
        "ARENA_TRADE_NOT_PARTICIPANT",
      );
    }

    const now = nowIso();
    if (session.askerId === userId) {
      db.prepare(
        `UPDATE arena_trade_sessions
         SET askerCoins = ?, askerConfirmed = 0, responderConfirmed = 0, updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(coinAmount, now, normalizedSessionId);
    } else {
      db.prepare(
        `UPDATE arena_trade_sessions
         SET responderCoins = ?, askerConfirmed = 0, responderConfirmed = 0, updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(coinAmount, now, normalizedSessionId);
    }
  });

  tx();
  const session = getTradeSession(db, userId, normalizedSessionId);
  _notifyUsers([session.askerId, session.responderId].filter(Boolean), S2C.ARENA_TRADE_SESSION_UPDATE, session);
  return session;
}

function removeCoinFromTrade(db, userId, sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  const tx = db.transaction(() => {
    ensureArenaProfile(db, userId);
    const session = db
      .prepare(
        `SELECT *
         FROM arena_trade_sessions
         WHERE id = ?
         LIMIT 1`,
      )
      .get(normalizedSessionId);
    if (!session) {
      throw new ArenaHttpError(
        404,
        "Trade session not found.",
        "ARENA_TRADE_SESSION_NOT_FOUND",
      );
    }
    if (session.status !== "active") {
      throw new ArenaHttpError(
        409,
        "This trade session is no longer active.",
        "ARENA_TRADE_SESSION_INACTIVE",
      );
    }
    if (session.askerId !== userId && session.responderId !== userId) {
      throw new ArenaHttpError(
        403,
        "You are not a participant in this trade.",
        "ARENA_TRADE_NOT_PARTICIPANT",
      );
    }

    const now = nowIso();
    if (session.askerId === userId) {
      db.prepare(
        `UPDATE arena_trade_sessions
         SET askerCoins = 0, askerConfirmed = 0, responderConfirmed = 0, updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(now, normalizedSessionId);
    } else {
      db.prepare(
        `UPDATE arena_trade_sessions
         SET responderCoins = 0, askerConfirmed = 0, responderConfirmed = 0, updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(now, normalizedSessionId);
    }
  });

  tx();
  const session = getTradeSession(db, userId, normalizedSessionId);
  _notifyUsers([session.askerId, session.responderId].filter(Boolean), S2C.ARENA_TRADE_SESSION_UPDATE, session);
  return session;
}

function confirmTrade(db, userId, sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  const tx = db.transaction(() => {
    ensureArenaProfile(db, userId);
    const session = db
      .prepare(
        `SELECT *
         FROM arena_trade_sessions
         WHERE id = ?
         LIMIT 1`,
      )
      .get(normalizedSessionId);
    if (!session) {
      throw new ArenaHttpError(
        404,
        "Trade session not found.",
        "ARENA_TRADE_SESSION_NOT_FOUND",
      );
    }
    if (session.status !== "active") {
      throw new ArenaHttpError(
        409,
        "This trade session is no longer active.",
        "ARENA_TRADE_SESSION_INACTIVE",
      );
    }
    if (session.askerId !== userId && session.responderId !== userId) {
      throw new ArenaHttpError(
        403,
        "You are not a participant in this trade.",
        "ARENA_TRADE_NOT_PARTICIPANT",
      );
    }

    const isAsker = session.askerId === userId;
    const userCardInstanceIds = tradeCardIdsForSide(session, isAsker ? "asker" : "responder");
    const userCoins = isAsker ? (session.askerCoins || 0) : (session.responderCoins || 0);

    // Validate card ownership if cards are placed
    const selectPlacedCardStmt = db.prepare(
      `SELECT cardJson
       FROM arena_card_collection
       WHERE userId = ? AND cardInstanceId = ?
       LIMIT 1`,
    );
    for (const userCardInstanceId of userCardInstanceIds) {
      const collectionRow = selectPlacedCardStmt.get(userId, userCardInstanceId);
      if (!collectionRow) {
        throw new ArenaHttpError(
          404,
          "Your offered card was not found in your collection.",
          "ARENA_COLLECTION_CARD_NOT_FOUND",
        );
      }
      const card = normalizeSelectedCard(collectionRow.cardJson);
      if (!card) {
        throw new ArenaHttpError(
          409,
          "Your card data is invalid.",
          "ARENA_COLLECTION_CARD_INVALID",
        );
      }
    }

    // Validate coin balance if coins are offered
    if (userCoins > 0) {
      const freshProfile = db
        .prepare("SELECT coins FROM arena_profiles WHERE userId = ?")
        .get(userId);
      if (!freshProfile || freshProfile.coins < userCoins) {
        throw new ArenaHttpError(
          400,
          "You do not have enough coins.",
          "ARENA_COINS_INSUFFICIENT",
        );
      }
    }

    const now = nowIso();
    if (isAsker) {
      db.prepare(
        `UPDATE arena_trade_sessions
         SET askerConfirmed = 1, updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(now, normalizedSessionId);
    } else {
      db.prepare(
        `UPDATE arena_trade_sessions
         SET responderConfirmed = 1, updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(now, normalizedSessionId);
    }

    // Check if both confirmed
    const updated = db
      .prepare(
        `SELECT *
         FROM arena_trade_sessions
         WHERE id = ?
         LIMIT 1`,
      )
      .get(normalizedSessionId);

    if (updated.askerConfirmed === 1 && updated.responderConfirmed === 1) {
      const askerCardInstanceIds = tradeCardIdsForSide(updated, "asker");
      const responderCardInstanceIds = tradeCardIdsForSide(updated, "responder");
      const askerCoinAmount = updated.askerCoins || 0;
      const responderCoinAmount = updated.responderCoins || 0;

      // Validate coin balances again before executing
      if (askerCoinAmount > 0) {
        const askerProfile = db
          .prepare("SELECT coins FROM arena_profiles WHERE userId = ?")
          .get(updated.askerId);
        if (!askerProfile || askerProfile.coins < askerCoinAmount) {
          throw new ArenaHttpError(
            400,
            "Asker no longer has enough coins.",
            "ARENA_COINS_INSUFFICIENT",
          );
        }
      }
      if (responderCoinAmount > 0) {
        const responderProfile = db
          .prepare("SELECT coins FROM arena_profiles WHERE userId = ?")
          .get(updated.responderId);
        if (!responderProfile || responderProfile.coins < responderCoinAmount) {
          throw new ArenaHttpError(
            400,
            "Responder no longer has enough coins.",
            "ARENA_COINS_INSUFFICIENT",
          );
        }
      }

      // Compiled once, reused for every card on both sides of the trade.
      const selectOfferedCardStmt = db.prepare(
        `SELECT cardJson, id
         FROM arena_card_collection
         WHERE userId = ? AND cardInstanceId = ?
         LIMIT 1`,
      );
      const loadOfferedCards = (ownerId, cardInstanceIds) =>
        cardInstanceIds.map((cardInstanceId) => {
          const row = selectOfferedCardStmt.get(ownerId, cardInstanceId);
          if (!row) {
            throw new ArenaHttpError(
              409,
              "One of the cards is no longer available.",
              "ARENA_TRADE_CARD_UNAVAILABLE",
            );
          }
          const card = normalizeSelectedCard(row.cardJson);
          if (!card) {
            throw new ArenaHttpError(
              409,
              "One of the cards has invalid data.",
              "ARENA_COLLECTION_CARD_INVALID",
            );
          }
          return card;
        });

      const askerCards = loadOfferedCards(updated.askerId, askerCardInstanceIds);
      const responderCards = loadOfferedCards(updated.responderId, responderCardInstanceIds);

      // Transfer cards — one compiled DELETE for both sides.
      const deleteCollectionCardStmt = db.prepare(
        `DELETE FROM arena_card_collection
         WHERE userId = ? AND cardInstanceId = ?`,
      );
      for (const cardInstanceId of askerCardInstanceIds) {
        deleteCollectionCardStmt.run(updated.askerId, cardInstanceId);
      }
      for (const cardInstanceId of responderCardInstanceIds) {
        deleteCollectionCardStmt.run(updated.responderId, cardInstanceId);
      }
      for (const card of askerCards) {
        insertCollectionCard(db, updated.responderId, card);
      }
      for (const card of responderCards) {
        insertCollectionCard(db, updated.askerId, card);
      }

      if (
        askerCardInstanceIds.length !== askerCards.length ||
        responderCardInstanceIds.length !== responderCards.length
      ) {
          throw new ArenaHttpError(
            409,
            "One of the cards is no longer available.",
            "ARENA_TRADE_CARD_UNAVAILABLE",
          );
      }

      clearSelectedCardsForCompletedTrade(db, updated, now);

      // Transfer coins. The payer is debited the full amount; the receiver is
      // credited the amount minus a commission that is burned (improve.md §7).
      if (askerCoinAmount > 0) {
        const netToResponder = askerCoinAmount - tradeCoinCommission(askerCoinAmount);
        db.prepare("UPDATE arena_profiles SET coins = coins - ?, updatedAt = ? WHERE userId = ?")
          .run(askerCoinAmount, now, updated.askerId);
        db.prepare("UPDATE arena_profiles SET coins = coins + ?, updatedAt = ? WHERE userId = ?")
          .run(netToResponder, now, updated.responderId);
      }
      if (responderCoinAmount > 0) {
        const netToAsker = responderCoinAmount - tradeCoinCommission(responderCoinAmount);
        db.prepare("UPDATE arena_profiles SET coins = coins - ?, updatedAt = ? WHERE userId = ?")
          .run(responderCoinAmount, now, updated.responderId);
        db.prepare("UPDATE arena_profiles SET coins = coins + ?, updatedAt = ? WHERE userId = ?")
          .run(netToAsker, now, updated.askerId);
      }

      db.prepare(
        `UPDATE arena_trade_sessions
         SET status = 'completed', completedAt = ?, updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(now, now, normalizedSessionId);
    }
  });

  tx();
  const session = getTradeSession(db, userId, normalizedSessionId);
  _notifyUsers([session.askerId, session.responderId].filter(Boolean), S2C.ARENA_TRADE_SESSION_UPDATE, session);
  return session;
}

function unconfirmTrade(db, userId, sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  const tx = db.transaction(() => {
    ensureArenaProfile(db, userId);
    const session = db
      .prepare(
        `SELECT *
         FROM arena_trade_sessions
         WHERE id = ?
         LIMIT 1`,
      )
      .get(normalizedSessionId);
    if (!session) {
      throw new ArenaHttpError(
        404,
        "Trade session not found.",
        "ARENA_TRADE_SESSION_NOT_FOUND",
      );
    }
    if (session.status !== "active") {
      throw new ArenaHttpError(
        409,
        "This trade session is no longer active.",
        "ARENA_TRADE_SESSION_INACTIVE",
      );
    }
    if (session.askerId !== userId && session.responderId !== userId) {
      throw new ArenaHttpError(
        403,
        "You are not a participant in this trade.",
        "ARENA_TRADE_NOT_PARTICIPANT",
      );
    }

    const now = nowIso();
    if (session.askerId === userId && session.askerConfirmed === 1) {
      db.prepare(
        `UPDATE arena_trade_sessions
         SET askerConfirmed = 0, updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(now, normalizedSessionId);
    } else if (session.responderId === userId && session.responderConfirmed === 1) {
      db.prepare(
        `UPDATE arena_trade_sessions
         SET responderConfirmed = 0, updatedAt = ?
         WHERE id = ? AND status = 'active'`,
      ).run(now, normalizedSessionId);
    }
  });

  tx();
  const session = getTradeSession(db, userId, normalizedSessionId);
  _notifyUsers([session.askerId, session.responderId].filter(Boolean), S2C.ARENA_TRADE_SESSION_UPDATE, session);
  return session;
}

function cancelTradeSession(db, userId, sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  let otherUserId;
  const tx = db.transaction(() => {
    ensureArenaProfile(db, userId);
    const session = db
      .prepare(
        `SELECT *
         FROM arena_trade_sessions
         WHERE id = ?
         LIMIT 1`,
      )
      .get(normalizedSessionId);
    if (!session) {
      throw new ArenaHttpError(
        404,
        "Trade session not found.",
        "ARENA_TRADE_SESSION_NOT_FOUND",
      );
    }
    if (session.status !== "active") {
      throw new ArenaHttpError(
        409,
        "This trade session is no longer active.",
        "ARENA_TRADE_SESSION_INACTIVE",
      );
    }
    if (session.askerId !== userId && session.responderId !== userId) {
      throw new ArenaHttpError(
        403,
        "You are not a participant in this trade.",
        "ARENA_TRADE_NOT_PARTICIPANT",
      );
    }

    otherUserId = session.askerId === userId ? session.responderId : session.askerId;
    const now = nowIso();
    db.prepare(
      `UPDATE arena_trade_sessions
       SET status = 'cancelled', updatedAt = ?
       WHERE id = ? AND status = 'active'`,
    ).run(now, normalizedSessionId);
  });

  tx();
  _notifyUsers([userId, otherUserId].filter(Boolean), S2C.ARENA_TRADE_SESSION_UPDATE, { status: "cancelled", sessionId: normalizedSessionId });
  return { status: "cancelled" };
}

module.exports = {
  parseTradeCardIds,
  uniqueTradeCardIds,
  tradeCardIdsForSide,
  serializeTradeCardIds,
  primaryTradeCardId,
  findActiveTradeSessionUsingCard,
  loadTradeCardsForOwner,
  createArenaTradeListing,
  normalizeTradeListingRow,
  getArenaTradeListings,
  getMyArenaTradeListings,
  cancelArenaTradeListing,
  sendTradeRequest,
  getIncomingTradeRequests,
  getTradeRequestForUser,
  acceptTradeRequest,
  denyTradeRequest,
  cancelTradeRequest,
  getTradeSession,
  clearSelectedCardsForCompletedTrade,
  offerCardInTrade,
  removeCardFromTrade,
  offerCoinInTrade,
  removeCoinFromTrade,
  confirmTrade,
  unconfirmTrade,
  cancelTradeSession,
};
