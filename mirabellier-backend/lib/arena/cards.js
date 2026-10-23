const {
  RARITY_CONFIG, ELEMENTS, RARITY_ORDER,
} = require("../arena-constants");
const {
  rarityFromCharacterRank, getArenaCharacterCatalog,
} = require("../arena-characters");
const {
  nowIso, makeId, clamp, toInt, toPositiveInt, randomInt,
  getCurrentRecordedDate, rarityRank,
  isEloProvisional, ELO_MIN_RATING, RARITY_TO_RANK,
  CARD_IV_MIN, CARD_IV_MAX,
} = require("./utils");
const { normalizeArenaEffects } = require("./effects");

// Affinity constants (domain-specific, not in arena-constants).
// improve.md §11: the old +2/+1/+1/+1 at 250 fights was ~1% against level-70
// stats — a huge grind for nothing. Thresholds pulled in so the first levels are
// an early-game nudge, and each level now grants AFFINITY_STAT_STEP (was +1) so a
// maxed card is a real ~10% edge on its featured stat without being on-demand.
const AFFINITY_THRESHOLDS = Object.freeze([6, 18, 45, 100, 190]);
const AFFINITY_STAT_ORDER = Object.freeze(["power", "guard", "speed", "effectHit", "power"]);
const AFFINITY_STAT_STEP = 3;
const CARD_SACRIFICE_BASE_PAYOUTS = Object.freeze({
  C: 10,
  R: 25,
  SR: 200,
  SSR: 800,
  UR: 1800,
});
const CARD_STAT_KEYS = Object.freeze(["hp", "power", "guard", "speed", "effectHit"]);
const CARD_IV_KEYS = Object.freeze(["power", "guard", "speed", "effectHit"]);

function normalizeCardItemStats(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return CARD_STAT_KEYS.reduce((stats, key) => {
    stats[key] = clamp(toPositiveInt(source[key], 0), 0, 999);
    return stats;
  }, {});
}

function addCardItemStats(left = {}, right = {}) {
  const normalizedLeft = normalizeCardItemStats(left);
  const normalizedRight = normalizeCardItemStats(right);
  return CARD_STAT_KEYS.reduce((stats, key) => {
    stats[key] = normalizedLeft[key] + normalizedRight[key];
    return stats;
  }, {});
}

function normalizeCardIvBonus(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return CARD_IV_KEYS.reduce((stats, key) => {
    stats[key] = clamp(toPositiveInt(source[key], 0), 0, 999);
    return stats;
  }, {});
}

function addCardIvBonus(left = {}, right = {}) {
  const normalizedLeft = normalizeCardIvBonus(left);
  const normalizedRight = normalizeCardIvBonus(right);
  return CARD_IV_KEYS.reduce((stats, key) => {
    stats[key] = normalizedLeft[key] + normalizedRight[key];
    return stats;
  }, {});
}

function calculateCardSacrificePayout(card) {
  const normalized = normalizeSelectedCard(card);
  if (!normalized) return 0;
  const base = CARD_SACRIFICE_BASE_PAYOUTS[normalized.rarity] ?? CARD_SACRIFICE_BASE_PAYOUTS.C;
  const ivTotal = clamp(toPositiveInt(normalized.iv?.total, 0), 0, CARD_IV_MAX * 4);
  const ivBonusPct = (ivTotal / (CARD_IV_MAX * 4)) * 0.25;
  const rainbowBonusPct = normalized.rainbow ? 0.15 : 0;
  return Math.max(1, Math.floor(base * (1 + ivBonusPct + rainbowBonusPct)));
}


