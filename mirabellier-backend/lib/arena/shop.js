const {
  SHOP_ITEMS, SHOP_TIERS, CATALOG_VERSION, EQUIPMENT_SET_BY_ID,
} = require("../arena-constants");
const {
  nowIso, makeId, clamp, toInt, toPositiveInt,
  MAX_ACTIVE_CONSUMABLE_EFFECTS, MAX_CONSUMABLE_INVENTORY_QUANTITY,
} = require("./utils");
const SHOP_ITEMS_BY_ID = new Map(SHOP_ITEMS.map((item) => [item.id, item]));
const {
  ACTIVE_CONSUMABLE_EFFECT_FIELDS,
  hasActiveConsumableKind,
  normalizeArenaEffects,
  pruneInactiveConsumables,
  serializeEffects,
} = require("./effects");
const { rollEquipmentPiece, insertEquipmentPiece, equipEquipmentPiece, computeEquipmentStats, getFodderRefund, getGearRollPrice } = require("./equipment");
const { ensureArenaProfile, getArenaProfilePayload, getInventoryMap } = require("./profile");
const {
  addCardItemStats,
  normalizeCardItemStats,
  serializeSelectedCard,
} = require("./cards");
const { ArenaHttpError } = require("./utils");

function clearConsumableEffectKind(effects, kind) {
  const fields = ACTIVE_CONSUMABLE_EFFECT_FIELDS[kind] || [];
  fields.forEach((field) => {
    effects[field] = 0;
  });
}

function keepConsumableValue(effects, field, value) {
  if (toPositiveInt(effects[field], 0) <= 0) {
    effects[field] = toPositiveInt(value, 0);
  }
}

function normalizeConsumableUseOptions(input) {
  if (typeof input === "boolean") {
    return { force: input, replaceItemId: null };
  }

  return {
    force: Boolean(input?.force),
    replaceItemId: typeof input?.replaceItemId === "string"
      ? input.replaceItemId.trim() || null
      : null,
  };
}

function toActiveConsumableChoice(entry) {
  const item = entry?.itemId ? SHOP_ITEMS_BY_ID.get(entry.itemId) : null;
  return {
    itemId: entry?.itemId || null,
    kind: entry?.kind || null,
    itemName: item?.name || entry?.itemId || "Unknown effect",
    activatedAt: entry?.activatedAt || null,
  };
}

function buildConsumableCapDetails(active) {
  const choices = active.map(toActiveConsumableChoice);
  const oldest = choices[0] || null;
  return {
    oldestItemId: oldest?.itemId || null,
    oldestKind: oldest?.kind || null,
    oldestItemName: oldest?.itemName || null,
    activeCount: active.length,
    maxActive: MAX_ACTIVE_CONSUMABLE_EFFECTS,
    activeConsumables: choices,
  };
}

function registerActiveConsumable(effects, item, options = false, wasActive = false) {
  const { force, replaceItemId } = normalizeConsumableUseOptions(options);
  const kind = item?.consumableEffect?.kind;
  if (!ACTIVE_CONSUMABLE_EFFECT_FIELDS[kind]) return;
  const now = nowIso();
  const hadTrackedKind =
    Array.isArray(effects.activeConsumables) &&
    effects.activeConsumables.some((entry) => entry.kind === kind);
  const active = Array.isArray(effects.activeConsumables)
    ? effects.activeConsumables.filter((entry) => entry.kind !== kind)
    : [];

  // When the cap is reached and the new kind is not already in the list,
  // require explicit force confirmation from the user before replacing.
  if (active.length >= MAX_ACTIVE_CONSUMABLE_EFFECTS) {
    if (wasActive && !hadTrackedKind) {
      effects.activeConsumables = active;
      return;
    }

    if (!force) {
      throw new ArenaHttpError(
        409,
        `You can only have ${MAX_ACTIVE_CONSUMABLE_EFFECTS} active consumable effects at once.`,
        "ARENA_CONSUMABLE_CAP_REACHED",
        buildConsumableCapDetails(active),
      );
    }

    const replaceIndex = replaceItemId
      ? active.findIndex((entry) => entry.itemId === replaceItemId)
      : 0;
    if (replaceIndex < 0) {
      throw new ArenaHttpError(
        409,
        "The selected consumable effect is no longer active.",
        "ARENA_CONSUMABLE_REPLACE_TARGET_INVALID",
        buildConsumableCapDetails(active),
      );
    }

    const [removed] = active.splice(replaceIndex, 1);
    clearConsumableEffectKind(effects, removed?.kind);
  }

  active.push({ itemId: item.id, kind, activatedAt: now });
  effects.activeConsumables = active;
}

