const { ELEMENTS, ELEMENT_EFFECTIVENESS } = require("./arena-constants");

const ELEMENTS_TO_ATTACK = 2;
const SUPPORT_SLOTS = 3;

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function cardStatScore(card) {
  if (!card) return 0;
  return toInt(card.iv?.power, 0) + toInt(card.iv?.speed, 0) + toInt(card.iv?.guard, 0) + toInt(card.iv?.effectHit, 0);
}

function attackScore(card) {
  return toInt(card.iv?.power, 0) + toInt(card.iv?.speed, 0) + toInt(card.iv?.effectHit, 0);
}

function toCardId(card) {
  return card?.cardInstanceId || `${card?.malId}-${card?.drawnAt || "card"}`;
}

function findCardInDeck(playerState, cardId) {
  return playerState.fullDeck?.find((c) => toCardId(c) === cardId) || null;
}

/**
 * Plays the AI's entire turn and returns the actions taken.
 * Called within a transaction (state is already loaded).
 */
function playAiTurn(state, playerKey) {
  const actions = [];
  const playerState = state.players[playerKey];

  // 1. Draw if not drawn and pile has cards
  if (!playerState.drawnCardThisTurn && playerState.drawPile.length > 0 && state.turn >= 2) {
    const cardId = playerState.drawPile.pop();
    const drawn = findCardInDeck(playerState, cardId);
    if (drawn) {
      playerState.hand.push(drawn);
      playerState.drawnCardThisTurn = true;
    }
  }

  // 2. If no attacker: promote from support (pick highest HP), else place from hand
  if (!playerState.board.attacker) {
    let bestIndex = -1;
    let bestScore = -1;
    for (let i = 0; i < SUPPORT_SLOTS; i++) {
      if (playerState.board.support[i]) {
        const score = cardStatScore(playerState.board.support[i]);
        if (score > bestScore) { bestScore = score; bestIndex = i; }
      }
    }
    if (bestIndex >= 0) {
      playerState.board.attacker = playerState.board.support[bestIndex];
      playerState.board.support[bestIndex] = null;
      actions.push(`promoted ${playerState.board.attacker.title} to attacker`);
    } else if (playerState.hand.length > 0 && !playerState.placedCardThisTurn) {
      // Place best attacker from hand
      let bestCard = null;
      let bestScore = -1;
      for (const card of playerState.hand) {
        const score = attackScore(card);
        if (score > bestScore) { bestScore = score; bestCard = card; }
      }
      if (bestCard) {
        playerState.hand = playerState.hand.filter((c) => c !== bestCard);
        const hpBase = 40 + Math.floor(toInt(bestCard.iv?.guard, 0) * 1) + Math.floor((toInt(bestCard.iv?.power, 0) + toInt(bestCard.iv?.speed, 0)) * 0.1);
        playerState.board.attacker = {
          ...bestCard,
          currentHp: Math.max(25, hpBase),
          maxHp: Math.max(25, hpBase),
          assignedElements: [],
        };
        playerState.placedCardThisTurn = true;
      }
    }
  }

  // 3. Attack if attacker has >= 2 matching elements
  if (
    playerState.board.attacker
    && (playerState.board.attacker.assignedElements?.length || 0) >= ELEMENTS_TO_ATTACK
    && playerState.board.attacker.assignedElements.every((e) => e === playerState.board.attacker.element)
  ) {
    const opponentKey = playerKey === "p1" ? "p2" : "p1";
    const opponentState = state.players[opponentKey];
    if (opponentState.board.attacker) {
      const attacker = playerState.board.attacker;
      const defender = opponentState.board.attacker;

      const atkPower = toInt(attacker.iv?.power, 0) + toInt(attacker.iv?.speed, 0);
      const defGuard = toInt(defender.iv?.guard, 0) * 0.75;
      let damage = Math.max(8, Math.floor(atkPower - defGuard));

      const atkEl = ELEMENTS.includes(attacker.element) ? attacker.element : null;
      const defEl = ELEMENTS.includes(defender.element) ? defender.element : null;
      const elementMult = (atkEl && defEl && ELEMENT_EFFECTIVENESS[atkEl] && ELEMENT_EFFECTIVENESS[atkEl][defEl])
        ? ELEMENT_EFFECTIVENESS[atkEl][defEl] : 1;
      damage = Math.max(1, Math.floor(damage * elementMult));

      // Extra element bonus
      const extraElements = attacker.assignedElements.length - ELEMENTS_TO_ATTACK;
      if (extraElements > 0) {
        damage = Math.max(1, Math.floor(damage * (1 + extraElements * 0.5)));
      }

      attacker.assignedElements = [];
      defender.currentHp = Math.max(0, defender.currentHp - damage);

      const elementEffectiveness = elementMult > 1 ? "super-effective" : elementMult < 1 ? "not-very-effective" : "normal";
      state.lastAttackResult = {
        damage,
        elementEffective: elementEffectiveness,
        elementAttacker: attacker.element || null,
        ko: defender.currentHp <= 0,
        defenderHp: defender.currentHp,
        defenderMaxHp: defender.maxHp,
        attackerKey: playerKey,
        defenderKey: opponentKey,
        attackId: Date.now() + Math.random(),
      };

      actions.push(`attacked ${defender.title} for ${damage} damage`);

      if (defender.currentHp <= 0) {
        opponentState.discardPile.push(defender.cardInstanceId || `${defender.malId}`);
        opponentState.board.attacker = null;
        if (playerKey === "p1") state.p1Score += 1;
        else state.p2Score += 1;
        actions.push(`KO'd ${defender.title}!`);

        if ((playerKey === "p1" ? state.p1Score : state.p2Score) >= 3) {
          state.winner = playerKey;
          state.phase = "finished";
        }
      }
    }
  }

  // Skip remaining actions if game is over
  if (state.phase === "finished") {
    state.lastAction = actions.join("; ");
    state.aiActions = actions;
    return actions;
  }

  // 4. Assign element to a board card if pool has matching element
  if (playerState.elementPool.length > 0) {
    const poolEl = playerState.elementPool[0];
    const targets = [];
    if (playerState.board.attacker && playerState.board.attacker.element === poolEl) {
      targets.push({ slot: "attacker", card: playerState.board.attacker });
    }
    for (let i = 0; i < SUPPORT_SLOTS; i++) {
      const s = playerState.board.support[i];
      if (s && s.element === poolEl) {
        targets.push({ slot: `support_${i}`, card: s });
      }
    }
    if (targets.length > 0) {
      playerState.elementPool.pop();
      targets[0].card.assignedElements.push(poolEl);
    }
  }

  // 5. Place card from hand to empty slot
  if (!playerState.placedCardThisTurn && playerState.hand.length > 0) {
    let emptySupport = -1;
    for (let i = 0; i < SUPPORT_SLOTS; i++) {
      if (!playerState.board.support[i]) { emptySupport = i; break; }
    }
    if (emptySupport >= 0) {
      let bestCard = null;
      let bestScore = -1;
      for (const card of playerState.hand) {
        const score = attackScore(card);
        if (score > bestScore) { bestScore = score; bestCard = card; }
      }
      if (bestCard) {
        playerState.hand = playerState.hand.filter((c) => c !== bestCard);
        const hpBase = 40 + Math.floor(toInt(bestCard.iv?.guard, 0) * 1) + Math.floor((toInt(bestCard.iv?.power, 0) + toInt(bestCard.iv?.speed, 0)) * 0.1);
        playerState.board.support[emptySupport] = {
          ...bestCard,
          currentHp: Math.max(25, hpBase),
          maxHp: Math.max(25, hpBase),
          assignedElements: [],
        };
        playerState.placedCardThisTurn = true;
      }
    }
  }

  // 6. Switch if support card has more elements than attacker
  if (playerState.board.attacker && !playerState.switchedCardThisTurn) {
    const atkElements = playerState.board.attacker.assignedElements?.length || 0;
    for (let i = 0; i < SUPPORT_SLOTS; i++) {
      const s = playerState.board.support[i];
      if (s && (s.assignedElements?.length || 0) > atkElements) {
        const temp = playerState.board.attacker;
        playerState.board.attacker = s;
        playerState.board.support[i] = temp;
        playerState.switchedCardThisTurn = true;
        if (temp.assignedElements && temp.assignedElements.length > 0) {
          temp.assignedElements.pop();
        }
        actions.push(`switched ${temp.title} with ${s.title}`);
        break;
      }
    }
  }

  state.lastAction = actions.join("; ");
  state.aiActions = actions;
  return actions;
}

module.exports = { playAiTurn };
