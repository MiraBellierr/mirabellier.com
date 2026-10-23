const express = require("express");
const { isOwner } = require("../lib/authz");
const {
  drawArenaCard,
  ensureArenaCardPool,
  getArenaCharacterCatalog,
  rarityFromCharacterRank,
} = require("../lib/arena-characters");
const { rerollArenaCardShopOffers } = require("../lib/arena/card-shop");
const { createArenaCompensation } = require("../lib/arena/compensation");
const { readArenaMetrics } = require("../lib/arena-monitoring");
const { ArenaHttpError } = require("../lib/arena/utils");

const CARD_IV_MIN = 0;
const CARD_IV_MAX = 31;

function setNoStoreHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toPositiveInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createCard(malCard, options = {}) {
  const catalogSize = getArenaCharacterCatalog().characters.length;
  const rarity = rarityFromCharacterRank(
    malCard.popularity,
    catalogSize > 0 ? catalogSize : 5000,
  );
  const maxIv = !!options.maxIv;
  const ivPower = maxIv ? CARD_IV_MAX : randomInt(CARD_IV_MIN, CARD_IV_MAX);
  const ivGuard = maxIv ? CARD_IV_MAX : randomInt(CARD_IV_MIN, CARD_IV_MAX);
  const ivSpeed = maxIv ? CARD_IV_MAX : randomInt(CARD_IV_MIN, CARD_IV_MAX);
  const ivEffectHit = maxIv ? CARD_IV_MAX : randomInt(CARD_IV_MIN, CARD_IV_MAX);

  return {
    cardInstanceId: makeId("card"),
    malId: toPositiveInt(malCard.malId, 0),
    title: malCard.title,
    url: malCard.url,
    imageUrl: malCard.imageUrl,
    meanScore:
      malCard.meanScore === null || malCard.meanScore === undefined
        ? null
        : Number(malCard.meanScore),
    popularity:
      malCard.popularity === null || malCard.popularity === undefined
        ? null
        : Number(malCard.popularity),
    favorites:
      malCard.favorites === null || malCard.favorites === undefined
        ? null
        : Number(malCard.favorites),
    nsfw: typeof malCard.nsfw === "string" ? malCard.nsfw : null,
    rarity,
    iv: {
      power: ivPower,
      guard: ivGuard,
      speed: ivSpeed,
      effectHit: ivEffectHit,
      total: ivPower + ivGuard + ivSpeed + ivEffectHit,
    },
    drawnAt: nowIso(),
  };
}

function readUserLookup(db, target) {
  const profile = db
    .prepare("SELECT * FROM arena_profiles WHERE userId = ?")
    .get(target.id);

  return {
    id: target.id,
    username: target.username,
    avatar: target.avatar || null,
    hasArenaProfile: Boolean(profile),
    coins: profile?.coins ?? null,
    level: profile?.level ?? null,
    dailyDrawsUsed: profile?.dailyCardDrawCount ?? 0,
    lastCardDrawDate: profile?.lastCardDrawDate ?? null,
  };
}

function compactArenaCharacter(character) {
  return {
    malId: character.malId,
    title: character.title,
    imageUrl: character.imageUrl,
    favorites: character.favorites,
    from: character.from || null,
    rarity: rarityFromCharacterRank(
      character.popularity,
      getArenaCharacterCatalog().characters.length,
    ),
  };
}

