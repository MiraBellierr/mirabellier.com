const { ELEMENTS, ELEMENT_EFFECTIVENESS } = require("./arena-constants");
const { getArenaCharacterCatalog } = require("./arena-characters");
const { playAiTurn } = require("./tcg-ai");
const { S2C } = require("./websocket-events");

function _wsEmit() {
  return require("./websocket-server").getWebSocketManager();
}

function makeId(prefix) {
  const random = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now().toString(36);
  return `${prefix}-${timestamp}-${random}`;
}

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

const DECK_SIZE = 10;
const HAND_SIZE = 3;
const SUPPORT_SLOTS = 3;
const ELEMENTS_TO_ATTACK = 2;
const MAX_ELEMENT_POOL = 1;
const POINTS_TO_WIN = 3;

// ---- HP Calculation (mirrors computeMaxHp from arena/combat) ----
function cardMaxHp(card) {
  if (!card || !card.iv) return 40;
  const hp = 40;
  const guardBonus = Math.floor(toInt(card.iv.guard, 0) * 1.0);
  const utilityBonus = Math.floor(
    (toInt(card.iv.power, 0) + toInt(card.iv.speed, 0)) * 0.1,
  );
  return Math.max(25, hp + guardBonus + utilityBonus);
}

function toCardId(card) {
  return card?.cardInstanceId || `${card?.malId}-${card?.drawnAt || "card"}`;
}

