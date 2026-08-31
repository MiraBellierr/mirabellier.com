import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWebSocketEvent } from "@/hooks/use-websocket";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";

import {
  DECK_SIZE,
  ELEMENT_COLORS,
  type CollectionSort,
  type MobileTcgDrag,
  type MobileTcgGhost,
} from "@/lib/tcg-constants";
import {
  sortDeckCards,
  normalizeArenaError,
  toCardId,
  loadSavedDeck,
  saveDeck,
  loadElementPool,
  clearActiveTcgGame,
  loadTcgStagingAcknowledgement,
  saveTcgStagingAcknowledgement,
} from "@/lib/tcg-utils";
import {
  type ArenaCard,
  type TcgGameState,
  type TcgCard,
  type TcgPlayerState,
  fetchTcgEligibleCards,
  startTcgSoloGame,
  joinTcgQueue,
  leaveTcgQueue,
  checkTcgQueue,
  fetchActiveTcgGame,
  submitTcgDeck,
  fetchTcgGameState,
  submitTcgAction,
} from "@/lib/arena";

export type TcgPageMode = "decks" | "match";

export function useTcg(mode: TcgPageMode) {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const location = useLocation();
  const navigate = useNavigate();
  const arenaPrefix = location.pathname === "/ar" || location.pathname.startsWith("/ar/")
    ? "/ar"
    : "/arena";
  const decksPath = `${arenaPrefix}/tcg/decks`;
  const matchPath = `${arenaPrefix}/tcg/match`;

  const [gameId, setGameId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<TcgGameState | null>(null);
  const [eligibleCards, setEligibleCards] = useState<ArenaCard[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<Set<string>>(() => new Set(loadSavedDeck()));
  const [elementPool, setElementPool] = useState<string[]>(() => loadElementPool());
  const [deckSearch, setDeckSearch] = useState("");
  const [deckSort, setDeckSort] = useState<CollectionSort>("recent");
  const [deckFilterEl, setDeckFilterEl] = useState("");
  const [deckDuplicatesFilter, setDeckDuplicatesFilter] = useState(false);
  const [hoverDetail, setHoverDetail] = useState<{ card: ArenaCard; top: number; left: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<"hidden" | "pending" | "entering" | "visible" | "leaving">("hidden");
  const [aiActionText, setAiActionText] = useState<string | null>(null);
  const [queueState, setQueueState] = useState<"idle" | "searching" | "matched">("idle");
  const [showStagingModal, setShowStagingModal] = useState(() => !loadTcgStagingAcknowledgement());
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [attackFloaters, setAttackFloaters] = useState<{ key: number; dmg: number; elLabel: string | null; elColor: string | null; defenderKey: string }[]>([]);
  const [shakeOpponent, setShakeOpponent] = useState(false);
  const [shakePlayer, setShakePlayer] = useState(false);
  const [boardDragActive, setBoardDragActive] = useState(false);
  const [mobileDragGhost, setMobileDragGhost] = useState<MobileTcgGhost | null>(null);
  const [projectile, setProjectile] = useState<{ key: number; fromBoard: string; toBoard: string; fromX: number; fromY: number; toX: number; toY: number } | null>(null);

  const tokenRef = useRef(token);
  tokenRef.current = token;
  const eligibleCardsRef = useRef(eligibleCards);
  eligibleCardsRef.current = eligibleCards;
  const selectedDeckRef = useRef(selectedDeck);
  selectedDeckRef.current = selectedDeck;
  const elementPoolRef = useRef(elementPool);
  elementPoolRef.current = elementPool;
  const queueStateRef = useRef(queueState);
  queueStateRef.current = queueState;
  const claimedMatchRef = useRef<string | null>(null);
  const boardDragActiveRef = useRef(false);
  const boardElementRef = useRef<HTMLDivElement | null>(null);
  const mobileDragRef = useRef<MobileTcgDrag | null>(null);
  const mobileDragPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const floaterKeyRef = useRef(0);
  const projectileKeyRef = useRef(0);
  const lastAttackDedupRef = useRef<string | null>(null);

  const showError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setErrorState("entering");
    requestAnimationFrame(() => setErrorState("visible"));
    setTimeout(() => setErrorState("leaving"), 2500);
    setTimeout(() => {
      setErrorMessage(null);
      setErrorState("hidden");
    }, 3260);
  }, []);

  const spawnAttackFloat = useCallback((dmg: number, elLabel: string | null, elColor: string | null, defenderKey: string) => {
    const key = floaterKeyRef.current++;
    setAttackFloaters((prev) => [...prev, { key, dmg, elLabel, elColor, defenderKey }]);
    setTimeout(() => setAttackFloaters((prev) => prev.filter((f) => f.key !== key)), 1800);
  }, []);

  const spawnProjectile = useCallback((fromBoard: string, toBoard: string) => {
    const fromEl = document.querySelector(`[data-board-key="${fromBoard}"][data-slot="attacker"]`);
    const toEl = document.querySelector(`[data-board-key="${toBoard}"][data-slot="attacker"]`);
    if (!fromEl || !toEl) return;
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const key = projectileKeyRef.current++;
    setProjectile({
      key,
      fromBoard,
      toBoard,
      fromX: fromRect.left + fromRect.width / 2,
      fromY: fromRect.top + fromRect.height / 2,
      toX: toRect.left + toRect.width / 2,
      toY: toRect.top + toRect.height / 2,
    });
    setTimeout(() => setProjectile((prev) => (prev?.key === key ? null : prev)), 500);
  }, []);

  const startBoardDrag = useCallback(() => {
    boardDragActiveRef.current = true;
    setBoardDragActive(true);
  }, []);

  const stopBoardDrag = useCallback(() => {
    boardDragActiveRef.current = false;
    setBoardDragActive(false);
  }, []);

  usePageSeo({
    canonical: `https://mirabellier.com/arena/tcg/${mode}`,
    structuredDataId: "tcg-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: mode === "decks" ? "TCG Decks" : "TCG Match",
      url: `https://mirabellier.com/arena/tcg/${mode}`,
    },
    socialMeta: {
      title: mode === "decks" ? "TCG Decks" : "TCG Match",
      description: "Build a 10-card Arena deck and play Mirabellier TCG alpha matches.",
      url: `https://mirabellier.com/arena/tcg/${mode}`,
      image: "https://mirabellier.com/background.jpg",
    },
  });

  useEffect(() => {
    if (!boardDragActive) return;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    const boardElement = boardElementRef.current;
    const preventBoardTouchScroll = (event: TouchEvent) => {
      if (boardDragActiveRef.current) event.preventDefault();
    };
    boardElement?.addEventListener("touchmove", preventBoardTouchScroll, { passive: false });
    return () => {
      boardElement?.removeEventListener("touchmove", preventBoardTouchScroll);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overscrollBehavior = htmlOverscroll;
    };
  }, [boardDragActive]);

  useEffect(() => {
    if (!token) return;
    fetchTcgEligibleCards(token).then(({ cards }) => setEligibleCards(cards)).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || mode !== "match") return;
    let cancelled = false;
    const resumeGameId = async (candidateGameId: string | null) => {
      if (!candidateGameId) return false;
      try {
        const state = await fetchTcgGameState(token, candidateGameId);
        if (cancelled) return true;
        if (state?.board && !state.winner && state.phase !== "finished") {
          setGameId(candidateGameId);
          setGameState(state);
          localStorage.setItem("tcg_active_game", candidateGameId);
          return true;
        }
      } catch { /* fall through */ }
      if (!cancelled) clearActiveTcgGame();
      return false;
    };
    const resume = async () => {
      const savedGameId = localStorage.getItem("tcg_active_game");
      if (await resumeGameId(savedGameId)) return;
      try {
        const active = await fetchActiveTcgGame(token);
        if (!cancelled) await resumeGameId(active.gameId);
      } catch { /* no active game */ }
    };
    void resume();
    return () => { cancelled = true; };
  }, [mode, token]);

  const refreshActiveGameState = useCallback(async () => {
    if (!token || !gameId) return;
    try {
      const state = await fetchTcgGameState(token, gameId);
      setGameState(state);
      if (state.winner || state.phase === "finished") clearActiveTcgGame();
    } catch { /* keep current board */ }
  }, [gameId, token]);

  const handleStartSolo = async (gameMode: "solo" | "ai" = "solo") => {
    if (!token) return;
    if (selectedDeck.size < DECK_SIZE) { showError("Build a 10-card deck first."); return; }
    setLoading(true); setErrorMessage(null);
    try {
      const deckCards = eligibleCards.filter((c) => selectedDeck.has(toCardId(c)));
      const { gameId: gid } = await startTcgSoloGame(token, elementPool, deckCards, gameMode);
      setGameId(gid);
      localStorage.setItem("tcg_active_game", gid);
      navigate(matchPath);
      const state = await fetchTcgGameState(token, gid);
      setGameState(state);
    } catch (err) { showError(normalizeArenaError(err)); }
    finally { setLoading(false); }
  };

  const handleFindMatch = async () => {
    if (!token) return;
    if (selectedDeck.size < DECK_SIZE) { showError("Build a 10-card deck first."); return; }
    setLoading(true); setErrorMessage(null);
    const deckCards = eligibleCards.filter((c) => selectedDeck.has(toCardId(c)));
    if (deckCards.length < DECK_SIZE) {
      showError(eligibleCards.length === 0 ? "Card list still loading. Please wait a moment." : "Some deck cards are missing. Rebuild your deck.");
      setLoading(false);
      return;
    }
    try {
      const result = await joinTcgQueue(token);
      if (result.matched && result.gameId) {
        setQueueState("matched");
        await submitTcgDeck(token, result.gameId, deckCards, elementPool);
        setGameId(result.gameId);
        localStorage.setItem("tcg_active_game", result.gameId);
        navigate(matchPath);
        const state = await fetchTcgGameState(token, result.gameId);
        setGameState(state);
      } else {
        setQueueState("searching");
      }
    } catch (err) { showError(normalizeArenaError(err)); }
    finally { setLoading(false); }
  };

  const handleCancelQueue = async () => {
    if (!token) return;
    try { await leaveTcgQueue(token); } catch { /* ignore */ }
    setQueueState("idle");
    claimedMatchRef.current = null;
  };

  const claimMatchedGame = useCallback(async (matchedGameId: string) => {
    const t = tokenRef.current;
    if (!t || !matchedGameId) return;
    if (claimedMatchRef.current === matchedGameId) return;
    claimedMatchRef.current = matchedGameId;
    setQueueState("matched");
    const deckCards = eligibleCardsRef.current.filter((c) => selectedDeckRef.current.has(toCardId(c)));
    if (deckCards.length < DECK_SIZE) {
      showError("Deck cards are still loading. Please try finding a match again.");
      claimedMatchRef.current = null;
      setQueueState("idle");
      return;
    }
    try {
      await submitTcgDeck(t, matchedGameId, deckCards, elementPoolRef.current);
      setGameId(matchedGameId);
      localStorage.setItem("tcg_active_game", matchedGameId);
      navigate(matchPath);
      const state = await fetchTcgGameState(t, matchedGameId);
      setGameState(state);
    } catch (err) {
      claimedMatchRef.current = null;
      setQueueState("idle");
      showError(normalizeArenaError(err));
    }
  }, [showError, matchPath, navigate]);

  const handleQueueMatched = useCallback(async (data: unknown) => {
    const { gameId: matchedGameId } = data as { gameId: string };
    if (queueStateRef.current !== "searching" && queueStateRef.current !== "matched") return;
    await claimMatchedGame(matchedGameId);
  }, [claimMatchedGame]);

  useWebSocketEvent("tcg:queue:matched", handleQueueMatched);

  useEffect(() => {
    if (!token || queueState !== "searching") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await checkTcgQueue(token);
        if (cancelled) return;
        if (status.matched && status.gameId) {
          await claimMatchedGame(status.gameId);
        } else if (!status.waiting && !status.inQueue) {
          setQueueState("idle");
          claimedMatchRef.current = null;
        }
      } catch { /* websocket may still succeed */ }
    };
    const interval = window.setInterval(() => void poll(), 2000);
    void poll();
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [token, queueState, claimMatchedGame]);

  useEffect(() => {
    if (!token || !gameId || !gameState?.board || gameState.winner || gameState.phase === "finished") return;
    const interval = window.setInterval(() => void refreshActiveGameState(), 5000);
    const timeoutMs = gameState.turnStartedAt ? Math.max(0, gameState.turnStartedAt + 180000 - Date.now() + 300) : null;
    const timeout = timeoutMs == null ? null : window.setTimeout(() => void refreshActiveGameState(), timeoutMs);
    return () => {
      window.clearInterval(interval);
      if (timeout != null) window.clearTimeout(timeout);
    };
  }, [gameId, gameState?.board, gameState?.phase, gameState?.turnStartedAt, gameState?.winner, refreshActiveGameState, token]);

  const handleGameState = useCallback((data: unknown) => {
    const state = data as TcgGameState;
    if (!state?.board) return;
    const currentKey = state.solo ? "p1" : (state.playerKey || "p1");
    if (state.lastAttackResult && state.lastAttackResult.attackerKey !== currentKey) {
      const ar = state.lastAttackResult;
      const dedupKey = (ar.attackId ?? `${ar.attackerKey}|${ar.damage}|${ar.defenderHp}|${ar.ko}`).toString();
      if (dedupKey !== lastAttackDedupRef.current) {
        const elColor = ar.elementEffective === "super-effective" ? (ar.elementAttacker ? ELEMENT_COLORS[ar.elementAttacker] : null) : ar.elementEffective === "not-very-effective" ? "#94a3b8" : null;
        spawnAttackFloat(ar.damage, ar.elementEffective === "super-effective" ? "Super Effective" : ar.elementEffective === "not-very-effective" ? "Weak..." : null, elColor, ar.defenderKey);
        setShakePlayer(true); setTimeout(() => setShakePlayer(false), 500);
        lastAttackDedupRef.current = dedupKey;
        spawnProjectile(ar.attackerKey, ar.defenderKey);
      }
    }
    setGameState(state);
  }, [spawnAttackFloat, spawnProjectile]);

  useWebSocketEvent("tcg:game:state", handleGameState);

  const handleGameFinished = useCallback((data: unknown) => {
    const { winner, p1Score, p2Score } = data as { winner: string; p1Score: number; p2Score: number; gameId: string };
    clearActiveTcgGame();
    setGameState((prev) => prev ? { ...prev, winner, p1Score, p2Score, phase: "finished" as const } : null);
  }, []);

  useWebSocketEvent("tcg:game:finished", handleGameFinished);

  const handleToggleCard = (cardId: string) => {
    setSelectedDeck((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) { next.delete(cardId); }
      else if (next.size < DECK_SIZE) { next.add(cardId); }
      saveDeck(Array.from(next));
      return next;
    });
  };

  const onCardHover = useCallback((card: ArenaCard | TcgCard, e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHoverDetail((prev) => {
      if (prev && (prev.card as Record<string, unknown>).malId === (card as Record<string, unknown>).malId) return prev;
      return { card, top: r.top, left: r.left + r.width / 2 };
    });
  }, []);
  const onCardHoverLeave = useCallback(() => setHoverDetail(null), []);

  const myKey = gameState?.solo ? "p1" : (gameState?.playerKey || "p1");
  const oppKey = myKey === "p1" ? "p2" : "p1";
  const gameBoard = gameState?.board;
  const myBoard = gameBoard?.[myKey as keyof typeof gameBoard] || null;
  const oppBoard = gameBoard?.[oppKey as keyof typeof gameBoard] || null;

  const mobileDragGhostCard = useMemo(() => {
    if (!mobileDragGhost) return null;
    const drag = mobileDragGhost.drag;
    const boards = [myBoard, oppBoard].filter((board): board is TcgPlayerState => !!board);
    if (drag.kind === "card") {
      for (const board of boards) {
        const found = board.hand.find((card) => toCardId(card) === drag.cardId) || board.fullDeck?.find((card) => toCardId(card) === drag.cardId);
        if (found) return found;
      }
    }
    if (drag.kind === "promote") {
      const index = Number(drag.slot.replace("support_", ""));
      for (const board of boards) { const found = board.board.support[index]; if (found) return found; }
    }
    if (drag.kind === "attack") return myBoard?.board.attacker || oppBoard?.board.attacker || null;
    return null;
  }, [mobileDragGhost, myBoard, oppBoard]);

  const handleAction = useCallback(async (action: { type: string; cardId?: string; slot?: string }) => {
    if (!token || !gameId || actionPending) return;
    setActionPending(true); setErrorMessage(null);
    try {
      const result = await submitTcgAction(token, gameId, action);
      if (result.attackResult && result.attackResult.attackerKey === myKey) {
        const ar = result.attackResult;
        const dedupKey = (ar.attackId ?? `${ar.attackerKey}|${ar.damage}|${ar.defenderHp}|${ar.ko}`).toString();
        if (dedupKey !== lastAttackDedupRef.current) {
          const elColor = ar.elementEffective === "super-effective" ? (ar.elementAttacker ? ELEMENT_COLORS[ar.elementAttacker] : null) : ar.elementEffective === "not-very-effective" ? "#94a3b8" : null;
          spawnAttackFloat(ar.damage, ar.elementEffective === "super-effective" ? "Super Effective" : ar.elementEffective === "not-very-effective" ? "Weak..." : null, elColor, ar.defenderKey);
          setShakeOpponent(true); setTimeout(() => setShakeOpponent(false), 500);
          spawnProjectile(ar.attackerKey, ar.defenderKey);
          lastAttackDedupRef.current = dedupKey;
        }
      }
      const state = await fetchTcgGameState(token, gameId);
      if (state.winner || state.phase === "finished" || action.type === "forfeit") clearActiveTcgGame();
      if (state.lastAttackResult && state.lastAttackResult.attackerKey !== myKey) {
        const ar = state.lastAttackResult;
        const dedupKey = (ar.attackId ?? `${ar.attackerKey}|${ar.damage}|${ar.defenderHp}|${ar.ko}`).toString();
        if (dedupKey !== lastAttackDedupRef.current) {
          const elColor = ar.elementEffective === "super-effective" ? (ar.elementAttacker ? ELEMENT_COLORS[ar.elementAttacker] : null) : ar.elementEffective === "not-very-effective" ? "#94a3b8" : null;
          spawnAttackFloat(ar.damage, ar.elementEffective === "super-effective" ? "Super Effective" : ar.elementEffective === "not-very-effective" ? "Weak..." : null, elColor, ar.defenderKey);
          setShakePlayer(true); setTimeout(() => setShakePlayer(false), 500);
          spawnProjectile(ar.attackerKey, ar.defenderKey);
          lastAttackDedupRef.current = dedupKey;
        }
      }
      setGameState(state);
      if (result.aiActions && result.aiActions.length > 0) {
        for (let i = 0; i < result.aiActions.length; i++) {
          setAiActionText(result.aiActions[i]);
          await new Promise<void>((resolve) => setTimeout(resolve, i === 0 ? 300 : 1000));
        }
        setTimeout(() => setAiActionText(null), 500);
      }
    } catch (err) { showError(normalizeArenaError(err)); }
    finally { setActionPending(false); }
  }, [actionPending, gameId, myKey, showError, spawnAttackFloat, spawnProjectile, token]);

  const handleMobileTcgDrop = useCallback((drag: MobileTcgDrag, dropElement: Element | null) => {
    const dropTarget = dropElement?.closest("[data-tcg-drop-slot], [data-tcg-drop-zone]") as HTMLElement | null;
    if (!dropTarget || !gameState?.board) return;
    const dropBoardKey = dropTarget.dataset.tcgDropBoard;
    const dropBoard = dropBoardKey === myKey ? myBoard : dropBoardKey === oppKey ? oppBoard : null;
    if (!dropBoard || !dropBoardKey) return;
    const isDropBoardTurn = gameState.solo ? gameState.currentPlayer === dropBoardKey : dropBoardKey === myKey && !!gameState.myTurn;
    if (drag.kind === "draw") {
      if (isDropBoardTurn && dropTarget.dataset.tcgDropZone === "hand") void handleAction({ type: "draw" });
      return;
    }
    const slot = dropTarget.dataset.tcgDropSlot;
    if (!slot) return;
    const targetCard = slot === "attacker" ? dropBoard.board.attacker : dropBoard.board.support[Number(slot.replace("support_", ""))] || null;
    if (drag.kind === "card") {
      if (!isDropBoardTurn) return;
      if (slot === "attacker" && !dropBoard.board.attacker && dropBoard.board.support.every((support) => !support)) void handleAction({ type: "place", cardId: drag.cardId, slot: "attacker" });
      else if (slot.startsWith("support_") && !targetCard) void handleAction({ type: "place", cardId: drag.cardId, slot });
      return;
    }
    if (drag.kind === "promote") {
      if (isDropBoardTurn && slot === "attacker" && !dropBoard.board.attacker) void handleAction({ type: "promote", slot: drag.slot });
      return;
    }
    if (drag.kind === "element") {
      if (isDropBoardTurn && targetCard) void handleAction({ type: "assign", slot });
      return;
    }
    if (drag.kind === "attack") {
      if (!isDropBoardTurn && slot === "attacker" && targetCard) void handleAction({ type: "attack" });
      else if (isDropBoardTurn && slot.startsWith("support_") && targetCard) void handleAction({ type: "switch", slot });
    }
  }, [gameState, handleAction, myBoard, myKey, oppBoard, oppKey]);

  const deckDuplicateIds = useMemo(() => {
    const counts = new Map<number, number>();
    for (const card of eligibleCards) counts.set(card.malId, (counts.get(card.malId) || 0) + 1);
    return new Set(Array.from(counts).filter(([, count]) => count > 1).map(([malId]) => malId));
  }, [eligibleCards]);

  const selectedDeckCards = useMemo(
    () => eligibleCards.filter((card) => selectedDeck.has(toCardId(card))),
    [eligibleCards, selectedDeck],
  );

  const filteredDeckCards = useMemo(() => {
    const search = deckSearch.trim().toLowerCase();
    const filtered = eligibleCards.filter((card) => {
      if (selectedDeck.has(toCardId(card))) return false;
      if (deckFilterEl && card.element !== deckFilterEl) return false;
      if (deckDuplicatesFilter && !deckDuplicateIds.has(card.malId)) return false;
      if (!search) return true;
      return card.title.toLowerCase().includes(search) || card.rarity.toLowerCase().includes(search) || String(card.malId).includes(search);
    });
    return sortDeckCards(filtered, deckSort);
  }, [deckDuplicateIds, deckDuplicatesFilter, deckFilterEl, deckSearch, deckSort, eligibleCards, selectedDeck]);

  const hasDeckFilters = deckSearch.trim().length > 0 || !!deckFilterEl || deckDuplicatesFilter;

  const dismissStaging = () => { saveTcgStagingAcknowledgement(); setShowStagingModal(false); };

  return {
    // routing
    arenaPrefix, decksPath, matchPath,
    // auth
    token,
    // deck state
    eligibleCards, selectedDeck, setSelectedDeck, elementPool, setElementPool,
    deckSearch, setDeckSearch, deckSort, setDeckSort,
    deckFilterEl, setDeckFilterEl, deckDuplicatesFilter, setDeckDuplicatesFilter,
    selectedDeckCards, filteredDeckCards, hasDeckFilters,
    // match state
    gameId, setGameId, gameState, setGameState,
    queueState, loading, actionPending,
    aiActionText,
    attackFloaters, shakeOpponent, shakePlayer,
    boardDragActive, boardElementRef, mobileDragGhost, setMobileDragGhost,
    projectile,
    // hover
    hoverDetail,
    // error
    errorMessage, errorState,
    // staging
    showStagingModal, dismissStaging,
    // handlers
    showError,
    handleToggleCard,
    handleStartSolo, handleFindMatch, handleCancelQueue,
    handleAction, handleMobileTcgDrop,
    refreshActiveGameState,
    onCardHover, onCardHoverLeave,
    startBoardDrag, stopBoardDrag,
    // derived
    myKey, oppKey, myBoard, oppBoard, mobileDragGhostCard,
    mobileDragRef, mobileDragPointRef,
  };
}
