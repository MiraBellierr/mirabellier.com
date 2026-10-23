const {
  ROLLABLE_EQUIPMENT, SUB_STAT_POOL,
  ENHANCEMENT_MAIN_STAT_SCALE_PER_LEVEL,
  ENHANCEMENT_SUBSTAT_BOOST_INTERVAL, ENHANCEMENT_SUBSTAT_BOOST_FRACTION,
  EQUIPMENT_SET_IDS, EQUIPMENT_SET_BY_ID,
} = require("../arena-constants");
const {
  nowIso, makeId, clamp, toInt, toPositiveInt, rollInRange,
} = require("./utils");
const { normalizeArenaEffects, serializeEffects } = require("./effects");
const { ArenaHttpError } = require("./utils");

const MAX_LOADOUTS = 5;
const MAX_ENHANCEMENT_LEVEL = 15;
const SUB_STAT_COUNT = SUB_STAT_POOL.count;

// A gear roll and a sub-stat reroll scale with the buyer's level so they stay
// worth roughly the same number of wins at every point in the game, instead of
// being a wall early and pocket change late (improve.md §6).
const GEAR_ROLL_BASE_PRICE = 250;
const GEAR_ROLL_PRICE_PER_LEVEL = 22;
const REROLL_COST_FRACTION_OF_ROLL = 0.5;

// Scrapping a piece refunds a fraction of the roll price plus a fraction of the
// coins sunk into enhancing it, so a heavily-enhanced piece is not worth the
// same as a fresh roll. Always a net loss versus what was spent.
const FODDER_ROLL_REFUND_RATE = 0.4;
const FODDER_ENHANCE_REFUND_RATE = 0.4;
const MIN_FODDER_REFUND = 150;

function getGearRollPrice(playerLevel) {
  const level = Math.max(toPositiveInt(playerLevel, 1), 1);
  return GEAR_ROLL_BASE_PRICE + level * GEAR_ROLL_PRICE_PER_LEVEL;
}

function getRerollSubStatCost(playerLevel) {
  return Math.floor(getGearRollPrice(playerLevel) * REROLL_COST_FRACTION_OF_ROLL);
}

// Back-compat alias — a nominal mid-game figure for callers/tests that still
// want a single number. Live pricing always goes through getRerollSubStatCost.
const REROLL_SUBSTAT_COIN_COST = getRerollSubStatCost(20);

// Main stat scales by a percentage of its rolled value per enhancement level.
function enhancedMainStatValue(rolledValue, enhancementLevel) {
  const rolled = Number(rolledValue) || 0;
  const level = clamp(toInt(enhancementLevel, 0), 0, MAX_ENHANCEMENT_LEVEL);
  return Math.round(rolled * (1 + level * ENHANCEMENT_MAIN_STAT_SCALE_PER_LEVEL));
}

// Per-tick permanent boost applied to one random sub-stat at enhance 3/6/9/12/15.
function subStatBoostAmount(type) {
  const range = getSubStatRange(type);
  if (!range) return 0;
  return Math.max(1, Math.round(((range[0] + range[1]) / 2) * ENHANCEMENT_SUBSTAT_BOOST_FRACTION));
}

function normalizeSubStatBonuses(value) {
  let parsed = [];
  try {
    parsed = JSON.parse(value || "[]");
  } catch {
    parsed = [];
  }
  const out = [];
  for (let i = 0; i < SUB_STAT_COUNT; i += 1) {
    out.push(Math.max(0, toInt(Array.isArray(parsed) ? parsed[i] : 0, 0)));
  }
  return out;
}

function pickEquipmentSetId() {
  return EQUIPMENT_SET_IDS[Math.floor(Math.random() * EQUIPMENT_SET_IDS.length)];
}


function getEquipmentPiecesRows(db, userId) {
  return db
    .prepare(
      `SELECT id, userId, slot, mainStatType, mainStatValue, enhancementLevel, subStats, subStatBonuses, setId, equipped, locked, createdAt
       FROM arena_equipment_pieces
       WHERE userId = ?
       ORDER BY createdAt ASC`,
    )
    .all(userId);
}

function getEquippedPiecesRows(db, userId) {
  return db
    .prepare(
      `SELECT id, userId, slot, mainStatType, mainStatValue, enhancementLevel, subStats, subStatBonuses, setId, equipped, locked, createdAt
       FROM arena_equipment_pieces
       WHERE userId = ? AND equipped = 1`,
    )
    .all(userId);
}