// ---- State Management ----
function createInitialState(p1Cards, p2Cards) {
  const p1Deck = shuffle(p1Cards.slice(0, DECK_SIZE));
  const p2Deck = shuffle(p2Cards.slice(0, DECK_SIZE));

  return {
    players: {
      p1: {
        board: { attacker: null, support: [null, null, null] },
        hand: p1Deck.splice(0, HAND_SIZE),
        drawPile: p1Deck.map((c) => toCardId(c)).reverse(),
        discardPile: [],
        elementPool: [],
        fullDeck: p1Cards.slice(0, DECK_SIZE),
        placedCardThisTurn: false,
        drawnCardThisTurn: false,
        switchedCardThisTurn: false,
      },
      p2: {
        board: { attacker: null, support: [null, null, null] },
        hand: p2Deck.splice(0, HAND_SIZE),
        drawPile: p2Deck.map((c) => toCardId(c)).reverse(),
        discardPile: [],
        elementPool: [],
        fullDeck: p2Cards.slice(0, DECK_SIZE),
        placedCardThisTurn: false,
        drawnCardThisTurn: false,
        switchedCardThisTurn: false,
      },
    },
    turn: 0,
    currentPlayer: "p1",
    phase: "playing",
    p1Score: 0,
    p2Score: 0,
    winner: null,
    lastAction: null,
    turnStartedAt: Date.now(),
  };
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---- State Helpers ----
function getPlayerState(state, playerKey) {
  return state.players[playerKey];
}

function getOpponentKey(playerKey) {
  return playerKey === "p1" ? "p2" : "p1";
}

function findCardInDeck(playerState, cardId) {
  return playerState.fullDeck.find((c) => toCardId(c) === cardId);
}

function removeFromDrawPile(playerState) {
  if (playerState.drawPile.length === 0) return null;
  const cardId = playerState.drawPile.pop();
  return findCardInDeck(playerState, cardId);
}

function removeFromHand(playerState, cardId) {
  const index = playerState.hand.findIndex((c) => toCardId(c) === cardId);
  if (index === -1) return null;
  const [removed] = playerState.hand.splice(index, 1);
  return removed;
}

function playerCannotContinue(playerState) {
  return !playerState.board.attacker
    && playerState.board.support.every((s) => !s)
    && playerState.hand.length === 0
    && playerState.drawPile.length === 0;
}

function finishIfPlayerCannotContinue(state, playerKey) {
  const playerState = getPlayerState(state, playerKey);
  if (!playerCannotContinue(playerState)) return false;

  const winner = getOpponentKey(playerKey);
  state.winner = winner;
  state.phase = "finished";
  state.lastAction = `${playerKey === "p1" ? "Player 1" : "Player 2"} has no cards left. ${winner === "p1" ? "Player 1" : "Player 2"} wins!`;
  return true;
}

// ---- Actions ----
function validateIsYourTurn(state, playerKey) {
  if (state.currentPlayer !== playerKey) {
    throw Object.assign(new Error("Not your turn."), { status: 400, code: "TCG_NOT_YOUR_TURN" });
  }
}

function actionPlaceCard(state, playerKey, cardId, slot) {
  validateIsYourTurn(state, playerKey);
  const playerState = getPlayerState(state, playerKey);

  if (playerState.placedCardThisTurn) {
    throw Object.assign(new Error("You can only place 1 card per turn."), { status: 400, code: "TCG_ONE_PER_TURN" });
  }

  // Player's first card must go in attacker slot
  const hasNoBoardCards = !playerState.board.attacker && playerState.board.support.every((s) => !s);
  if (hasNoBoardCards && slot !== "attacker") {
    throw Object.assign(new Error("Place your first card in the attacker slot."), { status: 400, code: "TCG_FIRST_ATTACKER" });
  }

  // If attacker slot is empty but support cards exist, must promote from support
  if (slot === "attacker" && !playerState.board.attacker && playerState.board.support.some((s) => !!s)) {
    throw Object.assign(new Error("Promote a card from support to attacker first."), { status: 400, code: "TCG_MUST_PROMOTE" });
  }

  if (slot !== "attacker" && !slot.startsWith("support_")) {
    throw Object.assign(new Error("Invalid slot."), { status: 400, code: "TCG_INVALID_SLOT" });
  }

  const card = removeFromHand(playerState, cardId);
  if (!card) {
    throw Object.assign(new Error("Card not in hand."), { status: 400, code: "TCG_CARD_NOT_IN_HAND" });
  }

  if (slot === "attacker") {
    if (playerState.board.attacker) {
      throw Object.assign(new Error("Attacker slot already occupied."), { status: 400, code: "TCG_SLOT_OCCUPIED" });
    }
    playerState.board.attacker = {
      ...card,
      currentHp: cardMaxHp(card),
      maxHp: cardMaxHp(card),
      assignedElements: [],
    };
  } else {
    const supportIndex = parseInt(slot.split("_")[1], 10);
    if (playerState.board.support[supportIndex]) {
      throw Object.assign(new Error("Support slot already occupied."), { status: 400, code: "TCG_SLOT_OCCUPIED" });
    }
    playerState.board.support[supportIndex] = {
      ...card,
      currentHp: cardMaxHp(card),
      maxHp: cardMaxHp(card),
      assignedElements: [],
    };
  }

  playerState.placedCardThisTurn = true;
}

function actionAssignElement(state, playerKey, cardSlot) {
  validateIsYourTurn(state, playerKey);
  const playerState = getPlayerState(state, playerKey);

  if (playerState.elementPool.length === 0) {
    throw Object.assign(new Error("No elements in pool."), { status: 400, code: "TCG_NO_ELEMENTS" });
  }

  let targetCard = null;
  if (cardSlot === "attacker") {
    targetCard = playerState.board.attacker;
  } else if (cardSlot.startsWith("support_")) {
    const index = parseInt(cardSlot.split("_")[1], 10);
    targetCard = playerState.board.support[index];
  }
  if (!targetCard) {
    throw Object.assign(new Error("No card in slot."), { status: 400, code: "TCG_EMPTY_SLOT" });
  }

  const consumed = playerState.elementPool.pop();
  if (!consumed || !ELEMENTS.includes(consumed)) {
    throw Object.assign(new Error("No valid element in pool."), { status: 400, code: "TCG_NO_ELEMENTS" });
  }
  if (!Array.isArray(targetCard.assignedElements)) targetCard.assignedElements = [];
  targetCard.assignedElements.push(consumed);
}
function actionAttack(state, playerKey) {
  validateIsYourTurn(state, playerKey);
  const playerState = getPlayerState(state, playerKey);
  const opponentKey = getOpponentKey(playerKey);
  const opponentState = getPlayerState(state, opponentKey);

  const attacker = playerState.board.attacker;
  const defender = opponentState.board.attacker;

  if (!attacker) {
    throw Object.assign(new Error("No attacker card."), { status: 400, code: "TCG_NO_ATTACKER" });
  }
  if (!defender) {
    throw Object.assign(new Error("Opponent has no attacker."), { status: 400, code: "TCG_NO_DEFENDER" });
  }
  if (attacker.assignedElements.length < ELEMENTS_TO_ATTACK) {
    throw Object.assign(new Error(`Need ${ELEMENTS_TO_ATTACK} assigned elements to attack.`), { status: 400, code: "TCG_NOT_ENOUGH_ELEMENTS" });
  }
  if (!attacker.element || !attacker.assignedElements.every((e) => e === attacker.element)) {
    throw Object.assign(new Error("All assigned elements must match card element."), { status: 400, code: "TCG_ELEMENT_MISMATCH" });
  }

  // Fast-paced damage: power + speed, no RNG
  const atkPower = toInt(attacker.iv?.power, 0) + toInt(attacker.iv?.speed, 0);
  const defGuard = toInt(defender.iv?.guard, 0) * 0.75;
  let damage = Math.max(8, Math.floor(atkPower - defGuard));

  // Element effectiveness
  const atkEl = ELEMENTS.includes(attacker.element) ? attacker.element : null;
  const defEl = ELEMENTS.includes(defender.element) ? defender.element : null;
  const elementMult = (atkEl && defEl && ELEMENT_EFFECTIVENESS[atkEl] && ELEMENT_EFFECTIVENESS[atkEl][defEl])
    ? ELEMENT_EFFECTIVENESS[atkEl][defEl] : 1;
  let elementEffectiveness = null;
  if (elementMult >= 1.5) elementEffectiveness = "super-effective";
  else if (elementMult <= 0.5) elementEffectiveness = "not-very-effective";

  damage = Math.max(1, Math.floor(damage * elementMult));

  // Extra elements beyond 2 boost damage: each extra = +50% base damage
  const extraElements = attacker.assignedElements.length - ELEMENTS_TO_ATTACK;
  if (extraElements > 0) {
    const bonusPct = extraElements * 0.5;
    damage = Math.max(1, Math.floor(damage * (1 + bonusPct)));
  }

  // Consume all elements on attack
  attacker.assignedElements = [];

  defender.currentHp = Math.max(0, defender.currentHp - damage);
  state.lastAction = `${attacker.title} dealt ${damage} damage to ${defender.title}`;
  state.lastAttackResult = {
    damage,
    elementEffective: elementEffectiveness,
    elementAttacker: attacker.element || null,
    ko: defender.currentHp <= 0,
    defenderHp: defender.currentHp,
    defenderMaxHp: defender.maxHp,
    attackerKey: playerKey,
    defenderKey: getOpponentKey(playerKey),
    attackId: Date.now() + Math.random(),
  };

  if (defender.currentHp <= 0) {
    // Move to discard — player must manually promote from support on their turn
    opponentState.discardPile.push(toCardId(defender));
    opponentState.board.attacker = null;

    // Score point
    if (playerKey === "p1") state.p1Score += 1;
    else state.p2Score += 1;

    state.lastAction += ` — KO! ${defender.title} fainted.`;

    // Check win
    const playerScore = playerKey === "p1" ? state.p1Score : state.p2Score;
    if (playerScore >= POINTS_TO_WIN) {
      state.winner = playerKey;
      state.phase = "finished";
    } else {
      finishIfPlayerCannotContinue(state, opponentKey);
    }
  }
}

function actionSwitchCard(state, playerKey, supportIndex) {
  validateIsYourTurn(state, playerKey);
  const playerState = getPlayerState(state, playerKey);

  if (!playerState.board.attacker) {
    throw Object.assign(new Error("No attacker to switch."), { status: 400, code: "TCG_NO_ATTACKER" });
  }
  if (playerState.switchedCardThisTurn) {
    throw Object.assign(new Error("Already switched this turn."), { status: 400, code: "TCG_ALREADY_SWITCHED" });
  }
  if (!playerState.board.attacker.assignedElements || playerState.board.attacker.assignedElements.length < 1) {
    throw Object.assign(new Error("Attacker needs at least 1 assigned element to switch."), { status: 400, code: "TCG_NO_ELEMENTS" });
  }

  const index = typeof supportIndex === "string" && supportIndex.startsWith("support_")
    ? toInt(supportIndex.split("_")[1], 0)
    : toInt(supportIndex, 0);
  if (index < 0 || index >= SUPPORT_SLOTS) {
    throw Object.assign(new Error("Invalid support slot."), { status: 400, code: "TCG_INVALID_SLOT" });
  }

  const supportCard = playerState.board.support[index];
  if (!supportCard) {
    throw Object.assign(new Error("Support slot is empty. Drag attacker to an occupied support card."), { status: 400, code: "TCG_EMPTY_SUPPORT_SLOT" });
  }

  // Swap attacker with support card — consume 1 element from attacker
  const temp = playerState.board.attacker;
  temp.assignedElements.pop();
  playerState.board.attacker = supportCard;
  playerState.board.support[index] = temp;
  playerState.switchedCardThisTurn = true;

  state.lastAction = `switched ${temp.title} with ${supportCard.title}`;
}

function actionPromoteCard(state, playerKey, supportIndex) {
  validateIsYourTurn(state, playerKey);
  const playerState = getPlayerState(state, playerKey);

  if (playerState.board.attacker) {
    throw Object.assign(new Error("Attacker slot already occupied."), { status: 400, code: "TCG_ATTACKER_OCCUPIED" });
  }

  const index = typeof supportIndex === "string" && supportIndex.startsWith("support_")
    ? toInt(supportIndex.split("_")[1], 0)
    : toInt(supportIndex, 0);
  if (index < 0 || index >= SUPPORT_SLOTS) {
    throw Object.assign(new Error("Invalid support slot."), { status: 400, code: "TCG_INVALID_SLOT" });
  }

  const card = playerState.board.support[index];
  if (!card) {
    throw Object.assign(new Error("Support slot is empty."), { status: 400, code: "TCG_EMPTY_SLOT" });
  }

  playerState.board.attacker = card;
  playerState.board.support[index] = null;
  state.lastAction = `promoted ${card.title} to attacker`;
}

function actionEndTurn(state) {
  const currentPlayerState = state.players[state.currentPlayer];
  if (finishIfPlayerCannotContinue(state, state.currentPlayer)) return;

  const hasBoardCard = !!currentPlayerState.board.attacker || currentPlayerState.board.support.some((s) => !!s);
  if (!hasBoardCard) {
    throw Object.assign(new Error("You must have at least one card on the board to end your turn."), { status: 400, code: "TCG_NO_BOARD_CARD" });
  }

  // Must have an attacker before ending turn
  if (!currentPlayerState.board.attacker) {
    const hasSupport = currentPlayerState.board.support.some((s) => !!s);
    if (hasSupport) {
      throw Object.assign(new Error("You must promote a support card to attacker before ending your turn."), { status: 400, code: "TCG_MUST_PROMOTE" });
    }
    if (finishIfPlayerCannotContinue(state, state.currentPlayer)) return;
  }

  state.currentPlayer = state.currentPlayer === "p1" ? "p2" : "p1";
  state.turn += 1;
  state.turnStartedAt = Date.now();

  const nextPlayerState = getPlayerState(state, state.currentPlayer);
  nextPlayerState.placedCardThisTurn = false;
  nextPlayerState.drawnCardThisTurn = false;
  nextPlayerState.switchedCardThisTurn = false;

  // Produce random element (skip turn 1)
  if (state.turn > 1) {
    if (nextPlayerState.elementPool.length < MAX_ELEMENT_POOL) {
      if (!state.elementPools) state.elementPools = {};
      const pool = state.elementPools[state.currentPlayer];
      const availablePool = (Array.isArray(pool) && pool.length > 0) ? pool : (console.warn(`[TCG] elementPools missing for ${state.currentPlayer}, falling back to all ELEMENTS`), ELEMENTS);
      const randomElement = availablePool[Math.floor(Math.random() * availablePool.length)];
      nextPlayerState.elementPool = [randomElement];
    }
  }

  state.lastAction = `Turn ${state.turn} — ${state.currentPlayer === "p1" ? "Player 1" : "Player 2"}'s turn`;
  finishIfPlayerCannotContinue(state, state.currentPlayer);
}

function actionDrawCard(state, playerKey) {
  validateIsYourTurn(state, playerKey);

  if (state.turn <= 1) {
    throw Object.assign(new Error("Cannot draw on the first turn."), { status: 400, code: "TCG_NO_DRAW_TURN_1" });
  }

  const playerState = getPlayerState(state, playerKey);

  if (playerState.drawnCardThisTurn) {
    throw Object.assign(new Error("Already drew a card this turn."), { status: 400, code: "TCG_ALREADY_DREW" });
  }

  const drawn = removeFromDrawPile(playerState);
  if (!drawn) {
    throw Object.assign(new Error("No cards left in draw pile."), { status: 400, code: "TCG_DRAW_EMPTY" });
  }

  playerState.hand.push(drawn);
  playerState.drawnCardThisTurn = true;
}

// ---- Game Flow ----
function getEligibleCards(db, userId) {
  const { getArenaCollectionPayload } = require("./arena/collection");
  const perPage = 100;
  const firstPage = getArenaCollectionPayload(db, userId, { page: 1, perPage });
  const cards = [...firstPage.cards];

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const collection = getArenaCollectionPayload(db, userId, { page, perPage });
    cards.push(...collection.cards);
  }

  return cards.filter((c) => c.element && c.rarity);
}

