// Shared by every read-only Arena fight view (spectate, replay) — the
// fighter's own live Battle page (ArenaFight.tsx) has a richer version with
// shield rendering and isn't touched here, on purpose.
const ArenaHpBar = ({
  current,
  max,
  label,
}: {
  current: number;
  max: number;
  label: string;
}) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const color = pct > 60 ? "bg-emerald-500" : pct > 30 ? "bg-amber-400" : "bg-red-500";

  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-blue-500">{label}</p>
      <div
        className="h-5 w-full overflow-hidden rounded-full border border-slate-300 bg-slate-200"
        aria-label={`${label}: ${current} of ${max}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default ArenaHpBar;
