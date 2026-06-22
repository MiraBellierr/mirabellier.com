import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";

import fireIcon from "@/assets/elements/fire.png";
import waterIcon from "@/assets/elements/water.png";
import earthIcon from "@/assets/elements/earth.png";
import windIcon from "@/assets/elements/wind.png";
import lightIcon from "@/assets/elements/light.png";
import darkIcon from "@/assets/elements/dark.png";
import cardBack from "@/assets/back-card-design.jpg";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ConfirmDialog from "@/parts/ConfirmDialog";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  ArenaApiError,
  type ArenaCard,
  type TcgGameState,
  type TcgCard,
  type TcgPlayerState,
  fetchTcgEligibleCards,
  startTcgSoloGame,
  joinTcgQueue,
  leaveTcgQueue,
  checkTcgQueue,
  submitTcgDeck,
  fetchTcgGameState,
  submitTcgAction,
} from "@/lib/arena-api";

const DECK_SIZE = 10;

const ELEMENT_COLORS: Record<string, string> = {
  Fire: "#e74c3c",
  Water: "#3498db",
  Earth: "#27ae60",
  Wind: "#2ecc71",
  Light: "#f1c40f",
  Dark: "#8e44ad",
};

const ELEMENT_ICONS: Record<string, string> = {
  Fire: fireIcon,
  Water: waterIcon,
  Earth: earthIcon,
  Wind: windIcon,
  Light: lightIcon,
  Dark: darkIcon,
};

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function toCardId(card: TcgCard | ArenaCard | null): string {
  if (!card) return "";
  return card.cardInstanceId || `${card.malId}-${card.drawnAt || "card"}`;
}

