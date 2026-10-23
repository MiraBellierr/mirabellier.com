const DEFAULT_WINDOW_DAYS = 7;

const BALANCE_THRESHOLDS = {
  damage: 1000,
  evasionPct: 50,
  winStreak: 100,
};

function toPositiveInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : fallback;
}

function clampWindowDays(value) {
  return Math.min(Math.max(toPositiveInt(value, DEFAULT_WINDOW_DAYS), 1), 90);
}

function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  const parsed = parseJsonObject(value);
  return Array.isArray(parsed) ? parsed : [];
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function summarizeFightRows(rows) {
  let totalDamage = 0;
  let maxDamage = 0;
  let damagingTurns = 0;
  const highDamageTurns = [];

  rows.forEach((row) => {
    const turns = parseJsonArray(row.roundsJson);
    turns.forEach((turn) => {
      const damage = toPositiveInt(turn?.damage, 0);
      if (damage <= 0) return;
      damagingTurns += 1;
      totalDamage += damage;
      maxDamage = Math.max(maxDamage, damage);

      if (damage > BALANCE_THRESHOLDS.damage) {
        highDamageTurns.push({
          fightId: row.id,
          userId: row.userId,
          opponentUserId: row.opponentUserId || null,
          createdAt: row.createdAt,
          turn: toPositiveInt(turn.turn, 0),
          attacker: String(turn.attacker || ""),
          damage,
        });
      }
    });
  });

  return {
    totalDamage,
    maxDamage,
    averageDamage:
      damagingTurns > 0 ? Number((totalDamage / damagingTurns).toFixed(2)) : 0,
    damagingTurns,
    highDamageTurns,
  };
}

function readArenaMetrics(db, options = {}) {
  const days = clampWindowDays(options.days);
  const since = options.since || isoDaysAgo(days);

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS totalFights,
         SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins,
         SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS losses,
         SUM(xpDelta) AS xpInflow,
         SUM(CASE WHEN coinDelta > 0 THEN coinDelta ELSE 0 END) AS fightCoinInflow
       FROM arena_fights
       WHERE createdAt >= ?`,
    )
    .get(since);

  const daily = db
    .prepare(
      `SELECT
         date(createdAt) AS day,
         COUNT(*) AS fights,
         SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins,
         SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS losses,
         SUM(CASE WHEN coinDelta > 0 THEN coinDelta ELSE 0 END) AS coinInflow
       FROM arena_fights
       WHERE createdAt >= ?
       GROUP BY date(createdAt)
       ORDER BY day DESC`,
    )
    .all(since)
    .map((row) => ({
      day: row.day,
      fights: toPositiveInt(row.fights, 0),
      wins: toPositiveInt(row.wins, 0),
      losses: toPositiveInt(row.losses, 0),
      winRate:
        toPositiveInt(row.fights, 0) > 0
          ? Number((toPositiveInt(row.wins, 0) / toPositiveInt(row.fights, 0)).toFixed(4))
          : 0,
      coinInflow: toPositiveInt(row.coinInflow, 0),
    }));

  const economy = db
    .prepare(
      `SELECT
         COUNT(*) AS profiles,
         SUM(coins) AS currentCoins,
         SUM(lifetimeCoinsEarned) AS lifetimeCoinsEarned
       FROM arena_profiles`,
    )
    .get();

  const fightRows = db
    .prepare(
      `SELECT id, userId, opponentUserId, roundsJson, createdAt
       FROM arena_fights
       WHERE createdAt >= ?
       ORDER BY createdAt DESC
       LIMIT 500`,
    )
    .all(since);
  const damage = summarizeFightRows(fightRows);

  const highStreakProfiles = db
    .prepare(
      `SELECT userId, winStreak, level, eloRating
       FROM arena_profiles
       WHERE winStreak > ?
       ORDER BY winStreak DESC
       LIMIT 20`,
    )
    .all(BALANCE_THRESHOLDS.winStreak)
    .map((row) => ({
      userId: row.userId,
      winStreak: toPositiveInt(row.winStreak, 0),
      level: toPositiveInt(row.level, 1),
      eloRating: toPositiveInt(row.eloRating, 1000),
    }));

  const highEvasionProfiles = db
    .prepare(
      `SELECT userId, effectsJson, level, winStreak
       FROM arena_profiles
       WHERE effectsJson IS NOT NULL`,
    )
    .all()
    .map((row) => {
      const effects = parseJsonObject(row.effectsJson);
      return {
        userId: row.userId,
        evasionPct: Number(effects.evadeBoostPct || 0),
        level: toPositiveInt(row.level, 1),
        winStreak: toPositiveInt(row.winStreak, 0),
      };
    })
    .filter((row) => row.evasionPct > BALANCE_THRESHOLDS.evasionPct)
    .sort((a, b) => b.evasionPct - a.evasionPct)
    .slice(0, 20);

  const totalFights = toPositiveInt(totals.totalFights, 0);
  const wins = toPositiveInt(totals.wins, 0);
  const currentCoins = toPositiveInt(economy.currentCoins, 0);
  const lifetimeCoinsEarned = toPositiveInt(economy.lifetimeCoinsEarned, 0);

  return {
    window: {
      days,
      since,
    },
    activity: {
      fights: totalFights,
      wins,
      losses: toPositiveInt(totals.losses, 0),
      winRate: totalFights > 0 ? Number((wins / totalFights).toFixed(4)) : 0,
      xpInflow: toPositiveInt(totals.xpInflow, 0),
      coinInflow: toPositiveInt(totals.fightCoinInflow, 0),
      fightsPerDay: Number((totalFights / days).toFixed(2)),
      daily,
    },
    economy: {
      profiles: toPositiveInt(economy.profiles, 0),
      currentCoins,
      lifetimeCoinsEarned,
      estimatedCoinOutflow: Math.max(0, lifetimeCoinsEarned - currentCoins),
      fightCoinInflow: toPositiveInt(totals.fightCoinInflow, 0),
    },
    balance: {
      thresholds: { ...BALANCE_THRESHOLDS },
      damage,
      highDamageTurns: damage.highDamageTurns.slice(0, 20),
      highEvasionProfiles,
      highStreakProfiles,
      alertCount:
        damage.highDamageTurns.length +
        highEvasionProfiles.length +
        highStreakProfiles.length,
    },
  };
}

module.exports = {
  BALANCE_THRESHOLDS,
  readArenaMetrics,
  summarizeFightRows,
};