function joinMatchmaking(db, userId) {
  // Clean up stale entries (older than 30 seconds)
  db.prepare(`DELETE FROM tcg_matchmaking WHERE joinedAt < ?`).run(new Date(Date.now() - 30000).toISOString());

  db.prepare(
    `INSERT OR REPLACE INTO tcg_matchmaking (userId, joinedAt) VALUES (?, ?)`,
  ).run(userId, nowIso());

  // Check if another player is already waiting
  const other = db
    .prepare(`SELECT userId FROM tcg_matchmaking WHERE userId != ? ORDER BY joinedAt ASC LIMIT 1`)
    .get(userId);

  if (other) {
    // Match found! Create game
    const gameId = makeId("tcg");
    const [p1, p2] = Math.random() < 0.5 ? [userId, other.userId] : [other.userId, userId];

    db.prepare(`DELETE FROM tcg_matchmaking WHERE userId IN (?, ?)`).run(userId, other.userId);

    db.prepare(
      `INSERT INTO tcg_games (id, state, currentPlayerId, player1Id, player2Id, createdAt, updatedAt)
       VALUES (?, 'deck_build', ?, ?, ?, ?, ?)`,
    ).run(gameId, p1, p1, p2, nowIso(), nowIso());

    const w = _wsEmit();
    if (w) w.sendToUser(other.userId, { type: S2C.TCG_QUEUE_MATCHED, data: { gameId } });

    return { matched: true, gameId };
  }

  return { waiting: true };
}