function loadSavedDeck(): string[] {
  try {
    const raw = localStorage.getItem("tcg_deck");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveDeck(ids: string[]) {
  localStorage.setItem("tcg_deck", JSON.stringify(ids));
}

function loadElementPool(): string[] {
  try {
    const raw = localStorage.getItem("tcg_element_pool");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) && arr.length > 0 ? arr : ["Fire", "Water", "Earth", "Wind", "Light", "Dark"];
  } catch { return ["Fire", "Water", "Earth", "Wind", "Light", "Dark"]; }
}

function saveElementPool(elements: string[]) {
  localStorage.setItem("tcg_element_pool", JSON.stringify(elements));
}

function CardThumbnail({ card, size = "sm", onClick, highlighted, draggable, onDragStart }: {
  card: TcgCard | ArenaCard | null;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  highlighted?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  if (!card) {
    const dims = size === "lg" ? "w-24 h-32" : size === "md" ? "w-16 h-20" : "w-12 h-16";
    return (
      <div className={`${dims} rounded-lg border-2 border-dashed border-slate-300 bg-slate-100 flex items-center justify-center text-xs text-slate-400 flex-shrink-0`}>
        ?
      </div>
    );
  }
  if ((card as TcgCard).hidden) {
    const dims = size === "lg" ? "w-24 h-32" : size === "md" ? "w-16 h-20" : "w-12 h-16";
    return (
      <div className={`${dims} rounded-lg border-2 border-slate-400 flex-shrink-0 overflow-hidden`}>
        <img src={cardBack} alt="" className="w-full h-full object-cover" draggable={false} />
      </div>
    );
  }

  const dims = size === "lg" ? "w-24 h-32" : size === "md" ? "w-16 h-20" : "w-12 h-16";
  const el = (card as unknown as Record<string, unknown>).element as string | undefined;
  const hp = (card as TcgCard).currentHp !== undefined ? (card as TcgCard).currentHp : (card as TcgCard).maxHp;
  const maxHp = (card as TcgCard).maxHp;
  const assigned = (card as TcgCard).assignedElements || [];

  return (
    <div
      className={`${dims} rounded-lg border-2 flex-shrink-0 relative overflow-hidden cursor-pointer transition hover:animate-wiggle ${
        highlighted ? "border-yellow-400 shadow-lg shadow-yellow-200 scale-105" : "border-slate-400 hover:border-blue-400"
      }`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      title={`${card.title}${el ? ` · ${el}` : ""}`}
    >
      <img src={card.imageUrl} alt={card.title} className="w-full h-full object-cover" draggable={false} />
      <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-[0.55rem] text-white leading-tight truncate">
        {card.title}
        {hp !== undefined ? <span className="ml-1 text-red-300">{hp}{maxHp ? `/${maxHp}` : ""}</span> : null}
      </div>
      {el ? (
        <span
          className="absolute top-0.5 right-0.5 text-[0.45rem] font-bold px-1 rounded-full text-white"
          style={{ backgroundColor: ELEMENT_COLORS[el] || "#888" }}
        >
          {el.charAt(0)}
        </span>
      ) : null}
      {assigned.length > 0 ? (
        <div className="absolute top-0.5 left-0.5 flex items-center gap-0.5">
          <span className="w-3 h-3 flex items-center justify-center rounded-full bg-white/90 shadow-sm">
            <img
              src={ELEMENT_ICONS[el || ""] || ""}
              alt=""
              className="w-2.5 h-2.5 object-contain pointer-events-none"
              draggable={false}
            />
          </span>
          {assigned.length > 2 ? (
            <span className="text-[0.45rem] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">×{assigned.length}</span>
          ) : assigned.length === 2 ? (
            <span className="w-3 h-3 flex items-center justify-center rounded-full bg-white/90 shadow-sm">
              <img src={ELEMENT_ICONS[el || ""] || ""} alt="" className="w-2.5 h-2.5 object-contain pointer-events-none" draggable={false} />
            </span>
          ) : null}
        </div>
        ) : null}
    </div>
  );
}

function PlayerBoard({ board, isTurn, onAction, mirror, shakeOpponentCard, attackFloaters }: {
  board: TcgPlayerState | null;
  isTurn: boolean;
  onAction?: (action: { type: string; cardId?: string; slot?: string }) => void;
  mirror?: boolean;
  shakeOpponentCard?: boolean;
  attackFloaters?: { key: number; dmg: number; elLabel: string | null; elColor: string | null }[];
}) {
  if (!board) return null;
  const attackerClasses = [
    "relative",
    !board.board.attacker && isTurn ? "border-2 border-dashed border-emerald-400 rounded-lg bg-emerald-50/50" : "",
    mirror && shakeOpponentCard ? "card-shake" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={`flex items-center gap-2 ${mirror ? "flex-col-reverse" : "flex-col"}`}>
      <div className={attackerClasses}
        onDragOver={(e) => {
          const atk = e.dataTransfer.types.length > 0; // accept if has any data
          if (isTurn || atk) e.preventDefault();
        }}
          onDrop={(e) => {
            e.preventDefault();
            const cid = e.dataTransfer.getData("cardId");
            const el = e.dataTransfer.getData("element");
            const atk = e.dataTransfer.getData("attack") || e.dataTransfer.getData("text/plain");
            const promoteSlot = e.dataTransfer.getData("promote");
            if (promoteSlot && !board.board.attacker && isTurn) {
              onAction?.({ type: "promote", slot: promoteSlot });
            } else if ((atk === "1" || atk === "tcg-attack") && board.board.attacker && !isTurn) {
              onAction?.({ type: "attack" });
            } else if (el && board.board.attacker && isTurn) {
            onAction?.({ type: "assign", slot: "attacker" });
            } else if (cid && !board.board.attacker && isTurn && board.board.support.every((s) => !s)) {
              onAction?.({ type: "place", cardId: cid, slot: "attacker" });
          }
        }}
      >
        <CardThumbnail
          card={board.board.attacker}
          size="lg"
          highlighted={!!board.board.attacker && isTurn && (() => {
            const elCount = board.board.attacker.assignedElements?.length ?? 0;
            if (elCount >= 2) return true; // can attack
            if (elCount >= 1 && !board.switchedCardThisTurn && board.board.support.some((s) => !!s)) return true; // can switch
            return false;
          })()}
          draggable={!!(isTurn && board.board.attacker && (() => {
            const elCount = board.board.attacker.assignedElements?.length ?? 0;
            if (elCount >= 2) return true;
            if (elCount >= 1 && !board.switchedCardThisTurn && board.board.support.some((s) => !!s)) return true;
            return false;
          })())}
          onDragStart={(e) => {
            const elCount = board.board.attacker?.assignedElements?.length ?? 0;
            if (isTurn && board.board.attacker && (elCount >= 2 || (elCount >= 1 && !board.switchedCardThisTurn && board.board.support.some((s) => !!s)))) {
              e.dataTransfer.setData("text/plain", "tcg-attack");
              e.dataTransfer.setData("attack", "1");
              e.dataTransfer.effectAllowed = "move";
            }
          }}
        />
        {!board.board.attacker && isTurn ? (
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-500 pointer-events-none">drop</span>
        ) : null}
        {attackFloaters && attackFloaters.length > 0 ? (
          attackFloaters.map((f) => (
            <div key={f.key} className="absolute inset-0 z-50 pointer-events-none flex flex-col items-center justify-center animate-float-up">
              <span className="text-lg font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ textShadow: "0 0 6px rgba(255,80,120,0.9), 0 0 2px #000" }}>
                -{f.dmg}
              </span>
              {f.elLabel ? (
                <span className="text-[0.5rem] font-bold mt-0.5" style={{ color: f.elColor || "#ffbe0b", textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000" }}>
                  {f.elLabel}
                </span>
              ) : null}
            </div>
          ))
        ) : null}
      </div>
      <div className="flex gap-3">
        {board.board.support.map((card, i) => (
          <div
            key={`s-${i}`}
            className={`relative ${!card && isTurn ? "border-2 border-dashed border-emerald-400 rounded-lg bg-emerald-50/50" : ""}`}
            style={!card && isTurn ? { minWidth: "64px", minHeight: "80px" } : undefined}
            onDragOver={(e) => { if (isTurn) e.preventDefault(); }}
            onDrop={(e) => {
              if (!isTurn) return;
              e.preventDefault();
              const cid = e.dataTransfer.getData("cardId");
              const el = e.dataTransfer.getData("element");
              const atk = e.dataTransfer.getData("attack") || e.dataTransfer.getData("text/plain");
              if ((atk === "1" || atk === "tcg-attack") && card) {
                onAction?.({ type: "switch", slot: `support_${i}` });
              } else if (el && card) {
                onAction?.({ type: "assign", slot: `support_${i}` });
              } else if (cid && !card) {
                onAction?.({ type: "place", cardId: cid, slot: `support_${i}` });
              }
            }}
            >
            <CardThumbnail
              card={card}
              size="md"
              highlighted={!!(card && !board.board.attacker && isTurn)}
              draggable={!!(card && !board.board.attacker && isTurn)}
              onDragStart={(e) => {
                if (card && !board.board.attacker && isTurn) {
                  e.dataTransfer.setData("promote", `support_${i}`);
                  e.dataTransfer.effectAllowed = "move";
                }
              }}
            />
            {!card && isTurn ? (
              <span className="absolute inset-0 flex items-center justify-center text-[0.55rem] font-bold text-emerald-500 pointer-events-none">drop</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardHand({ board, isTurn, mirror, onAction }: {
  board: TcgPlayerState | null;
  isTurn: boolean;
  mirror?: boolean;
  onAction?: (action: { type: string }) => void;
}) {
  if (!board) return null;
  const cards = mirror ? [...board.hand].reverse() : board.hand;
  return (
    <div className="mt-2">
      <p className="text-xs text-slate-400 text-center">
        Hand: {board.hand.length}
      </p>
      <div
        className={`flex gap-2 flex-wrap mt-0.5 ${mirror ? "flex-row-reverse justify-center" : "justify-center"}`}
        onDragOver={(e) => {
          if (isTurn && onAction && e.dataTransfer.types.length > 0) e.preventDefault();
        }}
        onDrop={(e) => {
          if (isTurn && onAction) {
            e.preventDefault();
            const kind = e.dataTransfer.getData("draw");
            if (kind) onAction({ type: "draw" });
          }
        }}
      >
        {cards.map((card) => {
          if ((card as TcgCard).hidden) return <CardThumbnail key={Math.random()} card={card} size="md" />;
          const cid = toCardId(card);
          const hasSlot = (!board.board.attacker || board.board.support.some((s) => !s)) && !board.placedCardThisTurn;
          return (
            <CardThumbnail
              key={cid}
              card={card}
              size="md"
              highlighted={isTurn && hasSlot}
              draggable={isTurn && hasSlot}
              onDragStart={(e) => {
                e.dataTransfer.setData("cardId", cid);
                e.dataTransfer.effectAllowed = "move";
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function BoardPiles({ board, isTurn, onAction, turn }: {
  board: TcgPlayerState | null;
  isTurn?: boolean;
  onAction?: (action: { type: string }) => void;
  turn?: number;
}) {
  if (!board) return null;
  const deck = board.fullDeck || [];
  const discardCards = [...board.discardPile].reverse().map((id) => deck.find((c) => toCardId(c) === id)).filter((c): c is TcgCard => !!c);
  const drawCards = [...board.drawPile].reverse().map((id) => deck.find((c) => toCardId(c) === id)).filter((c): c is TcgCard => !!c);
  return (
    <div className="flex flex-col gap-6 mr-2">
      {/* Discard pile — aligned with support row */}
      <div className="flex flex-col items-center group relative">
        <div className="w-16 h-20 rounded-lg bg-slate-200 border border-slate-300 flex items-center justify-center shadow-inner">
          <span className="text-[0.65rem] font-bold text-red-400">{board.discardPile.length}</span>
        </div>
        <span className="text-[0.5rem] text-slate-400 mt-0.5">Discard</span>
        {discardCards.length > 0 ? (
          <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col gap-0.5 bg-slate-900 text-white text-[0.55rem] rounded-lg p-2 shadow-lg z-20 w-36 max-h-40 overflow-y-auto">
            {discardCards.map((c, i) => (
              <p key={i} className="truncate">
                <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: ELEMENT_COLORS[(c as Record<string, unknown>).element as string] || "#888" }} />
                {c.title}
              </p>
            ))}
          </div>
        ) : null}
      </div>
      {/* Draw pile — shows top card thumbnail */}
      <div className="flex flex-col items-center group relative">
        {isTurn && board.drawPile.length > 0 && onAction ? (
          <div
            className={`cursor-grab active:cursor-grabbing ${!board.drawnCardThisTurn && (!turn || turn > 1) ? "border-2 border-yellow-400 shadow-lg shadow-yellow-200 scale-105 rounded-xl" : ""}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("draw", "1");
              e.dataTransfer.effectAllowed = "move";
            }}
          >
            {drawCards.length > 0 ? (
              <CardThumbnail card={drawCards[0]} size="md" />
            ) : (
              <div className="w-16 h-20 rounded-lg bg-slate-200 border border-slate-300 flex items-center justify-center shadow-inner">
                <span className="text-[0.65rem] font-bold text-slate-600">{board.drawPile.length}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-16 h-20 rounded-lg bg-slate-200 border border-slate-300 flex items-center justify-center shadow-inner">
            <span className="text-[0.65rem] font-bold text-slate-600">{board.drawPile.length}</span>
          </div>
        )}
        <span className="text-[0.5rem] text-slate-400 mt-0.5">Draw</span>
        {isTurn && board.drawPile.length > 0 ? (
          <span className="text-[0.5rem] font-bold text-emerald-600">drag to draw</span>
        ) : null}
        {drawCards.length > 0 ? (
          <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col gap-0.5 bg-slate-900 text-white text-[0.55rem] rounded-lg p-2 shadow-lg z-20 w-36 max-h-40 overflow-y-auto">
            {drawCards.map((c, i) => (
              <p key={i} className="truncate">
                <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: ELEMENT_COLORS[(c as Record<string, unknown>).element as string] || "#888" }} />
                {c.title}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CountdownTimer({ startMs }: { startMs: number }) {
  const [left, setLeft] = useState(30);
  const startRef = useRef(startMs);

  useEffect(() => {
    startRef.current = startMs;
    setLeft(30);
  }, [startMs]);

  useEffect(() => {
    let active = true;
    const update = () => {
      if (!active) return;
      const elapsed = (Date.now() - startRef.current) / 1000;
      const remaining = Math.max(0, Math.ceil(30 - elapsed));
      setLeft(remaining);
      if (remaining > 0) setTimeout(update, 250);
    };
    const timer = setTimeout(update, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [startMs]);

  if (left <= 0) return null;
  return (
    <p className={`text-center text-sm font-bold ${left <= 10 ? "text-red-600 animate-pulse" : "text-slate-500"}`}>
      ⏱ {left}s
    </p>
  );
}

const TcgPage = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;

  const [tab, setTab] = useState<"decks" | "match">("decks");
  const [gameId, setGameId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<TcgGameState | null>(null);
  const [eligibleCards, setEligibleCards] = useState<ArenaCard[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<Set<string>>(() => new Set(loadSavedDeck()));
  const [elementPool, setElementPool] = useState<string[]>(() => loadElementPool());
  const [deckSearch, setDeckSearch] = useState("");
  const [deckFilterEl, setDeckFilterEl] = useState("");
  const [hoverDetail, setHoverDetail] = useState<{ card: ArenaCard; top: number; left: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<"hidden" | "pending" | "entering" | "visible" | "leaving">("hidden");
  const [aiActionText, setAiActionText] = useState<string | null>(null);
  const [queueState, setQueueState] = useState<"idle" | "searching" | "matched">("idle");
  const queuePollRef = useRef<number | null>(null);
  const [showStagingModal, setShowStagingModal] = useState(true);

  function showError(msg: string) {
    setErrorMessage(msg);
    setErrorState("entering");
    requestAnimationFrame(() => setErrorState("visible"));
    setTimeout(() => setErrorState("leaving"), 2500);
    setTimeout(() => {
      setErrorMessage(null);
      setErrorState("hidden");
    }, 3260);
  }
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [attackFloaters, setAttackFloaters] = useState<{ key: number; dmg: number; elLabel: string | null; elColor: string | null }[]>([]);
  const [shakeOpponent, setShakeOpponent] = useState(false);
  const floaterKeyRef = useRef(0);

  function spawnAttackFloat(dmg: number, elLabel: string | null, elColor: string | null) {
    const key = floaterKeyRef.current++;
    setAttackFloaters((prev) => [...prev, { key, dmg, elLabel, elColor }]);
    setTimeout(() => setAttackFloaters((prev) => prev.filter((f) => f.key !== key)), 1800);
  }

  usePageSeo({
    canonical: "https://mirabellier.com/staging/tcg",
    structuredDataId: "tcg-structured-data",
    structuredData: { "@context": "https://schema.org", "@type": "WebPage", name: "TCG Showdown", url: "https://mirabellier.com/staging/tcg" },
  });

  // ── Load eligible cards on mount ──
  useEffect(() => {
    if (!token) return;
    fetchTcgEligibleCards(token).then(({ cards }) => setEligibleCards(cards)).catch(() => {});
  }, [token]);

  // ── Auto-resume active game on mount ──
  useEffect(() => {
    if (!token) return;
    const savedGameId = localStorage.getItem("tcg_active_game");
    if (savedGameId) {
      fetchTcgGameState(token, savedGameId).then((state) => {
        if (state && state.state === "playing" && !state.winner) {
          setGameId(savedGameId);
          setGameState(state);
          setTab("match");
        } else {
          localStorage.removeItem("tcg_active_game");
        }
      }).catch(() => localStorage.removeItem("tcg_active_game"));
    }
  }, [token]);

  // ── Start game ──
  const handleStartSolo = async (mode: "solo" | "ai" = "solo") => {
    if (!token) return;
    if (selectedDeck.size < DECK_SIZE) {
      showError("Build a 10-card deck first.");
      return;
    }
    setLoading(true); setErrorMessage(null);
    try {
      const deckCards = eligibleCards.filter((c) => selectedDeck.has(toCardId(c)));
      const { gameId: gid } = await startTcgSoloGame(token, elementPool, deckCards, mode);
      setGameId(gid);
      localStorage.setItem("tcg_active_game", gid);
      setTab("match");
      const state = await fetchTcgGameState(token, gid);
      setGameState(state);
    } catch (err) { showError(normalizeArenaError(err)); }
    finally { setLoading(false); }
  };

  // ── Matchmaking ──
  const handleFindMatch = async () => {
    if (!token) return;
    if (selectedDeck.size < DECK_SIZE) {
      showError("Build a 10-card deck first.");
      return;
    }
    setLoading(true); setErrorMessage(null);
    const deckCards = eligibleCards.filter((c) => selectedDeck.has(toCardId(c)));
    if (deckCards.length < DECK_SIZE) {
      showError(eligibleCards.length === 0
        ? "Card list still loading. Please wait a moment."
        : "Some deck cards are missing. Rebuild your deck.");
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
        setTab("match");
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
    if (queuePollRef.current) clearInterval(queuePollRef.current);
  };

  // ── Queue Polling ──
  useEffect(() => {
    if (queueState !== "searching" || !token) return;
    const poll = async () => {
      try {
        const status = await checkTcgQueue(token);
        if (status.matched && status.gameId) {
          setQueueState("matched");
          const deckCards = eligibleCards.filter((c) => selectedDeck.has(toCardId(c)));
          await submitTcgDeck(token, status.gameId, deckCards, elementPool);
          setGameId(status.gameId);
          localStorage.setItem("tcg_active_game", status.gameId);
          setTab("match");
          const state = await fetchTcgGameState(token, status.gameId);
          setGameState(state);
        } else if (!status.inQueue) {
          setQueueState("idle");
        }
      } catch { /* ignore */ }
    };
    poll();
    queuePollRef.current = window.setInterval(poll, 2000);
    return () => { if (queuePollRef.current) clearInterval(queuePollRef.current); };
  }, [queueState, token, eligibleCards, selectedDeck]);

  // ── Game State Polling ──
  useEffect(() => {
    if (!gameId || !token) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const state = await fetchTcgGameState(token, gameId);
        if (cancelled) return;
        setGameState(state);
      } catch (err) {
        if (!cancelled) showError(normalizeArenaError(err));
      }
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [gameId, token]);

  const handleToggleCard = (cardId: string) => {
    setSelectedDeck((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) { next.delete(cardId); }
      else if (next.size < DECK_SIZE) { next.add(cardId); }
      saveDeck(Array.from(next));
      return next;
    });
  };

  const handleAction = async (action: { type: string; cardId?: string; slot?: string }) => {
    if (!token || !gameId || actionPending) return;
    setActionPending(true); setErrorMessage(null);
    try {
      const result = await submitTcgAction(token, gameId, action);
      if (result.attackResult) {
        const ar = result.attackResult;
        const elColor = ar.elementEffective === "super-effective"
          ? (ar.elementAttacker ? ELEMENT_COLORS[ar.elementAttacker] : null)
          : ar.elementEffective === "not-very-effective" ? "#94a3b8" : null;
        spawnAttackFloat(ar.damage, ar.elementEffective === "super-effective" ? "Super Effective" : ar.elementEffective === "not-very-effective" ? "Weak..." : null, elColor);
        setShakeOpponent(true);
        setTimeout(() => setShakeOpponent(false), 500);
      }
      const state = await fetchTcgGameState(token, gameId);
      setGameState(state);
      // Show AI actions with 1s delay between each
      if (result.aiActions && result.aiActions.length > 0) {
        for (let i = 0; i < result.aiActions.length; i++) {
          setAiActionText(result.aiActions[i]);
          await new Promise<void>((resolve) => setTimeout(resolve, i === 0 ? 300 : 1000));
        }
        setTimeout(() => setAiActionText(null), 500);
      }
    } catch (err) { showError(normalizeArenaError(err)); }
    finally { setActionPending(false); }
  };

  const myKey = gameState?.solo ? "p1" : (gameState?.playerKey || "p1");
  const oppKey = myKey === "p1" ? "p2" : "p1";
  const gameBoard = gameState?.board;
  const myBoard = gameBoard?.[myKey as keyof typeof gameBoard] || null;
  const oppBoard = gameBoard?.[oppKey as keyof typeof gameBoard] || null;

  return (
    <div className="min-h-screen flex flex-col font-[sans-serif] text-blue-900">
      {/* Staging modal */}
      {showStagingModal ? (
        <ConfirmDialog
          title="Staging Area"
          message={<>You are on the <strong>staging stage</strong> of the website. Expect bugs, broken features, and unfinished content.<br /><br />Contact <span className="font-semibold text-pink-600">Mira</span> if you encounter any bugs.</>}
          confirmLabel="I Understand"
          cancelLabel="Go Back"
          onConfirm={() => setShowStagingModal(false)}
          onCancel={() => window.history.back()}
        />
      ) : null}
      <Header />
      <div className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: "var(--page-bg)" }}>
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-2 p-2 sm:gap-4 sm:p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col hidden lg:flex">
            <Navigation />
          </div>
          <main className="w-full space-y-2 p-2 sm:p-4 lg:w-3/5">
            <section className="card-border space-y-3 sm:space-y-4 bg-white/60 p-3 sm:p-4">
              <h2 className="text-2xl sm:text-4xl font-bold text-blue-900">TCG Showdown</h2>

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800 text-center">
                  <p className="font-semibold">Sign in required to access TCG.</p>
                  <Link to="/login" className="mt-2 inline-block underline font-bold text-pink-600">go to login</Link>
                </div>
              ) : (
                <>
                  {/* ── Tab Nav ── */}
                  <div className="flex justify-center gap-4 pb-3 border-b border-sky-100">
                    <button
                      onClick={() => setTab("decks")}
                      className={`arena-redraw-button hover:animate-wiggle ${tab === "decks" ? "font-bold text-pink-600" : ""}`}
                    >
                      [ Decks ]
                    </button>
                    <span className="font-bold self-center">|</span>
                    <button
                      onClick={() => setTab("match")}
                      className={`arena-redraw-button hover:animate-wiggle ${tab === "match" ? "font-bold text-pink-600" : ""}`}
                    >
                      [ Match ]
                    </button>
                  </div>

                  {/* ── Decks Tab ── */}
                  {tab === "decks" ? (
                    <div className="space-y-4">
                      {/* Selected deck — horizontal scroll */}
                      {selectedDeck.size > 0 ? (
                        <div className="border border-blue-200 rounded-xl bg-blue-50/60 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-blue-700">
                              Your Deck ({selectedDeck.size}/{DECK_SIZE})
                            </p>
                            <div className="flex items-center gap-1">
                              <span className="text-[0.55rem] font-semibold text-slate-500">elements:</span>
                              {elementPool.map((el) => (
                                <img
                                  key={el}
                                  alt={el}
                                  src={ELEMENT_ICONS[el]}
                                  className="w-4 h-4 drop-shadow-sm"
                                  title={el}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-3 overflow-x-auto pb-2 select-none" onContextMenu={(e) => e.preventDefault()}>
                            {eligibleCards
                              .filter((card) => selectedDeck.has(toCardId(card)))
                              .map((card) => {
                                const id = toCardId(card);
                                return (
                                  <div
                                    key={id}
                                    className="relative cursor-pointer flex-shrink-0 hover:scale-105 transition rounded-xl overflow-hidden"
                                    onClick={() => handleToggleCard(id)}
                                    title="Click to remove"
                                  >
                                    <ArenaPortraitCard card={card} size="compact" showIvLine={false} />
                                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                                      <span className="text-white text-sm font-bold bg-red-500/80 px-2 py-0.5 rounded-full">Remove</span>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      ) : null}

                      {/* Element spawn selector — choose which elements appear during match */}
                      <div className="flex flex-wrap items-center gap-2 bg-amber-50/60 border border-amber-200 rounded-lg p-2">
                        <span className="text-xs font-bold text-amber-700">⚡ Elements to spawn:</span>
                        {Object.keys(ELEMENT_COLORS).map((el) => {
                          const active = elementPool.includes(el);
                          return (
                            <button
                              key={el}
                              type="button"
                              onClick={() => {
                                const next = active
                                  ? elementPool.filter((e) => e !== el)
                                  : [...elementPool, el];
                                if (next.length === 0) return;
                                setElementPool(next);
                                saveElementPool(next);
                              }}
                              style={{
                                backgroundColor: active ? ELEMENT_COLORS[el] : "transparent",
                                borderColor: ELEMENT_COLORS[el],
                                color: active ? "#fff" : ELEMENT_COLORS[el],
                              }}
                              className="text-xs font-bold px-2.5 py-1 rounded-full border-2 transition hover:scale-105"
                            >
                              {el}
                            </button>
                          );
                        })}
                      </div>

                      {/* Search + Element Filter */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-500">filter:</span>
                          {Object.keys(ELEMENT_COLORS).map((el) => {
                            const active = deckFilterEl === el;
                            return (
                              <button
                                key={el}
                                type="button"
                                onClick={() => setDeckFilterEl(active ? "" : el)}
                                style={{
                                  backgroundColor: active ? ELEMENT_COLORS[el] : "transparent",
                                  borderColor: ELEMENT_COLORS[el],
                                  color: active ? "#fff" : ELEMENT_COLORS[el],
                                }}
                                className="text-[0.55rem] font-bold px-1.5 py-0.5 rounded-full border transition"
                              >
                                {el.charAt(0)}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="search"
                          value={deckSearch}
                          onChange={(e) => setDeckSearch(e.target.value)}
                          placeholder="Search cards..."
                          className="w-48 rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700"
                        />
                      </div>
                      {eligibleCards.length === 0 ? (
                        <p className="text-sm text-slate-500">Loading cards...</p>
                      ) : (
                        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 max-h-96 overflow-y-auto select-none" onContextMenu={(e) => e.preventDefault()}>
                          {eligibleCards
                            .filter((card) => !selectedDeck.has(toCardId(card)))
                            .filter((card) => {
                              if (deckFilterEl && card.element !== deckFilterEl) return false;
                              if (deckSearch) {
                                const q = deckSearch.toLowerCase();
                                return card.title.toLowerCase().includes(q) || (card.element || "").toLowerCase().includes(q);
                              }
                              return true;
                            })
                            .map((card) => {
                              const id = toCardId(card);
                              return (
                                <div
                                  key={id}
                                  className="relative cursor-pointer transition hover:scale-105"
                                  onClick={() => handleToggleCard(id)}
                                  onMouseEnter={(e) => {
                                    const r = e.currentTarget.getBoundingClientRect();
                                    setHoverDetail({ card, top: r.top, left: r.left + r.width / 2 });
                                  }}
                                  onMouseLeave={() => setHoverDetail(null)}
                                >
                                  <ArenaPortraitCard card={card} size="compact" showIvLine={false} />
                                </div>
                              );
                            })}
                        </div>
                      )}
                      {/* Fixed hover tooltip */}
                      {hoverDetail ? (
                        <div
                          className="fixed z-50 pointer-events-none"
                          style={{
                            left: Math.min(hoverDetail.left, window.innerWidth - 200),
                            top: hoverDetail.top - 12,
                            transform: "translate(-50%, -100%)",
                          }}
                        >
                          <div className="bg-slate-900 text-white text-[0.6rem] rounded-xl p-3 shadow-2xl w-48 space-y-1.5">
                            <p className="font-bold text-sm truncate">{hoverDetail.card.title}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: ELEMENT_COLORS[hoverDetail.card.element || ""] || "#888" }}>
                                {hoverDetail.card.element || "?"}
                              </span>
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white opacity-70" style={{ backgroundColor: (hoverDetail.card.element ? ELEMENT_COLORS[hoverDetail.card.element] : undefined) || "#888" }}>
                                {hoverDetail.card.rarity}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300">
                              <span>Power: {hoverDetail.card.iv?.power ?? 0}</span>
                              <span>Guard: {hoverDetail.card.iv?.guard ?? 0}</span>
                              <span>Speed: {hoverDetail.card.iv?.speed ?? 0}</span>
                              <span>Luck: {hoverDetail.card.iv?.luck ?? 0}</span>
                            </div>
                            <p className="text-slate-400">IV Total: {hoverDetail.card.iv?.total ?? 0}</p>
                            <p className="text-emerald-400">HP: ~{hoverDetail.card.iv ? Math.max(25, 40 + Math.floor((hoverDetail.card.iv.guard || 0) * 1) + Math.floor(((hoverDetail.card.iv.power || 0) + (hoverDetail.card.iv.speed || 0)) * 0.1)) : "?"}</p>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex gap-2 justify-center">
                        {selectedDeck.size > 0 ? (
                          <button
                            onClick={() => { setSelectedDeck(new Set()); saveDeck([]); }}
                            className="arena-redraw-button hover:animate-wiggle text-xs"
                          >
                            [ Clear ]
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* ── Match Tab ── */}
                  {tab === "match" ? (
                    <>
                      {/* No game active — show start button */}
                      {!gameId && queueState !== "searching" ? (
                        <div className="space-y-4 text-center">
                          <p className="text-lg font-bold text-blue-700">TCG Showdown</p>
                          <p className="text-sm text-slate-600">
                            {selectedDeck.size >= DECK_SIZE
                              ? "Deck ready!"
                              : `Need ${DECK_SIZE} cards in your deck. Go to [ Decks ] first.`}
                          </p>
                          <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3">
                            <button
                              onClick={() => handleStartSolo("solo")}
                              disabled={loading || selectedDeck.size < DECK_SIZE}
                              className="arena-redraw-button hover:animate-wiggle text-lg"
                            >
                              {loading ? "[ Starting... ]" : "[ Play Solo ]"}
                            </button>
                            <button
                              onClick={() => handleStartSolo("ai")}
                              disabled={loading || selectedDeck.size < DECK_SIZE}
                              className="arena-redraw-button hover:animate-wiggle text-lg"
                            >
                              {loading ? "[ Starting... ]" : "[ Play AI ]"}
                            </button>
                            <button
                              onClick={handleFindMatch}
                              disabled={loading || selectedDeck.size < DECK_SIZE}
                              className="arena-redraw-button hover:animate-wiggle text-lg"
                            >
                              {loading ? "[ Starting... ]" : "[ Find Match ]"}
                            </button>
                          </div>
                        </div>
                      ) : queueState === "searching" ? (
                        <div className="space-y-4 text-center">
                          <p className="text-lg font-bold text-blue-700 animate-pulse">Searching for opponent...</p>
                          <button onClick={handleCancelQueue} className="arena-redraw-button hover:animate-wiggle">
                            [ Cancel ]
                          </button>
                        </div>
                      ) : null}

                      {/* Game Board */}
                      {gameId && gameState?.board && !gameState?.winner ? (
                          <div className="space-y-2 sm:space-y-4 select-none" onContextMenu={(e) => e.preventDefault()}>
                            {/* Turn indicator */}
                            {gameState.solo ? (
                              <p className="text-center text-sm font-bold">
                                <span className="text-emerald-600">
                                  {gameState.mode === "ai"
                                    ? `${gameState.currentPlayer === "p1" ? "Your" : "AI"} turn`
                                    : `Solo — ${gameState.currentPlayer === "p1" ? "P1" : "P2"}'s turn`}
                                </span>
                              </p>
                            ) : gameState.myTurn ? (
                              <p className="text-center text-sm font-bold">
                                <span className="text-emerald-600">Your Turn</span>
                              </p>
                            ) : (
                              <p className="text-center text-sm font-bold">
                                <span className="text-slate-400 animate-pulse">Waiting for opponent...</span>
                              </p>
                            )}
                            {gameState?.lastAction ? (
                              <p className="text-center text-xs text-slate-500 italic">{gameState.lastAction}</p>
                            ) : null}
                            {aiActionText ? (
                              <p className="text-center text-sm font-bold text-purple-600 animate-pulse">{aiActionText}</p>
                            ) : null}
                            {gameState?.turnStartedAt && gameState.phase !== "finished" ? (
                              <CountdownTimer startMs={gameState.turnStartedAt} />
                            ) : null}
                            {/* Top Player (P2 in solo, Opponent in PvP) */}
                          {gameState.solo ? (
                            <div className={`border rounded-lg p-2 sm:p-3 ${gameState.currentPlayer === "p2" ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                              <p className="text-xs font-bold text-center mb-2">
                                <span className={gameState.currentPlayer === "p2" ? "text-blue-700" : "text-slate-500"}>
                                  P2{gameState.currentPlayer === "p2" ? " (active)" : ""}{gameState.mode === "ai" ? " 🤖" : ""}
                                </span>
                                {" · Score: "}{gameState.p2Score}
                              </p>
                              {gameState.elementPools?.[oppKey] && gameState.elementPools[oppKey].length > 0 ? (
                                <div className="flex items-center justify-center gap-1 mb-1">
                                  <span className="text-[0.5rem] text-slate-400">pool:</span>
                                  {gameState.elementPools[oppKey].map((el) => (
                                    <img key={el} alt={el} src={ELEMENT_ICONS[el]} className="w-4 h-4 drop-shadow-sm" title={el} />
                                  ))}
                                </div>
                              ) : null}
                              <div className="flex items-center justify-center gap-1 mb-2">
                                <span className="text-[0.5rem] text-slate-400">active:</span>
                                {oppBoard && oppBoard.elementPool.length > 0
                                  ? oppBoard.elementPool.map((el, i) => (
                                      <img key={i} alt={el} src={ELEMENT_ICONS[el] || ""} className="w-4 h-4 drop-shadow-sm" title={el} />
                                    ))
                                  : <span className="text-slate-400 text-[0.65rem]">none</span>}
                              </div>
                                <div className="mx-auto w-fit relative">
                                  <div className="absolute top-0 left-full ml-2">
                                    {oppBoard && oppBoard.elementPool.length > 0 && gameState.solo && gameState.currentPlayer === "p2" ? (
                                      (() => {
                                        const el = oppBoard.elementPool[0];
                                        const hasMatch = (!!oppBoard.board.attacker && oppBoard.board.attacker.element === el) || oppBoard.board.support.some((s) => s && s.element === el);
                                        return (
                                          <div
                                            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold text-white shadow-lg cursor-grab active:cursor-grabbing ${hasMatch ? "ring-2 ring-yellow-400 ring-offset-1" : ""}`}
                                            style={{ backgroundColor: ELEMENT_COLORS[el] || "#888", borderColor: ELEMENT_COLORS[el] || "#888" }}
                                            title={`Drag to assign ${el} to a card`}
                                            draggable
                                            onDragStart={(e) => {
                                              e.dataTransfer.setData("element", el);
                                              e.dataTransfer.effectAllowed = "move";
                                            }}
                                          >
                                            <img src={ELEMENT_ICONS[el] || ""} alt={el} className="w-6 h-6 object-contain pointer-events-none" draggable={false} />
                                          </div>
                                        );
                                      })()
                                    ) : oppBoard && oppBoard.elementPool.length > 0 ? (
                                      <div
                                        className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold text-white shadow-lg opacity-50"
                                        style={{ backgroundColor: ELEMENT_COLORS[oppBoard.elementPool[0]] || "#888", borderColor: ELEMENT_COLORS[oppBoard.elementPool[0]] || "#888" }}
                                        title={oppBoard.elementPool[0]}
                                      >
                                        <img
                                          src={ELEMENT_ICONS[oppBoard.elementPool[0]] || ""}
                                          alt={oppBoard.elementPool[0]}
                                          className="w-6 h-6 object-contain pointer-events-none"
                                          draggable={false}
                                        />
                                      </div>
                                    ) : (
                                      <div className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                                        -
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <BoardHand board={oppBoard} isTurn={gameState.solo && gameState.currentPlayer === "p2"} mirror onAction={gameState.solo ? handleAction : undefined} />
                                    <div className="mt-4">
                                      <PlayerBoard
                                        board={oppBoard}
                                        isTurn={gameState.solo && gameState.currentPlayer === "p2"}
                                      onAction={gameState.solo ? handleAction : undefined}
                                      mirror
                                      shakeOpponentCard={shakeOpponent}
                                      attackFloaters={gameState.currentPlayer === "p1" ? attackFloaters : []}
                                    />
                                    </div>
                                  </div>
                                  <div className="absolute top-0 right-full mr-2">
                                      <BoardPiles board={oppBoard} isTurn={gameState.solo && gameState.currentPlayer === "p2"} onAction={gameState.solo ? handleAction : undefined} turn={gameState.turn} />
                                  </div>
                                </div>
                              </div>
                          ) : (
                            <div className="border border-slate-200 rounded-lg p-2 sm:p-3 bg-slate-50">
                              <p className="text-xs font-bold text-slate-500 mb-1 text-center">
                                {gameState?.opponentName || "Opponent"} · Score: {gameState?.p2Score ?? gameState?.player2Score ?? 0}
                              </p>
                              {gameState.elementPools?.[oppKey] && gameState.elementPools[oppKey].length > 0 ? (
                                <div className="flex items-center justify-center gap-1 mb-1">
                                  <span className="text-[0.5rem] text-slate-400">pool:</span>
                                  {gameState.elementPools[oppKey].map((el) => (
                                    <img key={el} alt={el} src={ELEMENT_ICONS[el]} className="w-4 h-4 drop-shadow-sm" title={el} />
                                  ))}
                                </div>
                              ) : null}
                              <div className="flex items-center justify-center gap-1 mb-2">
                                <span className="text-[0.5rem] text-slate-400">active:</span>
                                {oppBoard && oppBoard.elementPool.length > 0
                                  ? oppBoard.elementPool.map((el, i) => (
                                      <img key={i} alt={el} src={ELEMENT_ICONS[el] || ""} className="w-4 h-4 drop-shadow-sm" title={el} />
                                    ))
                                  : <span className="text-slate-400 text-[0.65rem]">none</span>}
                              </div>
                                  <div className="mx-auto w-fit relative">
                                    <div>
                                      <div className="flex flex-col-reverse items-center gap-2">
                                        <CardThumbnail card={oppBoard?.board.attacker ?? null} size="lg" />
                                        <div className="flex gap-3 justify-center">
                                          {(oppBoard?.board.support ?? [null, null, null]).map((card, i) => (
                                            <CardThumbnail key={`opp-s-${i}`} card={card} size="md" />
                                          ))}
                                        </div>
                                      </div>
                                      <p className="text-xs text-slate-400 mt-1 text-center">
                                        Hand: {oppBoard?.hand.length ?? 0}
                                      </p>
                                    </div>
                                    <div className="absolute top-0 right-full mr-2">
                                    <BoardPiles board={oppBoard} isTurn={gameState.solo && gameState.currentPlayer === "p2"} onAction={gameState.solo ? handleAction : undefined} turn={gameState.turn} />
                                  </div>
                              </div>
                            </div>
                          )}

                          {/* Bottom Player (P1 in solo, You in PvP) */}
                            <div className={`border-2 rounded-lg p-2 sm:p-3 ${gameState.solo && gameState.currentPlayer === "p1" ? "border-blue-400 bg-blue-50" : "border-blue-300 bg-blue-50"}`}>
                            <p className="text-xs font-bold text-center mb-2">
                              {gameState.solo ? (
                                <span className={gameState.currentPlayer === "p1" ? "text-blue-700" : "text-slate-500"}>
                                  P1{gameState.currentPlayer === "p1" ? " (active)" : ""}
                                </span>
                              ) : "You"}
                              {" · Score: "}{gameState.p1Score}
                            </p>
                            {gameState.elementPools?.[myKey] && gameState.elementPools[myKey].length > 0 ? (
                              <div className="flex items-center justify-center gap-1 mb-1">
                                <span className="text-[0.5rem] text-slate-400">pool:</span>
                                {gameState.elementPools[myKey].map((el) => (
                                  <img key={el} alt={el} src={ELEMENT_ICONS[el]} className="w-4 h-4 drop-shadow-sm" title={el} />
                                ))}
                              </div>
                            ) : null}
                            <div className="flex items-center justify-center gap-1 mb-2">
                              <span className="text-[0.5rem] text-slate-400">active:</span>
                              {myBoard && myBoard.elementPool.length > 0
                                ? myBoard.elementPool.map((el, i) => (
                                    <img key={i} alt={el} src={ELEMENT_ICONS[el] || ""} className="w-4 h-4 drop-shadow-sm" title={el} />
                                  ))
                                : <span className="text-slate-400 text-[0.65rem]">none</span>}
                            </div>
                            <div className="mx-auto w-fit relative">
                              <div className="absolute top-0 right-full mr-2">
                                {myBoard && myBoard.elementPool.length > 0 && (gameState.solo ? gameState.currentPlayer === "p1" : gameState?.myTurn) ? (
                                  (() => {
                                    const el = myBoard.elementPool[0];
                                    const hasMatch = (!!myBoard.board.attacker && myBoard.board.attacker.element === el) || myBoard.board.support.some((s) => s && s.element === el);
                                    return (
                                      <div
                                        className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold text-white shadow-lg cursor-grab active:cursor-grabbing ${hasMatch ? "ring-2 ring-yellow-400 ring-offset-1" : ""}`}
                                        style={{ backgroundColor: ELEMENT_COLORS[el] || "#888", borderColor: ELEMENT_COLORS[el] || "#888" }}
                                        title={`Drag to assign ${el} to a card`}
                                        draggable
                                        onDragStart={(e) => {
                                          e.dataTransfer.setData("element", el);
                                          e.dataTransfer.effectAllowed = "move";
                                        }}
                                      >
                                        <img src={ELEMENT_ICONS[el] || ""} alt={el} className="w-6 h-6 object-contain pointer-events-none" draggable={false} />
                                      </div>
                                    );
                                  })()
                                ) : myBoard && myBoard.elementPool.length > 0 ? (
                                  <div
                                    className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold text-white shadow-lg opacity-50"
                                    style={{ backgroundColor: ELEMENT_COLORS[myBoard.elementPool[0]] || "#888", borderColor: ELEMENT_COLORS[myBoard.elementPool[0]] || "#888" }}
                                    title={myBoard.elementPool[0]}
                                  >
                                    <img
                                      src={ELEMENT_ICONS[myBoard.elementPool[0]] || ""}
                                      alt={myBoard.elementPool[0]}
                                      className="w-6 h-6 object-contain pointer-events-none"
                                      draggable={false}
                                    />
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                                    -
                                  </div>
                                )}
                              </div>
                              <div>
                                <PlayerBoard
                                  board={myBoard}
                                  isTurn={gameState.solo ? gameState.currentPlayer === "p1" : gameState.myTurn}
                                  onAction={handleAction}
                                  attackFloaters={gameState.currentPlayer === "p2" ? attackFloaters : []}
                                />
                                <BoardHand board={myBoard} isTurn={gameState.solo ? gameState.currentPlayer === "p1" : gameState.myTurn} onAction={handleAction} />
                              </div>
                              <div className="absolute top-0 left-full ml-2">
                                <BoardPiles board={myBoard} isTurn={gameState.solo ? gameState.currentPlayer === "p1" : gameState.myTurn} onAction={handleAction} turn={gameState.turn} />
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          {gameState.myTurn || gameState.solo ? (
                            <div className="flex flex-wrap justify-center gap-2">
                              <button onClick={() => handleAction({ type: "end" })} className="arena-redraw-button hover:animate-wiggle text-xs font-bold">
                                [ End Turn ]
                              </button>
                              <button onClick={() => handleAction({ type: "forfeit" })} className="arena-redraw-button hover:animate-wiggle text-xs text-red-600 font-bold">
                                [ Forfeit ]
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Finished */}
                      {gameState?.winner ? (
                        <div className="space-y-4 text-center">
                          <p className="text-2xl font-bold text-blue-700">
                            {gameState.winner === myKey ? "You Win!" : "You Lose!"}
                            <span className="text-base ml-3 text-slate-600">
                              {gameState.p1Score}-{gameState.p2Score}
                            </span>
                          </p>
                          <button onClick={() => { setGameId(null); setGameState(null); localStorage.removeItem("tcg_active_game"); }} className="arena-redraw-button hover:animate-wiggle">
                            [ Play Again ]
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}

              {errorMessage && errorState !== "hidden" && errorState !== "pending" ? (
                <div
                  className={`site-entry-toast-shell ${errorState === "visible" ? "site-entry-toast-shell--visible" : ""} ${errorState === "leaving" ? "site-entry-toast-shell--leaving" : ""}`}
                  style={{ top: "1rem", bottom: "auto", right: "50%", transform: errorState === "visible" ? "translateX(50%) translateY(0)" : errorState === "leaving" ? "translateX(50%) translateY(-100%)" : "translateX(50%) translateY(-100%)", width: "auto", maxWidth: "min(88vw, 24rem)" }}
                  role="status"
                  aria-live="polite"
                >
                  <div className="site-entry-toast">
                    <p className="site-entry-toast__message">{errorMessage}</p>
                  </div>
                </div>
              ) : null}
            </section>
            <Divider />
          </main>

          <aside className="mb-auto w-full space-y-4 hidden sm:block lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <h2 className="text-center text-lg font-bold text-blue-700 mb-2">weakness chart</h2>
              <div className="space-y-1 text-xs">
                {[
                  { el: "Fire", beats: "Earth" },
                  { el: "Water", beats: "Fire" },
                  { el: "Earth", beats: "Water" },
                  { el: "Wind", beats: "Light" },
                  { el: "Light", beats: "Dark" },
                  { el: "Dark", beats: "Wind" },
                ].map((row) => (
                  <div key={row.el} className="flex items-center gap-1.5">
                    <span className="inline-block w-14 px-1.5 py-0.5 rounded-full text-center font-bold text-white text-[0.6rem]" style={{ backgroundColor: ELEMENT_COLORS[row.el] }}>
                      {row.el}
                    </span>
                    <span className="text-slate-500">beats</span>
                    <span className="inline-block px-1.5 py-0.5 rounded-full text-center font-bold text-white text-[0.6rem]" style={{ backgroundColor: ELEMENT_COLORS[row.beats] }}>
                      {row.beats}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-2 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">tcg rules</h2>
                <p>10-card deck. 1 attacker + 3 support.</p>
                <p>Assign 2 matching elements to attack.</p>
                <p>Each turn spawns 1 random element type.</p>
                <p>Super-effective = 3x damage!</p>
                <p>First to 3 points wins.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default TcgPage;
