import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useWebSocketEvent } from "@/hooks/use-websocket";

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
import ArenaSubNav from "@/parts/ArenaSubNav";
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
  fetchActiveTcgGame,
  submitTcgDeck,
  fetchTcgGameState,
  submitTcgAction,
} from "@/lib/arena";

const DECK_SIZE = 10;
const ELEMENTS = ["Fire", "Water", "Earth", "Wind", "Light", "Dark"] as const;
const RARITY_ORDER = ["C", "R", "SR", "SSR", "UR"] as const;

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

type CollectionSort =
  | "recent"
  | "rarity-desc"
  | "rarity-asc"
  | "iv-desc"
  | "iv-asc"
  | "power-desc"
  | "guard-desc"
  | "speed-desc"
  | "effectHit-desc";

type MobileTcgDrag =
  | { kind: "card"; cardId: string }
  | { kind: "draw" }
  | { kind: "attack" }
  | { kind: "promote"; slot: string }
  | { kind: "element"; element: string };

type MobileTcgGhost = {
  drag: MobileTcgDrag;
  clientX: number;
  clientY: number;
};

type TcgAction = { type: string; cardId?: string; slot?: string };

function rarityRank(rarity: string | null | undefined) {
  const index = RARITY_ORDER.indexOf((rarity || "C") as (typeof RARITY_ORDER)[number]);
  return index >= 0 ? index : 0;
}

function sortDeckCards(cards: ArenaCard[], sort: CollectionSort) {
  return [...cards].sort((a, b) => {
    const byDate = (Date.parse(b.drawnAt || "") || 0) - (Date.parse(a.drawnAt || "") || 0);
    if (sort === "rarity-desc") return rarityRank(b.rarity) - rarityRank(a.rarity) || byDate;
    if (sort === "rarity-asc") return rarityRank(a.rarity) - rarityRank(b.rarity) || byDate;
    if (sort === "iv-desc") return (b.iv?.total || 0) - (a.iv?.total || 0) || byDate;
    if (sort === "iv-asc") return (a.iv?.total || 0) - (b.iv?.total || 0) || byDate;
    if (sort === "power-desc") return (b.iv?.power || 0) - (a.iv?.power || 0) || byDate;
    if (sort === "guard-desc") return (b.iv?.guard || 0) - (a.iv?.guard || 0) || byDate;
    if (sort === "speed-desc") return (b.iv?.speed || 0) - (a.iv?.speed || 0) || byDate;
    if (sort === "effectHit-desc") return (b.iv?.effectHit || 0) - (a.iv?.effectHit || 0) || byDate;
    return byDate;
  });
}

function readMobileTcgDrag(target: EventTarget | null): MobileTcgDrag | null {
  if (!(target instanceof Element)) return null;
  const dragElement = target.closest("[data-tcg-drag-kind]") as HTMLElement | null;
  if (!dragElement) return null;

  const kind = dragElement.dataset.tcgDragKind;
  if (kind === "card" && dragElement.dataset.tcgCardId) return { kind, cardId: dragElement.dataset.tcgCardId };
  if (kind === "draw") return { kind };
  if (kind === "attack") return { kind };
  if (kind === "promote" && dragElement.dataset.tcgPromoteSlot) return { kind, slot: dragElement.dataset.tcgPromoteSlot };
  if (kind === "element" && dragElement.dataset.tcgElement) return { kind, element: dragElement.dataset.tcgElement };
  return null;
}

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function toCardId(card: TcgCard | ArenaCard | null): string {
  if (!card) return "";
  return card.cardInstanceId || `${card.malId}-${card.drawnAt || "card"}`;
}

function canTcgCardAttack(card: TcgCard | null | undefined) {
  const assigned = card?.assignedElements || [];
  return !!card?.element && assigned.length >= 2 && assigned.every((element) => element === card.element);
}

function canTcgCardSwitch(card: TcgCard | null | undefined, board: TcgPlayerState) {
  return !!card && (card.assignedElements?.length || 0) >= 1 && !board.switchedCardThisTurn && board.board.support.some((support) => !!support);
}

function getAssignedEnergyText(card: TcgCard | null | undefined) {
  const assigned = card?.assignedElements || [];
  if (!card) return "No attacker";
  if (assigned.length === 0) return "No energy";
  return `${assigned.length} energy`;
}

function getActivePlayerLabel(gameState: TcgGameState) {
  if (gameState.solo) {
    if (gameState.mode === "ai" && gameState.currentPlayer === "p2") return "AI turn";
    return gameState.currentPlayer === "p2" ? "P2 turn" : "P1 turn";
  }
  return gameState.myTurn ? "Your turn" : "Opponent turn";
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

function clearActiveTcgGame() {
  localStorage.removeItem("tcg_active_game");
}

function loadTcgStagingAcknowledgement() {
  try {
    return localStorage.getItem("tcg_staging_acknowledged") === "1";
  } catch {
    return false;
  }
}

function saveTcgStagingAcknowledgement() {
  try {
    localStorage.setItem("tcg_staging_acknowledged", "1");
  } catch {
    // Ignore storage failures; the modal can safely return next visit.
  }
}

function CardDetailTooltip({ detail }: {
  detail: { card: ArenaCard; top: number; left: number } | null;
}) {
  if (!detail) return null;
  const card = detail.card;
  const el = (card as Record<string, unknown>).element as string | undefined;
  const tcgCard = card as TcgCard;
  const iv = card.iv;
  const hp = tcgCard.currentHp ?? tcgCard.maxHp;
  const maxHp = tcgCard.maxHp;
  const assigned = tcgCard.assignedElements || [];
  const atk = iv ? Math.floor((iv.power ?? 0) + (iv.speed ?? 0)) : null;
  const def = iv ? Math.floor((iv.guard ?? 0) * 0.75) : null;
  const hpEst = iv ? Math.max(25, Math.floor(40 + (iv.guard ?? 0) * 1 + ((iv.power ?? 0) + (iv.speed ?? 0)) * 0.1)) : null;

  return createPortal(
    <div
      className="fixed pointer-events-none"
      style={{
        left: Math.min(detail.left, window.innerWidth - 230),
        top: detail.top - 12,
        transform: "translate(-50%, -100%)",
        zIndex: 230001,
      }}
    >
      <div className="bg-slate-900 text-white text-[0.6rem] rounded-xl p-3 shadow-2xl w-52 space-y-1.5">
        <p className="font-bold text-sm truncate">{card.title}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {el ? (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: ELEMENT_COLORS[el] || "#888" }}>
              <img src={ELEMENT_ICONS[el] || ""} alt={el} className="w-3 h-3 object-contain" />
              {el}
            </span>
          ) : null}
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white opacity-70" style={{ backgroundColor: (el ? ELEMENT_COLORS[el] : undefined) || "#888" }}>
            {card.rarity || "?"}
          </span>
        </div>
        {hp !== undefined ? (
          <div className="flex items-center gap-2">
            <span className="text-red-300 font-bold">HP:</span>
            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-green-500 transition-all"
                style={{ width: `${maxHp ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 100}%` }}
              />
            </div>
            <span className="text-red-300 font-bold">{hp}{maxHp ? `/${maxHp}` : ""}</span>
          </div>
        ) : null}
        {assigned.length > 0 ? (
          <div className="flex items-center gap-1">
            <span className="text-amber-300 font-bold">Elements:</span>
            {assigned.map((ael, i) => (
              <img key={i} src={ELEMENT_ICONS[ael] || ""} alt={ael} className="w-3.5 h-3.5" title={ael} />
            ))}
            <span className="text-amber-300 text-[0.55rem]">(×{assigned.length})</span>
          </div>
        ) : null}
        {iv ? (
          <>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300">
              <span>Power: {iv.power ?? 0}</span>
              <span>Guard: {iv.guard ?? 0}</span>
              <span>Speed: {iv.speed ?? 0}</span>
              <span>Effect Hit: {iv.effectHit ?? 0}</span>
            </div>
            <p className="text-slate-400">IV Total: {iv.total ?? 0}</p>
          </>
        ) : null}
        {atk != null && def != null ? (
          <p className="text-slate-400">ATK: ~{atk} · DEF: ~{def}</p>
        ) : null}
        {hpEst != null && maxHp == null ? (
          <p className="text-emerald-400">Est. HP: ~{hpEst}</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function ZoneLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block h-4 text-center text-[0.55rem] font-black uppercase tracking-normal text-slate-400 dark:text-slate-500">
      {children}
    </span>
  );
}

function CardThumbnail({ card, size = "sm", onClick, highlighted, draggable, touchDrag, onDragStart, onMouseEnter, onMouseLeave }: {
  card: TcgCard | ArenaCard | null;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  highlighted?: boolean;
  draggable?: boolean;
  touchDrag?: MobileTcgDrag;
  onDragStart?: (e: React.DragEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
}) {
  if (!card) {
    const dims = size === "lg" ? "w-24 h-32" : size === "md" ? "w-16 h-20" : "w-12 h-16";
    return (
      <div className={`${dims} rounded-lg border-2 border-dashed border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500 flex items-center justify-center text-xs text-slate-400 flex-shrink-0`}>
        ?
      </div>
    );
  }
  if ((card as TcgCard).hidden) {
    const dims = size === "lg" ? "w-24 h-32" : size === "md" ? "w-16 h-20" : "w-12 h-16";
    return (
      <div className={`${dims} rounded-lg border-2 border-slate-400 dark:border-slate-600 flex-shrink-0 overflow-hidden`}>
        <img src={cardBack} alt="" className="w-full h-full object-cover" draggable={false} />
      </div>
    );
  }

  const dims = size === "lg" ? "w-24 h-32" : size === "md" ? "w-16 h-20" : "w-12 h-16";
  const el = (card as unknown as Record<string, unknown>).element as string | undefined;
  const hp = (card as TcgCard).currentHp !== undefined ? (card as TcgCard).currentHp : (card as TcgCard).maxHp;
  const maxHp = (card as TcgCard).maxHp;
  const assigned = (card as TcgCard).assignedElements || [];
  const isTouchDraggable = draggable || !!touchDrag;

  return (
    <div
      className={`${dims} rounded-lg border-2 flex-shrink-0 relative overflow-hidden cursor-pointer ${
        highlighted ? "border-yellow-400 shadow-lg shadow-yellow-200 scale-105" : "border-slate-400 dark:border-slate-600 hover:border-blue-400 dark:hover:border-purple-400"
      } ${isTouchDraggable ? "touch-none select-none" : ""}`}
      onClick={onClick}
      draggable={draggable}
      data-tcg-draggable={isTouchDraggable ? "true" : undefined}
      data-tcg-drag-kind={touchDrag?.kind}
      data-tcg-card-id={touchDrag?.kind === "card" ? touchDrag.cardId : undefined}
      data-tcg-promote-slot={touchDrag?.kind === "promote" ? touchDrag.slot : undefined}
      data-tcg-element={touchDrag?.kind === "element" ? touchDrag.element : undefined}
      onDragStart={onDragStart}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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
          {assigned.slice(0, 2).map((assignedEl, index) => (
            <span key={`${assignedEl}-${index}`} className="w-3 h-3 flex items-center justify-center rounded-full bg-white/90 shadow-sm">
              <img
                src={ELEMENT_ICONS[assignedEl] || ""}
                alt=""
                className="w-2.5 h-2.5 object-contain pointer-events-none"
                draggable={false}
              />
            </span>
          ))}
          {assigned.length > 2 ? (
            <span className="text-[0.45rem] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">×{assigned.length}</span>
          ) : null}
        </div>
        ) : null}
    </div>
  );
}

