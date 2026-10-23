const { createDrawnCard, insertCollectionCard } = require("./cards");
const { rollEquipmentPiece, insertEquipmentPiece } = require("./equipment");
const { getArenaCharacterById } = require("../arena-characters");
const {
  ArenaHttpError,
  makeId,
  nowIso,
  toPositiveInt,
} = require("./utils");

const MAX_COMPENSATION_COINS = 10_000_000;
const MAX_COMPENSATION_CARD_COUNT = 20;
const MAX_COMPENSATION_EQUIPMENT_COUNT = 20;
const EQUIPMENT_SLOTS = new Set(["weapon", "armor", "charm"]);

function parseJsonObject(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

function normalizeTitle(value) {
  const title = String(value || "").trim().slice(0, 80);
  return title || "Arena compensation";
}

function normalizeMessage(value) {
  const message = String(value || "").trim().slice(0, 500);
  return message || "Thanks for playing Arena. Please accept this compensation package.";
}

function normalizeCompensationPayload(input = {}) {
  const coins = Math.min(toPositiveInt(input.coins, 0), MAX_COMPENSATION_COINS);
  const cardMalId = toPositiveInt(input.cardMalId, 0);
  const cardCount = cardMalId > 0
    ? Math.min(Math.max(toPositiveInt(input.cardCount, 1), 1), MAX_COMPENSATION_CARD_COUNT)
    : 0;
  const cardMaxIv = input.cardMaxIv === true;
  const equipmentSlot = String(input.equipmentSlot || "").trim();
  const cleanEquipmentSlot = EQUIPMENT_SLOTS.has(equipmentSlot) ? equipmentSlot : "";
  const equipmentCount = cleanEquipmentSlot
    ? Math.min(
      Math.max(toPositiveInt(input.equipmentCount, 1), 1),
      MAX_COMPENSATION_EQUIPMENT_COUNT,
    )
    : 0;

  if (coins <= 0 && cardCount <= 0 && equipmentCount <= 0) {
    throw new ArenaHttpError(
      400,
      "Choose at least one reward: coins, a card, or equipment.",
      "ARENA_COMPENSATION_EMPTY",
    );
  }

  return {
    coins,
    cardMalId,
    cardCount,
    cardMaxIv,
    equipmentSlot: cleanEquipmentSlot || null,
    equipmentCount,
  };
}

function readCardByMalId(db, malId) {
  void db;
  const character = getArenaCharacterById(malId);
  return character ? { ...character } : null;
}

function createArenaCompensation(db, createdByUserId, input = {}) {
  const title = normalizeTitle(input.title);
  const message = normalizeMessage(input.message);
  const payload = normalizeCompensationPayload(input);

  let card = null;
  if (payload.cardMalId > 0) {
    card = readCardByMalId(db, payload.cardMalId);
    if (!card) {
      throw new ArenaHttpError(
        404,
        "Card MAL ID was not found in the Arena card pool.",
        "ARENA_COMPENSATION_CARD_NOT_FOUND",
      );
    }
  }

  const now = nowIso();
  const compensationId = makeId("comp");
  const tx = db.transaction(() => {
    const profiles = db
      .prepare("SELECT userId FROM arena_profiles ORDER BY createdAt ASC")
      .all();

    db.prepare(
      `INSERT INTO arena_compensations (
        id, title, message, payloadJson, createdByUserId, recipientCount, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      compensationId,
      title,
      message,
      JSON.stringify(payload),
      createdByUserId,
      profiles.length,
      now,
    );

    const insertClaim = db.prepare(
      `INSERT OR IGNORE INTO arena_compensation_claims (
        id, compensationId, userId, claimedAt, createdAt
      ) VALUES (?, ?, ?, NULL, ?)`,
    );
    for (const profile of profiles) {
      insertClaim.run(makeId("comp-claim"), compensationId, profile.userId, now);
    }

    return profiles.length;
  });

  const recipientCount = tx();
  return {
    id: compensationId,
    title,
    message,
    payload,
    card: card ? { malId: card.malId, title: card.title } : null,
    recipientCount,
    createdAt: now,
  };
}

function formatEquipmentSlot(slot) {
  if (slot === "weapon") return "Blade";
  if (slot === "armor") return "Armour";
  if (slot === "charm") return "Charm";
  return "Equipment";
}

function applyCompensationReward(db, userId, payload) {
  const now = nowIso();
  const summary = {
    coins: 0,
    cards: [],
    equipment: [],
  };

  if (payload.coins > 0) {
    db.prepare(
      `UPDATE arena_profiles
       SET coins = coins + ?,
           lifetimeCoinsEarned = lifetimeCoinsEarned + ?,
           updatedAt = ?
       WHERE userId = ?`,
    ).run(payload.coins, payload.coins, now, userId);
    summary.coins = payload.coins;
  }

  if (payload.cardMalId > 0 && payload.cardCount > 0) {
    const malCard = readCardByMalId(db, payload.cardMalId);
    if (malCard) {
      const cardOptions = payload.cardMaxIv ? { ivMin: 31, ivMax: 31 } : {};
      for (let i = 0; i < payload.cardCount; i += 1) {
        const card = createDrawnCard(
          { ...malCard, from: "admin-compensation" },
          cardOptions,
        );
        insertCollectionCard(db, userId, card);
        summary.cards.push({
          title: card.title,
          rarity: card.rarity,
          ivTotal: card.iv.total,
        });
      }
    }
  }

  if (payload.equipmentSlot && payload.equipmentCount > 0) {
    for (let i = 0; i < payload.equipmentCount; i += 1) {
      const piece = rollEquipmentPiece(payload.equipmentSlot);
      if (!piece) continue;
      insertEquipmentPiece(db, userId, piece);
      summary.equipment.push({
        slot: piece.slot,
        name: formatEquipmentSlot(piece.slot),
        mainStatType: piece.mainStatType,
        mainStatValue: piece.mainStatValue,
        subStats: piece.subStats,
      });
    }
  }

  return summary;
}

function claimArenaCompensations(db, userId) {
  const rows = db
    .prepare(
      `SELECT
         c.id,
         c.title,
         c.message,
         c.payloadJson,
         c.createdAt,
         claim.id AS claimId
       FROM arena_compensation_claims claim
       JOIN arena_compensations c ON c.id = claim.compensationId
       WHERE claim.userId = ?
         AND claim.claimedAt IS NULL
       ORDER BY c.createdAt ASC
       LIMIT 10`,
    )
    .all(userId);

  if (rows.length === 0) return { compensations: [] };

  const claimed = [];
  const tx = db.transaction(() => {
    for (const row of rows) {
      const payload = normalizeCompensationPayload(parseJsonObject(row.payloadJson));
      const rewards = applyCompensationReward(db, userId, payload);
      const claimedAt = nowIso();
      db.prepare(
        `UPDATE arena_compensation_claims
         SET claimedAt = ?
         WHERE id = ?
           AND userId = ?
           AND claimedAt IS NULL`,
      ).run(claimedAt, row.claimId, userId);

      claimed.push({
        id: row.id,
        title: row.title,
        message: row.message || "",
        rewards,
        createdAt: row.createdAt,
        claimedAt,
      });
    }
  });

  tx();
  return { compensations: claimed };
}

module.exports = {
  createArenaCompensation,
  claimArenaCompensations,
  normalizeCompensationPayload,
};
