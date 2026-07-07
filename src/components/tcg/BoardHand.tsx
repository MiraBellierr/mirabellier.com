import type { ArenaCard, TcgCard, TcgPlayerState } from "@/lib/arena";
import { toCardId } from "@/lib/tcg-utils";
import { type TcgAction } from "@/lib/tcg-constants";
import CardThumbnail from "@/components/tcg/CardThumbnail";
import ZoneLabel from "@/components/tcg/ZoneLabel";

export default function BoardHand({ board, isTurn, mirror, onAction, boardKey, onCardHover, onCardHoverLeave }: {
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
