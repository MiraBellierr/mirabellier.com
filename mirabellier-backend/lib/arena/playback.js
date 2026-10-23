const { nowIso, makeId, toInt, toPositiveInt } = require("./utils");
const { ensureArenaProfile, getArenaProfilePayload } = require("./profile");
const { normalizeArenaEffects, serializeEffects } = require("./effects");
const {
  normalizeSelectedCard, cardIvStatBonus, insertCollectionCard,
  recordCardAffinityFight,
} = require("./cards");
const {
  loadCombatSnapshot, selectOpponentForFight, loadFightOpponent,
  simulateFight, assertFightCooldown, applyFightEffectUsage,
  settleDefenderFight, NPC_REWARD_SCALE,
  calculateWinXp, calculateLossXp, calculateWinCoins, consumeWinBoosts,
  consumeFightBoostDurations, tryGrantBonusDraw,
  getWonRoundRarityCoinReward, applyEloResult,
  incrementDailyOpponentCount, resetDailyOpponentCount,
  applyLevelUps, convertMaxLevelOverflowXp,
} = require("./combat");
const { ensureArenaCardPool } = require("../arena-characters");
const { ArenaHttpError } = require("./utils");


function getActiveFightRow(db, userId) {
  return db
    .prepare("SELECT * FROM arena_active_fights WHERE userId = ?")
    .get(userId);
}

function hasActiveFight(db, userId) {
  const row = getActiveFightRow(db, userId);
  return row ? row.state === "active" : false;
}

function deleteActiveFight(db, userId) {
  db.prepare("DELETE FROM arena_active_fights WHERE userId = ?").run(userId);
}

// Public discovery list for spectators — who's fighting right now.
function getActiveArenaFighters(db) {
  return db
    .prepare(
      `SELECT af.userId, u.username, af.updatedAt
       FROM arena_active_fights af
       JOIN users u ON u.id = af.userId
       WHERE af.state = 'active'
       ORDER BY af.updatedAt DESC`,
    )
    .all();
}

// Fight rooms are named `arena:fight:<fighterUserId>` in the WS layer,
// joined only by sockets that asked to spectate that fighter (see
// ARENA_FIGHT_SPECTATE_JOIN in app.js). Broadcasting is a no-op when nobody
// is watching. Required lazily to dodge any module-load-order issue between
// this file and lib/websocket-server.js.
function broadcastSpectatorUpdate(userId, state) {
  try {
    const { getWebSocketManager } = require("../websocket-server");
    const { S2C } = require("../websocket-events");
    const wsManager = getWebSocketManager();
    if (!wsManager || !state) return;
    wsManager.broadcastToRoom(`arena:fight:${userId}`, {
      type: S2C.ARENA_FIGHT_SPECTATOR_UPDATE,
      data: state,
    });
  } catch {
    // Never let a spectator push failure break the fighter's own turn.
  }
}

function parsePlaybackSimulation(row) {
  return JSON.parse(row.simulationJson);
}

function reconcilePlaybackFightRow(db, userId, row, simulation) {
  const allTurns = Array.isArray(simulation.rounds) ? simulation.rounds : [];
  const totalTurns = allTurns.length;
  const cursor = toInt(row.cursor, 0);
  let changed = false;

  if (row.state !== "finished" && cursor >= totalTurns) {
    db.prepare(
      `UPDATE arena_active_fights
       SET cursor = ?, state = 'finished', updatedAt = ?
       WHERE userId = ?`,
    ).run(totalTurns, nowIso(), userId);
    row = getActiveFightRow(db, userId);
    changed = true;
  }

  if (row?.state === "finished" && !simulation.rewards) {
    finalizePlaybackFightRewards(db, userId);
    row = getActiveFightRow(db, userId);
    changed = true;
  }

  if (!changed || !row) {
    return { row, simulation };
  }

  try {
    return { row, simulation: parsePlaybackSimulation(row) };
  } catch {
    deleteActiveFight(db, userId);
    return { row: null, simulation: null };
  }
}

