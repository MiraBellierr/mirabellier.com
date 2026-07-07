import { createPortal } from "react-dom";
import cardBack from "@/assets/back-card-design.jpg";
import type { ArenaCard, TcgCard } from "@/lib/arena";
import { ELEMENT_COLORS, ELEMENT_ICONS, type MobileTcgGhost } from "@/lib/tcg-constants";

export default function MobileDragGhost({ ghost, card }: { ghost: MobileTcgGhost | null; card?: TcgCard | ArenaCard | null }) {
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