function getEquippedPieceBySlot(db, userId, slot) {
  return db
    .prepare(
      `SELECT id, userId, slot, mainStatType, mainStatValue, enhancementLevel, subStats, subStatBonuses, setId, equipped, locked, createdAt
       FROM arena_equipment_pieces
       WHERE userId = ? AND slot = ? AND equipped = 1`,
    )
    .get(userId, slot) || null;
}

function insertEquipmentPiece(db, userId, piece) {
  const now = nowIso();
  const id = makeId("eqp");
  db.prepare(
    `INSERT INTO arena_equipment_pieces
       (id, userId, slot, mainStatType, mainStatValue, enhancementLevel, subStats, subStatBonuses, setId, equipped, createdAt)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 0, ?)`,
  ).run(
    id,
    userId,
    piece.slot,
    piece.mainStatType,
    piece.mainStatValue,
    JSON.stringify(piece.subStats),
    JSON.stringify(piece.subStatBonuses || new Array(SUB_STAT_COUNT).fill(0)),
    piece.setId || pickEquipmentSetId(),
    now,
  );
  return id;
}

function getSubStatRange(type) {
  return SUB_STAT_POOL.ranges[type] || null;
}

function getLoadoutNamesForPiece(db, userId, pieceId) {
  return db
    .prepare(
      `SELECT name
       FROM arena_equipment_loadouts
       WHERE userId = ?
         AND (weaponPieceId = ? OR armorPieceId = ? OR charmPieceId = ?)`,
    )
    .all(userId, pieceId, pieceId, pieceId)
    .map((row) => row.name);
}

function assertPieceNotInLoadout(db, userId, pieceId) {
  const loadoutNames = getLoadoutNamesForPiece(db, userId, pieceId);
  if (loadoutNames.length > 0) {
    throw new ArenaHttpError(
      400,
      "Remove this piece from saved loadouts before scrapping it.",
      "ARENA_PIECE_IN_LOADOUT",
      { loadoutNames },
    );
  }
}

function getEnhancementCoinCost(currentLevel) {
  const level = clamp(toInt(currentLevel, 0), 0, MAX_ENHANCEMENT_LEVEL);
  if (level >= MAX_ENHANCEMENT_LEVEL) return null;
  return Math.round(350 * (1.45 ** level));
}

// Total coins spent enhancing a piece from +0 up to its current level.
function getEnhancementCoinsSunk(enhancementLevel) {
  const level = clamp(toInt(enhancementLevel, 0), 0, MAX_ENHANCEMENT_LEVEL);
  let sunk = 0;
  for (let i = 0; i < level; i += 1) sunk += getEnhancementCoinCost(i) || 0;
  return sunk;
}

// Scrap payout is derived entirely server-side: a fraction of what a roll costs
// the owner now, plus a fraction of the coins sunk into enhancing this piece.
function getFodderRefund(slot, enhancementLevel = 0, playerLevel = 1) {
  void slot; // all slots roll at the same price
  const rollComponent = Math.floor(getGearRollPrice(playerLevel) * FODDER_ROLL_REFUND_RATE);
  const enhanceComponent = Math.floor(
    getEnhancementCoinsSunk(enhancementLevel) * FODDER_ENHANCE_REFUND_RATE,
  );
  return Math.max(rollComponent + enhanceComponent, MIN_FODDER_REFUND);
}

