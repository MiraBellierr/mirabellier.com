// Shared by every read-only Arena fight view (spectate, replay) — mirrors
// the fighter's own live Battle page's local `HpBar` in ArenaFight.tsx
// exactly, `shield` included, so those views look identical.
const ArenaHpBar = ({
  current,
  max,
  shield = 0,
  label,
}: {
  current: number;
  max: number;
  shield?: number;
  label: string;
}) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const shieldPct = max > 0 && shield > 0 ? Math.min(100, (shield / max) * 100) : 0;
  const color = pct > 60 ? "bg-emerald-500" : pct > 30 ? "bg-amber-400" : "bg-red-500";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold">
        <p className="text-blue-500">{label}</p>
        {shield > 0 ? <p className="text-cyan-600">Shield +{shield}</p> : null}
      </div>
      <div
        className="relative h-5 w-full overflow-hidden rounded-full border border-slate-300 bg-slate-200"
        aria-label={`${label}: ${current} of ${max}${shield > 0 ? `, shield ${shield}` : ""}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
        {shield > 0 ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 rounded-full border-2 border-cyan-400 shadow-[inset_0_0_5px_rgba(34,211,238,0.9),0_0_6px_rgba(34,211,238,0.65)] transition-all duration-500 ease-out"
            style={{ width: `${shieldPct}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <p className="text-xs text-slate-600 mt-0.5">
        {current} / {max}
      </p>
    </div>
  );
};

export default ArenaHpBar;