function getPlaybackFightState(db, userId, preloadedRow) {
  let row = preloadedRow || getActiveFightRow(db, userId);
  if (!row) return null;

  let simulation;
  try {
    simulation = parsePlaybackSimulation(row);
  } catch {
    deleteActiveFight(db, userId);
    return null;
  }

  ({ row, simulation } = reconcilePlaybackFightRow(db, userId, row, simulation));
  if (!row || !simulation) return null;

  return buildPlaybackFightState(db, userId, row, simulation);
}

function buildPlaybackFightState(_db, _userId, row, simulation) {
  let opponent;
  try {
    opponent = JSON.parse(row.opponentJson);
  } catch {
    opponent = {};
  }

  let playerEffects;
  try {
    playerEffects = JSON.parse(row.playerEffectsJson || "{}");
  } catch {
    playerEffects = {};
  }

  const cursor = toInt(row.cursor, 0);
  const isFinished = row.state === "finished";
  const allTurns = Array.isArray(simulation.rounds) ? simulation.rounds : [];
  const totalTurns = allTurns.length;
  const revealedTurns = allTurns.slice(0, cursor);

  // Derive HP from the last revealed turn (or max HP if none yet)
  let playerHp = simulation.battle?.maxHp?.player ?? 0;
  let opponentHp = simulation.battle?.maxHp?.opponent ?? 0;
  let playerShield = simulation.battle?.initialShield?.player ?? 0;
  let opponentShield = simulation.battle?.initialShield?.opponent ?? 0;
  if (cursor > 0 && revealedTurns.length > 0) {
    const last = revealedTurns[revealedTurns.length - 1];
    playerHp = last.playerHp ?? playerHp;
    opponentHp = last.opponentHp ?? opponentHp;
    playerShield = last.playerShield ?? playerShield;
    opponentShield = last.opponentShield ?? opponentShield;
  }

  const consoleLines = Array.isArray(simulation.battle?.console)
    ? simulation.battle.console.filter(e => (e.turn || 0) <= cursor)
    : [];

  return {
    fightId: row.fightId,
    cursor,
    totalTurns,
    isFinished,
    result: isFinished ? (simulation.playerWon ? "win" : "loss") : null,
    opponent,
    playerEffects,
    battle: {
      maxHp: simulation.battle?.maxHp ?? { player: 0, opponent: 0 },
      currentHp: { player: playerHp, opponent: opponentHp },
      currentShield: { player: playerShield, opponent: opponentShield },
      console: consoleLines,
    },
    turns: revealedTurns,
    score: {
      player: simulation.playerRoundsWon,
      opponent: simulation.opponentRoundsWon,
    },
    rewards: isFinished
      ? {
          xp: toPositiveInt(simulation.rewards?.xp, 0),
          coins: toPositiveInt(simulation.rewards?.coins, 0),
          rarityCoinReward: toPositiveInt(
            simulation.rewards?.rarityCoinReward,
            0,
          ),
          levelsGained: toPositiveInt(simulation.rewards?.levelsGained, 0),
          materialDrops: Array.isArray(simulation.rewards?.materialDrops)
            ? simulation.rewards.materialDrops
            : Array.isArray(simulation.materialDrops)
              ? simulation.materialDrops
              : [],
          elo:
            simulation.rewards?.elo &&
            typeof simulation.rewards.elo === "object"
              ? simulation.rewards.elo
              : null,
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function startPlaybackFight(db, userId) {
  await ensureArenaCardPool(db);

  const profile = ensureArenaProfile(db, userId);
  if (!profile.selectedCard) {
    throw new ArenaHttpError(
      409,
      "Draw a card to start.",
      "ARENA_CARD_REQUIRED",
    );
  }

  if (hasActiveFight(db, userId)) {
    const existing = getPlaybackFightState(db, userId);
    throw new ArenaHttpError(
      409,
      "A fight is already in progress. Finish it first.",
      "ARENA_FIGHT_ACTIVE",
      { activeFight: existing },
    );
  }

  const preflightEffects = normalizeArenaEffects(profile.effects);
  const cooldownResult = assertFightCooldown(profile, {
    effects: preflightEffects,
    allowGateKey: true,
  });
  // assertFightCooldown already decrements preflightEffects.gateKeyCharges internally

  const opponentSelection = await selectOpponentForFight(db, userId);
  const opponentState = loadFightOpponent(db, opponentSelection);
  const opponentProfile = opponentState.profile;

  const playerSnapshot = loadCombatSnapshot(db, profile);
  const opponentSnapshot = opponentState.snapshot;
  const opponentPreflightEffects = normalizeArenaEffects(opponentProfile.effects || {});
  const simulation = await simulateFight(db, {
    player: playerSnapshot,
    opponent: opponentSnapshot,
    playerEffects: preflightEffects,
    opponentEffects: opponentPreflightEffects,
  });
  simulation.materialDrops = [];

  const now = nowIso();
  const fightId = makeId("fight");

  const tx = db.transaction(() => {
    if (hasActiveFight(db, userId)) {
      throw new ArenaHttpError(
        409,
        "A fight is already in progress.",
        "ARENA_FIGHT_ACTIVE",
      );
    }

    const current = ensureArenaProfile(db, userId);
    const effects = normalizeArenaEffects(current.effects);
    if (cooldownResult.bypassedWithGateKey && effects.gateKeyCharges > 0) {
      effects.gateKeyCharges -= 1;
    }

    db.prepare(
      `UPDATE arena_profiles
       SET effectsJson = ?, lastFightAt = ?, updatedAt = ?
       WHERE userId = ?`,
    ).run(serializeEffects(effects), now, now, userId);

    db.prepare(
      `INSERT OR REPLACE INTO arena_active_fights (
        userId, fightId, cursor, state,
        simulationJson, opponentJson, playerEffectsJson,
        createdAt, updatedAt
      ) VALUES (?, ?, 0, 'active', ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      fightId,
      JSON.stringify(simulation),
      JSON.stringify(opponentState.publicSnapshot),
      JSON.stringify(preflightEffects),
      now,
      now,
    );
  });

  tx();

  return getPlaybackFightState(db, userId);
}

function advancePlaybackFightTurn(db, userId) {
  const row = getActiveFightRow(db, userId);
  if (!row) {
    throw new ArenaHttpError(
      404,
      "No active fight. Start one first.",
      "ARENA_NO_ACTIVE_FIGHT",
    );
  }

  if (row.state === "finished") {
    return getPlaybackFightState(db, userId, row);
  }

  let simulation;
  try {
    simulation = JSON.parse(row.simulationJson);
  } catch {
    deleteActiveFight(db, userId);
    throw new ArenaHttpError(500, "Fight data corrupted.");
  }

  const allTurns = Array.isArray(simulation.rounds) ? simulation.rounds : [];
  const totalTurns = allTurns.length;
  const nextCursor = Math.min(row.cursor + 1, totalTurns);
  const isNowFinished = nextCursor >= totalTurns;

  db.prepare(
    `UPDATE arena_active_fights
     SET cursor = ?, state = ?, updatedAt = ?
     WHERE userId = ?`,
  ).run(nextCursor, isNowFinished ? "finished" : "active", nowIso(), userId);

  if (isNowFinished) {
    finalizePlaybackFightRewards(db, userId);
    // Re-read the row to get the updated simulationJson (with rewards)
    const updatedRow = getActiveFightRow(db, userId);
    if (updatedRow) {
      try {
        simulation = JSON.parse(updatedRow.simulationJson);
      } catch { /* keep old simulation */ }
    }
  }

  // Reuse the already-parsed simulation and updated cursor — avoid re-reading DB
  return buildPlaybackFightState(db, userId, {
    ...row,
    cursor: nextCursor,
    state: isNowFinished ? "finished" : "active",
  }, simulation);
}

function skipPlaybackFightToEnd(db, userId) {
  const row = getActiveFightRow(db, userId);
  if (!row) {
    throw new ArenaHttpError(
      404,
      "No active fight. Start one first.",
      "ARENA_NO_ACTIVE_FIGHT",
    );
  }

  if (row.state === "finished") {
    return getPlaybackFightState(db, userId, row);
  }

  let simulation;
  try {
    simulation = JSON.parse(row.simulationJson);
  } catch {
    deleteActiveFight(db, userId);
    throw new ArenaHttpError(500, "Fight data corrupted.");
  }

  const totalTurns = Array.isArray(simulation.rounds)
    ? simulation.rounds.length
    : 0;

  db.prepare(
    `UPDATE arena_active_fights
     SET cursor = ?, state = 'finished', updatedAt = ?
     WHERE userId = ?`,
  ).run(totalTurns, nowIso(), userId);

  finalizePlaybackFightRewards(db, userId);

  // Re-read to get updated simulationJson with rewards
  const updatedRow = getActiveFightRow(db, userId);
  if (updatedRow) {
    try {
      simulation = JSON.parse(updatedRow.simulationJson);
    } catch { /* keep old simulation */ }
  }

  return buildPlaybackFightState(db, userId, {
    ...row,
    cursor: totalTurns,
    state: "finished",
  }, simulation);
}

function finalizePlaybackFightRewards(db, userId) {
  const row = getActiveFightRow(db, userId);
  if (!row || row.state !== "finished") return null;

  let simulation;
  try {
    simulation = JSON.parse(row.simulationJson);
  } catch {
    return null;
  }
  if (simulation.rewards && typeof simulation.rewards === "object") {
    return { rewards: simulation.rewards };
  }

  let opponent;
  try {
    opponent = JSON.parse(row.opponentJson);
  } catch {
    opponent = {};
  }

  const tx = db.transaction(() => {
    const current = ensureArenaProfile(db, userId);
    const effects = normalizeArenaEffects(current.effects);

    // Gate key was already consumed at fight start in startPlaybackFight's tx.
    // Only apply the simulation-scoped effect usage (no usedGateKeyBypass).
    const effectUsage = simulation.effectUsage || {};
    const nextEffects = applyFightEffectUsage(effects, effectUsage);

    const currentSnapshot = loadCombatSnapshot(db, current);
    const rarityCoinReward = getWonRoundRarityCoinReward(simulation);

    let baseXp = calculateWinXp(
      opponent.level ?? 1,
      simulation.xpRoundsWon ?? 1,
      current.winStreak,
    );
    baseXp = Math.floor(
      baseXp *
        (1 + Number(simulation?.passiveRewardBonus?.xpPct || 0) / 100),
    );
    let xpDelta = calculateLossXp(
      opponent.level ?? 1,
      simulation.xpRoundsWon ?? 1,
      current.winStreak,
    );
    let coinDelta = 0;

    if (simulation.playerWon) {
      let baseCoins = calculateWinCoins(
        opponent.level ?? 1,
        rarityCoinReward,
        current.winStreak,
      );
      baseCoins = Math.floor(
        baseCoins *
          (1 + Number(simulation?.passiveRewardBonus?.coinsPct || 0) / 100),
      );
      const adjusted = consumeWinBoosts(nextEffects, baseXp, baseCoins);
      xpDelta = adjusted.xpGain;
      coinDelta = adjusted.coinGain;
      current.wins += 1;
      current.winStreak += 1;
      tryGrantBonusDraw(db, userId, nextEffects);
    } else {
      current.losses += 1;
      xpDelta = consumeWinBoosts(nextEffects, xpDelta, 0).xpGain;
      if (nextEffects.streakShieldCharges > 0) {
        nextEffects.streakShieldCharges -= 1;
      } else {
        current.winStreak = 0;
      }
    }

    const isNpcFight =
      opponent.isNpc || !opponent.userId || String(opponent.userId).startsWith("npc:");
    // NPC fights pay less so PvP is the efficient path (they are also unrated).
    if (isNpcFight) {
      xpDelta = Math.floor(xpDelta * NPC_REWARD_SCALE);
      coinDelta = Math.floor(coinDelta * NPC_REWARD_SCALE);
    }
    consumeFightBoostDurations(nextEffects);

    const materialDrops = [];

    current.xp += xpDelta;
    current.coins += coinDelta;
    current.lifetimeCoinsEarned += coinDelta;
    const levelsGained = applyLevelUps(current);
    const overflowCoinDelta = convertMaxLevelOverflowXp(current);
    coinDelta += overflowCoinDelta;

    const tutorialMilestone = current.tutorialComplete || 0;
    for (const milestone of [5, 8, 12, 16, 20]) {
      if (current.level >= milestone && tutorialMilestone < milestone) {
        current.coins += 2000;
        current.lifetimeCoinsEarned += 2000;
        current.tutorialComplete = milestone;
      }
    }

    current.effects = nextEffects;
    current.updatedAt = nowIso();

    db.prepare(
      `UPDATE arena_profiles
       SET level = ?, xp = ?, coins = ?,
           wins = ?, losses = ?, winStreak = ?,
           hp = ?, power = ?, guard = ?, speed = ?, effectHit = ?,
           lifetimeCoinsEarned = ?, effectsJson = ?, updatedAt = ?,
           tutorialComplete = ?
       WHERE userId = ?`,
    ).run(
      current.level,
      current.xp,
      current.coins,
      current.wins,
      current.losses,
      current.winStreak,
      current.hp,
      current.power,
      current.guard,
      current.speed,
      current.effectHit,
      current.lifetimeCoinsEarned,
      serializeEffects(current.effects),
      current.updatedAt,
      current.tutorialComplete || 0,
      current.userId,
    );

    db.prepare(
      `INSERT INTO arena_fights (
        id, userId, opponentUserId, result,
        roundsJson, xpDelta, coinDelta, createdAt,
        playerCardJson, opponentCardJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.fightId,
      current.userId,
      opponent.userId || "unknown",
      simulation.playerWon ? "win" : "loss",
      JSON.stringify(simulation.rounds),
      xpDelta,
      coinDelta,
      nowIso(),
      simulation.playerCard ? JSON.stringify(simulation.playerCard) : null,
      opponent.selectedCard ? JSON.stringify(opponent.selectedCard) : null,
    );

    const opponentUserId = String(opponent.userId || "");
    const elo =
      opponent.isNpc ||
      !opponentUserId ||
      opponentUserId.startsWith("npc:")
      ? {
          rated: false,
          kFactor: 0,
          playerBefore: current.eloRating,
          playerAfter: current.eloRating,
          playerDelta: 0,
          opponentBefore: null,
          opponentAfter: null,
          opponentDelta: 0,
        }
      : applyEloResult(
          db,
          current.userId,
          opponentUserId,
          simulation.playerWon,
        );

    if (opponentUserId && !String(opponentUserId).startsWith("npc:")) {
      incrementDailyOpponentCount(db, opponentUserId);
      if (!isNpcFight) {
        settleDefenderFight(db, opponentUserId, {
          defenderWon: !simulation.playerWon,
          oppEffectUsage: simulation.oppEffectUsage,
          attackerUserId: current.userId,
          timestamp: nowIso(),
        });
      }
    }
    resetDailyOpponentCount(db, current.userId);

    recordCardAffinityFight(
      db,
      current.userId,
      simulation.playerCard || currentSnapshot.selectedCard,
      simulation.playerWon,
    );

    const rewards = {
      xp: xpDelta,
      coins: coinDelta,
      rarityCoinReward,
      levelsGained,
      materialDrops,
      elo,
    };
    simulation.rewards = rewards;
    db.prepare(
      `UPDATE arena_active_fights
       SET simulationJson = ?, updatedAt = ?
       WHERE userId = ?`,
    ).run(JSON.stringify(simulation), nowIso(), userId);

    return {
      rewards,
    };
  });

  return tx();
}

module.exports = {
  getActiveFightRow,
  hasActiveFight,
  deleteActiveFight,
  getActiveArenaFighters,
  parsePlaybackSimulation,
  reconcilePlaybackFightRow,
  getPlaybackFightState,
  // Wrapped so every caller — the REST routes in routes/arena/index.js and
  // the (currently unused by the frontend, but still-live) WS messages in
  // app.js alike — pushes spectators an update for free, from one place.
  async startPlaybackFight(db, userId) {
    const state = await startPlaybackFight(db, userId);
    broadcastSpectatorUpdate(userId, state);
    return state;
  },
  advancePlaybackFightTurn(db, userId) {
    const state = advancePlaybackFightTurn(db, userId);
    broadcastSpectatorUpdate(userId, state);
    return state;
  },
  skipPlaybackFightToEnd(db, userId) {
    const state = skipPlaybackFightToEnd(db, userId);
    broadcastSpectatorUpdate(userId, state);
    return state;
  },
  finalizePlaybackFightRewards,
};