function parseSubStatsJson(subStatsJson) {
  try {
    const parsed = JSON.parse(subStatsJson || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toPublicEquipmentPiece(row, includeEquipped = false, playerLevel = 1) {
  const enhancementLevel = clamp(toInt(row.enhancementLevel, 0), 0, MAX_ENHANCEMENT_LEVEL);
  const bonuses = normalizeSubStatBonuses(row.subStatBonuses);
  const subStats = parseSubStatsJson(row.subStats).map((sub, i) => {
    const bonus = bonuses[i] || 0;
    return {
      ...sub,
      bonus,
      effectiveValue: (Number(sub.value) || 0) + bonus,
    };
  });
  const setDef = row.setId ? EQUIPMENT_SET_BY_ID.get(row.setId) : null;
  const piece = {
    id: row.id,
    slot: row.slot,
    mainStatType: row.mainStatType,
    mainStatValue: row.mainStatValue,
    enhancementLevel,
    enhancedMainStatValue: enhancedMainStatValue(row.mainStatValue, enhancementLevel),
    subStats,
    setId: row.setId || null,
    setName: setDef ? setDef.name : null,
    locked: !!row.locked,
    // Authoritative scrap payout so every screen shows the same number.
    fodderRefund: getFodderRefund(row.slot, enhancementLevel, playerLevel),
    createdAt: row.createdAt,
  };
  if (includeEquipped) piece.equipped = !!row.equipped;
  return piece;
}

function getPieceForUpgrade(db, userId, pieceId) {
  const piece = db
    .prepare(
      `SELECT id, userId, slot, mainStatType, mainStatValue, enhancementLevel, subStats, subStatBonuses, setId, equipped, locked, createdAt
       FROM arena_equipment_pieces
       WHERE id = ? AND userId = ?`,
    )
    .get(pieceId, userId);
  if (!piece) {
    throw new ArenaHttpError(404, "Equipment piece not found.", "ARENA_PIECE_NOT_FOUND");
  }
  return piece;
}

function getConsumableFodderPiece(db, userId, fodderPieceId, targetPieceId) {
  const fodder = getPieceForUpgrade(db, userId, fodderPieceId);
  if (fodder.id === targetPieceId) {
    throw new ArenaHttpError(400, "Choose a different fodder piece.", "ARENA_FODDER_TARGET_MATCH");
  }
  if (fodder.equipped) {
    throw new ArenaHttpError(400, "Unequip fodder gear first.", "ARENA_FODDER_EQUIPPED");
  }
  if (fodder.locked) {
    throw new ArenaHttpError(400, "Unlock the fodder piece before using it.", "ARENA_PIECE_LOCKED");
  }
  assertPieceNotInLoadout(db, userId, fodder.id);
  return fodder;
}

function spendCoinsAndFodderPiece(db, userId, cost, fodderPieceId) {
  const profile = db
    .prepare("SELECT coins FROM arena_profiles WHERE userId = ?")
    .get(userId);
  if (!profile) {
    throw new ArenaHttpError(404, "Arena profile not found.", "ARENA_PROFILE_NOT_FOUND");
  }
  if (toInt(profile.coins, 0) < cost) {
    throw new ArenaHttpError(400, "Not enough coins.", "ARENA_NOT_ENOUGH_COINS");
  }

  const now = nowIso();
  db.prepare("DELETE FROM arena_equipment_pieces WHERE id = ? AND userId = ?").run(fodderPieceId, userId);
  db.prepare("UPDATE arena_profiles SET coins = coins - ?, updatedAt = ? WHERE userId = ?").run(cost, now, userId);
}

function enhanceEquipmentPiece(db, userId, pieceId, fodderPieceId) {
  const cleanPieceId = String(pieceId || "").trim();
  const cleanFodderPieceId = String(fodderPieceId || "").trim();
  if (!cleanPieceId) {
    throw new ArenaHttpError(400, "pieceId is required.", "ARENA_PIECE_REQUIRED");
  }
  if (!cleanFodderPieceId) {
    throw new ArenaHttpError(400, "fodderPieceId is required.", "ARENA_FODDER_REQUIRED");
  }

  const tx = db.transaction(() => {
    const piece = getPieceForUpgrade(db, userId, cleanPieceId);
    getConsumableFodderPiece(db, userId, cleanFodderPieceId, piece.id);
    const currentLevel = clamp(toInt(piece.enhancementLevel, 0), 0, MAX_ENHANCEMENT_LEVEL);
    const coinCost = getEnhancementCoinCost(currentLevel);
    if (coinCost === null) {
      throw new ArenaHttpError(
        409,
        "This equipment is already fully enhanced.",
        "ARENA_EQUIPMENT_MAX_ENHANCEMENT",
      );
    }

    spendCoinsAndFodderPiece(db, userId, coinCost, cleanFodderPieceId);
    const nextLevel = currentLevel + 1;

    // Every ENHANCEMENT_SUBSTAT_BOOST_INTERVAL levels, permanently boost one
    // random sub-stat line (stored apart from the rolled value).
    let subStatBoost = null;
    const subStats = parseSubStatsJson(piece.subStats);
    const bonuses = normalizeSubStatBonuses(piece.subStatBonuses);
    if (nextLevel % ENHANCEMENT_SUBSTAT_BOOST_INTERVAL === 0 && subStats.length > 0) {
      const idx = Math.floor(Math.random() * subStats.length);
      const amount = subStatBoostAmount(subStats[idx].type);
      bonuses[idx] = (bonuses[idx] || 0) + amount;
      subStatBoost = {
        subStatIndex: idx,
        type: subStats[idx].type,
        amount,
        totalBonus: bonuses[idx],
      };
    }

    db.prepare(
      `UPDATE arena_equipment_pieces
       SET enhancementLevel = ?, subStatBonuses = ?
       WHERE id = ? AND userId = ?`,
    ).run(nextLevel, JSON.stringify(bonuses), piece.id, userId);

    return {
      pieceId: piece.id,
      fodderPieceId: cleanFodderPieceId,
      previousLevel: currentLevel,
      enhancementLevel: nextLevel,
      coinCost,
      subStatBoost,
    };
  });

  return tx();
}

function rerollEquipmentSubStat(db, userId, pieceId, subStatIndex, fodderPieceId) {
  const cleanPieceId = String(pieceId || "").trim();
  const cleanFodderPieceId = String(fodderPieceId || "").trim();
  const index = toInt(subStatIndex, -1);
  if (!cleanPieceId) {
    throw new ArenaHttpError(400, "pieceId is required.", "ARENA_PIECE_REQUIRED");
  }
  if (!cleanFodderPieceId) {
    throw new ArenaHttpError(400, "fodderPieceId is required.", "ARENA_FODDER_REQUIRED");
  }

  const tx = db.transaction(() => {
    const piece = getPieceForUpgrade(db, userId, cleanPieceId);
    getConsumableFodderPiece(db, userId, cleanFodderPieceId, piece.id);
    const subStats = parseSubStatsJson(piece.subStats);
    if (index < 0 || index >= subStats.length) {
      throw new ArenaHttpError(400, "Valid subStatIndex is required.", "ARENA_SUBSTAT_REQUIRED");
    }

    const oldSubStat = subStats[index] || {};
    const range = getSubStatRange(oldSubStat.type);
    if (!range) {
      throw new ArenaHttpError(400, "Unsupported substat type.", "ARENA_SUBSTAT_UNSUPPORTED");
    }

    const rerollProfile = db
      .prepare("SELECT level, effectsJson FROM arena_profiles WHERE userId = ?")
      .get(userId);
    const coinCost = getRerollSubStatCost(rerollProfile?.level);

    const rolledValue = rollInRange(range[0], range[1]);
    const oldValue = Number(oldSubStat.value) || 0;

    // A "keep higher" charge protects the current value from a bad reroll.
    const effects = normalizeArenaEffects(rerollProfile?.effectsJson);
    let keptHigher = false;
    let value = rolledValue;
    if (effects.rerollKeepHigherCharges > 0) {
      value = Math.max(oldValue, rolledValue);
      effects.rerollKeepHigherCharges -= 1;
      keptHigher = true;
    }

    const newSubStat = { type: oldSubStat.type, value };
    subStats[index] = newSubStat;

    // A rerolled line loses its own enhancement boost (the other lines keep theirs).
    const bonuses = normalizeSubStatBonuses(piece.subStatBonuses);
    bonuses[index] = 0;

    spendCoinsAndFodderPiece(db, userId, coinCost, cleanFodderPieceId);
    db.prepare(
      `UPDATE arena_equipment_pieces
       SET subStats = ?, subStatBonuses = ?
       WHERE id = ? AND userId = ?`,
    ).run(JSON.stringify(subStats), JSON.stringify(bonuses), piece.id, userId);
    if (keptHigher) {
      db.prepare(
        "UPDATE arena_profiles SET effectsJson = ?, updatedAt = ? WHERE userId = ?",
      ).run(serializeEffects(effects), nowIso(), userId);
    }

    return {
      pieceId: piece.id,
      fodderPieceId: cleanFodderPieceId,
      subStatIndex: index,
      oldSubStat,
      newSubStat,
      rolledValue,
      keptHigher,
      keepHigherChargesRemaining: effects.rerollKeepHigherCharges,
      coinCost,
    };
  });

  return tx();
}

function equipEquipmentPiece(db, userId, pieceId) {
  const piece = db
    .prepare(
      `SELECT id, userId, slot FROM arena_equipment_pieces WHERE id = ? AND userId = ?`,
    )
    .get(pieceId, userId);
  if (!piece) {
    throw new ArenaHttpError(404, "Equipment piece not found.", "ARENA_PIECE_NOT_FOUND");
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE arena_equipment_pieces SET equipped = 0 WHERE userId = ? AND slot = ? AND equipped = 1`,
    ).run(userId, piece.slot);
    db.prepare(
      `UPDATE arena_equipment_pieces SET equipped = 1 WHERE id = ? AND userId = ?`,
    ).run(pieceId, userId);
  });
  tx();
}

function unequipEquipmentSlot(db, userId, slot) {
  db.prepare(
    `UPDATE arena_equipment_pieces SET equipped = 0 WHERE userId = ? AND slot = ? AND equipped = 1`,
  ).run(userId, slot);
}

function fodderEquipmentPiece(db, userId, pieceId) {
  const piece = db.prepare(
    "SELECT slot, equipped, locked, enhancementLevel FROM arena_equipment_pieces WHERE id = ? AND userId = ?",
  ).get(pieceId, userId);
  if (!piece) throw new ArenaHttpError(404, "Piece not found.", "ARENA_PIECE_NOT_FOUND");
  if (piece.equipped) throw new ArenaHttpError(400, "Unequip before foddering.", "ARENA_PIECE_EQUIPPED");
  if (piece.locked) throw new ArenaHttpError(400, "Unlock the piece before scrapping.", "ARENA_PIECE_LOCKED");
  assertPieceNotInLoadout(db, userId, pieceId);

  const scrapper = db
    .prepare("SELECT level FROM arena_profiles WHERE userId = ?")
    .get(userId);
  const FODDER_PRICE = getFodderRefund(
    piece.slot,
    piece.enhancementLevel,
    scrapper?.level,
  );
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM arena_equipment_pieces WHERE id = ? AND userId = ?").run(pieceId, userId);
    db.prepare("UPDATE arena_profiles SET coins = coins + ?, updatedAt = ? WHERE userId = ?").run(FODDER_PRICE, now, userId);
  });
  tx();
  return { fodderPieceId: pieceId, coinsGained: FODDER_PRICE };
}

function lockEquipmentPiece(db, userId, pieceId) {
  const piece = db.prepare(
    "SELECT id FROM arena_equipment_pieces WHERE id = ? AND userId = ?",
  ).get(pieceId, userId);
  if (!piece) throw new ArenaHttpError(404, "Piece not found.", "ARENA_PIECE_NOT_FOUND");

  db.prepare("UPDATE arena_equipment_pieces SET locked = 1 WHERE id = ? AND userId = ?").run(pieceId, userId);
  return { pieceId, locked: true };
}

function unlockEquipmentPiece(db, userId, pieceId) {
  const piece = db.prepare(
    "SELECT id FROM arena_equipment_pieces WHERE id = ? AND userId = ?",
  ).get(pieceId, userId);
  if (!piece) throw new ArenaHttpError(404, "Piece not found.", "ARENA_PIECE_NOT_FOUND");

  db.prepare("UPDATE arena_equipment_pieces SET locked = 0 WHERE id = ? AND userId = ?").run(pieceId, userId);
  return { pieceId, locked: false };
}

function getEquipmentLoadouts(db, userId) {
  const rows = db
    .prepare(
      `SELECT id, name, weaponPieceId, armorPieceId, charmPieceId, createdAt
       FROM arena_equipment_loadouts
       WHERE userId = ?
       ORDER BY createdAt DESC`,
    )
    .all(userId);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    weaponPieceId: row.weaponPieceId || null,
    armorPieceId: row.armorPieceId || null,
    charmPieceId: row.charmPieceId || null,
    createdAt: row.createdAt,
  }));
}

function saveEquipmentLoadout(db, userId, name) {
  const cleanName = String(name || "").trim().slice(0, 40) || "Loadout";
  const existing = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM arena_equipment_loadouts WHERE userId = ?`,
    )
    .get(userId);
  if (existing.cnt >= MAX_LOADOUTS) {
    throw new ArenaHttpError(
      409,
      `You can only save up to ${MAX_LOADOUTS} loadouts.`,
      "ARENA_LOADOUT_LIMIT",
    );
  }

  const equipped = getEquippedPiecesRows(db, userId);
  const pieceBySlot = {};
  equipped.forEach((p) => {
    pieceBySlot[p.slot] = p.id;
  });

  const id = makeId("ld");
  const now = nowIso();
  db.prepare(
    `INSERT INTO arena_equipment_loadouts (id, userId, name, weaponPieceId, armorPieceId, charmPieceId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    cleanName,
    pieceBySlot.weapon || null,
    pieceBySlot.armor || null,
    pieceBySlot.charm || null,
    now,
  );

  return {
    id,
    name: cleanName,
    weaponPieceId: pieceBySlot.weapon || null,
    armorPieceId: pieceBySlot.armor || null,
    charmPieceId: pieceBySlot.charm || null,
    createdAt: now,
  };
}

function restoreEquipmentLoadout(db, userId, loadoutId) {
  const loadout = db
    .prepare(
      `SELECT id, userId, weaponPieceId, armorPieceId, charmPieceId
       FROM arena_equipment_loadouts
       WHERE id = ? AND userId = ?`,
    )
    .get(loadoutId, userId);
  if (!loadout) {
    throw new ArenaHttpError(
      404,
      "Loadout not found.",
      "ARENA_LOADOUT_NOT_FOUND",
    );
  }

  const slots = ["weapon", "armor", "charm"];
  const pieceIds = [loadout.weaponPieceId, loadout.armorPieceId, loadout.charmPieceId];
  const restored = [];

  const tx = db.transaction(() => {
    // Compiled once, not once per slot (better-sqlite3 recompiles each prepare).
    const selectPieceStmt = db.prepare(
      `SELECT id FROM arena_equipment_pieces WHERE id = ? AND userId = ?`,
    );
    const unequipSlotStmt = db.prepare(
      `UPDATE arena_equipment_pieces SET equipped = 0 WHERE userId = ? AND slot = ? AND equipped = 1`,
    );
    const equipPieceStmt = db.prepare(
      `UPDATE arena_equipment_pieces SET equipped = 1 WHERE id = ? AND userId = ?`,
    );
    slots.forEach((slot, i) => {
      const pieceId = pieceIds[i];
      if (!pieceId) return;

      const piece = selectPieceStmt.get(pieceId, userId);
      if (!piece) return;

      unequipSlotStmt.run(userId, slot);
      equipPieceStmt.run(pieceId, userId);
      restored.push(slot);
    });
  });
  tx();

  return { loadoutId, restored };
}

function deleteEquipmentLoadout(db, userId, loadoutId) {
  const result = db
    .prepare(`DELETE FROM arena_equipment_loadouts WHERE id = ? AND userId = ?`)
    .run(loadoutId, userId);
  if (result.changes === 0) {
    throw new ArenaHttpError(
      404,
      "Loadout not found.",
      "ARENA_LOADOUT_NOT_FOUND",
    );
  }
  return { success: true, loadoutId };
}

function rollEquipmentPiece(slot) {
  const equipmentDef = ROLLABLE_EQUIPMENT.find((e) => e.slot === slot);
  if (!equipmentDef) return null;

  let mainStatType;
  let mainStatValue;

  if (equipmentDef.mainStat.type === "random") {
    const chosen = equipmentDef.mainStat.options[Math.floor(Math.random() * equipmentDef.mainStat.options.length)];
    mainStatType = chosen.type;
    mainStatValue = rollInRange(chosen.min, chosen.max);
  } else {
    mainStatType = equipmentDef.mainStat.type;
    mainStatValue = rollInRange(equipmentDef.mainStat.min, equipmentDef.mainStat.max);
  }

  // Pick unique sub-stats — the slot's own main stat can never appear as one.
  const pool = SUB_STAT_POOL.pool.filter((t) => t !== mainStatType);
  const subStats = [];
  for (let i = 0; i < SUB_STAT_COUNT && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const type = pool.splice(idx, 1)[0];
    const range = getSubStatRange(type);
    subStats.push({ type, value: rollInRange(range[0], range[1]) });
  }

  return {
    slot,
    mainStatType,
    mainStatValue,
    subStats,
    subStatBonuses: new Array(SUB_STAT_COUNT).fill(0),
    setId: pickEquipmentSetId(),
  };
}

function computeEquipmentStats(db, userId) {
  const pieceRows = getEquippedPiecesRows(db, userId);
  const flatStats = {
    hp: 0,
    power: 0,
    guard: 0,
    speed: 0,
    effectHit: 0,
  };
  const pctStats = {
    hpPct: 0,
    dmgPct: 0,
    defendPct: 0,
    critChancePct: 0,
    critDmgPct: 0,
  };
  const equipped = {
    weapon: null,
    armor: null,
    charm: null,
  };
  const setCounts = new Map();

  const addStat = (type, val) => {
    switch (type) {
      case "hp": flatStats.hp += val; break;
      case "power": flatStats.power += val; break;
      case "guard": flatStats.guard += val; break;
      case "speed": flatStats.speed += val; break;
      case "effectHit": flatStats.effectHit += val; break;
      case "hpPct": pctStats.hpPct += val; break;
      case "dmgPct": pctStats.dmgPct += val; break;
      case "defendPct": pctStats.defendPct += val; break;
      case "critRate": pctStats.critChancePct += val; break;
      case "critDmg": pctStats.critDmgPct += val; break;
    }
  };

  pieceRows.forEach((row) => {
    let subStatsArray = [];
    try { subStatsArray = JSON.parse(row.subStats || "[]"); } catch { /* keep empty */ }
    const bonuses = normalizeSubStatBonuses(row.subStatBonuses);
    const enhLevel = clamp(toInt(row.enhancementLevel, 0), 0, MAX_ENHANCEMENT_LEVEL);
    const mainVal = enhancedMainStatValue(row.mainStatValue, enhLevel);

    equipped[row.slot] = {
      id: row.id,
      slot: row.slot,
      mainStatType: row.mainStatType,
      mainStatValue: row.mainStatValue,
      enhancementLevel: enhLevel,
      enhancedMainStatValue: mainVal,
      subStats: subStatsArray,
      setId: row.setId || null,
      setName: row.setId ? (EQUIPMENT_SET_BY_ID.get(row.setId)?.name || null) : null,
      createdAt: row.createdAt,
    };

    if (row.setId) {
      setCounts.set(row.setId, (setCounts.get(row.setId) || 0) + 1);
    }

    // Main stat (scaled by enhancement level).
    addStat(row.mainStatType, mainVal);

    // Sub stats (rolled value + permanent enhancement boost).
    subStatsArray.forEach((s, i) => {
      addStat(s.type, (Number(s.value) || 0) + (bonuses[i] || 0));
    });
  });

  // Equipment set bonuses: 3-piece replaces (does not stack with) 2-piece.
  // Bonus keys are pctStats keys and are added there directly.
  const sets = [];
  for (const [setId, count] of setCounts) {
    const def = EQUIPMENT_SET_BY_ID.get(setId);
    if (!def || count < 2) continue;
    const tier = count >= 3 ? 3 : 2;
    const bonus = tier === 3 ? def.bonus3 : def.bonus2;
    Object.entries(bonus).forEach(([type, val]) => {
      if (type in pctStats) pctStats[type] += val;
    });
    sets.push({ id: setId, name: def.name, count, tier });
  }

  return {
    stats: {
      hp: flatStats.hp,
      power: flatStats.power,
      guard: flatStats.guard,
      speed: flatStats.speed,
      effectHit: flatStats.effectHit,
    },
    pct: pctStats,
    equipped,
    sets,
  };
}

function weightedEquipmentBonus(stats) {
  return (
    (stats.power || 0) * 2.0 +
    (stats.guard || 0) * 1.7 +
    (stats.speed || 0) * 1.5
  );
}

module.exports = {
  getEquipmentPiecesRows,
  getEquippedPiecesRows,
  getEquippedPieceBySlot,
  toPublicEquipmentPiece,
  insertEquipmentPiece,
  equipEquipmentPiece,
  unequipEquipmentSlot,
  fodderEquipmentPiece,
  lockEquipmentPiece,
  unlockEquipmentPiece,
  enhanceEquipmentPiece,
  rerollEquipmentSubStat,
  getEnhancementCoinCost,
  getEnhancementCoinsSunk,
  getFodderRefund,
  getGearRollPrice,
  getRerollSubStatCost,
  enhancedMainStatValue,
  subStatBoostAmount,
  MAX_ENHANCEMENT_LEVEL,
  REROLL_SUBSTAT_COIN_COST,
  getEquipmentLoadouts,
  saveEquipmentLoadout,
  restoreEquipmentLoadout,
  deleteEquipmentLoadout,
  rollEquipmentPiece,
  computeEquipmentStats,
  weightedEquipmentBonus,
};