function startSoloGame(db, userId, elementPool = ELEMENTS, deckCards = null, mode = "solo") {
  let cards;
  if (Array.isArray(deckCards) && deckCards.length >= DECK_SIZE) {
    cards = deckCards.slice(0, DECK_SIZE).filter((c) => c && c.malId && c.title && c.imageUrl && c.element);
    if (cards.length < DECK_SIZE) {
      throw Object.assign(new Error(`Need at least ${DECK_SIZE} valid cards with element types.`), { status: 400, code: "TCG_INVALID_CARDS" });
    }
  } else {
    cards = getEligibleCards(db, userId);
    if (cards.length < DECK_SIZE) {
      throw Object.assign(new Error(`Need at least ${DECK_SIZE} eligible cards.`), { status: 400, code: "TCG_NOT_ENOUGH_CARDS" });
    }
  }

  const gameId = makeId("tcg");
  const p1Deck = shuffle(cards).slice(0, DECK_SIZE);
  let p2Deck;
  if (mode === "ai") {
    // AI gets a random deck from all eligible cards
    const aiCards = getEligibleCards(db, userId);
    p2Deck = shuffle(aiCards).slice(0, DECK_SIZE);
  } else {
    p2Deck = shuffle(cards.filter((c) => toCardId(c) !== toCardId(p1Deck[0]) || cards.length <= DECK_SIZE)).slice(0, DECK_SIZE);
  }

  const validPool = Array.isArray(elementPool) && elementPool.length > 0
    ? elementPool.filter((e) => ELEMENTS.includes(e))
    : ELEMENTS;

  // AI gets a random subset of elements (2-4 types)
  const aiPool = shuffle([...ELEMENTS]).slice(0, 2 + Math.floor(Math.random() * 3));

  const gameState = createInitialState(p1Deck, p2Deck);
  gameState.turn = 1;
  gameState.elementPools = {
    p1: [...validPool],
    p2: mode === "ai" ? aiPool : [...validPool],
  };
  gameState.mode = mode === "ai" ? "ai" : "solo";

  db.prepare(
    `INSERT INTO tcg_games (id, state, currentTurn, currentPlayerId, player1Id, player2Id, createdAt, updatedAt)
     VALUES (?, 'playing', 1, ?, ?, ?, ?, ?)`,
  ).run(gameId, userId, userId, userId, nowIso(), nowIso());

  db.prepare(
    `INSERT OR REPLACE INTO tcg_game_state (gameId, stateJson, updatedAt) VALUES (?, ?, ?)`,
  ).run(gameId, JSON.stringify(gameState), nowIso());

  return { gameId };
}

