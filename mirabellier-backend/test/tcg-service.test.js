const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const { getEligibleCards, getGameState, submitAction } = require("../lib/tcg-service");
const { playAiTurn } = require("../lib/tcg-ai");

function createTestDb() {
  const db = new Database(":memory:");
  initializeSchema(db);
  db.prepare("INSERT INTO users (id, username, avatar, createdAt) VALUES (?, ?, ?, ?)").run("u1", "player1", null, new Date().toISOString());
  db.prepare("INSERT INTO users (id, username, avatar, createdAt) VALUES (?, ?, ?, ?)").run("u2", "player2", null, new Date().toISOString());
  return db;
}

function makeCard(id, element = "Might", iv = {}) {
  return {
    cardInstanceId: `card-${id}`,
    malId: id,
    title: `Card ${id}`,
    imageUrl: `https://cdn.test/${id}.jpg`,
    rarity: "C",
    element,
    drawnAt: `2026-01-01T00:00:${String(id).padStart(2, "0")}.000Z`,
    iv: {
      power: iv.power ?? 20,
      guard: iv.guard ?? 5,
      speed: iv.speed ?? 10,
      effectHit: iv.effectHit ?? 0,
      total: iv.total ?? 35,
    },
  };
}

function boardCard(card, input = {}) {
  return {
    ...card,
    currentHp: input.currentHp ?? 40,
    maxHp: input.maxHp ?? 40,
    assignedElements: input.assignedElements ?? [],
  };
}

function baseState(input = {}) {
  const p1Attacker = boardCard(makeCard(1, "Might", { power: 24, speed: 12 }));
  const p2Attacker = boardCard(makeCard(2, "Ward", { power: 16, guard: 4, speed: 8 }));
  return {
    players: {
      p1: {
        board: { attacker: p1Attacker, support: [null, null, null] },
        hand: [],
        drawPile: [],
        discardPile: [],
        elementPool: [],
        fullDeck: [p1Attacker],
        placedCardThisTurn: false,
        drawnCardThisTurn: false,
        switchedCardThisTurn: false,
        ...(input.p1 || {}),
      },
      p2: {
        board: { attacker: p2Attacker, support: [null, null, null] },
        hand: [],
        drawPile: [],
        discardPile: [],
        elementPool: [],
        fullDeck: [p2Attacker],
        placedCardThisTurn: false,
        drawnCardThisTurn: false,
        switchedCardThisTurn: false,
        ...(input.p2 || {}),
      },
    },
    turn: input.turn ?? 2,
    currentPlayer: input.currentPlayer ?? "p1",
    phase: "playing",
    p1Score: 0,
    p2Score: 0,
    winner: null,
    lastAction: null,
    turnStartedAt: input.turnStartedAt ?? Date.now(),
    mode: "pvp",
    elementPools: { p1: ["Might", "Swift"], p2: ["Might", "Swift"] },
    ...input.state,
  };
}

