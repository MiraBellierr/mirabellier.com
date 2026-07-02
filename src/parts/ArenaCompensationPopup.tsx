import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

import { useAuth } from "@/states/AuthContext";
import { joinApi } from "@/lib/config";
import { readApiError, makeAuthHeaders } from "@/lib/arena/shared";

type CompensationRewardSummary = {
  coins: number;
  cards: Array<{
    title: string;
    rarity: string;
    ivTotal: number;
  }>;
  equipment: Array<{
    slot: string;
    name: string;
    mainStatType: string;
    mainStatValue: number;
    subStats?: Array<{
      type: string;
      value: number;
    }>;
  }>;
};

type ArenaCompensationReceipt = {
  id: string;
  title: string;
  message: string;
  rewards: CompensationRewardSummary;
  createdAt: string;
  claimedAt: string;
};

function isArenaPath(pathname: string) {
  return pathname === "/arena"
    || pathname.startsWith("/arena/")
    || pathname === "/ar"
    || pathname.startsWith("/ar/");
}

function groupByTitle<T extends { title?: string; name?: string }>(
  items: T[],
  key: "title" | "name",
) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const label = String(item[key] || "Reward");
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()];
}

function statLabel(value: string) {
  if (value === "critRate") return "Crit Rate";
  if (value === "critDmg") return "Crit DMG";
  if (value === "effectHit") return "Effect Hit";
  if (value === "hpPct") return "HP%";
  if (value === "dmgPct") return "DMG%";
  if (value === "defendPct") return "DEF%";
  if (value === "power") return "Power";
  if (value === "guard") return "Guard";
  if (value === "speed") return "Speed";
  if (value === "hp") return "HP";
  return value || "Main Stat";
}

function formatSubStats(
  subStats: NonNullable<CompensationRewardSummary["equipment"][number]["subStats"]>,
) {
  return subStats
    .map((subStat) => `${statLabel(subStat.type)} +${subStat.value}`)
    .join(", ");
}

export default function ArenaCompensationPopup() {
  const { pathname } = useLocation();
  const auth = useAuth();
  const token = auth.token;
  const [receipts, setReceipts] = useState<ArenaCompensationReceipt[]>([]);
  const requestedKeys = useRef<Set<string>>(new Set());
  const activeReceipt = receipts[0] || null;

  const routeKey = useMemo(() => {
    if (!isArenaPath(pathname)) return "";
    return `${auth.user?.id || "anon"}:${pathname}`;
  }, [auth.user?.id, pathname]);

  useEffect(() => {
    if (!token || !routeKey) return;
    if (requestedKeys.current.has(routeKey)) return;
    requestedKeys.current.add(routeKey);

    let cancelled = false;
    fetch(joinApi("/arena/compensations/claim"), {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw await readApiError(response);
        return response.json() as Promise<{ compensations?: ArenaCompensationReceipt[] }>;
      })
      .then((payload) => {
        if (cancelled) return;
        const next = Array.isArray(payload.compensations)
          ? payload.compensations
          : [];
        if (next.length > 0) {
          setReceipts((current) => [...current, ...next]);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [routeKey, token]);

  useEffect(() => {
    if (!activeReceipt) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setReceipts((current) => current.slice(1));
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeReceipt]);

  if (!activeReceipt || typeof document === "undefined") return null;

  const rewards = activeReceipt.rewards;
  const cardGroups = groupByTitle(rewards.cards || [], "title");
  const equipmentGroups = groupByTitle(rewards.equipment || [], "name");
  const firstEquipment = rewards.equipment?.[0] || null;

  return createPortal(
    <div
      className="fixed inset-0 z-[240000] flex items-center justify-center bg-white/60 p-4 backdrop-blur-sm dark:bg-slate-950/75"
      onClick={() => setReceipts((current) => current.slice(1))}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="arena-compensation-title"
        className="card-border w-full max-w-md rounded-2xl bg-white/95 p-5 text-center shadow-2xl dark:bg-slate-900/95"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-500">
              Arena gift
            </p>
            <h2
              id="arena-compensation-title"
              className="mt-1 text-2xl font-bold text-blue-700 dark:text-purple-100"
            >
              {activeReceipt.title}
            </h2>
          </div>

          <p className="text-sm text-blue-700 dark:text-purple-100">
            {activeReceipt.message}
          </p>

          <div className="space-y-2 rounded border border-blue-100 bg-blue-50/70 p-3 text-sm text-blue-800 dark:border-purple-400/20 dark:bg-slate-800 dark:text-purple-100">
            {rewards.coins > 0 ? (
              <p className="font-black">
                +{rewards.coins.toLocaleString()} coins
              </p>
            ) : null}
            {cardGroups.map(([title, count]) => (
              <p key={title}>
                +{count} card{count === 1 ? "" : "s"}: {title}
              </p>
            ))}
            {equipmentGroups.map(([name, count]) => (
              <p key={name}>
                +{count} {name}{count === 1 ? "" : " pieces"}
              </p>
            ))}
            {firstEquipment ? (
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  Gear roll preview: {statLabel(firstEquipment.mainStatType)} +{firstEquipment.mainStatValue}
                </p>
                {firstEquipment.subStats && firstEquipment.subStats.length > 0 ? (
                  <p>
                    Substats: {formatSubStats(firstEquipment.subStats)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setReceipts((current) => current.slice(1))}
            className="arena-redraw-button hover:animate-wiggle"
          >
            [ claim received ]
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