function PlayerBoard({ board, isTurn, onAction, mirror, shakeOpponentCard, shakePlayerCard, attackFloaters, boardKey, onCardHover, onCardHoverLeave }: {
  board: TcgPlayerState | null;
  isTurn: boolean;
  onAction?: (action: TcgAction) => void;
  mirror?: boolean;
  shakeOpponentCard?: boolean;
  shakePlayerCard?: boolean;
  attackFloaters?: { key: number; dmg: number; elLabel: string | null; elColor: string | null; defenderKey: string }[];
  boardKey?: string;
  onCardHover?: (card: ArenaCard | TcgCard, e: React.MouseEvent) => void;
  onCardHoverLeave?: () => void;
}) {
  if (!board) return null;
  const attackerCanAttack = canTcgCardAttack(board.board.attacker);
  const attackerCanSwitch = canTcgCardSwitch(board.board.attacker, board);
  const attackerCanDrag = attackerCanAttack || attackerCanSwitch;
  const attackerClasses = [
    "relative",
    !board.board.attacker && isTurn ? "border-2 border-dashed border-emerald-400 rounded-lg bg-emerald-50/50 dark:border-emerald-600 dark:bg-emerald-950/30" : "",
    (mirror ? shakeOpponentCard : shakePlayerCard) ? "card-shake" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={`flex items-center gap-2 ${mirror ? "flex-col-reverse" : "flex-col"}`}>
      <div>
        <ZoneLabel>attacker</ZoneLabel>
        <div className={attackerClasses}
          data-board-key={boardKey || ""}
          data-slot="attacker"
          data-tcg-drop-board={boardKey || ""}
          data-tcg-drop-slot="attacker"
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
            highlighted={!!board.board.attacker && isTurn && attackerCanDrag}
            draggable={!!(isTurn && board.board.attacker && attackerCanDrag)}
            touchDrag={isTurn && board.board.attacker && attackerCanDrag ? { kind: "attack" } : undefined}
            onDragStart={(e) => {
              if (isTurn && board.board.attacker && attackerCanDrag) {
                e.dataTransfer.setData("text/plain", "tcg-attack");
                e.dataTransfer.setData("attack", "1");
                e.dataTransfer.effectAllowed = "move";
              }
            }}
            onMouseEnter={(e) => { if (board.board.attacker && onCardHover) onCardHover(board.board.attacker, e); }}
            onMouseLeave={onCardHoverLeave}
          />
          {!board.board.attacker && isTurn ? (
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-500 pointer-events-none">drop</span>
          ) : null}
          {attackFloaters && attackFloaters.length > 0 ? (
            attackFloaters.filter((f) => f.defenderKey === (boardKey || "")).map((f) => (
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
      </div>
      <div>
        <ZoneLabel>support</ZoneLabel>
        <div className="flex gap-3">
        {board.board.support.map((card, i) => (
          <div
            key={`s-${i}`}
            className={`relative ${!card && isTurn ? "border-2 border-dashed border-emerald-400 rounded-lg bg-emerald-50/50 dark:border-emerald-600 dark:bg-emerald-950/30" : ""}`}
            style={!card && isTurn ? { minWidth: "64px", minHeight: "80px" } : undefined}
            data-tcg-drop-board={boardKey || ""}
            data-tcg-drop-slot={`support_${i}`}
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
              touchDrag={card && !board.board.attacker && isTurn ? { kind: "promote", slot: `support_${i}` } : undefined}
              onClick={() => {
                if (card && !board.board.attacker && isTurn) {
                  onAction?.({ type: "promote", slot: `support_${i}` });
                }
              }}
              onDragStart={(e) => {
                if (card && !board.board.attacker && isTurn) {
                  e.dataTransfer.setData("promote", `support_${i}`);
                  e.dataTransfer.effectAllowed = "move";
                }
              }}
              onMouseEnter={(e) => { if (card && onCardHover) onCardHover(card, e); }}
              onMouseLeave={onCardHoverLeave}
            />
            {!card && isTurn ? (
              <span className="absolute inset-0 flex items-center justify-center text-[0.55rem] font-bold text-emerald-500 pointer-events-none">drop</span>
            ) : null}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

function BoardHand({ board, isTurn, mirror, onAction, boardKey, onCardHover, onCardHoverLeave }: {
  board: TcgPlayerState | null;
  isTurn: boolean;
  mirror?: boolean;
  onAction?: (action: TcgAction) => void;
  boardKey?: string;
  onCardHover?: (card: ArenaCard | TcgCard, e: React.MouseEvent) => void;
  onCardHoverLeave?: () => void;
}) {
  if (!board) return null;
  const cards = mirror ? [...board.hand].reverse() : board.hand;
  return (
    <div className="mt-2">
      <ZoneLabel>hand · {board.hand.length}</ZoneLabel>
      <div
        className={`flex gap-2 flex-wrap mt-0.5 ${mirror ? "flex-row-reverse justify-center" : "justify-center"}`}
        data-tcg-drop-board={boardKey || ""}
        data-tcg-drop-zone="hand"
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
        {cards.map((card, index) => {
          if ((card as TcgCard).hidden) {
            return (
              <CardThumbnail
                key={`${boardKey || "board"}-hidden-hand-${mirror ? "mirror" : "self"}-${index}`}
                card={card}
                size="md"
              />
            );
          }
          const cid = toCardId(card);
          const hasSlot = (!board.board.attacker || board.board.support.some((s) => !s)) && !board.placedCardThisTurn;
          const clickSlot = !board.board.attacker && board.board.support.every((s) => !s)
            ? "attacker"
            : board.board.support.findIndex((s) => !s) >= 0
              ? `support_${board.board.support.findIndex((s) => !s)}`
              : null;
          return (
            <CardThumbnail
              key={cid}
              card={card}
              size="md"
              highlighted={isTurn && hasSlot}
              draggable={isTurn && hasSlot}
              touchDrag={isTurn && hasSlot ? { kind: "card", cardId: cid } : undefined}
              onClick={() => {
                if (isTurn && hasSlot && clickSlot) {
                  onAction?.({ type: "place", cardId: cid, slot: clickSlot });
                }
              }}
              onDragStart={(e) => {
                e.dataTransfer.setData("cardId", cid);
                e.dataTransfer.effectAllowed = "move";
              }}
              onMouseEnter={(e) => onCardHover?.(card, e)}
              onMouseLeave={onCardHoverLeave}
            />
          );
        })}
      </div>
    </div>
  );
}

function BoardPiles({ board, isTurn, onAction, turn, onCardHover, onCardHoverLeave }: {
  board: TcgPlayerState | null;
  isTurn?: boolean;
  onAction?: (action: TcgAction) => void;
  turn?: number;
  onCardHover?: (card: ArenaCard | TcgCard, e: React.MouseEvent) => void;
  onCardHoverLeave?: () => void;
}) {
  if (!board) return null;
  const deck = board.fullDeck || [];
  const discardCards = [...board.discardPile].reverse().map((id) => deck.find((c) => toCardId(c) === id)).filter((c): c is TcgCard => !!c);
  const drawCards = [...board.drawPile].reverse().map((id) => deck.find((c) => toCardId(c) === id)).filter((c): c is TcgCard => !!c);
  return (
    <div className="flex flex-row justify-center gap-2 sm:flex-col sm:gap-6 sm:mr-2">
      {/* Discard pile — aligned with support row */}
      <div className="flex flex-col items-center group relative">
        <ZoneLabel>discard</ZoneLabel>
        <div className="w-16 h-20 rounded-lg bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:border-slate-700 flex items-center justify-center shadow-inner">
          <span className="text-[0.65rem] font-bold text-red-400 dark:text-red-300">{board.discardPile.length}</span>
        </div>
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
        <ZoneLabel>draw</ZoneLabel>
        {isTurn && board.drawPile.length > 0 && onAction ? (
          <div
            className={`touch-none cursor-pointer select-none active:scale-95 ${!board.drawnCardThisTurn && (!turn || turn > 1) ? "border-2 border-yellow-400 shadow-lg shadow-yellow-200 scale-105 rounded-xl" : ""}`}
            draggable
            role="button"
            tabIndex={0}
            data-tcg-draggable="true"
            data-tcg-drag-kind="draw"
            onClick={() => {
              if (!board.drawnCardThisTurn && (!turn || turn > 1)) onAction({ type: "draw" });
            }}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && !board.drawnCardThisTurn && (!turn || turn > 1)) {
                event.preventDefault();
                onAction({ type: "draw" });
              }
            }}
            onDragStart={(e) => {
              e.dataTransfer.setData("draw", "1");
              e.dataTransfer.effectAllowed = "move";
            }}
          >
            {drawCards.length > 0 ? (
              <CardThumbnail card={drawCards[0]} size="md" onMouseEnter={(e) => onCardHover?.(drawCards[0], e)} onMouseLeave={onCardHoverLeave} />
            ) : (
              <div className="w-16 h-20 rounded-lg bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:border-slate-700 flex items-center justify-center shadow-inner">
                <span className="text-[0.65rem] font-bold text-slate-600 dark:text-slate-400">{board.drawPile.length}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-16 h-20 rounded-lg bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:border-slate-700 flex items-center justify-center shadow-inner">
            <span className="text-[0.65rem] font-bold text-slate-600 dark:text-slate-400">{board.drawPile.length}</span>
          </div>
        )}
        {isTurn && board.drawPile.length > 0 ? (
          <span className="text-[0.5rem] font-bold text-emerald-600">click or drag</span>
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

function TcgActionRail({ gameState, myBoard, oppBoard, myKey, oppKey, actionPending, onAction }: {
  gameState: TcgGameState;
  myBoard: TcgPlayerState | null;
  oppBoard: TcgPlayerState | null;
  myKey: string;
  oppKey: string;
  actionPending: boolean;
  onAction: (action: TcgAction) => void;
}) {
  const activeKey = gameState.solo ? (gameState.currentPlayer || "p1") : myKey;
  const activeBoard = activeKey === myKey ? myBoard : activeKey === oppKey ? oppBoard : null;
  const isAiTurn = gameState.mode === "ai" && activeKey === "p2";
  const isActionTurn = gameState.solo ? !isAiTurn : gameState.myTurn;
  const activeLabel = gameState.solo
    ? activeKey === "p1" ? "P1" : gameState.mode === "ai" ? "AI" : "P2"
    : "You";
  const activeEnergy = activeBoard?.elementPool[0] || null;
  const canDraw = !!activeBoard && activeBoard.drawPile.length > 0 && !activeBoard.drawnCardThisTurn && gameState.turn > 1;
  const attacker = activeBoard?.board.attacker || null;
  const support = activeBoard?.board.support || [];
  const canPlace = !!activeBoard && !activeBoard.placedCardThisTurn && activeBoard.hand.length > 0 && (!attacker || support.some((card) => !card));
  const assignTargets = [
    { slot: "attacker", label: "atk", card: attacker },
    ...support.map((card, index) => ({ slot: `support_${index}`, label: `S${index + 1}`, card })),
  ].filter((target) => !!target.card);
  const canAttack = canTcgCardAttack(attacker);
  const attackReason = attacker
    ? `Attack needs 2 matching ${attacker.element || "element"} energy. ${getAssignedEnergyText(attacker)} assigned.`
    : "Place an attacker first.";
  const switchTargets = activeBoard && canTcgCardSwitch(attacker, activeBoard)
    ? support
        .map((card, index) => ({ slot: `support_${index}`, label: index + 1, card }))
        .filter((target) => !!target.card)
    : [];
  const canSwitch = switchTargets.length > 0;
  const switchReason = !attacker
    ? "Place an attacker first."
    : activeBoard?.switchedCardThisTurn
      ? "Already switched this turn."
      : support.some((card) => !!card)
        ? "Switch needs at least 1 energy on the attacker."
        : "Place a support card to switch.";
  const disabledReason = !isActionTurn
    ? isAiTurn ? "AI is taking its turn." : "Waiting for opponent."
    : actionPending
      ? "Action pending."
      : !activeBoard
        ? "Board not ready."
        : null;
  const hints = [
    canPlace ? "Click a hand card to place it." : null,
    canDraw ? "Draw is available." : null,
    activeEnergy && assignTargets.length > 0 ? `Assign ${activeEnergy} to a card.` : null,
    canAttack ? "Attack is ready." : null,
    canSwitch ? "Switch is ready." : null,
  ].filter((hint): hint is string => !!hint);

  const baseBtn = "rounded-lg border px-2.5 py-1.5 text-xs font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 w-full text-center";
  const readyBtn = `${baseBtn} border-emerald-300 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:border-pink-300 hover:text-pink-600 dark:border-emerald-300/50 dark:bg-emerald-950/40 dark:text-emerald-100`;
  const idleBtn = `${baseBtn} border-blue-200 bg-white/80 text-blue-700 dark:border-purple-300/30 dark:bg-purple-950/40 dark:text-purple-100`;
  const dangerBtn = `${baseBtn} border-red-200 bg-white/80 text-red-600 hover:bg-red-50 dark:border-red-400/30 dark:bg-red-950/20 dark:text-red-300`;
  const disabled = !!disabledReason;

  const statusText = disabledReason
    || (attacker && !canAttack ? attackReason : null)
    || (attacker && support.some((c) => !!c) && !canSwitch ? switchReason : null)
    || hints[0]
    || null;

  return (
    <div className="border-y border-sky-100 bg-sky-50/60 px-3 py-3 dark:border-purple-400/20 dark:bg-purple-950/20 space-y-3">
      {/* ── Status line ── */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {activeLabel}&apos;s turn
        </span>
        <span className="text-[0.6rem] font-semibold text-slate-400 dark:text-slate-500">
          turn {gameState.turn || 1}
        </span>
      </div>

      {/* ── Primary actions: Draw + Attack ── */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={canDraw ? readyBtn : idleBtn}
          disabled={disabled || !canDraw}
          title={disabledReason || (canDraw ? "Draw one card" : "Already drew this turn")}
          onClick={() => onAction({ type: "draw" })}
        >
          🂠 Draw
        </button>
        <button
          type="button"
          className={canAttack ? readyBtn : idleBtn}
          disabled={disabled || !canAttack}
          title={canAttack ? "Attack opponent" : attackReason}
          onClick={() => onAction({ type: "attack" })}
        >
          ⚔ Attack
        </button>
      </div>

      {/* ── Energy assignment ── */}
      {assignTargets.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[0.6rem] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">
            ⚡ assign {activeEnergy || "energy"}
          </p>
          <div className="flex gap-1.5">
            {assignTargets.map((target) => (
              <button
                key={`assign-${target.slot}`}
                type="button"
                className={activeEnergy ? readyBtn : idleBtn}
                disabled={disabled || !activeEnergy}
                title={activeEnergy ? `Assign ${activeEnergy} to ${target.label}` : "No energy available"}
                onClick={() => onAction({ type: "assign", slot: target.slot })}
              >
                {target.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Switch ── */}
      {switchTargets.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[0.6rem] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">
            🔄 switch
          </p>
          <div className="flex gap-1.5">
            {switchTargets.map((target) => (
              <button
                key={`switch-${target.slot}`}
                type="button"
                className={readyBtn}
                disabled={disabled}
                title="Switch attacker with this support card"
                onClick={() => onAction({ type: "switch", slot: target.slot })}
              >
                S{target.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Turn actions: End + Forfeit ── */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={isActionTurn && !actionPending ? readyBtn : idleBtn}
          disabled={disabled}
          title={disabledReason || "End this turn"}
          onClick={() => onAction({ type: "end" })}
        >
          ⏹ End turn
        </button>
        <button
          type="button"
          className={dangerBtn}
          disabled={actionPending}
          title="Forfeit this game"
          onClick={() => onAction({ type: "forfeit" })}
        >
          🏳 Forfeit
        </button>
      </div>

      {/* ── Hint / status message ── */}
      {statusText ? (
        <p className={`text-center text-[0.65rem] font-semibold leading-snug ${
          disabledReason || (attacker && !canAttack)
            ? "text-amber-600 dark:text-amber-300"
            : "text-emerald-700 dark:text-emerald-200"
        }`}>
          {statusText}
        </p>
      ) : null}
    </div>
  );
}

function CountdownTimer({ startMs, onExpire }: { startMs: number; onExpire?: () => void }) {
  const TURN_SECONDS = 180;
  const [left, setLeft] = useState(TURN_SECONDS);
  const startRef = useRef(startMs);
  const expiredRef = useRef(false);

  useEffect(() => {
    startRef.current = startMs;
    expiredRef.current = false;
    setLeft(TURN_SECONDS);
  }, [startMs]);

  useEffect(() => {
    let active = true;
    const update = () => {
      if (!active) return;
      const elapsed = (Date.now() - startRef.current) / 1000;
      const remaining = Math.max(0, Math.ceil(TURN_SECONDS - elapsed));
      setLeft(remaining);
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
      if (remaining > 0) setTimeout(update, 250);
    };
    const timer = setTimeout(update, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [onExpire, startMs]);

  if (left <= 0) return null;
  return (
    <p className={`text-center text-sm font-bold ${left <= 30 ? "text-red-600 animate-pulse" : "text-slate-500 dark:text-slate-300"}`}>
      ⏱ {left}s
    </p>
  );
}

function TcgMatchStatusBand({ gameState, queueState, actionPending, aiActionText, onExpire }: {
  gameState: TcgGameState;
  queueState: "idle" | "searching" | "matched";
  actionPending: boolean;
  aiActionText: string | null;
  onExpire: () => void;
}) {
  const score = `${gameState.p1Score ?? gameState.player1Score ?? 0}-${gameState.p2Score ?? gameState.player2Score ?? 0}`;
  const activeText = getActivePlayerLabel(gameState);
  const activeClass = activeText.includes("Your") || activeText.includes("P1") || activeText.includes("P2")
    ? "text-emerald-700"
    : "text-slate-500";

  return (
    <div className="border-y border-sky-100 bg-white/75 px-3 py-2 dark:border-purple-400/20 dark:bg-purple-950/20">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-bold">
        <span className={activeClass}>{activeText}</span>
        <span className="text-blue-700 dark:text-blue-200">Score {score}</span>
        <span className="text-slate-500 dark:text-slate-300">Queue {queueState === "searching" ? "searching" : gameState.solo ? "solo" : "matched"}</span>
        {gameState.turnStartedAt && gameState.phase !== "finished" ? (
          <CountdownTimer startMs={gameState.turnStartedAt} onExpire={onExpire} />
        ) : null}
        {actionPending ? <span className="text-amber-600 dark:text-amber-300">Action pending</span> : null}
      </div>
      {aiActionText || gameState.lastAction ? (
        <p className={`mt-1 text-center text-xs font-semibold ${aiActionText ? "text-purple-600 animate-pulse" : "text-slate-500"}`}>
          {aiActionText || gameState.lastAction}
        </p>
      ) : null}
    </div>
  );
}

function TcgMatchHelpRail() {
  return (
    <details className="border-y border-sky-100 bg-sky-50/40 px-3 py-2 text-xs text-blue-700 dark:border-purple-400/20 dark:bg-purple-950/20 dark:text-purple-100">
      <summary className="cursor-pointer text-center font-black">quick rules</summary>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[0.7rem] font-semibold text-slate-600 dark:text-purple-100/80">
        <span>1 attacker + 3 support</span>
        <span>Energy can go on any card</span>
        <span>Attack with 2 matching energy</span>
        <span>Off-element energy can switch</span>
        <span>First to 3 points wins</span>
      </div>
    </details>
  );
}

function MobileDragGhost({ ghost, card }: { ghost: MobileTcgGhost | null; card?: TcgCard | ArenaCard | null }) {
  if (!ghost) return null;

  const shellStyle: React.CSSProperties = {
    left: ghost.clientX,
    top: ghost.clientY,
    transform: "translate(-50%, -50%)",
    zIndex: 230002,
  };

  let content: React.ReactNode;
  if (ghost.drag.kind === "element") {
    const element = ghost.drag.element;
    content = (
      <div
        className="w-12 h-12 rounded-full border-2 flex items-center justify-center shadow-2xl ring-4 ring-white/60"
        style={{ backgroundColor: ELEMENT_COLORS[element] || "#888", borderColor: ELEMENT_COLORS[element] || "#888" }}
      >
        <img src={ELEMENT_ICONS[element] || ""} alt={element} className="w-7 h-7 object-contain" draggable={false} />
      </div>
    );
  } else if (ghost.drag.kind === "attack") {
    content = (
      <div className="rounded-lg border-2 border-amber-300 bg-slate-950/90 px-3 py-2 text-xs font-black text-amber-200 shadow-2xl">
        Attack / Switch
      </div>
    );
  } else if (ghost.drag.kind === "promote") {
    content = (
      <div className="rounded-lg border-2 border-emerald-300 bg-slate-950/90 px-3 py-2 text-xs font-black text-emerald-200 shadow-2xl">
        Promote
      </div>
    );
  } else {
    content = (
      <div className="w-16 h-20 overflow-hidden rounded-lg border-2 border-white bg-slate-200 shadow-2xl">
        <img src={card?.imageUrl || cardBack} alt="" className="h-full w-full object-cover" draggable={false} />
      </div>
    );
  }

  return createPortal(
    <div className="fixed pointer-events-none opacity-90" style={shellStyle}>
      {content}
    </div>,
    document.body,
  );
}

type TcgPageMode = "decks" | "match";

const TcgPage = ({ mode }: { mode: TcgPageMode }) => {
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
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [attackFloaters, setAttackFloaters] = useState<{ key: number; dmg: number; elLabel: string | null; elColor: string | null; defenderKey: string }[]>([]);
  const [shakeOpponent, setShakeOpponent] = useState(false);
  const [shakePlayer, setShakePlayer] = useState(false);
  const [boardDragActive, setBoardDragActive] = useState(false);
  const boardDragActiveRef = useRef(false);
  const boardElementRef = useRef<HTMLDivElement | null>(null);
  const mobileDragRef = useRef<MobileTcgDrag | null>(null);
  const mobileDragPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const [mobileDragGhost, setMobileDragGhost] = useState<MobileTcgGhost | null>(null);
  const floaterKeyRef = useRef(0);
  const [projectile, setProjectile] = useState<{ key: number; fromBoard: string; toBoard: string; fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  const projectileKeyRef = useRef(0);
  const lastAttackDedupRef = useRef<string | null>(null);

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
      if (boardDragActiveRef.current) {
        event.preventDefault();
      }
    };

    boardElement?.addEventListener("touchmove", preventBoardTouchScroll, {
      passive: false,
    });

    return () => {
      boardElement?.removeEventListener("touchmove", preventBoardTouchScroll);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overscrollBehavior = htmlOverscroll;
    };
  }, [boardDragActive]);

  // ── Load eligible cards on mount ──
  useEffect(() => {
    if (!token) return;
    fetchTcgEligibleCards(token).then(({ cards }) => setEligibleCards(cards)).catch(() => {});
  }, [token]);

  // ── Auto-resume active game on match route ──
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
      } catch {
        // Fall through to the backend active-game lookup.
      }
      if (!cancelled) clearActiveTcgGame();
      return false;
    };

    const resume = async () => {
      const savedGameId = localStorage.getItem("tcg_active_game");
      if (await resumeGameId(savedGameId)) return;

      try {
        const active = await fetchActiveTcgGame(token);
        if (!cancelled) await resumeGameId(active.gameId);
      } catch {
        // No active game is fine; the match route can show start actions.
      }
    };

    void resume();

    return () => {
      cancelled = true;
    };
  }, [mode, token]);

  const refreshActiveGameState = useCallback(async () => {
    if (!token || !gameId) return;
    try {
      const state = await fetchTcgGameState(token, gameId);
      setGameState(state);
      if (state.winner || state.phase === "finished") {
        clearActiveTcgGame();
      }
    } catch {
      // Keep the current board visible; websocket/action refresh may still recover.
    }
  }, [gameId, token]);

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
      navigate(matchPath);
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

    const deckCards = eligibleCardsRef.current.filter((c) =>
      selectedDeckRef.current.has(toCardId(c)),
    );
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
  }, [showError]);

  // ── WebSocket: queue matched ──
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
      } catch {
        // The websocket path may still succeed; keep the search UI alive.
      }
    };
    const interval = window.setInterval(() => void poll(), 2000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token, queueState, claimMatchedGame]);

  useEffect(() => {
    if (!token || !gameId || !gameState?.board || gameState.winner || gameState.phase === "finished") return;
    const interval = window.setInterval(() => void refreshActiveGameState(), 5000);
    const timeoutMs = gameState.turnStartedAt
      ? Math.max(0, gameState.turnStartedAt + 180000 - Date.now() + 300)
      : null;
    const timeout = timeoutMs == null
      ? null
      : window.setTimeout(() => void refreshActiveGameState(), timeoutMs);
    return () => {
      window.clearInterval(interval);
      if (timeout != null) window.clearTimeout(timeout);
    };
  }, [gameId, gameState?.board, gameState?.phase, gameState?.turnStartedAt, gameState?.winner, refreshActiveGameState, token]);

  // ── WebSocket: game state ──
  const handleGameState = useCallback((data: unknown) => {
    const state = data as TcgGameState;
    if (!state?.board) return;
    const currentKey = state.solo ? "p1" : (state.playerKey || "p1");
    if (state.lastAttackResult && state.lastAttackResult.attackerKey !== currentKey) {
      const ar = state.lastAttackResult;
      const dedupKey = (ar.attackId ?? `${ar.attackerKey}|${ar.damage}|${ar.defenderHp}|${ar.ko}`).toString();
      if (dedupKey !== lastAttackDedupRef.current) {
        const elColor = ar.elementEffective === "super-effective"
          ? (ar.elementAttacker ? ELEMENT_COLORS[ar.elementAttacker] : null)
          : ar.elementEffective === "not-very-effective" ? "#94a3b8" : null;
        spawnAttackFloat(ar.damage, ar.elementEffective === "super-effective" ? "Super Effective" : ar.elementEffective === "not-very-effective" ? "Weak..." : null, elColor, ar.defenderKey);
        setShakePlayer(true);
        setTimeout(() => setShakePlayer(false), 500);
        lastAttackDedupRef.current = dedupKey;
        spawnProjectile(ar.attackerKey, ar.defenderKey);
      }
    }
    setGameState(state);
  }, [spawnAttackFloat, spawnProjectile]);

  useWebSocketEvent("tcg:game:state", handleGameState);

  // ── WebSocket: game finished ──
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
      // Skip re-render if same card already shown
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
        const found = board.hand.find((card) => toCardId(card) === drag.cardId)
          || board.fullDeck?.find((card) => toCardId(card) === drag.cardId);
        if (found) return found;
      }
    }
    if (drag.kind === "promote") {
      const index = Number(drag.slot.replace("support_", ""));
      for (const board of boards) {
        const found = board.board.support[index];
        if (found) return found;
      }
    }
    if (drag.kind === "attack") {
      return myBoard?.board.attacker || oppBoard?.board.attacker || null;
    }
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
          const elColor = ar.elementEffective === "super-effective"
            ? (ar.elementAttacker ? ELEMENT_COLORS[ar.elementAttacker] : null)
            : ar.elementEffective === "not-very-effective" ? "#94a3b8" : null;
          spawnAttackFloat(ar.damage, ar.elementEffective === "super-effective" ? "Super Effective" : ar.elementEffective === "not-very-effective" ? "Weak..." : null, elColor, ar.defenderKey);
          setShakeOpponent(true);
          setTimeout(() => setShakeOpponent(false), 500);
          spawnProjectile(ar.attackerKey, ar.defenderKey);
          lastAttackDedupRef.current = dedupKey;
        }
      }
      const state = await fetchTcgGameState(token, gameId);
      if (state.winner || state.phase === "finished" || action.type === "forfeit") {
        clearActiveTcgGame();
      }
      // Immediately animate any opponent attack we haven't seen yet
      if (state.lastAttackResult && state.lastAttackResult.attackerKey !== myKey) {
        const ar = state.lastAttackResult;
        const dedupKey = (ar.attackId ?? `${ar.attackerKey}|${ar.damage}|${ar.defenderHp}|${ar.ko}`).toString();
        if (dedupKey !== lastAttackDedupRef.current) {
          const elColor = ar.elementEffective === "super-effective"
            ? (ar.elementAttacker ? ELEMENT_COLORS[ar.elementAttacker] : null)
            : ar.elementEffective === "not-very-effective" ? "#94a3b8" : null;
          spawnAttackFloat(ar.damage, ar.elementEffective === "super-effective" ? "Super Effective" : ar.elementEffective === "not-very-effective" ? "Weak..." : null, elColor, ar.defenderKey);
          setShakePlayer(true);
          setTimeout(() => setShakePlayer(false), 500);
          spawnProjectile(ar.attackerKey, ar.defenderKey);
          lastAttackDedupRef.current = dedupKey;
        }
      }
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
  }, [actionPending, gameId, myKey, showError, spawnAttackFloat, spawnProjectile, token]);
  const handleMobileTcgDrop = useCallback((drag: MobileTcgDrag, dropElement: Element | null) => {
    const dropTarget = dropElement?.closest("[data-tcg-drop-slot], [data-tcg-drop-zone]") as HTMLElement | null;
    if (!dropTarget || !gameState?.board) return;

    const dropBoardKey = dropTarget.dataset.tcgDropBoard;
    const dropBoard = dropBoardKey === myKey ? myBoard : dropBoardKey === oppKey ? oppBoard : null;
    if (!dropBoard || !dropBoardKey) return;

    const isDropBoardTurn = gameState.solo
      ? gameState.currentPlayer === dropBoardKey
      : dropBoardKey === myKey && !!gameState.myTurn;

    if (drag.kind === "draw") {
      if (isDropBoardTurn && dropTarget.dataset.tcgDropZone === "hand") {
        void handleAction({ type: "draw" });
      }
      return;
    }

    const slot = dropTarget.dataset.tcgDropSlot;
    if (!slot) return;
    const targetCard = slot === "attacker"
      ? dropBoard.board.attacker
      : dropBoard.board.support[Number(slot.replace("support_", ""))] || null;

    if (drag.kind === "card") {
      if (!isDropBoardTurn) return;
      if (slot === "attacker" && !dropBoard.board.attacker && dropBoard.board.support.every((support) => !support)) {
        void handleAction({ type: "place", cardId: drag.cardId, slot: "attacker" });
      } else if (slot.startsWith("support_") && !targetCard) {
        void handleAction({ type: "place", cardId: drag.cardId, slot });
      }
      return;
    }

    if (drag.kind === "promote") {
      if (isDropBoardTurn && slot === "attacker" && !dropBoard.board.attacker) {
        void handleAction({ type: "promote", slot: drag.slot });
      }
      return;
    }

    if (drag.kind === "element") {
      if (isDropBoardTurn && targetCard) {
        void handleAction({ type: "assign", slot });
      }
      return;
    }

    if (drag.kind === "attack") {
      if (!isDropBoardTurn && slot === "attacker" && targetCard) {
        void handleAction({ type: "attack" });
      } else if (isDropBoardTurn && slot.startsWith("support_") && targetCard) {
        void handleAction({ type: "switch", slot });
      }
    }
  }, [gameState, handleAction, myBoard, myKey, oppBoard, oppKey]);

  const deckDuplicateIds = useMemo(() => {
    const counts = new Map<number, number>();
    for (const card of eligibleCards) {
      counts.set(card.malId, (counts.get(card.malId) || 0) + 1);
    }
    return new Set(
      Array.from(counts)
        .filter(([, count]) => count > 1)
        .map(([malId]) => malId),
    );
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
      return (
        card.title.toLowerCase().includes(search) ||
        card.rarity.toLowerCase().includes(search) ||
        String(card.malId).includes(search)
      );
    });
    return sortDeckCards(filtered, deckSort);
  }, [deckDuplicateIds, deckDuplicatesFilter, deckFilterEl, deckSearch, deckSort, eligibleCards, selectedDeck]);
  const hasDeckFilters = deckSearch.trim().length > 0 || !!deckFilterEl || deckDuplicatesFilter;

  return (
    <div className="min-h-screen flex flex-col font-[sans-serif] text-blue-900">
      {/* Staging modal */}
      {showStagingModal ? (
        <ConfirmDialog
          title="Staging Area"
          message={<>You are on the <strong>staging stage</strong> of the website. Expect bugs, broken features, and unfinished content.<br /><br />Contact <span className="font-semibold text-pink-600">Mira</span> if you encounter any bugs.</>}
          confirmLabel="I Understand"
          cancelLabel="Go Back"
          onConfirm={() => {
            saveTcgStagingAcknowledgement();
            setShowStagingModal(false);
          }}
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
            <section className="card-border space-y-3 sm:space-y-4 bg-white/60 p-3 sm:p-4 dark:bg-purple-950/20">
              {/* Projectile overlay */}
              {projectile ? (
                <div
                  key={projectile.key}
                  className="animate-projectile-fly"
                  style={{
                    '--proj-from-x': `${projectile.fromX}px`,
                    '--proj-from-y': `${projectile.fromY}px`,
                    '--proj-to-x': `${projectile.toX}px`,
                    '--proj-to-y': `${projectile.toY}px`,
                  } as React.CSSProperties}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 shadow-[0_0_12px_rgba(251,191,36,0.8)]"
                    style={{ marginLeft: -8, marginTop: -8 }}
                  />
                </div>
              ) : null}
              <MobileDragGhost ghost={mobileDragGhost} card={mobileDragGhostCard} />
              <h2 className="text-2xl sm:text-4xl font-bold text-blue-900">TCG Showdown</h2>
              <ArenaSubNav />
              {!showStagingModal ? (
                <p className="text-center text-xs font-semibold text-amber-700 dark:text-amber-200">
                  Alpha build: matches and deck tools may still change.
                </p>
              ) : null}

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800 text-center">
                  <p className="font-semibold">Sign in required to access TCG.</p>
                  <Link to="/login" className="mt-2 inline-block underline font-bold text-pink-600">go to login</Link>
                </div>
              ) : (
                <>
                  {/* ── Decks Route ── */}
                  {mode === "decks" ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 pb-3 dark:border-purple-400/20">
                        <div>
                          <p className="text-sm font-black text-blue-800 dark:text-purple-100">
                            Deck readiness: {selectedDeck.size}/{DECK_SIZE}
                          </p>
                          <p className="text-xs font-semibold text-slate-500">
                            {selectedDeck.size >= DECK_SIZE ? "Ready to play." : `${DECK_SIZE - selectedDeck.size} more card${DECK_SIZE - selectedDeck.size === 1 ? "" : "s"} needed.`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleStartSolo("solo")}
                            disabled={loading || selectedDeck.size < DECK_SIZE}
                            className="arena-redraw-button hover:animate-wiggle text-xs"
                          >
                            {loading ? "[ Starting... ]" : "[ Play Solo ]"}
                          </button>
                          <button
                            onClick={() => handleStartSolo("ai")}
                            disabled={loading || selectedDeck.size < DECK_SIZE}
                            className="arena-redraw-button hover:animate-wiggle text-xs"
                          >
                            {loading ? "[ Starting... ]" : "[ Play AI ]"}
                          </button>
                          <button
                            onClick={handleFindMatch}
                            disabled={loading || selectedDeck.size < DECK_SIZE}
                            className="arena-redraw-button hover:animate-wiggle text-xs"
                          >
                            {loading ? "[ Searching... ]" : "[ Find Match ]"}
                          </button>
                        </div>
                      </div>
                      {/* Selected deck — horizontal scroll */}
                      {selectedDeck.size > 0 ? (
                        <div className="border border-blue-200 rounded-xl bg-blue-50/60 p-3 dark:border-purple-400/20 dark:bg-purple-950/30">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-blue-700 dark:text-purple-100">
                              Your Deck ({selectedDeck.size}/{DECK_SIZE})
                            </p>
                            <div className="flex items-center gap-1">
                              <span className="text-[0.55rem] font-semibold text-slate-500 dark:text-slate-400">elements:</span>
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
                            {selectedDeckCards.map((card) => {
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
                      <div className="flex flex-wrap items-center gap-2 bg-amber-50/60 border border-amber-200 rounded-lg p-2 dark:bg-amber-950/20 dark:border-amber-800/40">
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-200">⚡ Elements to spawn:</span>
                        {ELEMENTS.map((el) => {
                          const active = elementPool.includes(el);
                          return (
                            <button
                              key={el}
                              type="button"
                              aria-pressed={active}
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
                              className={`text-xs font-bold px-2.5 py-1 rounded-full border-2 transition hover:scale-105 ${
                                active
                                  ? "ring-2 ring-amber-300 ring-offset-1 shadow-md"
                                  : "opacity-70 hover:opacity-100"
                              }`}
                            >
                              {active ? "✓ " : ""}
                              {el}
                            </button>
                          );
                        })}
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm text-blue-600 dark:text-purple-100/70">
                            Cards available: {filteredDeckCards.length}
                          </p>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                          <label htmlFor="tcg-deck-sort" className="sr-only">
                            Sort deck cards
                          </label>
                          <span className="text-xs text-slate-500 dark:text-slate-400">sort:</span>
                          <select
                            id="tcg-deck-sort"
                            value={deckSort}
                            onChange={(event) => setDeckSort(event.target.value as CollectionSort)}
                            className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-purple-400/30 dark:bg-purple-950/40 dark:text-purple-100"
                          >
                            <option value="recent">Recent</option>
                            <option value="rarity-desc">Rarity ▼</option>
                            <option value="rarity-asc">Rarity ▲</option>
                            <option value="iv-desc">IV ▼</option>
                            <option value="iv-asc">IV ▲</option>
                            <option value="power-desc">Power ▼</option>
                            <option value="guard-desc">Guard ▼</option>
                            <option value="speed-desc">Speed ▼</option>
                            <option value="effectHit-desc">Effect Hit ▼</option>
                          </select>
                          <input
                            id="tcg-deck-search"
                            type="search"
                            value={deckSearch}
                            onChange={(event) => setDeckSearch(event.target.value)}
                            placeholder="Lelouch Lamperouge..."
                            className="w-48 rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700 dark:border-purple-400/30 dark:bg-purple-950/40 dark:text-purple-100"
                          />
                          {hasDeckFilters ? (
                            <button
                              type="button"
                              onClick={() => {
                                setDeckSearch("");
                                setDeckFilterEl("");
                                setDeckDuplicatesFilter(false);
                              }}
                              className="arena-redraw-button text-xs"
                            >
                              [ clear filters ]
                            </button>
                          ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">element:</span>
                          {ELEMENTS.map((el) => {
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
                                className="text-xs font-bold px-2 py-0.5 rounded-full border transition"
                              >
                                {el}
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">show:</span>
                          <button
                            type="button"
                            onClick={() => setDeckDuplicatesFilter((prev) => !prev)}
                            className={`text-xs font-bold px-2 py-0.5 rounded-full border transition ${
                              deckDuplicatesFilter
                                ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-300"
                                : "text-purple-500 border-purple-300 hover:bg-purple-50"
                            }`}
                          >
                            duplicates only
                          </button>
                        </div>
                      </div>

                      {eligibleCards.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">Loading cards...</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 max-h-96 overflow-y-auto select-none" onContextMenu={(e) => e.preventDefault()}>
                            {filteredDeckCards.map((card) => {
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
                          {filteredDeckCards.length === 0 ? (
                            <p className="text-sm text-slate-600 dark:text-slate-400">No cards match your search.</p>
                          ) : null}
                        </>
                      )}
                      <div className="flex gap-2 justify-center">
                        {selectedDeck.size > 0 ? (
                          <button
                            onClick={() => { setSelectedDeck(new Set()); saveDeck([]); }}
                            className="arena-redraw-button hover:animate-wiggle text-xs"
                          >
                            [ Clear deck ]
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* ── Match Route ── */}
                  {mode === "match" ? (
                    <>
                      {/* No game active — show start button */}
                      {!gameId && queueState !== "searching" ? (
                        <div className="space-y-4 text-center">
                          <p className="text-lg font-bold text-blue-700 dark:text-blue-200">TCG Showdown</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            {selectedDeck.size >= DECK_SIZE
                              ? "Deck ready!"
                              : (
                                <>
                                  Need {DECK_SIZE} cards in your deck.{" "}
                                  <Link to={decksPath} className="font-bold text-pink-600 underline">
                                    Go to Decks
                                  </Link>
                                  .
                                </>
                              )}
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
                          <p className="text-lg font-bold text-blue-700 dark:text-blue-200 animate-pulse">Searching for opponent...</p>
                          <button onClick={handleCancelQueue} className="arena-redraw-button hover:animate-wiggle">
                            [ Cancel ]
                          </button>
                        </div>
                      ) : null}

                      {/* Game Board */}
                      {gameId && gameState?.board && !gameState?.winner ? (
                          <div
                            ref={boardElementRef}
                            className="space-y-2 overscroll-contain touch-pan-x select-none sm:space-y-4"
                            data-tcg-board="true"
                            onContextMenu={(e) => e.preventDefault()}
                            onDragStartCapture={startBoardDrag}
                            onDragEndCapture={stopBoardDrag}
                            onDropCapture={stopBoardDrag}
                            onTouchStartCapture={(e) => {
                              const drag = readMobileTcgDrag(e.target);
                              if (drag) {
                                const touch = e.touches[0];
                                const point = touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
                                mobileDragRef.current = drag;
                                mobileDragPointRef.current = point;
                                setMobileDragGhost(point ? { drag, ...point } : null);
                                startBoardDrag();
                              }
                            }}
                            onTouchMoveCapture={(e) => {
                              if (!mobileDragRef.current) return;
                              const touch = e.touches[0];
                              if (touch) {
                                mobileDragPointRef.current = { clientX: touch.clientX, clientY: touch.clientY };
                                setMobileDragGhost((prev) => prev ? { ...prev, clientX: touch.clientX, clientY: touch.clientY } : null);
                              }
                            }}
                            onTouchEndCapture={(e) => {
                              const drag = mobileDragRef.current;
                              const touch = e.changedTouches[0];
                              const point = touch ? { clientX: touch.clientX, clientY: touch.clientY } : mobileDragPointRef.current;
                              mobileDragRef.current = null;
                              mobileDragPointRef.current = null;
                              setMobileDragGhost(null);
                              stopBoardDrag();
                              if (drag && point) {
                                handleMobileTcgDrop(drag, document.elementFromPoint(point.clientX, point.clientY));
                              }
                            }}
                            onTouchCancelCapture={() => {
                              mobileDragRef.current = null;
                              mobileDragPointRef.current = null;
                              setMobileDragGhost(null);
                              stopBoardDrag();
                            }}
                          >
                            {/* Top Player (P2 in solo, Opponent in PvP) */}
                          {gameState.solo ? (
                            <div className={`border-y p-2 sm:p-3 ${gameState.currentPlayer === "p2" ? "border-blue-300 bg-blue-50/70 dark:border-purple-400/30 dark:bg-purple-950/30" : "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/30"}`}>
                              <p className="text-xs font-bold text-center mb-2">
                                <span className={gameState.currentPlayer === "p2" ? "text-blue-700 dark:text-blue-200" : "text-slate-500 dark:text-slate-300"}>
                                  P2{gameState.currentPlayer === "p2" ? " (active)" : ""}{gameState.mode === "ai" ? " 🤖" : ""}
                                </span>
                                {" · Score: "}{gameState.p2Score}
                              </p>
                              {gameState.elementPools?.[oppKey] && gameState.elementPools[oppKey].length > 0 ? (
                                <div className="flex items-center justify-center gap-1 mb-1">
                                  <span className="text-[0.5rem] text-slate-400 dark:text-slate-500">pool:</span>
                                  {gameState.elementPools[oppKey].map((el) => (
                                    <img key={el} alt={el} src={ELEMENT_ICONS[el]} className="w-4 h-4 drop-shadow-sm" title={el} />
                                  ))}
                                </div>
                              ) : null}
                              <div className="flex items-center justify-center gap-1 mb-2">
                                <span className="text-[0.5rem] text-slate-400 dark:text-slate-500">active energy:</span>
                                {oppBoard && oppBoard.elementPool.length > 0
                                  ? oppBoard.elementPool.map((el, i) => (
                                      <img key={i} alt={el} src={ELEMENT_ICONS[el] || ""} className="w-4 h-4 drop-shadow-sm" title={el} />
                                    ))
                                  : <span className="text-slate-400 text-[0.65rem] dark:text-slate-500">none</span>}
                              </div>
                                <div className="relative mx-auto w-fit max-w-full">
                                  <div className="static mb-2 flex justify-center sm:absolute sm:top-0 sm:left-full sm:mb-0 sm:ml-2">
                                    {oppBoard && oppBoard.elementPool.length > 0 && gameState.solo && gameState.currentPlayer === "p2" ? (
                                      (() => {
                                        const el = oppBoard.elementPool[0];
                                        const hasTarget = !!oppBoard.board.attacker || oppBoard.board.support.some((s) => !!s);
                                        return (
                                          <div
                                            className={`w-10 h-10 touch-none select-none rounded-full border-2 flex items-center justify-center text-sm font-bold text-white shadow-lg cursor-grab active:cursor-grabbing ${hasTarget ? "ring-2 ring-yellow-400 ring-offset-1" : ""}`}
                                            style={{ backgroundColor: ELEMENT_COLORS[el] || "#888", borderColor: ELEMENT_COLORS[el] || "#888" }}
                                            title={`Drag ${el} energy to a card`}
                                            draggable
                                            data-tcg-draggable="true"
                                            data-tcg-drag-kind="element"
                                            data-tcg-element={el}
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
                                    <BoardHand board={oppBoard} isTurn={gameState.solo && gameState.currentPlayer === "p2"} mirror onAction={gameState.solo ? handleAction : undefined} boardKey={oppKey} onCardHover={onCardHover} onCardHoverLeave={onCardHoverLeave} />
                                    <div className="mt-4">
                                      <PlayerBoard
                                        board={oppBoard}
                                        isTurn={gameState.solo && gameState.currentPlayer === "p2"}
                                      onAction={handleAction}
                                      mirror
                                      boardKey={oppKey}
                                      shakeOpponentCard={shakeOpponent}
                                      attackFloaters={attackFloaters}
                                      onCardHover={onCardHover}
                                      onCardHoverLeave={onCardHoverLeave}
                                    />
                                    </div>
                                  </div>
                                  <div className="static mt-2 flex justify-center sm:absolute sm:top-0 sm:right-full sm:mt-0 sm:mr-2">
                                      <BoardPiles board={oppBoard} isTurn={gameState.solo && gameState.currentPlayer === "p2"} onAction={gameState.solo ? handleAction : undefined} turn={gameState.turn} onCardHover={onCardHover} onCardHoverLeave={onCardHoverLeave} />
                                  </div>
                                </div>
                              </div>
                          ) : (
                            <div className="border-y border-slate-200 p-2 sm:p-3 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/30">
                              <p className="text-xs font-bold text-slate-500 dark:text-slate-300 mb-1 text-center">
                                {gameState?.opponentName || "Opponent"} · Score: {gameState?.p2Score ?? gameState?.player2Score ?? 0}
                              </p>
                              {gameState.elementPools?.[oppKey] && gameState.elementPools[oppKey].length > 0 ? (
                                <div className="flex items-center justify-center gap-1 mb-1">
                                  <span className="text-[0.5rem] text-slate-400 dark:text-slate-500">pool:</span>
                                  {gameState.elementPools[oppKey].map((el) => (
                                    <img key={el} alt={el} src={ELEMENT_ICONS[el]} className="w-4 h-4 drop-shadow-sm" title={el} />
                                  ))}
                                </div>
                              ) : null}
                              <div className="flex items-center justify-center gap-1 mb-2">
                                <span className="text-[0.5rem] text-slate-400 dark:text-slate-500">active energy:</span>
                                {oppBoard && oppBoard.elementPool.length > 0
                                  ? oppBoard.elementPool.map((el, i) => (
                                      <img key={i} alt={el} src={ELEMENT_ICONS[el] || ""} className="w-4 h-4 drop-shadow-sm" title={el} />
                                    ))
                                  : <span className="text-slate-400 text-[0.65rem] dark:text-slate-500">none</span>}
                              </div>
                                  <div className="relative mx-auto w-fit max-w-full">
                                    <div>
                                      <PlayerBoard
                                        board={oppBoard}
                                        isTurn={false}
                                        onAction={handleAction}
                                        mirror
                                        boardKey={oppKey}
                                        shakeOpponentCard={shakeOpponent}
                                        attackFloaters={attackFloaters}
                                        onCardHover={onCardHover}
                                        onCardHoverLeave={onCardHoverLeave}
                                      />
                                      <p className="text-xs text-slate-400 mt-1 text-center dark:text-slate-500">
                                        Hand: {oppBoard?.hand.length ?? 0}
                                      </p>
                                    </div>
                                    <div className="static mt-2 flex justify-center sm:absolute sm:top-0 sm:right-full sm:mt-0 sm:mr-2">
                                    <BoardPiles board={oppBoard} isTurn={gameState.solo && gameState.currentPlayer === "p2"} onAction={gameState.solo ? handleAction : undefined} turn={gameState.turn} onCardHover={onCardHover} onCardHoverLeave={onCardHoverLeave} />
                                  </div>
                              </div>
                            </div>
                          )}

                          {/* Bottom Player (P1 in solo, You in PvP) */}
                            <div className={`border-y p-2 sm:p-3 ${gameState.solo && gameState.currentPlayer === "p1" ? "border-blue-300 bg-blue-50/80 dark:border-purple-400/30 dark:bg-purple-950/40" : "border-blue-200 bg-blue-50/70 dark:border-purple-400/20 dark:bg-purple-950/30"}`}>
                            <p className="text-xs font-bold text-center mb-2">
                              {gameState.solo ? (
                                <span className={gameState.currentPlayer === "p1" ? "text-blue-700 dark:text-blue-200" : "text-slate-500 dark:text-slate-300"}>
                                  P1{gameState.currentPlayer === "p1" ? " (active)" : ""}
                                </span>
                              ) : <span className="dark:text-purple-100">You</span>}
                              <span className="dark:text-slate-300">{" · Score: "}{gameState.p1Score}</span>
                            </p>
                            {gameState.elementPools?.[myKey] && gameState.elementPools[myKey].length > 0 ? (
                              <div className="flex items-center justify-center gap-1 mb-1">
                                <span className="text-[0.5rem] text-slate-400 dark:text-slate-500">pool:</span>
                                {gameState.elementPools[myKey].map((el) => (
                                  <img key={el} alt={el} src={ELEMENT_ICONS[el]} className="w-4 h-4 drop-shadow-sm" title={el} />
                                ))}
                              </div>
                            ) : null}
                            <div className="flex items-center justify-center gap-1 mb-2">
                              <span className="text-[0.5rem] text-slate-400 dark:text-slate-500">active energy:</span>
                              {myBoard && myBoard.elementPool.length > 0
                                ? myBoard.elementPool.map((el, i) => (
                                    <img key={i} alt={el} src={ELEMENT_ICONS[el] || ""} className="w-4 h-4 drop-shadow-sm" title={el} />
                                  ))
                                : <span className="text-slate-400 text-[0.65rem] dark:text-slate-500">none</span>}
                            </div>
                            <div className="relative mx-auto w-fit max-w-full">
                              <div className="static mb-2 flex justify-center sm:absolute sm:top-0 sm:right-full sm:mb-0 sm:mr-2">
                                {myBoard && myBoard.elementPool.length > 0 && (gameState.solo ? gameState.currentPlayer === "p1" : gameState?.myTurn) ? (
                                  (() => {
                                    const el = myBoard.elementPool[0];
                                    const hasTarget = !!myBoard.board.attacker || myBoard.board.support.some((s) => !!s);
                                    return (
                                      <div
                                        className={`w-10 h-10 touch-none select-none rounded-full border-2 flex items-center justify-center text-sm font-bold text-white shadow-lg cursor-grab active:cursor-grabbing ${hasTarget ? "ring-2 ring-yellow-400 ring-offset-1" : ""}`}
                                        style={{ backgroundColor: ELEMENT_COLORS[el] || "#888", borderColor: ELEMENT_COLORS[el] || "#888" }}
                                        title={`Drag ${el} energy to a card`}
                                        draggable
                                        data-tcg-draggable="true"
                                        data-tcg-drag-kind="element"
                                        data-tcg-element={el}
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
                                  boardKey={myKey}
                                  shakePlayerCard={shakePlayer}
                                  attackFloaters={attackFloaters}
                                  onCardHover={onCardHover}
                                  onCardHoverLeave={onCardHoverLeave}
                                />
                                <BoardHand board={myBoard} isTurn={gameState.solo ? gameState.currentPlayer === "p1" : gameState.myTurn} onAction={handleAction} boardKey={myKey} onCardHover={onCardHover} onCardHoverLeave={onCardHoverLeave} />
                              </div>
                              <div className="static mt-2 flex justify-center sm:absolute sm:top-0 sm:left-full sm:mt-0 sm:ml-2">
                                <BoardPiles board={myBoard} isTurn={gameState.solo ? gameState.currentPlayer === "p1" : gameState.myTurn} onAction={handleAction} turn={gameState.turn} onCardHover={onCardHover} onCardHoverLeave={onCardHoverLeave} />
                              </div>
                            </div>
                          </div>

                        </div>
                      ) : null}

                      {/* Finished */}
                      {gameState?.winner ? (
                        <div className="space-y-3 border-y border-sky-100 bg-white/75 py-5 text-center dark:border-purple-400/20 dark:bg-purple-950/20">
                          <p className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-slate-300">match finished</p>
                          <p className="text-2xl font-bold text-blue-700 dark:text-blue-200">
                            {gameState.winner === myKey ? "You Win!" : "You Lose!"}
                          </p>
                          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                            Final score: {gameState.p1Score}-{gameState.p2Score}
                          </p>
                          {gameState.lastAction ? (
                            <p className="mx-auto max-w-xl px-3 text-xs font-semibold text-slate-500 dark:text-slate-300">{gameState.lastAction}</p>
                          ) : null}
                          <div className="flex flex-wrap justify-center gap-2">
                            <button onClick={() => { setGameId(null); setGameState(null); clearActiveTcgGame(); }} className="arena-redraw-button hover:animate-wiggle">
                              [ Play again ]
                            </button>
                            <Link
                              to={decksPath}
                              onClick={() => { setGameId(null); setGameState(null); clearActiveTcgGame(); }}
                              className="arena-redraw-button hover:animate-wiggle"
                            >
                              [ Back to decks ]
                            </Link>
                          </div>
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
            {/* Hover tooltip rendered via portal to document.body — escapes .card-border CSS stacking */}
            <CardDetailTooltip detail={hoverDetail} />
            <Divider />
          </main>

          <aside className="w-full space-y-4 sm:block lg:w-1/5">
            <div className="sticky top-4 space-y-4">
              {/* Match mode: score, controls, and rules */}
              {mode === "match" && gameId && gameState?.board && !gameState?.winner ? (
                <>
                  <div className="right-side-panel rounded-xl border border-blue-300 bg-white/80 p-3 opacity-95 shadow-md dark:border-purple-400/30 dark:bg-purple-950/40">
                    <h2 className="text-center text-sm font-bold text-blue-700 mb-2 dark:text-purple-100">score board</h2>
                    <TcgMatchStatusBand
                      gameState={gameState}
                      queueState={queueState}
                      actionPending={actionPending}
                      aiActionText={aiActionText}
                      onExpire={refreshActiveGameState}
                    />
                  </div>
                  <div className="right-side-panel rounded-xl border border-blue-300 bg-white/80 p-3 opacity-95 shadow-md dark:border-purple-400/30 dark:bg-purple-950/40">
                    <h2 className="text-center text-sm font-bold text-blue-700 mb-2 dark:text-purple-100">controls</h2>
                    <TcgActionRail
                      gameState={gameState}
                      myBoard={myBoard}
                      oppBoard={oppBoard}
                      myKey={myKey}
                      oppKey={oppKey}
                      actionPending={actionPending}
                      onAction={handleAction}
                    />
                  </div>
                  <div className="right-side-panel rounded-xl border border-blue-300 bg-sky-50/60 p-3 opacity-95 shadow-md dark:border-purple-400/30 dark:bg-purple-950/30">
                    <h2 className="text-center text-sm font-bold text-blue-700 mb-2 dark:text-purple-100">rules</h2>
                    <TcgMatchHelpRail />
                  </div>
                </>
              ) : (
                <>
                  <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md dark:border-purple-400/30 dark:bg-purple-950/40 dark:text-purple-100">
                    <h2 className="text-center text-lg font-bold text-blue-700 mb-2 dark:text-purple-100">weakness chart</h2>
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
                  <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md dark:border-purple-400/30 dark:bg-purple-950/40">
                    <div className="space-y-2 text-sm text-blue-600 dark:text-purple-100/80">
                      <h2 className="text-center text-lg font-bold text-blue-700 dark:text-purple-100">tcg rules</h2>
                      <p>10-card deck. 1 attacker + 3 support.</p>
                      <p>Energy can go on any card.</p>
                      <p>Attack with 2 matching energy.</p>
                      <p>Off-element energy can switch.</p>
                      <p>Each turn spawns 1 random element type.</p>
                      <p>Super-effective = 3x damage!</p>
                      <p>First to 3 points wins.</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default TcgPage;