function insertGame(db, state, gameId = "tcg-test") {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tcg_games (id, state, currentTurn, currentPlayerId, player1Id, player2Id, player1Score, player2Score, createdAt, updatedAt)
     VALUES (?, 'playing', ?, ?, 'u1', 'u2', ?, ?, ?, ?)`,
  ).run(
    gameId,
    state.turn,
    state.currentPlayer === "p1" ? "u1" : "u2",
    state.p1Score,
    state.p2Score,
    now,
    now,
  );
  db.prepare("INSERT INTO tcg_game_state (gameId, stateJson, updatedAt) VALUES (?, ?, ?)").run(gameId, JSON.stringify(state), now);
  return gameId;
}

function insertCollectionCard(db, userId, card, index) {
  const now = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
  db.prepare(
    `INSERT INTO arena_card_collection (id, userId, cardInstanceId, cardJson, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(`collection-${card.cardInstanceId}`, userId, card.cardInstanceId, JSON.stringify(card), now, now);
}

function readStoredState(db, gameId = "tcg-test") {
  return JSON.parse(db.prepare("SELECT stateJson FROM tcg_game_state WHERE gameId = ?").get(gameId).stateJson);
}

test("eligible TCG cards include the full player collection beyond the first page", () => {
  const db = createTestDb();
  for (let id = 1; id <= 125; id += 1) {
    insertCollectionCard(db, "u1", makeCard(id, id % 2 === 0 ? "Might" : "Swift"), id);
  }
  insertCollectionCard(db, "u1", { ...makeCard(126, "Might"), element: null }, 126);

  const cards = getEligibleCards(db, "u1");

  assert.equal(cards.length, 125);
  assert.ok(cards.some((card) => card.cardInstanceId === "card-125"));
  assert.ok(cards.every((card) => card.element && card.rarity));
});

test("AI draw stores a full card object in hand instead of a raw draw-pile id", () => {
  const drawnCard = makeCard(9, "Swift");
  const aiAttacker = boardCard(makeCard(8, "Might"));
  const state = baseState({
    currentPlayer: "p2",
    p2: {
      board: { attacker: aiAttacker, support: [null, null, null] },
      hand: [],
      drawPile: [drawnCard.cardInstanceId],
      fullDeck: [aiAttacker, drawnCard],
      placedCardThisTurn: true,
    },
  });

  playAiTurn(state, "p2");

  assert.equal(state.players.p2.hand.length, 1);
  assert.equal(typeof state.players.p2.hand[0], "object");
  assert.equal(state.players.p2.hand[0].cardInstanceId, drawnCard.cardInstanceId);
});

test("empty draw pile does not block attacking", () => {
  const db = createTestDb();
  const state = baseState({
    p1: {
      board: {
        attacker: boardCard(makeCard(1, "Might", { power: 12, speed: 8 }), { assignedElements: ["Might", "Might"] }),
        support: [null, null, null],
      },
      drawPile: [],
      drawnCardThisTurn: false,
    },
  });
  const gameId = insertGame(db, state);

  const result = submitAction(db, gameId, "u1", { type: "attack" });

  assert.equal(result.ok, true);
  assert.equal(readStoredState(db, gameId).phase, "playing");
});

test("empty draw pile does not block ending turn", () => {
  const db = createTestDb();
  const state = baseState({
    p1: {
      drawPile: [],
      drawnCardThisTurn: false,
    },
  });
  const gameId = insertGame(db, state);

  const result = submitAction(db, gameId, "u1", { type: "end" });
  const stored = readStoredState(db, gameId);

  assert.equal(result.ok, true);
  assert.equal(stored.currentPlayer, "p2");
});

test("KO of a player with no remaining cards finishes cleanly", () => {
  const db = createTestDb();
  const state = baseState({
    p1: {
      board: {
        attacker: boardCard(makeCard(1, "Might", { power: 100, speed: 20 }), { assignedElements: ["Might", "Might"] }),
        support: [null, null, null],
      },
    },
    p2: {
      board: {
        attacker: boardCard(makeCard(2, "Ward", { guard: 0 }), { currentHp: 5, maxHp: 40 }),
        support: [null, null, null],
      },
      hand: [],
      drawPile: [],
    },
  });
  const gameId = insertGame(db, state);

  submitAction(db, gameId, "u1", { type: "attack" });
  const stored = readStoredState(db, gameId);

  assert.equal(stored.phase, "finished");
  assert.equal(stored.winner, "p1");
});

test("current player with no board, hand, or draw pile can end into a clean loss", () => {
  const db = createTestDb();
  const state = baseState({
    p1: {
      board: { attacker: null, support: [null, null, null] },
      hand: [],
      drawPile: [],
    },
  });
  const gameId = insertGame(db, state);

  submitAction(db, gameId, "u1", { type: "end" });
  const stored = readStoredState(db, gameId);

  assert.equal(stored.phase, "finished");
  assert.equal(stored.winner, "p2");
});

test("off-element energy assignment succeeds", () => {
  const db = createTestDb();
  const state = baseState({
    p1: {
      elementPool: ["Swift"],
    },
  });
  const gameId = insertGame(db, state);

  submitAction(db, gameId, "u1", { type: "assign", slot: "attacker" });
  const stored = readStoredState(db, gameId);

  assert.deepEqual(stored.players.p1.board.attacker.assignedElements, ["Swift"]);
});

test("off-element energy cannot attack", () => {
  const db = createTestDb();
  const state = baseState({
    p1: {
      board: {
        attacker: boardCard(makeCard(1, "Might"), { assignedElements: ["Swift", "Swift"] }),
        support: [null, null, null],
      },
    },
  });
  const gameId = insertGame(db, state);

  assert.throws(
    () => submitAction(db, gameId, "u1", { type: "attack" }),
    (error) => error.code === "TCG_ELEMENT_MISMATCH",
  );
});

test("off-element energy can be consumed to switch", () => {
  const db = createTestDb();
  const attacker = boardCard(makeCard(1, "Might"), { assignedElements: ["Swift"] });
  const support = boardCard(makeCard(3, "Swift"));
  const state = baseState({
    p1: {
      board: { attacker, support: [support, null, null] },
    },
  });
  const gameId = insertGame(db, state);

  submitAction(db, gameId, "u1", { type: "switch", slot: "support_0" });
  const stored = readStoredState(db, gameId);

  assert.equal(stored.players.p1.board.attacker.cardInstanceId, support.cardInstanceId);
  assert.deepEqual(stored.players.p1.board.support[0].assignedElements, []);
});

test("getGameState finalizes timeout into a finished state", () => {
  const db = createTestDb();
  const state = baseState({
    turnStartedAt: Date.now() - 181000,
  });
  const gameId = insertGame(db, state);

  const publicState = getGameState(db, gameId, "u1");
  const gameRow = db.prepare("SELECT state, winnerId FROM tcg_games WHERE id = ?").get(gameId);

  assert.equal(publicState.phase, "finished");
  assert.equal(publicState.winner, "p2");
  assert.equal(gameRow.state, "finished");
  assert.equal(gameRow.winnerId, "u2");
});

test("submitAction timeout forfeits the active player, not the requester", () => {
  const db = createTestDb();
  const state = baseState({
    currentPlayer: "p1",
    turnStartedAt: Date.now() - 181000,
  });
  const gameId = insertGame(db, state);

  submitAction(db, gameId, "u2", { type: "end" });
  const stored = readStoredState(db, gameId);
  const gameRow = db.prepare("SELECT state, winnerId FROM tcg_games WHERE id = ?").get(gameId);

  assert.equal(stored.phase, "finished");
  assert.equal(stored.winner, "p2");
  assert.equal(gameRow.state, "finished");
  assert.equal(gameRow.winnerId, "u2");
});

test("PvP player can forfeit when it is not their turn", () => {
  const db = createTestDb();
  const state = baseState({
    currentPlayer: "p1",
  });
  const gameId = insertGame(db, state);

  submitAction(db, gameId, "u2", { type: "forfeit" });
  const stored = readStoredState(db, gameId);
  const gameRow = db.prepare("SELECT state, winnerId FROM tcg_games WHERE id = ?").get(gameId);

  assert.equal(stored.phase, "finished");
  assert.equal(stored.winner, "p1");
  assert.equal(gameRow.state, "finished");
  assert.equal(gameRow.winnerId, "u1");
});