function normalizeSelectedCard(value) {
  let source = null;

  if (value && typeof value === "object") {
    source = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        source = parsed;
      }
    } catch {
      source = null;
    }
  }

  if (!source) return null;

  const malId = toPositiveInt(source.malId, 0);
  const title = typeof source.title === "string" ? source.title : "";
  const imageUrl = typeof source.imageUrl === "string" ? source.imageUrl : "";
  if (!malId || !title || !imageUrl) return null;

  const favorites =
    source.favorites === null || source.favorites === undefined
      ? null
      : Number(source.favorites);

  const storedRarity = typeof source.rarity === "string" ? source.rarity : "C";
  const baseRarity = RARITY_CONFIG[storedRarity] ? storedRarity : "C";
  const rarity = Number.isFinite(favorites) && favorites <= 0 ? "C" : baseRarity;
  const iv = source.iv && typeof source.iv === "object" ? source.iv : {};
  const ivPower = clamp(toPositiveInt(iv.power, 0), CARD_IV_MIN, CARD_IV_MAX);
  const ivGuard = clamp(toPositiveInt(iv.guard, 0), CARD_IV_MIN, CARD_IV_MAX);
  const ivSpeed = clamp(toPositiveInt(iv.speed, 0), CARD_IV_MIN, CARD_IV_MAX);
  const ivEffectHit = clamp(toPositiveInt(iv.effectHit, 0), CARD_IV_MIN, CARD_IV_MAX);

  return {
    cardInstanceId:
      typeof source.cardInstanceId === "string" && source.cardInstanceId
        ? source.cardInstanceId
        : makeId("card"),
    malId,
    title,
    url: typeof source.url === "string" ? source.url : "",
    imageUrl,
    meanScore:
      source.meanScore === null || source.meanScore === undefined
        ? null
        : Number(source.meanScore),
    popularity:
      source.popularity === null || source.popularity === undefined
        ? null
        : Number(source.popularity),
    favorites,
    nsfw: typeof source.nsfw === "string" ? source.nsfw : null,
    rarity,
    element: ELEMENTS.includes(source.element) ? source.element : null,
    from: typeof source.from === "string" ? source.from.trim() || null : null,
    iv: {
      power: ivPower,
      guard: ivGuard,
      speed: ivSpeed,
      effectHit: ivEffectHit,
      total: ivPower + ivGuard + ivSpeed + ivEffectHit,
    },
    cardItemStats: normalizeCardItemStats(source.cardItemStats),
    cardItemIds: Array.isArray(source.cardItemIds)
      ? [...new Set(source.cardItemIds.filter((id) => typeof id === "string" && id))]
      : [],
    drawnAt: typeof source.drawnAt === "string" ? source.drawnAt : null,
    rainbow: !!source.rainbow,
  };
}

function serializeSelectedCard(card) {
  if (!card) return null;
  return JSON.stringify(card);
}

function calculateAffinityLevel(fights) {
  const total = Math.max(toInt(fights, 0), 0);
  return AFFINITY_THRESHOLDS.reduce(
    (level, threshold) => (total >= threshold ? level + 1 : level),
    0,
  );
}

function getAffinityStatBonus(level) {
  const bonus = { hp: 0, power: 0, guard: 0, speed: 0, effectHit: 0 };
  const count = clamp(toPositiveInt(level, 0), 0, AFFINITY_STAT_ORDER.length);
  for (let i = 0; i < count; i += 1) {
    bonus[AFFINITY_STAT_ORDER[i]] += AFFINITY_STAT_STEP;
  }
  return bonus;
}

function buildAffinitySummary(row = {}) {
  const fights = Math.max(toInt(row.fights, 0), 0);
  const wins = Math.max(toInt(row.wins, 0), 0);
  const level = calculateAffinityLevel(fights);
  const nextThreshold = AFFINITY_THRESHOLDS.find((threshold) => threshold > fights) || null;
  return {
    fights,
    wins,
    level,
    nextThreshold,
    statBonus: getAffinityStatBonus(level),
  };
}

