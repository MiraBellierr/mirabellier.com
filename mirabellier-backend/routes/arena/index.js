const express = require("express");
const { ArenaHttpError } = require("../../lib/arena/utils");
const { acceptTradeRequest, cancelTradeRequest, cancelTradeSession, confirmTrade,
  createArenaTradeListing, cancelArenaTradeListing, denyTradeRequest,
  getArenaTradeListings, getIncomingTradeRequests, getMyArenaTradeListings,
  getTradeRequestForUser, getTradeSession, offerCardInTrade, removeCardFromTrade, offerCoinInTrade,
  removeCoinFromTrade, sendTradeRequest, unconfirmTrade } = require("../../lib/arena/trade");
const { searchArenaTradeCards, searchArenaUsers } = require("../../lib/arena/archive");
const { advancePlaybackFightTurn, getActiveArenaFighters, getPlaybackFightState,
  hasActiveFight, skipPlaybackFightToEnd, startPlaybackFight } = require("../../lib/arena/playback");
const { activateArenaSkill, getArenaSkillTreePayload, resetArenaSkills } = require("../../lib/arena/skill-tree");
const { getArenaTitlesPayload, buyArenaTitle, setActiveArenaTitle } = require("../../lib/arena/titles");
const { buyArenaMarketListing, cancelArenaMarketListing, createArenaMarketListing,
  getArenaMarketListings, getArenaMarketPriceGuide, getMyArenaMarketListings } = require("../../lib/arena/market");
const { buyArenaShopCard, getArenaCardShopPayload, drawDailyCard, drawArenaPack } = require("../../lib/arena/card-shop");
const { buyShopItem, equipShopItem, getArenaShopPayload,
  useConsumable } = require("../../lib/arena/shop");
const { unequipEquipmentSlot, fodderEquipmentPiece, lockEquipmentPiece, unlockEquipmentPiece,
  getEquipmentLoadouts, saveEquipmentLoadout, restoreEquipmentLoadout,
  deleteEquipmentLoadout, enhanceEquipmentPiece, rerollEquipmentSubStat } = require("../../lib/arena/equipment");
const { createArenaUpdate, deleteArenaUpdate, getArenaUpdates } = require("../../lib/arena/updates");
const { claimArenaCompensations } = require("../../lib/arena/compensation");
const { getArenaCollectionPayload,
  sacrificeCollectionCards, selectCollectionCard, toggleCollectionCardFavorite } = require("../../lib/arena/collection");
const { getArenaArchivePayload } = require("../../lib/arena/archive");
const { getMintDuplicates, mintRainbowCard } = require("../../lib/arena/mint");
const { getArenaNotifications, getArenaNotificationUnreadCount,
  markAllArenaNotificationsRead, markArenaNotificationRead } = require("../../lib/arena/notifications");
const { getArenaProfilePayload, getArenaFightById, claimDailyLoginBonus } = require("../../lib/arena/profile");
const { getHallOfFame } = require("../../lib/arena/hall-of-fame");
const { getLeaderboard } = require("../../lib/arena/leaderboard");
const { runFight } = require("../../lib/arena/combat");
const { isOwner } = require("../../lib/authz");
const { verifyTurnstileToken } = require("../../lib/turnstile");
const { checkArenaFightRateLimit, checkArenaPlaybackRateLimit } = require("../../lib/arena-fight-guard");
const { markArenaFightVerified } = require("../../lib/arena-fight-verification");
const {
  handleArenaError,
  requireAuthUser,
  requireArenaFightVerified,
  setNoStoreHeaders,
} = require("./http");