function leaveMatchmaking(db, userId) {
  db.prepare(`DELETE FROM tcg_matchmaking WHERE userId = ?`).run(userId);
  return { ok: true };
}

function checkMatchmaking(db, userId) {
  // Check if a game was recently created for this user (within last 60s)
  const recentGame = db
    .prepare(`SELECT id FROM tcg_games WHERE (player1Id = ? OR player2Id = ?) AND state = 'deck_build' AND createdAt > ? LIMIT 1`)
    .get(userId, userId, new Date(Date.now() - 60000).toISOString());
  if (recentGame) return { matched: true, gameId: recentGame.id };

  const self = db.prepare(`SELECT userId FROM tcg_matchmaking WHERE userId = ?`).get(userId);
  if (!self) return { waiting: false, inQueue: false };

  // Only match if another player joined
  const other = db
    .prepare(`SELECT userId FROM tcg_matchmaking WHERE userId != ? ORDER BY joinedAt ASC LIMIT 1`)
    .get(userId);

  if (other) {
    const game = db
      .prepare(`SELECT id FROM tcg_games WHERE ((player1Id = ? AND player2Id = ?) OR (player1Id = ? AND player2Id = ?)) AND state = 'deck_build' LIMIT 1`)
      .get(userId, other.userId, other.userId, userId);
    if (game) return { matched: true, gameId: game.id };
  }

  return { waiting: true, inQueue: true };
}

