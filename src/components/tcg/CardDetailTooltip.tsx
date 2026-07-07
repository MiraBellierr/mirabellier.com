import { createPortal } from "react-dom";
import type { ArenaCard, TcgCard } from "@/lib/arena";
import { ELEMENT_COLORS, ELEMENT_ICONS } from "@/lib/tcg-constants";

export default function CardDetailTooltip({ detail }: {
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