function upsertInventoryItem(db, userId, itemId, quantityDelta) {
  const existing = db
    .prepare(
      `SELECT id, quantity
       FROM arena_inventory
       WHERE userId = ? AND itemId = ?
       LIMIT 1`,
    )
    .get(userId, itemId);
  const now = nowIso();
  const item = SHOP_ITEMS_BY_ID.get(itemId);
  const inventoryCap =
    item?.type === "consumable" ? MAX_CONSUMABLE_INVENTORY_QUANTITY : null;

  if (!existing) {
    if (quantityDelta <= 0) {
      throw new ArenaHttpError(400, "Inventory quantity cannot go below zero.");
    }
    if (inventoryCap !== null && quantityDelta > inventoryCap) {
      throw new ArenaHttpError(
        409,
        `You can only hold ${inventoryCap} of this consumable.`,
        "ARENA_INVENTORY_CAP",
        { itemId, cap: inventoryCap },
      );
    }
    db.prepare(
      `INSERT INTO arena_inventory (id, userId, itemId, quantity, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(makeId("inv"), userId, itemId, quantityDelta, now, now);
    return quantityDelta;
  }

  const nextQuantity = toInt(existing.quantity, 0) + toInt(quantityDelta, 0);
  if (nextQuantity < 0) {
    throw new ArenaHttpError(400, "Inventory quantity cannot go below zero.");
  }
  if (inventoryCap !== null && nextQuantity > inventoryCap) {
    throw new ArenaHttpError(
      409,
      `You can only hold ${inventoryCap} of this consumable.`,
      "ARENA_INVENTORY_CAP",
      { itemId, cap: inventoryCap },
    );
  }

  if (nextQuantity === 0) {
    db.prepare("DELETE FROM arena_inventory WHERE id = ?").run(existing.id);
    return 0;
  }

  db.prepare("UPDATE arena_inventory SET quantity = ?, updatedAt = ? WHERE id = ?").run(
    nextQuantity,
    now,
    existing.id,
  );
  return nextQuantity;
}

function upsertEquippedItem(db, userId, slot, itemId) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO arena_equipment (userId, slot, itemId, equippedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(userId, slot) DO UPDATE SET
       itemId = excluded.itemId,
       equippedAt = excluded.equippedAt`,
  ).run(userId, slot, itemId, now);
}

function buildShopCatalog(profile, inventoryMap) {
  const equipmentItems = [];
  const cardItems = [];
  const tierItems = [];

  SHOP_ITEMS.forEach((item) => {
    const ownedQuantity = inventoryMap.get(item.id)?.quantity || 0;
    const isOwned = ownedQuantity > 0;
    const unlocked = item.type === "card" || profile.level >= item.unlockLevel;
    // Gear rolls are priced by the buyer's level (improve.md §6).
    const price =
      item.type === "gear" ? getGearRollPrice(profile.level) : toInt(item.price, 0);
    const canBuy =
      item.acquisition === "buy" &&
      unlocked &&
      profile.coins >= price &&
      (item.type !== "consumable" ||
        ownedQuantity < MAX_CONSUMABLE_INVENTORY_QUANTITY);

    let cooldownEndsAt = null;
    if (
      item.type === "consumable" &&
      item.consumableEffect?.kind === "ascension" &&
      profile.effects.ascensionLastPurchasedAt
    ) {
      const parsed = Date.parse(profile.effects.ascensionLastPurchasedAt);
      if (Number.isFinite(parsed)) {
        const cooldownMs =
          Number(item.consumableEffect.cooldownDays || 7) * 24 * 60 * 60 * 1000;
        const cooldownEnds = parsed + cooldownMs;
        if (cooldownEnds > Date.now()) {
          cooldownEndsAt = new Date(cooldownEnds).toISOString();
        }
      }
    }

    const enriched = {
      ...item,
      price,
      ownedQuantity,
      isOwned,
      isEquipped: false,
      unlocked,
      canBuy: canBuy && !cooldownEndsAt,
      cooldownEndsAt,
    };

    if (item.type === "gear") {
      equipmentItems.push(enriched);
    } else if (item.type === "card") {
      cardItems.push(enriched);
    } else {
      tierItems.push(enriched);
    }
  });

  const tieredCatalog = SHOP_TIERS.map((tier) => ({
    tier,
    items: tierItems.filter((item) => item.tier === tier),
  }));

  return { equipment: equipmentItems, cardItems, shop: tieredCatalog };
}

function getArenaShopPayload(db, userId) {
  const profile = ensureArenaProfile(db, userId);
  const inventoryMap = getInventoryMap(db, userId);
  const { equipment, cardItems, shop } = buildShopCatalog(profile, inventoryMap);
  const { equipped } = computeEquipmentStats(db, userId);

  return {
    catalogVersion: CATALOG_VERSION,
    profile: getArenaProfilePayload(db, userId),
    equipment,
    cardItems,
    shop,
    equipped,
  };
}

function enforceAscensionCooldown(profile, item) {
  const cooldownDays = Number(item?.consumableEffect?.cooldownDays || 7);
  const previous = profile.effects.ascensionLastPurchasedAt;
  if (!previous) return;
  const parsed = Date.parse(previous);
  if (!Number.isFinite(parsed)) return;
  const cooldownEndsAt = parsed + cooldownDays * 24 * 60 * 60 * 1000;
  if (cooldownEndsAt > Date.now()) {
    throw new ArenaHttpError(
      409,
      "Solar Cauldron can only be used once every 7 days.",
      "ARENA_ASCENSION_COOLDOWN",
      { cooldownEndsAt: new Date(cooldownEndsAt).toISOString() },
    );
  }
}

function buyShopItem(db, userId, itemId, quantityInput = 1) {
  const item = SHOP_ITEMS_BY_ID.get(itemId);
  if (!item) {
    throw new ArenaHttpError(404, "Item not found.", "ARENA_ITEM_NOT_FOUND");
  }

  // Only stackable items (consumables, materials, cards) support bulk buys;
  // gear is rolled one piece per purchase.
  const stackable =
    item.type === "consumable" || item.type === "material" || item.type === "card";
  const quantity = stackable ? clamp(toPositiveInt(quantityInput, 1), 1, 20) : 1;

  const tx = db.transaction(() => {
    const profile = ensureArenaProfile(db, userId);
    if (item.type !== "card" && profile.level < item.unlockLevel) {
      throw new ArenaHttpError(
        403,
        `Reach level ${item.unlockLevel} to buy this item.`,
        "ARENA_ITEM_LOCKED",
        { unlockLevel: item.unlockLevel },
      );
    }

    if (item.acquisition !== "buy") {
      throw new ArenaHttpError(
        400,
        "This item cannot be bought.",
        "ARENA_ITEM_NOT_BUYABLE",
      );
    }

    const unitPrice =
      item.type === "gear" ? getGearRollPrice(profile.level) : toInt(item.price, 0);
    const totalCost = unitPrice * quantity;
    if (profile.coins < totalCost) {
      throw new ArenaHttpError(400, "Not enough coins.", "ARENA_NOT_ENOUGH_COINS");
    }

    profile.coins -= totalCost;
    profile.updatedAt = nowIso();

    let appliedInstantly = false;
    let rolledPieceId = null;
    let rolledPieceData = null;
    const effects = normalizeArenaEffects(profile.effects);
    if (item.type === "gear") {
      const piece = rollEquipmentPiece(item.slot);
      if (!piece) {
        throw new ArenaHttpError(500, "Failed to roll equipment piece.");
      }
      rolledPieceId = insertEquipmentPiece(db, userId, piece);
      rolledPieceData = {
        ...piece,
        setName: piece.setId ? (EQUIPMENT_SET_BY_ID.get(piece.setId)?.name || null) : null,
        fodderRefund: getFodderRefund(piece.slot, 0, profile.level),
      };
    } else if (stackable) {
      upsertInventoryItem(db, userId, item.id, quantity);
    }

    db.prepare(
      `UPDATE arena_profiles
       SET coins = ?,
           hp = ?,
           power = ?,
           guard = ?,
           speed = ?,
           effectHit = ?,
           effectsJson = ?,
           updatedAt = ?
       WHERE userId = ?`,
    ).run(
      profile.coins,
      profile.hp,
      profile.power,
      profile.guard,
      profile.speed,
      profile.effectHit,
      serializeEffects(effects),
      profile.updatedAt,
      userId,
    );

    return {
      item,
      appliedInstantly,
      rolledPieceId,
      rolledPieceData,
    };
  });

  const result = tx();
  return {
    purchasedItemId: result.item.id,
    purchasedQuantity: quantity,
    appliedInstantly: result.appliedInstantly,
    rolledPieceId: result.rolledPieceId || null,
    rolledPiece: result.rolledPieceData || null,
    shop: getArenaShopPayload(db, userId),
  };
}

function isMaxIvCard(card) {
  const iv = card?.iv || {};
  return (
    toPositiveInt(iv.power, 0) === 31 &&
    toPositiveInt(iv.guard, 0) === 31 &&
    toPositiveInt(iv.speed, 0) === 31 &&
    toPositiveInt(iv.effectHit, 0) === 31
  );
}

function applyCardItemEffect(db, userId, profile, item) {
  const effect = item.consumableEffect || {};
  if (effect.kind !== "max_iv_card_stat_bonus") {
    throw new ArenaHttpError(400, "Unsupported card item effect.");
  }

  const selectedCard = profile.selectedCard;
  if (!selectedCard) {
    throw new ArenaHttpError(
      409,
      "Select a card before using this item.",
      "ARENA_CARD_REQUIRED",
    );
  }

  if (!isMaxIvCard(selectedCard)) {
    throw new ArenaHttpError(
      409,
      "This item can only be used on a selected card with all IVs at 31.",
      "ARENA_CARD_MAX_IV_REQUIRED",
    );
  }

  const appliedItemIds = Array.isArray(selectedCard.cardItemIds)
    ? selectedCard.cardItemIds
    : [];
  if (appliedItemIds.includes(item.id)) {
    throw new ArenaHttpError(
      409,
      "This card item has already been used on the selected card.",
      "ARENA_CARD_ITEM_ALREADY_APPLIED",
    );
  }

  const nextCard = {
    ...selectedCard,
    cardItemStats: addCardItemStats(
      selectedCard.cardItemStats,
      normalizeCardItemStats(effect.stats),
    ),
    cardItemIds: [...appliedItemIds, item.id],
  };
  const serializedCard = serializeSelectedCard(nextCard);
  const updatedAt = nowIso();

  db.prepare(
    `UPDATE arena_profiles
     SET selectedCardJson = ?, updatedAt = ?
     WHERE userId = ?`,
  ).run(serializedCard, updatedAt, userId);

  if (nextCard.cardInstanceId) {
    db.prepare(
      `UPDATE arena_card_collection
       SET cardJson = ?, updatedAt = ?
       WHERE userId = ? AND cardInstanceId = ?`,
    ).run(serializedCard, updatedAt, userId, nextCard.cardInstanceId);
  }

  return nextCard;
}

function applyConsumableEffect(profile, item, options = false) {
  const effect = item.consumableEffect || {};
  const effects = normalizeArenaEffects(profile.effects);
  const wasActive = hasActiveConsumableKind(effects, effect.kind);
  const now = nowIso();

  if (effect.kind === "damage_boost") {
    keepConsumableValue(effects, "damageBoostPct", effect.pct);
    const fights = toPositiveInt(effect.fights, 1);
    effects.damageBoostFightsRemaining += fights;
  } else if (effect.kind === "speed_boost") {
    keepConsumableValue(effects, "speedBoostPct", effect.pct);
    const fights = toPositiveInt(effect.fights, 1);
    effects.speedBoostFightsRemaining += fights;
  } else if (effect.kind === "death_save") {
    const charges = toPositiveInt(effect.charges, 1);
    effects.deathSaveCharges += charges;
  } else if (effect.kind === "stat_steroid") {
    keepConsumableValue(effects, "statSteroidPct", effect.pct);
    const fights = toPositiveInt(effect.fights, 1);
    effects.statSteroidFightsRemaining += fights;
  } else if (effect.kind === "match_rarity") {
    const charges = toPositiveInt(effect.charges, 1);
    effects.matchRarityCharges += charges;
  } else if (effect.kind === "vampiric_heal") {
    keepConsumableValue(effects, "vampiricHealPct", effect.pct);
    const fights = toPositiveInt(effect.fights, 1);
    effects.vampiricHealFightsRemaining += fights;
  } else if (effect.kind === "crit_chance") {
    keepConsumableValue(effects, "critChanceBoostPct", effect.pct);
    const fights = toPositiveInt(effect.fights, 1);
    effects.critChanceBoostFightsRemaining += fights;
  } else if (effect.kind === "guard_boost") {
    keepConsumableValue(effects, "guardBoostPct", effect.pct);
    const fights = toPositiveInt(effect.fights, 1);
    effects.guardBoostFightsRemaining += fights;
  } else if (effect.kind === "first_attack_double") {
    const charges = toPositiveInt(effect.charges, 1);
    effects.firstAttackDoubleCharges += charges;
  } else if (effect.kind === "iv_boost") {
    const charges = toPositiveInt(effect.charges, 1);
    effects.ivBoostCharges += charges;
  } else if (effect.kind === "exp_boost") {
    keepConsumableValue(effects, "expBoostPct", effect.pct);
    const fights = toPositiveInt(effect.fights, 1);
    effects.expBoostWinsRemaining += fights;
  } else if (effect.kind === "self_revive") {
    keepConsumableValue(effects, "selfReviveHpThresholdPct", effect.hpPct);
    const charges = toPositiveInt(effect.charges, 1);
    effects.selfReviveCharges += charges;
  } else if (effect.kind === "shield_fight_start") {
    keepConsumableValue(effects, "fightStartShieldAmount", effect.amount);
    const charges = toPositiveInt(effect.charges, 1);
    effects.fightStartShieldCharges += charges;
  } else if (effect.kind === "evade_next_fight") {
    keepConsumableValue(effects, "evadeBoostPct", effect.pct);
    const fights = toPositiveInt(effect.fights, 1);
    effects.evadeBoostFightsRemaining += fights;
  } else if (effect.kind === "first_hit_true_damage") {
    keepConsumableValue(effects, "firstHitTrueDamageValue", effect.value);
    const charges = toPositiveInt(effect.charges, 1);
    effects.firstHitTrueDamageCharges += charges;
  } else if (effect.kind === "bonus_vs_higher_rarity") {
    keepConsumableValue(effects, "higherRarityDamageBonusPct", effect.pct);
    const charges = toPositiveInt(effect.charges, 1);
    effects.higherRarityDamageBonusPctCharges += charges;
  } else if (effect.kind === "double_passive_trigger") {
    const fights = toPositiveInt(effect.fights, 1);
    effects.doublePassiveTriggerFightsRemaining += fights;
  } else if (effect.kind === "ascension") {
    enforceAscensionCooldown(profile, item);
    profile.hp += 1;
    profile.power += 1;
    profile.guard += 1;
    profile.speed += 1;
    profile.effectHit += 1;
    effects.ascensionLastPurchasedAt = now;
    effects.ascensionCount = (effects.ascensionCount || 0) + 1;
  } else {
    throw new ArenaHttpError(400, "Unsupported consumable effect.");
  }

  pruneInactiveConsumables(effects);
  if (ACTIVE_CONSUMABLE_EFFECT_FIELDS[effect.kind]) {
    registerActiveConsumable(effects, item, options, wasActive);
  }
  return normalizeArenaEffects(effects);
}

function equipShopItem(db, userId, pieceId) {
  if (!pieceId || typeof pieceId !== "string" || !pieceId.trim()) {
    throw new ArenaHttpError(400, "pieceId is required.", "ARENA_PIECE_REQUIRED");
  }

  equipEquipmentPiece(db, userId, pieceId.trim());

  const piece = db
    .prepare(`SELECT id, slot FROM arena_equipment_pieces WHERE id = ? AND userId = ?`)
    .get(pieceId.trim(), userId);
  if (!piece) {
    throw new ArenaHttpError(404, "Equipment piece not found.", "ARENA_PIECE_NOT_FOUND");
  }

  return {
    equippedPieceId: piece.id,
    slot: piece.slot,
    shop: getArenaShopPayload(db, userId),
  };
}

function useConsumable(db, userId, itemId, options = false) {
  const item = SHOP_ITEMS_BY_ID.get(itemId);
  if (!item || (item.type !== "consumable" && item.type !== "card")) {
    throw new ArenaHttpError(404, "Consumable not found.", "ARENA_CONSUMABLE_NOT_FOUND");
  }

  const tx = db.transaction(() => {
    const profile = ensureArenaProfile(db, userId);
    const inventory = getInventoryMap(db, userId);
    const owned = inventory.get(item.id)?.quantity || 0;
    if (owned <= 0) {
      throw new ArenaHttpError(
        400,
        "Consumable is not owned.",
        "ARENA_CONSUMABLE_NOT_OWNED",
      );
    }

    upsertInventoryItem(db, userId, item.id, -1);
    const nextEffects = item.type === "card"
      ? normalizeArenaEffects(profile.effects)
      : applyConsumableEffect(profile, item, options);
    if (item.type === "card") {
      applyCardItemEffect(db, userId, profile, item);
    }
    const updatedAt = nowIso();

    if (item.type === "consumable") {
      db.prepare(
        `UPDATE arena_profiles
         SET hp = ?, power = ?, guard = ?, speed = ?, effectHit = ?, effectsJson = ?, updatedAt = ?
         WHERE userId = ?`,
      ).run(
        profile.hp,
        profile.power,
        profile.guard,
        profile.speed,
        profile.effectHit,
        serializeEffects(nextEffects),
        updatedAt,
        userId,
      );
    }

    return {
      item,
      effects: nextEffects,
    };
  });

  const result = tx();
  return {
    activatedItemId: result.item.id,
    effects: result.effects,
    shop: getArenaShopPayload(db, userId),
  };
}

module.exports = {
  upsertInventoryItem,
  upsertEquippedItem,
  buildShopCatalog,
  getArenaShopPayload,
  enforceAscensionCooldown,
  buyShopItem,
  applyConsumableEffect,
  equipShopItem,
  useConsumable,
};