module.exports = function registerArenaRoutes(app, deps) {
  const { db, authFromReq } = deps;
  const router = express.Router();

  router.get("/profile", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const profile = getArenaProfilePayload(db, user.id);
      const activeFight = getPlaybackFightState(db, user.id);
      setNoStoreHeaders(res);
      res.json({ ...profile, activeFight });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/daily-login/claim", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const result = claimDailyLoginBonus(db, user.id);
      setNoStoreHeaders(res);
      res.json(result);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/updates", (req, res) => {
    try {
      const updates = getArenaUpdates(db, { limit: req.query?.limit });
      setNoStoreHeaders(res);
      res.json({ updates });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/compensations/claim", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = claimArenaCompensations(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/updates", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      if (!isOwner(user)) {
        throw new ArenaHttpError(
          403,
          "Only the site owner can publish Arena updates.",
          "ARENA_UPDATE_FORBIDDEN",
        );
      }
      const update = createArenaUpdate(db, user.id, {
        title: req.body?.title,
        body: req.body?.body,
      });
      setNoStoreHeaders(res);
      res.status(201).json({ update });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.delete("/updates/:updateId", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      if (!isOwner(user)) {
        throw new ArenaHttpError(
          403,
          "Only the site owner can delete Arena updates.",
          "ARENA_UPDATE_FORBIDDEN",
        );
      }
      const payload = deleteArenaUpdate(db, req.params.updateId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/verify", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      await verifyTurnstileToken(req, req.body?.turnstileToken, "arena_fight");
      markArenaFightVerified(user.id);
      setNoStoreHeaders(res);
      res.json({ ok: true });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/collection", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getArenaCollectionPayload(db, user.id, {
        page: req.query?.page,
        perPage: req.query?.perPage,
        sort: req.query?.sort,
        search: req.query?.search,
        element: req.query?.element,
        duplicates: req.query?.duplicates,
      });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/archive", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getArenaArchivePayload(db, user.id, {
        page: req.query?.page,
        perPage: req.query?.perPage,
        search: req.query?.search,
        ownership: req.query?.ownership,
      });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/skill-tree", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getArenaSkillTreePayload(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/skill-tree/activate", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const nodeId = String(req.body?.nodeId || "").trim();
      if (!nodeId) {
        throw new ArenaHttpError(
          400,
          "nodeId is required.",
          "ARENA_SKILL_NODE_REQUIRED",
        );
      }
      const payload = activateArenaSkill(db, user.id, nodeId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/skill-tree/reset", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = resetArenaSkills(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/collection/select-card", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const cardInstanceId = String(req.body?.cardInstanceId || "").trim();
      if (!cardInstanceId) {
        throw new ArenaHttpError(
          400,
          "cardInstanceId is required.",
          "ARENA_CARD_INSTANCE_REQUIRED",
        );
      }

      const payload = selectCollectionCard(db, user.id, cardInstanceId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/collection/toggle-favorite", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const cardInstanceId = String(req.body?.cardInstanceId || "").trim();
      if (!cardInstanceId) {
        throw new ArenaHttpError(400, "cardInstanceId is required.", "ARENA_CARD_INSTANCE_REQUIRED");
      }

      const payload = toggleCollectionCardFavorite(db, user.id, cardInstanceId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/collection/sacrifice", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = sacrificeCollectionCards(db, user.id, {
        cardInstanceIds: req.body?.cardInstanceIds,
        confirm: req.body?.confirm === true,
      });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/market/listings", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getArenaMarketListings(db, user.id, {
        page: req.query?.page,
        limit: req.query?.limit,
        search: req.query?.search,
        rarity: req.query?.rarity,
        ivBand: req.query?.ivBand,
        sort: req.query?.sort,
      });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/market/price", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getArenaMarketPriceGuide(db, user.id, {
        malId: req.query?.malId,
        ivTotal: req.query?.ivTotal,
        rarity: req.query?.rarity,
      });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/market/listings/mine", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getMyArenaMarketListings(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/market/listings", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = createArenaMarketListing(db, user.id, {
        cardInstanceId: req.body?.cardInstanceId,
        price: req.body?.price,
      });
      setNoStoreHeaders(res);
      res.status(201).json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/market/listings/:listingId/buy", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = buyArenaMarketListing(
        db,
        user.id,
        req.params.listingId,
      );
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/market/listings/:listingId/cancel", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = cancelArenaMarketListing(
        db,
        user.id,
        req.params.listingId,
      );
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/fight", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      requireArenaFightVerified(user.id);
      if (hasActiveFight(db, user.id)) {
        throw new ArenaHttpError(
          409,
          "A fight is already in progress. Finish it first.",
          "ARENA_FIGHT_ACTIVE",
          { activeFight: getPlaybackFightState(db, user.id) },
        );
      }
      const rateLimit = checkArenaFightRateLimit(req, user.id);
      if (!rateLimit.allowed) {
        throw new ArenaHttpError(
          429,
          "Too many fight attempts. Please wait before trying again.",
          "ARENA_FIGHT_RATE_LIMIT",
          { retryAfterMs: rateLimit.retryAfterMs },
        );
      }
      const payload = await runFight(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/fight/start", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      requireArenaFightVerified(user.id);
      const rateLimit = checkArenaFightRateLimit(req, user.id);
      if (!rateLimit.allowed) {
        throw new ArenaHttpError(
          429,
          "Too many fight attempts. Please wait before trying again.",
          "ARENA_FIGHT_RATE_LIMIT",
          { retryAfterMs: rateLimit.retryAfterMs },
        );
      }
      const payload = await startPlaybackFight(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/fight/state", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const state = getPlaybackFightState(db, user.id);
      setNoStoreHeaders(res);
      res.json({ activeFight: state });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/fight/advance", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      requireArenaFightVerified(user.id);
      const rateLimit = checkArenaPlaybackRateLimit(req, user.id);
      if (!rateLimit.allowed) {
        throw new ArenaHttpError(
          429,
          "Too many fight actions. Please slow down.",
          "ARENA_FIGHT_RATE_LIMIT",
          { retryAfterMs: rateLimit.retryAfterMs },
        );
      }
      const payload = advancePlaybackFightTurn(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/fight/skip", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      requireArenaFightVerified(user.id);
      const rateLimit = checkArenaPlaybackRateLimit(req, user.id);
      if (!rateLimit.allowed) {
        throw new ArenaHttpError(
          429,
          "Too many fight actions. Please slow down.",
          "ARENA_FIGHT_RATE_LIMIT",
          { retryAfterMs: rateLimit.retryAfterMs },
        );
      }
      const payload = skipPlaybackFightToEnd(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  // ── Spectator mode (read-only, public — no verification/rate-limit gate,
  // those exist to slow down the fighter's own actions, not viewers) ──

  router.get("/spectate/active", async (req, res) => {
    try {
      setNoStoreHeaders(res);
      res.json({ fighters: getActiveArenaFighters(db) });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/spectate/:userId", async (req, res) => {
    try {
      const state = getPlaybackFightState(db, req.params.userId);
      if (!state) {
        throw new ArenaHttpError(
          404,
          "No active fight for this user.",
          "ARENA_FIGHT_NOT_FOUND",
        );
      }
      setNoStoreHeaders(res);
      res.json({ activeFight: state });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  // ── Replay links (read-only, public — see suggestion #17) ──

  router.get("/fights/:id", async (req, res) => {
    try {
      const fight = getArenaFightById(db, req.params.id);
      if (!fight) {
        throw new ArenaHttpError(404, "Fight not found.", "ARENA_FIGHT_NOT_FOUND");
      }
      setNoStoreHeaders(res);
      res.json({ fight });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/draw-card", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = await drawDailyCard(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/draw-pack", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const count = Number(req.body?.count) || 5;
      const payload = await drawArenaPack(db, user.id, count);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/shop", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getArenaShopPayload(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/shop/cards", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const forceRandomPack = req.query.forceRandomPack === "1" && isOwner(user);
      const payload = await getArenaCardShopPayload(db, user.id, { forceRandomPack });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/shop/cards/buy", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const forceRandomPack = req.body?.forceRandomPack === true && isOwner(user);
      const payload = await buyArenaShopCard(db, user.id, {
        kind: req.body?.kind,
        offerId: req.body?.offerId,
      }, { forceRandomPack });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/shop/buy", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const itemId = String(req.body?.itemId || "").trim();
      if (!itemId) {
        throw new ArenaHttpError(400, "itemId is required.", "ARENA_ITEM_REQUIRED");
      }

      const payload = buyShopItem(db, user.id, itemId, req.body?.quantity);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/shop/use-consumable", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const itemId = String(req.body?.itemId || "").trim();
      if (!itemId) {
        throw new ArenaHttpError(400, "itemId is required.", "ARENA_ITEM_REQUIRED");
      }
      const force = Boolean(req.body?.force);
      const replaceItemId = typeof req.body?.replaceItemId === "string"
        ? req.body.replaceItemId.trim()
        : "";

      const payload = useConsumable(db, user.id, itemId, {
        force,
        replaceItemId: replaceItemId || null,
      });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/shop/equip", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const pieceId = String(req.body?.pieceId || "").trim();
      if (!pieceId) {
        throw new ArenaHttpError(400, "pieceId is required.", "ARENA_PIECE_REQUIRED");
      }

      const payload = equipShopItem(db, user.id, pieceId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/shop/unequip", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const slot = String(req.body?.slot || "").trim();
      if (!slot || !["weapon", "armor", "charm"].includes(slot)) {
        throw new ArenaHttpError(400, "Valid slot is required (weapon, armor, charm).", "ARENA_SLOT_REQUIRED");
      }

      unequipEquipmentSlot(db, user.id, slot);
      setNoStoreHeaders(res);
      res.json({ success: true, slot });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/shop/fodder", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const pieceId = String(req.body?.pieceId || "").trim();
      if (!pieceId) {
        throw new ArenaHttpError(400, "pieceId is required.", "ARENA_PIECE_REQUIRED");
      }

      const payload = fodderEquipmentPiece(db, user.id, pieceId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/shop/enhance", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const pieceId = String(req.body?.pieceId || "").trim();
      const fodderPieceId = String(req.body?.fodderPieceId || "").trim();
      const result = enhanceEquipmentPiece(db, user.id, pieceId, fodderPieceId);
      const shop = getArenaShopPayload(db, user.id);
      setNoStoreHeaders(res);
      res.json({ ...result, shop });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/shop/reroll-substat", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const pieceId = String(req.body?.pieceId || "").trim();
      const fodderPieceId = String(req.body?.fodderPieceId || "").trim();
      const subStatIndex = Number(req.body?.subStatIndex);
      const result = rerollEquipmentSubStat(
        db,
        user.id,
        pieceId,
        subStatIndex,
        fodderPieceId,
      );
      const shop = getArenaShopPayload(db, user.id);
      setNoStoreHeaders(res);
      res.json({ ...result, shop });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/shop/titles", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getArenaTitlesPayload(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/shop/titles/buy", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const titleId = String(req.body?.titleId || "").trim();
      if (!titleId) {
        throw new ArenaHttpError(400, "titleId is required.", "ARENA_TITLE_REQUIRED");
      }
      const payload = buyArenaTitle(db, user.id, titleId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/shop/titles/activate", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      // Empty / null titleId clears the active title.
      const titleId = String(req.body?.titleId || "").trim();
      const payload = setActiveArenaTitle(db, user.id, titleId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/loadout/save", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const name = String(req.body?.name || "").trim();
      const payload = saveEquipmentLoadout(db, user.id, name);
      const shop = getArenaShopPayload(db, user.id);
      setNoStoreHeaders(res);
      res.json({ loadout: payload, shop });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/loadout/restore", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const loadoutId = String(req.body?.loadoutId || "").trim();
      if (!loadoutId) {
        throw new ArenaHttpError(400, "loadoutId is required.", "ARENA_LOADOUT_REQUIRED");
      }
      const result = restoreEquipmentLoadout(db, user.id, loadoutId);
      const shop = getArenaShopPayload(db, user.id);
      setNoStoreHeaders(res);
      res.json({ ...result, shop });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/loadout/delete", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const loadoutId = String(req.body?.loadoutId || "").trim();
      if (!loadoutId) {
        throw new ArenaHttpError(400, "loadoutId is required.", "ARENA_LOADOUT_REQUIRED");
      }
      const result = deleteEquipmentLoadout(db, user.id, loadoutId);
      const shop = getArenaShopPayload(db, user.id);
      setNoStoreHeaders(res);
      res.json({ ...result, shop });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/shop/lock", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const pieceId = String(req.body?.pieceId || "").trim();
      if (!pieceId) {
        throw new ArenaHttpError(400, "pieceId is required.", "ARENA_PIECE_REQUIRED");
      }
      const result = lockEquipmentPiece(db, user.id, pieceId);
      setNoStoreHeaders(res);
      res.json(result);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/shop/unlock", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const pieceId = String(req.body?.pieceId || "").trim();
      if (!pieceId) {
        throw new ArenaHttpError(400, "pieceId is required.", "ARENA_PIECE_REQUIRED");
      }
      const result = unlockEquipmentPiece(db, user.id, pieceId);
      setNoStoreHeaders(res);
      res.json(result);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/leaderboard", (req, res) => {
    try {
      const metric = String(req.query?.metric || "level");
      const payload = getLeaderboard(db, metric, {
        page: req.query?.page,
        perPage: req.query?.perPage,
      });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  // ---------------------------------------------------------------
  //  Trade
  // ---------------------------------------------------------------

  router.get("/trade/users", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const q = String(req.query?.q || "").trim();
      if (!q || q.length < 1) {
        setNoStoreHeaders(res);
        return res.json({ users: [] });
      }
      const users = searchArenaUsers(db, q, user.id);
      setNoStoreHeaders(res);
      res.json({ users });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/trade/cards", (req, res) => {
    try {
      requireAuthUser(req, authFromReq);
      const q = String(req.query?.q || "").trim();
      const cards = q ? searchArenaTradeCards(q) : [];
      setNoStoreHeaders(res);
      res.json({ cards });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/trade/listings", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getArenaTradeListings(db, user.id, {
        page: req.query?.page,
        limit: req.query?.limit,
        search: req.query?.search,
        wantedRarity: req.query?.wantedRarity,
        wantedElement: req.query?.wantedElement,
      });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/trade/listings/mine", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getMyArenaTradeListings(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/listings", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = createArenaTradeListing(db, user.id, {
        cardInstanceId: req.body?.cardInstanceId,
        wantedCardMalId: req.body?.wantedCardMalId,
        wantedRarity: req.body?.wantedRarity,
        wantedElement: req.body?.wantedElement,
        note: req.body?.note,
      });
      setNoStoreHeaders(res);
      res.status(201).json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/listings/:listingId/cancel", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = cancelArenaTradeListing(
        db,
        user.id,
        req.params.listingId,
      );
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/request", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = sendTradeRequest(db, user.id, req.body?.responderId, req.body?.cardInstanceId, {
        listingId: req.body?.listingId,
      });
      setNoStoreHeaders(res);
      res.status(201).json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/trade/request/:requestId", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getTradeRequestForUser(db, user.id, req.params.requestId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/trade/requests/incoming", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const requests = getIncomingTradeRequests(db, user.id);
      setNoStoreHeaders(res);
      res.json({ requests });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/requests/:requestId/accept", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = acceptTradeRequest(db, user.id, req.params.requestId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/requests/:requestId/deny", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = denyTradeRequest(db, user.id, req.params.requestId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/requests/:requestId/cancel", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = cancelTradeRequest(db, user.id, req.params.requestId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/trade/session/:sessionId", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const session = getTradeSession(db, user.id, req.params.sessionId);
      setNoStoreHeaders(res);
      res.json({ session });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/session/:sessionId/offer-card", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = offerCardInTrade(
        db,
        user.id,
        req.params.sessionId,
        req.body?.cardInstanceId,
      );
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/session/:sessionId/remove-card", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = removeCardFromTrade(
        db,
        user.id,
        req.params.sessionId,
        req.body?.cardInstanceId,
      );
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/session/:sessionId/offer-coins", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = offerCoinInTrade(
        db,
        user.id,
        req.params.sessionId,
        req.body?.amount,
      );
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/session/:sessionId/remove-coins", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = removeCoinFromTrade(
        db,
        user.id,
        req.params.sessionId,
      );
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/session/:sessionId/confirm", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = confirmTrade(db, user.id, req.params.sessionId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/session/:sessionId/unconfirm", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = unconfirmTrade(db, user.id, req.params.sessionId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/trade/session/:sessionId/cancel", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = cancelTradeSession(db, user.id, req.params.sessionId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  // ---------------------------------------------------------------
  //  Notifications
  // ---------------------------------------------------------------

  router.get("/notifications", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getArenaNotifications(db, user.id, {
        page: req.query?.page,
        limit: req.query?.limit,
      });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/notifications/unread-count", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const count = getArenaNotificationUnreadCount(db, user.id);
      setNoStoreHeaders(res);
      res.json({ count });
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/notifications/:notificationId/read", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = markArenaNotificationRead(db, user.id, req.params.notificationId);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/mint/duplicates", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = getMintDuplicates(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/mint", async (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = mintRainbowCard(db, user.id, req.body?.cardInstanceId1, req.body?.cardInstanceId2);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.post("/notifications/read-all", (req, res) => {
    try {
      const user = requireAuthUser(req, authFromReq);
      const payload = markAllArenaNotificationsRead(db, user.id);
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  router.get("/hall-of-fame", (req, res) => {
    try {
      const month = req.query.month || null;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const payload = getHallOfFame(db, { month, page, perPage: 12 });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      handleArenaError(error, res);
    }
  });

  app.use("/arena", router);
};
