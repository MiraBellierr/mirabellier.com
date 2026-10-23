const { toInt, toPositiveInt, clamp, xpToNext, isEloProvisional, ELO_DEFAULT_RATING, ELO_MIN_RATING } = require("./utils");
const { ArenaHttpError } = require("./utils");
const { resolveActiveTitle } = require("./titles");


function countLeaderboardEntries(db, normalizedMetric) {
  if (normalizedMetric === "win_rate") {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS total FROM arena_profiles p
         WHERE (p.wins + p.losses) >= 50`,
      )
      .get();
    return Number(row?.total || 0);
  }
  const row = db
    .prepare(`SELECT COUNT(*) AS total FROM arena_profiles`)
    .get();
  return Number(row?.total || 0);
}

function getLeaderboard(db, metric, options = {}) {
  const page = Math.max(toPositiveInt(options.page, 1), 1);
  const perPage = clamp(toPositiveInt(options.perPage, 50), 1, 100);
  const offset = (page - 1) * perPage;
  const normalizedMetric = String(metric || "level").toLowerCase();

  if (!["level", "win_rate", "rich", "elo"].includes(normalizedMetric)) {
    throw new ArenaHttpError(
      400,
      "Invalid leaderboard metric. Use level, win_rate, rich, or elo.",
      "ARENA_INVALID_LEADERBOARD_METRIC",
    );
  }

  const total = countLeaderboardEntries(db, normalizedMetric);
  const totalPages = Math.max(Math.ceil(total / perPage), 1);

  let rows = [];
  if (normalizedMetric === "level") {
    rows = db
      .prepare(
        `SELECT
           p.userId,
           u.username,
           u.avatar,
           p.level,
           p.xp,
           p.coins,
           p.wins,
           p.losses,
           p.winStreak,
           p.defensiveWins,
           p.defensiveLosses,
           p.activeTitleId,
           p.lifetimeCoinsEarned,
           p.eloRating,
           p.eloMatches,
           p.peakElo,
           p.updatedAt,
           (p.wins + p.losses) AS totalFights,
           CASE WHEN (p.wins + p.losses) > 0
             THEN CAST(p.wins AS REAL) / CAST((p.wins + p.losses) AS REAL)
             ELSE 0 END AS winRate
         FROM arena_profiles p
         JOIN users u ON u.id = p.userId
          ORDER BY p.level DESC, p.xp DESC, p.wins DESC, p.updatedAt ASC
          LIMIT ? OFFSET ?`,
       )
       .all(perPage, offset);
   } else if (normalizedMetric === "win_rate") {
    rows = db
      .prepare(
        `SELECT
           p.userId,
           u.username,
           u.avatar,
           p.level,
           p.xp,
           p.coins,
           p.wins,
           p.losses,
           p.winStreak,
           p.defensiveWins,
           p.defensiveLosses,
           p.activeTitleId,
           p.lifetimeCoinsEarned,
           p.eloRating,
           p.eloMatches,
           p.peakElo,
           p.updatedAt,
           (p.wins + p.losses) AS totalFights,
           CASE WHEN (p.wins + p.losses) > 0
             THEN CAST(p.wins AS REAL) / CAST((p.wins + p.losses) AS REAL)
             ELSE 0 END AS winRate
         FROM arena_profiles p
         JOIN users u ON u.id = p.userId
          WHERE (p.wins + p.losses) >= 50
          ORDER BY winRate DESC, totalFights DESC, p.level DESC, p.updatedAt ASC
          LIMIT ? OFFSET ?`,
       )
       .all(perPage, offset);
   } else if (normalizedMetric === "rich") {
    rows = db
      .prepare(
        `SELECT
           p.userId,
           u.username,
           u.avatar,
           p.level,
           p.xp,
           p.coins,
           p.wins,
           p.losses,
           p.winStreak,
           p.defensiveWins,
           p.defensiveLosses,
           p.activeTitleId,
           p.lifetimeCoinsEarned,
           p.eloRating,
           p.eloMatches,
           p.peakElo,
           p.updatedAt,
           (p.wins + p.losses) AS totalFights,
           CASE WHEN (p.wins + p.losses) > 0
             THEN CAST(p.wins AS REAL) / CAST((p.wins + p.losses) AS REAL)
             ELSE 0 END AS winRate
         FROM arena_profiles p
         JOIN users u ON u.id = p.userId
          ORDER BY p.coins DESC, p.lifetimeCoinsEarned DESC, p.level DESC, p.updatedAt ASC
          LIMIT ? OFFSET ?`,
       )
       .all(perPage, offset);
   } else if (normalizedMetric === "elo") {
    rows = db
      .prepare(
        `SELECT
           p.userId,
           u.username,
           u.avatar,
           p.level,
           p.xp,
           p.coins,
           p.wins,
           p.losses,
           p.winStreak,
           p.defensiveWins,
           p.defensiveLosses,
           p.activeTitleId,
           p.lifetimeCoinsEarned,
           p.eloRating,
           p.eloMatches,
           p.peakElo,
           p.updatedAt,
           (p.wins + p.losses) AS totalFights,
           CASE WHEN (p.wins + p.losses) > 0
             THEN CAST(p.wins AS REAL) / CAST((p.wins + p.losses) AS REAL)
             ELSE 0 END AS winRate
         FROM arena_profiles p
         JOIN users u ON u.id = p.userId
          ORDER BY p.eloRating DESC, p.eloMatches DESC, p.peakElo DESC, p.updatedAt ASC
          LIMIT ? OFFSET ?`,
       )
       .all(perPage, offset);
   }

  return {
    metric: normalizedMetric,
    page,
    perPage,
    totalPages,
    total,
    entries: rows.map((row, index) => ({
      rank: offset + index + 1,
      user: {
        id: row.userId,
        username: row.username,
        avatar: row.avatar || null,
      },
      title: resolveActiveTitle(row.activeTitleId),
      level: toInt(row.level, 1),
      xp: toInt(row.xp, 0),
      xpToNext: xpToNext(toInt(row.level, 1)),
      // Derived in JS from the shared `xpToNext` — the curve is a fractional
      // power now (`level^1.85`), which SQLite can't express inline.
      xpProgress: clamp(
        toInt(row.xp, 0) / xpToNext(toInt(row.level, 1)),
        0,
        1,
      ),
      wins: toInt(row.wins, 0),
      losses: toInt(row.losses, 0),
      defensiveWins: toInt(row.defensiveWins, 0),
      defensiveLosses: toInt(row.defensiveLosses, 0),
      totalFights: toInt(row.totalFights, 0),
      winRate: Number(row.winRate || 0),
      coins: toInt(row.coins, 0),
      lifetimeCoinsEarned: toInt(row.lifetimeCoinsEarned, 0),
      eloRating: Math.max(
        toInt(row.eloRating, ELO_DEFAULT_RATING),
        ELO_MIN_RATING,
      ),
      eloMatches: toPositiveInt(row.eloMatches, 0),
      peakElo: Math.max(
        toInt(row.peakElo, ELO_DEFAULT_RATING),
        ELO_MIN_RATING,
      ),
      eloProvisional: isEloProvisional(row.eloMatches),
      updatedAt: row.updatedAt || null,
    })),
  };
}

module.exports = {
  countLeaderboardEntries,
  getLeaderboard,
};
