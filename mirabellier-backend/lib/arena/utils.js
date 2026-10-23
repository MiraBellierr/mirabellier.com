const {
  RARITY_ORDER,
  SHOP_TIERS,
} = require("../arena-constants");

const {
  CARD_IV_MIN,
  CARD_IV_MAX,
  ELO_DEFAULT_RATING,
  ELO_MIN_RATING,
  ELO_PROVISIONAL_MATCHES,
  ELO_PROVISIONAL_K,
  ELO_ESTABLISHED_K,
  ELO_VETERAN_K,
  ELO_VETERAN_MATCHES,
  ELO_SCALE,
  ELO_MAX_DELTA_PROVISIONAL,
  ELO_MAX_DELTA_ESTABLISHED,
  MARKET_MIN_PRICE,
  MARKET_MAX_PRICE,
  MARKET_MAX_ACTIVE_LISTINGS,
  MARKET_MAX_PAGE_SIZE,
  MARKET_SALES_SAMPLE_SIZE,
  MARKET_SALE_COMMISSION_RATE,
  MARKET_LISTING_FEE_RATE,
  MARKET_LISTING_FEE_MIN,
  MARKET_PRICE_CEILING_MULTIPLIER,
  ARENA_TRADE_MIN_LEVEL,
  MARKET_IV_BANDS,
  CARD_SHOP_DAILY_OFFER_COUNT,
  CARD_SHOP_PRICES,
  CARD_SHOP_MAX_PRICE,
  CARD_SHOP_RANDOM_PRICE,
  CARD_SHOP_GENERATION_ATTEMPTS,
  MAX_TRADE_LISTINGS,
  TRADE_SESSION_TIMEOUT_MS,
  ARENA_UPDATE_MAX_TITLE_LENGTH,
  ARENA_UPDATE_MAX_BODY_LENGTH,
  RECENT_OPPONENT_LIMIT,
  DAILY_OPPONENT_LIMIT_MULTIPLIER,
  DAILY_OPPONENT_LIMIT_MIN,
  DAILY_OPPONENT_LIMIT_MAX,
  ELO_MATCHMAKING_POOL_SIZE,
  ELO_MATCHMAKING_CANDIDATE_LIMIT,
  MAX_ACTIVE_CONSUMABLE_EFFECTS,
  MAX_COMBINED_DAMAGE_MULTIPLIER,
  MAX_CONSUMABLE_INVENTORY_QUANTITY,
  EFFECT_DURATION_LIMITS,
  RARITY_TO_RANK,
  SLOT_ORDER,
} = require("./_constants");

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
class ArenaHttpError extends Error {
  constructor(status, message, code = "ARENA_ERROR", details = {}) {
    super(message);
    this.name = "ArenaHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function toPositiveInt(value, fallback = 0) {
  return Math.max(toInt(value, fallback), 0);
}

function randomInt(min, max, randomFn = Math.random) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  if (high <= low) return low;
  return Math.floor(randomFn() * (high - low + 1)) + low;
}

function rollInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getValueAtPath(source, path) {
  if (!source || typeof source !== "object") return undefined;
  if (typeof path !== "string" || !path) return undefined;
  return path.split(".").reduce((cursor, part) => {
    if (!cursor || typeof cursor !== "object") return undefined;
    return cursor[part];
  }, source);
}