function submitDeck(db, gameId, userId, cards, elementPool = null) {
  const game = db.prepare(`SELECT * FROM tcg_games WHERE id = ?`).get(gameId);
  if (!game) {
    throw Object.assign(new Error("Game not found."), { status: 404, code: "TCG_GAME_NOT_FOUND" });
  }
  if (game.state !== "deck_build") {
    throw Object.assign(new Error("Game is not in deck building phase."), { status: 400, code: "TCG_WRONG_PHASE" });
  }
  if (!cards || cards.length < DECK_SIZE) {
    throw Object.assign(new Error(`Need at least ${DECK_SIZE} cards.`), { status: 400, code: "TCG_NOT_ENOUGH_CARDS" });
  }

  // Store deck — validate cards
  const normalizedCards = cards.slice(0, DECK_SIZE).filter((c) => c && c.malId && c.title && c.imageUrl && c.element);
  if (normalizedCards.length < DECK_SIZE) {
    throw Object.assign(new Error(`Need ${DECK_SIZE} valid cards with element types.`), { status: 400, code: "TCG_INVALID_CARDS" });
  }

  const playerKey = userId === game.player1Id ? "p1" : "p2";

  // Check if other player has submitted
  const existingState = db.prepare(`SELECT stateJson FROM tcg_game_state WHERE gameId = ?`).get(gameId);
  let stateJson;
  if (existingState) {
    stateJson = JSON.parse(existingState.stateJson);
    // Store this player's deck in a pending slot
    stateJson[`${playerKey}Deck`] = normalizedCards;
  } else {
    stateJson = { [`${playerKey}Deck`]: normalizedCards };
  }

  // Store element pool if provided
  if (elementPool && Array.isArray(elementPool) && elementPool.length > 0) {
    stateJson[`${playerKey}Pool`] = elementPool.filter((e) => ELEMENTS.includes(e));
  }

  const p1Deck = stateJson.p1Deck;
  const p2Deck = stateJson.p2Deck;

  // If both decks submitted, start the game
  if (p1Deck && p2Deck) {
    const gameState = createInitialState(p1Deck, p2Deck);
    gameState.turn = 1;
    const p1Pool = stateJson.p1Pool && stateJson.p1Pool.length > 0 ? stateJson.p1Pool : [...ELEMENTS];
    const p2Pool = stateJson.p2Pool && stateJson.p2Pool.length > 0 ? stateJson.p2Pool : [...ELEMENTS];
    gameState.elementPools = { p1: p1Pool, p2: p2Pool };
    gameState.mode = "pvp";

    db.prepare(
      `INSERT OR REPLACE INTO tcg_game_state (gameId, stateJson, updatedAt) VALUES (?, ?, ?)`,
    ).run(gameId, JSON.stringify(gameState), nowIso());

    db.prepare(`UPDATE tcg_games SET state = 'playing', currentTurn = 1, updatedAt = ? WHERE id = ?`).run(nowIso(), gameId);

    const w = _wsEmit();
    if (w) {
      const state = getGameState(db, gameId, game.player1Id);
      w.sendToUser(game.player1Id, { type: S2C.TCG_GAME_STATE, data: state });
      const state2 = getGameState(db, gameId, game.player2Id);
      w.sendToUser(game.player2Id, { type: S2C.TCG_GAME_STATE, data: state2 });
    }
  } else {
    db.prepare(
      `INSERT OR REPLACE INTO tcg_game_state (gameId, stateJson, updatedAt) VALUES (?, ?, ?)`,
    ).run(gameId, JSON.stringify(stateJson), nowIso());
  }

  return { ok: true, waiting: !(p2Deck || playerKey === "p1" ? p2Deck : p1Deck) };
}

