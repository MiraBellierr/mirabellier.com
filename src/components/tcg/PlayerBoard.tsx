import type { ArenaCard, TcgCard, TcgPlayerState } from "@/lib/arena";
import { canTcgCardAttack, canTcgCardSwitch } from "@/lib/tcg-utils";
import { type TcgAction } from "@/lib/tcg-constants";
import CardThumbnail from "@/components/tcg/CardThumbnail";
import ZoneLabel from "@/components/tcg/ZoneLabel";

export default function PlayerBoard({ board, isTurn, onAction, mirror, shakeOpponentCard, shakePlayerCard, attackFloaters, boardKey, onCardHover, onCardHoverLeave }: {
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
            const atk = e.dataTransfer.types.length > 0;
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