function getCardAffinity(db, userId, malId) {
  const normalizedMalId = toPositiveInt(malId, 0);
  if (!userId || !normalizedMalId) return buildAffinitySummary();
  const row = db
    .prepare(
      `SELECT fights, wins, affinityLevel
       FROM arena_card_affinity
       WHERE userId = ? AND malId = ?
       LIMIT 1`,
    )
    .get(userId, normalizedMalId);
  return buildAffinitySummary(row || {});
}

function getCardAffinityMap(db, userId, malIds = []) {
  const uniqueMalIds = [...new Set(
    malIds.map((malId) => toPositiveInt(malId, 0)).filter(Boolean),
  )];
  const map = new Map();
  if (!userId || uniqueMalIds.length === 0) return map;

  const placeholders = uniqueMalIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT malId, fights, wins, affinityLevel
       FROM arena_card_affinity
       WHERE userId = ? AND malId IN (${placeholders})`,
    )
    .all(userId, ...uniqueMalIds);
  rows.forEach((row) => {
    map.set(toPositiveInt(row.malId, 0), buildAffinitySummary(row));
  });
  return map;
}

function attachCardAffinity(card, affinity) {
  if (!card) return card;
  return {
    ...card,
    affinity: affinity || buildAffinitySummary(),
  };
}

function recordCardAffinityFight(db, userId, card, playerWon) {
  const normalizedCard = normalizeSelectedCard(card);
  const malId = toPositiveInt(normalizedCard?.malId, 0);
  if (!userId || !malId) return buildAffinitySummary();

  const now = nowIso();
  const row = db
    .prepare(
      `SELECT fights, wins
       FROM arena_card_affinity
       WHERE userId = ? AND malId = ?
       LIMIT 1`,
    )
    .get(userId, malId);
  const fights = Math.max(toInt(row?.fights, 0), 0) + 1;
  const wins = Math.max(toInt(row?.wins, 0), 0) + (playerWon ? 1 : 0);
  const level = calculateAffinityLevel(fights);

  if (row) {
    db.prepare(
      `UPDATE arena_card_affinity
       SET fights = ?, wins = ?, affinityLevel = ?, updatedAt = ?
       WHERE userId = ? AND malId = ?`,
    ).run(fights, wins, level, now, userId, malId);
  } else {
    db.prepare(
      `INSERT INTO arena_card_affinity (
        userId, malId, fights, wins, affinityLevel, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, malId, fights, wins, level, now, now);
  }

  return buildAffinitySummary({ fights, wins, affinityLevel: level });
}

