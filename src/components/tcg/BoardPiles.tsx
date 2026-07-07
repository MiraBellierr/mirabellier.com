import type { ArenaCard, TcgCard, TcgPlayerState } from "@/lib/arena";
import { toCardId } from "@/lib/tcg-utils";
import { ELEMENT_COLORS, type TcgAction } from "@/lib/tcg-constants";
import CardThumbnail from "@/components/tcg/CardThumbnail";
import ZoneLabel from "@/components/tcg/ZoneLabel";

export default function BoardPiles({ board, isTurn, onAction, turn, onCardHover, onCardHoverLeave }: {
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
