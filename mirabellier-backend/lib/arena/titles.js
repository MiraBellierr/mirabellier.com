const { TITLE_CATALOG, TITLE_BY_ID } = require("../arena-constants");
const { nowIso, toInt, ArenaHttpError } = require("./utils");

// Lazy-require to dodge the circular dependency with profile.js.
function ensureProfile(db, userId) {
  return require("./profile").ensureArenaProfile(db, userId);
}

/**
 * Resolve a stored `activeTitleId` to a public `{ id, name }` object (or null).
 * Used by the profile, leaderboard, and fight-opponent payloads.
 */
function resolveActiveTitle(activeTitleId) {
  if (!activeTitleId) return null;
  const entry = TITLE_BY_ID.get(String(activeTitleId));
  return entry ? { id: entry.id, name: entry.name } : null;
}

function getOwnedTitleIds(db, userId) {
  return db
    .prepare("SELECT titleId FROM arena_titles WHERE userId = ?")
    .all(userId)
    .map((row) => row.titleId);
}

function getArenaTitlesPayload(db, userId) {
  const profile = ensureProfile(db, userId);
  const owned = new Set(getOwnedTitleIds(db, userId));
  return {
    coins: profile.coins,
    activeTitleId: profile.activeTitleId || null,
    titles: TITLE_CATALOG.map((entry) => ({
      id: entry.id,
      name: entry.name,
      price: entry.price,
      owned: owned.has(entry.id),
      active: profile.activeTitleId === entry.id,
      canBuy: !owned.has(entry.id) && profile.coins >= entry.price,
    })),
  };
}

function buyArenaTitle(db, userId, titleId) {
  const id = String(titleId || "").trim();
  const entry = TITLE_BY_ID.get(id);
  if (!entry) {
    throw new ArenaHttpError(404, "Title not found.", "ARENA_TITLE_NOT_FOUND");
  }

  const tx = db.transaction(() => {
    const profile = ensureProfile(db, userId);
    const alreadyOwned = db
      .prepare("SELECT 1 FROM arena_titles WHERE userId = ? AND titleId = ?")
      .get(userId, id);
    if (alreadyOwned) {
      throw new ArenaHttpError(409, "You already own this title.", "ARENA_TITLE_OWNED");
    }
    if (toInt(profile.coins, 0) < entry.price) {
      throw new ArenaHttpError(
        400,
        "Not enough coins for this title.",
        "ARENA_NOT_ENOUGH_COINS",
        { requiredCoins: entry.price },
      );
    }

    const now = nowIso();
    db.prepare(
      "INSERT INTO arena_titles (userId, titleId, purchasedAt) VALUES (?, ?, ?)",
    ).run(userId, id, now);

    // First title bought becomes the active one automatically.
    const activate = profile.activeTitleId ? profile.activeTitleId : id;
    db.prepare(
      "UPDATE arena_profiles SET coins = coins - ?, activeTitleId = ?, updatedAt = ? WHERE userId = ?",
    ).run(entry.price, activate, now, userId);
  });

  tx();
  return getArenaTitlesPayload(db, userId);
}

function setActiveArenaTitle(db, userId, titleId) {
  const id = String(titleId || "").trim();

  const tx = db.transaction(() => {
    ensureProfile(db, userId);
    if (id) {
      const owned = db
        .prepare("SELECT 1 FROM arena_titles WHERE userId = ? AND titleId = ?")
        .get(userId, id);
      if (!owned) {
        throw new ArenaHttpError(
          409,
          "Buy this title before setting it active.",
          "ARENA_TITLE_NOT_OWNED",
        );
      }
    }
    db.prepare(
      "UPDATE arena_profiles SET activeTitleId = ?, updatedAt = ? WHERE userId = ?",
    ).run(id || null, nowIso(), userId);
  });

  tx();
  return getArenaTitlesPayload(db, userId);
}

module.exports = {
  resolveActiveTitle,
  getOwnedTitleIds,
  getArenaTitlesPayload,
  buyArenaTitle,
  setActiveArenaTitle,
};