function toCombatName(input, fallback) {
  if (typeof input === "string" && input.trim()) return input.trim();
  return fallback;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function getArenaDayUtcOffsetMinutes() {
  const raw = process.env.ARENA_DAY_UTC_OFFSET_MINUTES;
  if (raw === undefined || raw === null || String(raw).trim() === "") return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.trunc(parsed);
}

function getCurrentRecordedDate(date = new Date()) {
  const shifted = new Date(
    date.getTime() + getArenaDayUtcOffsetMinutes() * 60 * 1000,
  );
  return shifted.toISOString().slice(0, 10);
}

function toRecordedIso(date = new Date()) {
  const shifted = new Date(
    date.getTime() + getArenaDayUtcOffsetMinutes() * 60 * 1000,
  );
  return shifted.toISOString();
}

function addDaysToRecordedDate(recordedDate, days) {
  const [year, month, day] = String(recordedDate || "")
    .split("-")
    .map((value) => Number(value));
  const nextDate = new Date(Date.UTC(year, month - 1, day));
  nextDate.setUTCDate(nextDate.getUTCDate() + Number(days || 0));
  return nextDate.toISOString().slice(0, 10);
}

function getNextCardDrawAt(lastCardDrawDate) {
  if (!lastCardDrawDate) return null;
  const nextDate = addDaysToRecordedDate(lastCardDrawDate, 1);
  return `${nextDate}T00:00:00.000Z`;
}

// ---------------------------------------------------------------------------
// Progression helpers
// ---------------------------------------------------------------------------
/**
 * XP required to advance from the given level to the next.
 * Formula: 80 + 18 * level^1.85 (rounded).
 *
 * Was `80 + 25 * level²` — a quadratic that put ~2.8M XP and ~14k best-case
 * fights on the road to 70. The sub-quadratic curve here totals ~1.13M XP
 * (~3.7k best-case fights with the retuned `calculateWinXp`), so the back half
 * of the level range is reachable in a normal play span (improve.md §10).
 *
 * @param {number} level - Current level.
 * @returns {number} XP threshold.
 */
function xpToNext(level) {
  const currentLevel = Math.max(toInt(level, 1), 1);
  return 80 + Math.round(18 * currentLevel ** 1.85);
}

/**
 * Returns the numeric rank (0-based) for a rarity string.
 *
 * @param {string} rarity - e.g. "C", "R", "SR", "SSR", "UR".
 * @returns {number} 0-based rank index.
 */
function rarityRank(rarity) {
  return RARITY_TO_RANK.get(rarity) ?? 0;
}

function rarityAtRank(rank) {
  const normalized = clamp(rank, 0, RARITY_ORDER.length - 1);
  return RARITY_ORDER[normalized];
}

function upgradeRarityOneStep(rarity) {
  return rarityAtRank(rarityRank(rarity) + 1);
}

// ---------------------------------------------------------------------------
// Card shop price helpers
// ---------------------------------------------------------------------------
function getCardShopPrice(rarity) {
  const normalizedRarity = String(rarity || "").trim().toUpperCase();
  return CARD_SHOP_PRICES[normalizedRarity] ?? CARD_SHOP_MAX_PRICE;
}

function isRandomCardOfferAvailable(recordedDate = getCurrentRecordedDate()) {
  const day = new Date(recordedDate + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 2 || day === 4 || day === 6;
}

// ---------------------------------------------------------------------------
// Market helpers
// ---------------------------------------------------------------------------
function getMarketIvBand(ivTotal) {
  const total = clamp(toPositiveInt(ivTotal, 0), 0, CARD_IV_MAX * 4);
  return (
    MARKET_IV_BANDS.find((band) => total >= band.min && total <= band.max) ||
    MARKET_IV_BANDS[0]
  );
}

// ---------------------------------------------------------------------------
// Elo helpers
// ---------------------------------------------------------------------------
/**
 * Whether a player is still in their provisional (placement) matches.
 *
 * @param {number} matches - Number of ELO matches played.
 * @returns {boolean}
 */
function isEloProvisional(matches) {
  return toPositiveInt(matches, 0) < ELO_PROVISIONAL_MATCHES;
}

/**
 * Returns the K-factor for ELO calculations based on match count.
 *
 * @param {number} matches - Number of ELO matches played.
 * @returns {number} K-factor (48 provisional, 24 established, 16 veteran).
 */
function getEloKFactor(matches) {
  if (isEloProvisional(matches)) return ELO_PROVISIONAL_K;
  if (toPositiveInt(matches, 0) < ELO_VETERAN_MATCHES) return ELO_ESTABLISHED_K;
  return ELO_VETERAN_K;
}

/**
 * Calculates the ELO rating exchange between a winner and loser.
 * Uses provisional/established/veteran K-factors, a large-gap penalty,
 * and caps on maximum delta per match.
 *
 * @param {{ eloRating?: number, eloMatches?: number }} winner
 * @param {{ eloRating?: number, eloMatches?: number }} loser
 * @returns {{ kFactor: number, delta: number, winnerBefore: number, winnerAfter: number, loserBefore: number, loserAfter: number }}
 */
function calculateEloExchange(winner, loser) {
  const winnerRating = Math.max(
    toInt(winner?.eloRating, ELO_DEFAULT_RATING),
    ELO_MIN_RATING,
  );
  const loserRating = Math.max(
    toInt(loser?.eloRating, ELO_DEFAULT_RATING),
    ELO_MIN_RATING,
  );

  const winnerK = getEloKFactor(winner?.eloMatches);
  const loserK = getEloKFactor(loser?.eloMatches);

  const ratingDiff = loserRating - winnerRating;
  const winnerExpected = 1 / (1 + Math.pow(10, ratingDiff / ELO_SCALE));

  const avgK = Math.round((winnerK + loserK) / 2);
  const rawDelta = Math.round(avgK * (1 - winnerExpected));

  const maxDelta =
    isEloProvisional(winner?.eloMatches) || isEloProvisional(loser?.eloMatches)
      ? ELO_MAX_DELTA_PROVISIONAL
      : ELO_MAX_DELTA_ESTABLISHED;
  const delta = Math.min(rawDelta, maxDelta, loserRating - ELO_MIN_RATING);

  const largeGapPenalty =
    Math.abs(ratingDiff) > 600 ? 0.5 + (600 / (Math.abs(ratingDiff) + 600)) : 1;
  const finalDelta = Math.round(Math.max(1, delta * largeGapPenalty));

  return {
    kFactor: avgK,
    delta: finalDelta,
    winnerBefore: winnerRating,
    winnerAfter: winnerRating + finalDelta,
    loserBefore: loserRating,
    loserAfter: loserRating - finalDelta,
  };
}

module.exports = {
  // Error class
  ArenaHttpError,

  // Constants
  CARD_IV_MIN,
  CARD_IV_MAX,
  CARD_SHOP_DAILY_OFFER_COUNT,
  CARD_SHOP_PRICES,
  CARD_SHOP_MAX_PRICE,
  CARD_SHOP_RANDOM_PRICE,
  CARD_SHOP_GENERATION_ATTEMPTS,
  MARKET_MIN_PRICE,
  MARKET_MAX_PRICE,
  MARKET_MAX_ACTIVE_LISTINGS,
  MARKET_MAX_PAGE_SIZE,
  MARKET_SALES_SAMPLE_SIZE,
  MARKET_SALE_COMMISSION_RATE,
  MARKET_LISTING_FEE_RATE,
  MARKET_LISTING_FEE_MIN,
  MARKET_PRICE_CEILING_MULTIPLIER,
  ARENA_TRADE_MIN_LEVEL,
  MARKET_IV_BANDS,
  MAX_TRADE_LISTINGS,
  TRADE_SESSION_TIMEOUT_MS,
  ARENA_UPDATE_MAX_TITLE_LENGTH,
  ARENA_UPDATE_MAX_BODY_LENGTH,
  RECENT_OPPONENT_LIMIT,
  DAILY_OPPONENT_LIMIT_MULTIPLIER,
  DAILY_OPPONENT_LIMIT_MIN,
  DAILY_OPPONENT_LIMIT_MAX,
  ELO_MATCHMAKING_POOL_SIZE,
  ELO_MATCHMAKING_CANDIDATE_LIMIT,
  MAX_ACTIVE_CONSUMABLE_EFFECTS,
  MAX_COMBINED_DAMAGE_MULTIPLIER,
  MAX_CONSUMABLE_INVENTORY_QUANTITY,
  EFFECT_DURATION_LIMITS,
  RARITY_TO_RANK,
  SLOT_ORDER,
  ELO_DEFAULT_RATING,
  ELO_MIN_RATING,
  ELO_PROVISIONAL_MATCHES,
  ELO_PROVISIONAL_K,
  ELO_ESTABLISHED_K,
  ELO_VETERAN_K,
  ELO_VETERAN_MATCHES,
  ELO_SCALE,
  ELO_MAX_DELTA_PROVISIONAL,
  ELO_MAX_DELTA_ESTABLISHED,

  // Pure helpers
  nowIso,
  makeId,
  clamp,
  toInt,
  toPositiveInt,
  randomInt,
  rollInRange,
  getValueAtPath,
  toCombatName,

  // Date helpers
  getCurrentRecordedDate,
  toRecordedIso,
  addDaysToRecordedDate,
  getNextCardDrawAt,

  // Progression helpers
  xpToNext,
  rarityRank,
  rarityAtRank,
  upgradeRarityOneStep,

  // Card shop helpers
  getCardShopPrice,
  isRandomCardOfferAvailable,

  // Market helpers
  getMarketIvBand,

  // Elo helpers
  isEloProvisional,
  getEloKFactor,
  calculateEloExchange,
};