module.exports = function registerAdminRoutes(app, deps) {
  const { db, authFromReq } = deps;
  const router = express.Router();

  router.get("/users/lookup", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      const username = String(req.query.username || "").trim();
      if (!username) {
        return res.status(400).json({ error: "username query param is required" });
      }

      const target = db
        .prepare("SELECT id, username, avatar FROM users WHERE username = ? COLLATE NOCASE")
        .get(username);
      if (!target) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(readUserLookup(db, target));
    } catch (error) {
      res.status(500).json({ error: "Failed to look up user" });
    }
  });

  router.get("/users/suggestions", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      const q = String(req.query.q || "").trim();
      if (!q) {
        return res.json({ users: [] });
      }

      const users = db
        .prepare(
          `SELECT id, username, avatar
           FROM users
           WHERE username LIKE ? COLLATE NOCASE
           ORDER BY username ASC
           LIMIT 10`,
        )
        .all(`${q}%`)
        .map((target) => readUserLookup(db, target));

      res.json({ users });
    } catch (error) {
      res.status(500).json({ error: "Failed to suggest users" });
    }
  });

  router.get("/arena/characters/suggestions", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      const q = String(req.query.q || "").trim().toLowerCase();
      if (!q) {
        return res.json({ characters: [] });
      }

      const catalog = getArenaCharacterCatalog();
      const characters = catalog.characters
        .filter((character) => {
          const id = String(character.malId);
          const title = String(character.title || "").toLowerCase();
          const from = String(character.from || "").toLowerCase();
          return id.includes(q) || title.includes(q) || from.includes(q);
        })
        .slice(0, 12)
        .map(compactArenaCharacter);

      res.json({
        source: "mal-characters.json",
        characters,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to suggest Arena characters" });
    }
  });

  router.post("/users/:userId/coins", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      const targetUserId = req.params.userId;
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount === 0) {
        return res.status(400).json({ error: "amount must be a non-zero number" });
      }

      const profile = db
        .prepare("SELECT * FROM arena_profiles WHERE userId = ?")
        .get(targetUserId);
      if (!profile) {
        return res.status(404).json({ error: "User has no arena profile" });
      }

      const delta = Math.trunc(amount);
      const currentCoins = Math.max(toPositiveInt(profile.coins, 0), 0);
      const newCoins = currentCoins + delta;
      if (newCoins < 0) {
        return res.status(400).json({ error: "User does not have enough coins to remove that amount" });
      }

      const newLifetime = delta > 0
        ? (profile.lifetimeCoinsEarned ?? 0) + delta
        : (profile.lifetimeCoinsEarned ?? 0);
      const now = nowIso();
      db.prepare(
        "UPDATE arena_profiles SET coins = ?, lifetimeCoinsEarned = ?, updatedAt = ? WHERE userId = ?",
      ).run(newCoins, newLifetime, now, targetUserId);

      res.json({
        userId: targetUserId,
        coins: newCoins,
        added: delta,
        delta,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to update coins" });
    }
  });

  router.post("/users/:userId/cards", async (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      const targetUserId = req.params.userId;
      const count = Math.min(Math.max(Number(req.body?.count) || 1, 1), 20);
      const maxIv = req.body?.maxIv === true;

      const profile = db
        .prepare("SELECT * FROM arena_profiles WHERE userId = ?")
        .get(targetUserId);
      if (!profile) {
        return res.status(404).json({ error: "User has no arena profile" });
      }

      await ensureArenaCardPool(db);
      const cards = [];
      for (let i = 0; i < count; i++) {
        const malCard = await drawArenaCard(db);
        const card = createCard(malCard, { maxIv });
        if (!card) continue;

        const now = nowIso();
        db.prepare(
          `INSERT OR IGNORE INTO arena_card_collection (
            id, userId, cardInstanceId, cardJson, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          makeId("collection"),
          targetUserId,
          card.cardInstanceId,
          JSON.stringify(card),
          now,
          now,
        );
        cards.push({ title: card.title, rarity: card.rarity, iv: card.iv });
      }

      res.json({
        userId: targetUserId,
        added: cards.length,
        maxIv,
        cards,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to add cards" });
    }
  });

  router.post("/users/:userId/reset-draws", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      const targetUserId = req.params.userId;
      const profile = db
        .prepare("SELECT * FROM arena_profiles WHERE userId = ?")
        .get(targetUserId);
      if (!profile) {
        return res.status(404).json({ error: "User has no arena profile" });
      }

      const now = nowIso();
      db.prepare(
        "UPDATE arena_profiles SET dailyCardDrawCount = 0, lastCardDrawDate = NULL, updatedAt = ? WHERE userId = ?",
      ).run(now, targetUserId);

      res.json({
        userId: targetUserId,
        message: "Daily draws reset. User can now open packs again.",
        dailyDrawsUsed: 0,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset draws" });
    }
  });

  // Fields cleared when wiping consumable effects — mirrors every
  // consumable-related field that applyConsumableEffect / combat can mutate.
  const CONSUMABLE_EFFECT_FIELDS = [
    "damageBoostPct",
    "damageBoostFightsRemaining",
    "speedBoostPct",
    "speedBoostFightsRemaining",
    "deathSaveCharges",
    "statSteroidPct",
    "statSteroidFightsRemaining",
    "matchRarityCharges",
    "vampiricHealPct",
    "vampiricHealFightsRemaining",
    "critChanceBoostPct",
    "critChanceBoostFightsRemaining",
    "guardBoostPct",
    "guardBoostFightsRemaining",
    "firstAttackDoubleCharges",
    "ivBoostCharges",
    "expBoostPct",
    "expBoostWinsRemaining",
    "selfReviveHpThresholdPct",
    "selfReviveCharges",
    "fightStartShieldAmount",
    "fightStartShieldCharges",
    "evadeBoostPct",
    "evadeBoostFightsRemaining",
    "firstHitTrueDamageValue",
    "firstHitTrueDamageCharges",
    "higherRarityDamageBonusPct",
    "higherRarityDamageBonusPctCharges",
    "doublePassiveTriggerFightsRemaining",
  ];

  router.post("/users/:userId/clear-consumable-effects", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      const targetUserId = req.params.userId;
      const profile = db
        .prepare("SELECT * FROM arena_profiles WHERE userId = ?")
        .get(targetUserId);
      if (!profile) {
        return res.status(404).json({ error: "User has no arena profile" });
      }

      let effects = {};
      try {
        effects = JSON.parse(profile.effectsJson || "{}");
      } catch {
        effects = {};
      }
      if (!effects || typeof effects !== "object") effects = {};

      // Zero out every consumable-related effect field.
      let clearedCount = 0;
      CONSUMABLE_EFFECT_FIELDS.forEach((field) => {
        if (typeof effects[field] === "number" && effects[field] !== 0) {
          clearedCount++;
        }
        effects[field] = 0;
      });

      // Clear the active-consumables tracking list.
      const hadActiveEntries = Array.isArray(effects.activeConsumables) && effects.activeConsumables.length > 0;
      if (hadActiveEntries) clearedCount++;
      effects.activeConsumables = [];

      const now = nowIso();
      db.prepare(
        "UPDATE arena_profiles SET effectsJson = ?, updatedAt = ? WHERE userId = ?",
      ).run(JSON.stringify(effects), now, targetUserId);

      res.json({
        userId: targetUserId,
        message: `Cleared ${clearedCount} consumable effect(s).`,
        clearedCount,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear consumable effects" });
    }
  });

  router.post("/arena/card-shop/reroll", async (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      const payload = await rerollArenaCardShopOffers(db);
      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: "Failed to reroll card shop" });
    }
  });

  router.post("/arena/compensations", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      const compensation = createArenaCompensation(db, user.id, {
        title: req.body?.title,
        message: req.body?.message,
        coins: req.body?.coins,
        cardMalId: req.body?.cardMalId,
        cardCount: req.body?.cardCount,
        cardMaxIv: req.body?.cardMaxIv === true,
        equipmentSlot: req.body?.equipmentSlot,
        equipmentCount: req.body?.equipmentCount,
      });

      res.status(201).json({ compensation });
    } catch (error) {
      if (error instanceof ArenaHttpError) {
        return res.status(error.status).json({
          error: error.message,
          code: error.code,
          ...error.details,
        });
      }
      res.status(500).json({ error: "Failed to create compensation" });
    }
  });

  router.get("/arena/metrics", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      res.json(readArenaMetrics(db, { days: req.query.days }));
    } catch (error) {
      res.status(500).json({ error: "Failed to read Arena metrics" });
    }
  });

  app.use("/admin", router);
};