function insertCollectionCard(db, userId, card) {
  if (!card || !card.cardInstanceId) return;
  const now = nowIso();
  db.prepare(
    `INSERT OR IGNORE INTO arena_card_collection (
      id,
      userId,
      cardInstanceId,
      cardJson,
      createdAt,
      updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    makeId("collection"),
    userId,
    card.cardInstanceId,
    JSON.stringify(card),
    now,
    now,
  );
}

function countCollectionCards(db, userId, search = "", element = "", ivFilters = {}, duplicates = false) {
  const term = String(search || "").trim();
  const elem = String(element || "").trim();
  const minPower = toPositiveInt(ivFilters.minPower, 0) || 0;
  const minGuard = toPositiveInt(ivFilters.minGuard, 0) || 0;
  const minSpeed = toPositiveInt(ivFilters.minSpeed, 0) || 0;
  const minLuck  = toPositiveInt(ivFilters.minLuck, 0) || 0;
  const hasIv = minPower > 0 || minGuard > 0 || minSpeed > 0 || minLuck > 0;
  const hasSearch = !!term;
  const hasElement = !!elem;
  const showDuplicates = !!duplicates;

  if (!hasSearch && !hasElement && !hasIv && !showDuplicates) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM arena_card_collection
         WHERE userId = ?`,
      )
      .get(userId);
    return Number(row?.total || 0);
  }

  const conditions = ["userId = ?"];
  const params = [userId];

  if (hasSearch) {
    const like = `%${term}%`;
    conditions.push(`(LOWER(json_extract(cardJson, '$.title')) LIKE LOWER(?)
      OR LOWER(json_extract(cardJson, '$.rarity')) LIKE LOWER(?)
      OR LOWER(json_extract(cardJson, '$.from')) LIKE LOWER(?)
      OR CAST(json_extract(cardJson, '$.malId') AS TEXT) LIKE ?)`);
    params.push(like, like, like, like);
  }

  if (hasElement) {
    conditions.push("json_extract(cardJson, '$.element') = ?");
    params.push(elem);
  }

  if (showDuplicates) {
    conditions.push(`json_extract(cardJson, '$.malId') IN (
      SELECT json_extract(cardJson, '$.malId')
      FROM arena_card_collection
      WHERE userId = ?
      GROUP BY json_extract(cardJson, '$.malId')
      HAVING COUNT(*) > 1
    )`);
    params.push(userId);
  }

  if (minPower > 0) {
    conditions.push("CAST(json_extract(cardJson, '$.iv.power') AS INTEGER) >= ?");
    params.push(minPower);
  }
  if (minGuard > 0) {
    conditions.push("CAST(json_extract(cardJson, '$.iv.guard') AS INTEGER) >= ?");
    params.push(minGuard);
  }
  if (minSpeed > 0) {
    conditions.push("CAST(json_extract(cardJson, '$.iv.speed') AS INTEGER) >= ?");
    params.push(minSpeed);
  }
  if (minLuck > 0) {
    conditions.push("CAST(json_extract(cardJson, '$.iv.effectHit') AS INTEGER) >= ?");
    params.push(minLuck);
  }

  const row = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM arena_card_collection
       WHERE ${conditions.join(" AND ")}`,
    )
    .get(...params);
  return Number(row?.total || 0);
}

function readCollectionCards(db, userId, { limit = 24, offset = 0, sort = "recent", search = "", element = "", minPower = 0, minGuard = 0, minSpeed = 0, minLuck = 0, duplicates = false } = {}) {
  // Build ORDER BY from comma-separated sort columns (AND logic: each column
  // further refines the previous).  e.g. "rarity-desc,iv-desc" sorts by rarity
  // then by IV within each rarity tier.
  const RARITY_CASE = `(CASE json_extract(c.cardJson, '$.rarity')
    WHEN 'UR' THEN 4
    WHEN 'SSR' THEN 3
    WHEN 'SR' THEN 2
    WHEN 'R' THEN 1
    ELSE 0
  END)`;

  const COLUMN_SQL = {
    "rarity-desc": `${RARITY_CASE} DESC`,
    "rarity-asc": `${RARITY_CASE} ASC`,
    "RH": `${RARITY_CASE} DESC`,
    "RL": `${RARITY_CASE} ASC`,
    "iv-desc": "json_extract(c.cardJson, '$.iv.total') DESC",
    "iv-asc": "json_extract(c.cardJson, '$.iv.total') ASC",
    "IH": "json_extract(c.cardJson, '$.iv.total') DESC",
    "IL": "json_extract(c.cardJson, '$.iv.total') ASC",
    "affinity-desc": "COALESCE(a.affinityLevel, 0) DESC, COALESCE(a.fights, 0) DESC, COALESCE(a.wins, 0) DESC",
    "affinity-asc": "COALESCE(a.affinityLevel, 0) ASC, COALESCE(a.fights, 0) ASC, COALESCE(a.wins, 0) ASC",
    "power-desc": "CAST(json_extract(c.cardJson, '$.iv.power') AS INTEGER) DESC",
    "guard-desc": "CAST(json_extract(c.cardJson, '$.iv.guard') AS INTEGER) DESC",
    "speed-desc": "CAST(json_extract(c.cardJson, '$.iv.speed') AS INTEGER) DESC",
    "effectHit-desc": "CAST(json_extract(c.cardJson, '$.iv.effectHit') AS INTEGER) DESC",
  };

  const sortColumns = String(sort || "recent")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const orderClauses = [];
  for (const col of sortColumns) {
    if (col === "recent") {
      orderClauses.push("c.createdAt DESC");
    } else if (COLUMN_SQL[col]) {
      orderClauses.push(COLUMN_SQL[col]);
    }
  }

  // Always append createdAt DESC as final tiebreaker (unless already "recent")
  if (sortColumns[0] !== "recent" || sortColumns.length > 1) {
    orderClauses.push("c.createdAt DESC");
  }

  const orderBy = orderClauses.length > 0
    ? orderClauses.join(", ")
    : "c.createdAt DESC";

  const term = String(search || "").trim();
  const elem = String(element || "").trim();
  const mP = toPositiveInt(minPower, 0) || 0;
  const mG = toPositiveInt(minGuard, 0) || 0;
  const mS = toPositiveInt(minSpeed, 0) || 0;
  const mL = toPositiveInt(minLuck, 0) || 0;

  const conditions = ["c.userId = ?"];
  const params = [userId];

  if (term) {
    const like = `%${term}%`;
    conditions.push(`(LOWER(json_extract(c.cardJson, '$.title')) LIKE LOWER(?)
      OR LOWER(json_extract(c.cardJson, '$.rarity')) LIKE LOWER(?)
      OR LOWER(json_extract(c.cardJson, '$.from')) LIKE LOWER(?)
      OR CAST(json_extract(c.cardJson, '$.malId') AS TEXT) LIKE ?)`);
    params.push(like, like, like, like);
  }

  if (elem) {
    conditions.push("json_extract(c.cardJson, '$.element') = ?");
    params.push(elem);
  }

  if (duplicates) {
    conditions.push(`json_extract(c.cardJson, '$.malId') IN (
      SELECT json_extract(cardJson, '$.malId')
      FROM arena_card_collection
      WHERE userId = ?
      GROUP BY json_extract(cardJson, '$.malId')
      HAVING COUNT(*) > 1
    )`);
    params.push(userId);
  }

  if (mP > 0) {
    conditions.push("CAST(json_extract(c.cardJson, '$.iv.power') AS INTEGER) >= ?");
    params.push(mP);
  }
  if (mG > 0) {
    conditions.push("CAST(json_extract(c.cardJson, '$.iv.guard') AS INTEGER) >= ?");
    params.push(mG);
  }
  if (mS > 0) {
    conditions.push("CAST(json_extract(c.cardJson, '$.iv.speed') AS INTEGER) >= ?");
    params.push(mS);
  }
  if (mL > 0) {
    conditions.push("CAST(json_extract(c.cardJson, '$.iv.effectHit') AS INTEGER) >= ?");
    params.push(mL);
  }

  params.push(toPositiveInt(limit, 24), toPositiveInt(offset, 0));

  const sql = `SELECT c.cardJson, c.isFavorite
    FROM arena_card_collection c
    LEFT JOIN arena_card_affinity a
      ON a.userId = c.userId
     AND a.malId = CAST(json_extract(c.cardJson, '$.malId') AS INTEGER)
    WHERE ${conditions.join(" AND ")}
    ORDER BY c.isFavorite DESC, ${orderBy}
    LIMIT ? OFFSET ?`;

  const rows = db
    .prepare(sql)
    .all(...params);

  return rows
    .map((row) => {
      const card = normalizeSelectedCard(row.cardJson);
      if (!card) return null;
      card.isFavorite = !!row.isFavorite;
      return card;
    })
    .filter(Boolean);
}

function createDrawnCard(malCard, options = {}, randomFn = Math.random) {
  const catalogSize = Number(options.catalogSize);
  const rarity =
    options.rarity ||
    rarityFromCharacterRank(
      malCard.popularity,
      Number.isFinite(catalogSize) && catalogSize > 0
        ? catalogSize
        : getArenaCharacterCatalog().characters.length,
    );
  const ivMin = Number.isFinite(options.ivMin) ? Number(options.ivMin) : CARD_IV_MIN;
  const ivMax = Number.isFinite(options.ivMax) ? Number(options.ivMax) : CARD_IV_MAX;
  const ivPower = randomInt(ivMin, ivMax, randomFn);
  const ivGuard = randomInt(ivMin, ivMax, randomFn);
  const ivSpeed = randomInt(ivMin, ivMax, randomFn);
  const ivEffectHit = randomInt(ivMin, ivMax, randomFn);

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
    element: ELEMENTS.includes(malCard.element) ? malCard.element : null,
    from: malCard.from || null,
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

function createPurchasedCard(card) {
  const normalized = normalizeSelectedCard(card);
  if (!normalized) return null;
  return {
    ...normalized,
    cardInstanceId: makeId("card"),
    drawnAt: nowIso(),
  };
}

function metadataBonuses(card) {
  const mean = Number(card?.meanScore);
  const popularity = Number(card?.popularity);
  const malScoreBonus = Number.isFinite(mean) ? clamp((mean - 6) * 4, 0, 16) : 0;
  const popularityBonus = Number.isFinite(popularity)
    ? clamp((2500 - popularity) / 250, 0, 10)
    : 0;

  return {
    malScoreBonus,
    popularityBonus,
  };
}

function getEffectiveCardIv(card) {
  const iv = card?.iv && typeof card.iv === "object" ? card.iv : {};
  const base = {
    power: clamp(toPositiveInt(iv.power, 0), CARD_IV_MIN, CARD_IV_MAX),
    guard: clamp(toPositiveInt(iv.guard, 0), CARD_IV_MIN, CARD_IV_MAX),
    speed: clamp(toPositiveInt(iv.speed, 0), CARD_IV_MIN, CARD_IV_MAX),
    effectHit: clamp(toPositiveInt(iv.effectHit, 0), CARD_IV_MIN, CARD_IV_MAX),
  };
  // Sigil / card-item bonuses ride the card-IV path (added to the raw IV, then
  // divided down). Affinity used to as well, which meant a maxed card's whole
  // reward was floored away to ~1% (improve.md §11) — it is now applied as a
  // direct stat bonus in the snapshot instead, so it is not folded in here.
  const bonus = normalizeCardIvBonus(card?.cardItemStats);
  const effective = CARD_IV_KEYS.reduce((stats, key) => {
    stats[key] = base[key] + bonus[key];
    return stats;
  }, {});

  return {
    base: {
      ...base,
      total: CARD_IV_KEYS.reduce((sum, key) => sum + base[key], 0),
    },
    bonus: {
      ...bonus,
      total: CARD_IV_KEYS.reduce((sum, key) => sum + bonus[key], 0),
    },
    effective: {
      ...effective,
      total: CARD_IV_KEYS.reduce((sum, key) => sum + effective[key], 0),
    },
  };
}

function cardIvStatBonus(card) {
  const { effective } = getEffectiveCardIv(card);
  return {
    hp: Math.floor(effective.guard / 2),
    power: Math.floor(effective.power / 3),
    guard: Math.floor(effective.guard / 3),
    speed: Math.floor(effective.speed / 3),
    effectHit: Math.floor(effective.effectHit / 3),
  };
}

module.exports = {
  normalizeSelectedCard,
  serializeSelectedCard,
  calculateAffinityLevel,
  normalizeCardItemStats,
  addCardItemStats,
  normalizeCardIvBonus,
  addCardIvBonus,
  getAffinityStatBonus,
  buildAffinitySummary,
  getCardAffinity,
  getCardAffinityMap,
  attachCardAffinity,
  recordCardAffinityFight,
  insertCollectionCard,
  countCollectionCards,
  readCollectionCards,
  createDrawnCard,
  createPurchasedCard,
  calculateCardSacrificePayout,
  metadataBonuses,
  getEffectiveCardIv,
  cardIvStatBonus,
};