function getGameState(db, gameId, userId) {
  const game = db.prepare(`SELECT * FROM tcg_games WHERE id = ?`).get(gameId);
  if (!game) {
    throw Object.assign(new Error("Game not found."), { status: 404, code: "TCG_GAME_NOT_FOUND" });
  }
  if (userId !== game.player1Id && userId !== game.player2Id) {
    throw Object.assign(new Error("Not your game."), { status: 403, code: "TCG_NOT_YOUR_GAME" });
  }

  const stateRow = db.prepare(`SELECT stateJson FROM tcg_game_state WHERE gameId = ?`).get(gameId);
  let state = stateRow ? JSON.parse(stateRow.stateJson) : null;

  const isSolo = game.player1Id === game.player2Id;
  const playerKey = isSolo && state ? state.currentPlayer : (userId === game.player1Id ? "p1" : "p2");
  const opponentKey = getOpponentKey(playerKey);

  // Auto-forfeit if current player's turn has timed out (3 minutes)
  const TURN_TIMEOUT_MS = 180000;
  if (state && state.phase !== "finished" && state.turnStartedAt && Date.now() - state.turnStartedAt > TURN_TIMEOUT_MS) {
    state.winner = getOpponentKey(state.currentPlayer);
    state.phase = "finished";
    if (state.currentPlayer === "p1") state.p2Score += 1;
    else state.p1Score += 1;
    state.lastAction = `Time's up! Player ${state.currentPlayer === "p1" ? "1" : "2"} forfeited.`;

    // Persist
    db.prepare(`UPDATE tcg_game_state SET stateJson = ?, updatedAt = ? WHERE gameId = ?`)
      .run(JSON.stringify(state), nowIso(), gameId);
    db.prepare(`UPDATE tcg_games SET state = 'finished', winnerId = ?, player1Score = ?, player2Score = ?, updatedAt = ? WHERE id = ?`)
      .run(
        state.winner === "p1" ? game.player1Id : game.player2Id,
        state.p1Score,
        state.p2Score,
        nowIso(),
        gameId,
      );
  }

  if (!state || game.state === "deck_build") {
    const names = {};
    if (game.player1Id === userId) names.opponent = "Opponent";
    if (game.player2Id === userId) names.opponent = "Opponent";
    try {
      const oppRow = db.prepare(`SELECT username FROM users WHERE id = ?`).get(
        userId === game.player1Id ? game.player2Id : game.player1Id,
      );
      if (oppRow) names.opponent = oppRow.username;
    } catch { /* ignore */ }
    return {
      gameId,
      state: game.state,
      turn: game.currentTurn,
      playerKey,
      myTurn: game.currentPlayerId === userId,
      player1Score: game.player1Score,
      player2Score: game.player2Score,
      winner: game.winnerId,
      opponentName: names.opponent || "Opponent",
      board: null,
    };
  }

  // Mask opponent's hand (unless solo mode without AI)
  const publicState = JSON.parse(JSON.stringify(state));
  const shouldMaskHand = !isSolo || state.mode === "ai";
  if (shouldMaskHand) {
    publicState.players[opponentKey].hand = publicState.players[opponentKey].hand.map(() => ({ hidden: true }));
    delete publicState.players[opponentKey].fullDeck;
  }

  // Hide attackers until both players have placed one
  const bothAttackersPlaced = !!publicState.players.p1.board.attacker && !!publicState.players.p2.board.attacker;
  if (!bothAttackersPlaced) {
    if (publicState.players.p1.board.attacker) publicState.players.p1.board.attacker = { hidden: true };
    if (publicState.players.p2.board.attacker) publicState.players.p2.board.attacker = { hidden: true };
  }

  const result = {
    gameId,
    state: game.state,
    phase: state.phase,
    turn: state.turn,
    playerKey,
    myTurn: (isSolo && state.mode !== "ai") ? true : state.currentPlayer === playerKey,
    p1Score: state.p1Score,
    p2Score: state.p2Score,
    player1Score: game.player1Score,
    player2Score: game.player2Score,
    winner: state.winner,
    board: publicState.players,
    lastAction: state.lastAction,
    aiActions: state.aiActions || null,
    currentPlayer: state.currentPlayer,
    elementPools: state.elementPools || null,
    solo: isSolo,
    mode: state.mode || "solo",
    turnStartedAt: state.turnStartedAt || null,
    lastAttackResult: state.lastAttackResult || null,
  };

  // Clear aiActions after reading so they only appear once
  if (state.aiActions) delete state.aiActions;

  return result;
}

