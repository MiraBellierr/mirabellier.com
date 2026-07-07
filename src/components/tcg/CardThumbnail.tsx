import cardBack from "@/assets/back-card-design.jpg";
import type { ArenaCard, TcgCard } from "@/lib/arena";
import { ELEMENT_COLORS, ELEMENT_ICONS, type MobileTcgDrag } from "@/lib/tcg-constants";

export default function CardThumbnail({ card, size = "sm", onClick, highlighted, draggable, touchDrag, onDragStart, onMouseEnter, onMouseLeave }: {
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