function submitAction(db, gameId, userId, action) {
  const game = db.prepare(`SELECT * FROM tcg_games WHERE id = ?`).get(gameId);
  if (!game) {
    throw Object.assign(new Error("Game not found."), { status: 404, code: "TCG_GAME_NOT_FOUND" });
  }
  if (game.state !== "playing") {
    throw Object.assign(new Error("Game is not active."), { status: 400, code: "TCG_NOT_ACTIVE" });
  }

  const isSolo = game.player1Id === game.player2Id;
  const stateRow = db.prepare(`SELECT stateJson FROM tcg_game_state WHERE gameId = ?`).get(gameId);
  if (!stateRow) {
    throw Object.assign(new Error("Game state not found."), { status: 500, code: "TCG_STATE_MISSING" });
  }

  const state = JSON.parse(stateRow.stateJson);
  const playerKey = isSolo ? state.currentPlayer : (userId === game.player1Id ? "p1" : "p2");

  try {
    // Turn timeout: 3 minutes to act, otherwise auto-forfeit
    const TURN_TIMEOUT_MS = 180000;
    if (state.turnStartedAt && Date.now() - state.turnStartedAt > TURN_TIMEOUT_MS && state.phase !== "finished") {
      const timedOutPlayer = state.currentPlayer;
      state.winner = getOpponentKey(timedOutPlayer);
      state.phase = "finished";
      state.p1Score = state.p1Score + (timedOutPlayer === "p2" ? 1 : 0);
      state.p2Score = state.p2Score + (timedOutPlayer === "p1" ? 1 : 0);
      state.lastAction = `Time's up! ${timedOutPlayer === "p1" ? "Player 1" : "Player 2"} forfeited.`;
      // Skip action — save and return
      throw { _timeoutForfeit: true };
    }

    const playerState = state.players[playerKey];
    const hasNoBoardCards = !playerState.board.attacker && playerState.board.support.every((s) => !s);
    if (hasNoBoardCards && !["place", "draw", "end", "forfeit", "promote"].includes(action.type)) {
      throw Object.assign(new Error("Place your first card (attacker slot) before other actions."), { status: 400, code: "TCG_FIRST_ATTACKER" });
    }

    // Must draw a card first (optional on turn 1, skip if draw pile empty)
    const mustDraw = state.turn >= 2 && playerState.drawPile.length > 0 ? !playerState.drawnCardThisTurn : false;
    if (mustDraw && !["draw", "place", "end", "forfeit", "promote"].includes(action.type)) {
      throw Object.assign(new Error("Draw a card first (drag from draw pile to hand)."), { status: 400, code: "TCG_DRAW_FIRST" });
    }

    switch (action.type) {
      case "draw":
        actionDrawCard(state, playerKey);
        break;
      case "place":
        actionPlaceCard(state, playerKey, action.cardId, action.slot);
        break;
      case "assign":
        actionAssignElement(state, playerKey, action.slot);
        break;
      case "attack":
        actionAttack(state, playerKey);
        break;
      case "switch":
        actionSwitchCard(state, playerKey, action.slot);
        break;
      case "promote":
        actionPromoteCard(state, playerKey, action.slot);
        break;
      case "end":
        actionEndTurn(state);
        // AI auto-play: if the next player is AI, play its turn automatically
        if (state.mode === "ai" && state.currentPlayer === "p2" && state.phase !== "finished") {
          playAiTurn(state, "p2");
          // End AI's turn and switch back to player
          if (state.phase !== "finished") {
            actionEndTurn(state);
          }
        }
        break;
      case "forfeit":
        state.winner = getOpponentKey(playerKey);
        state.phase = "finished";
        state.p1Score = state.p1Score + (playerKey === "p2" ? 1 : 0);
        state.p2Score = state.p2Score + (playerKey === "p1" ? 1 : 0);
        state.lastAction = `Player forfeited!`;
        break;
      default:
        throw Object.assign(new Error(`Unknown action: ${action.type}`), { status: 400, code: "TCG_UNKNOWN_ACTION" });
    }
  } catch (e) {
    if (e._timeoutForfeit) { /* timeout forfeit — proceed to save state */ }
    else if (e.status) throw e;
    else throw Object.assign(new Error(e.message), { status: 400, code: "TCG_ACTION_FAILED" });
  }

  const attackResult = state.lastAttackResult || null;

  const aiActions = state.aiActions || null;
  if (state.aiActions) delete state.aiActions;

  // Save state
  db.prepare(`UPDATE tcg_game_state SET stateJson = ?, updatedAt = ? WHERE gameId = ?`)
    .run(JSON.stringify(state), nowIso(), gameId);

  db.prepare(`UPDATE tcg_games SET currentTurn = ?, currentPlayerId = ?, player1Score = ?, player2Score = ?, state = ?, winnerId = ?, updatedAt = ? WHERE id = ?`)
    .run(
      state.turn,
      state.currentPlayer === "p1" ? game.player1Id : game.player2Id,
      state.p1Score,
      state.p2Score,
      state.phase === "finished" ? "finished" : "playing",
      state.winner ? (state.winner === "p1" ? game.player1Id : game.player2Id) : null,
      nowIso(),
      gameId,
    );

  const w = _wsEmit();
  if (w) {
    const p1State = getGameState(db, gameId, game.player1Id);
    w.sendToUser(game.player1Id, { type: S2C.TCG_GAME_STATE, data: p1State });
    const p2State = getGameState(db, gameId, game.player2Id);
    w.sendToUser(game.player2Id, { type: S2C.TCG_GAME_STATE, data: p2State });
    if (state.phase === "finished") {
      const finished = { winner: state.winner, p1Score: state.p1Score, p2Score: state.p2Score, gameId };
      w.sendToUser(game.player1Id, { type: S2C.TCG_GAME_FINISHED, data: finished });
      w.sendToUser(game.player2Id, { type: S2C.TCG_GAME_FINISHED, data: finished });
    }
  }

  return { ok: true, attackResult, aiActions };
}

module.exports = {
  getEligibleCards,
  joinMatchmaking,
  leaveMatchmaking,
  checkMatchmaking,
  startSoloGame,
  submitDeck,
  getGameState,
  submitAction,
};
