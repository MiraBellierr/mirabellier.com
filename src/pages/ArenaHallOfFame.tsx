import { useEffect, useState } from "react";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaSubNav from "@/parts/ArenaSubNav";
import { usePageSeo } from "@/lib/seo";
import {
  normalizeArenaError,
  type ArenaHallOfFameEntry,
  type ArenaHallOfFameResponse,
  fetchArenaHallOfFame,
} from "@/lib/arena";


function monthLabel(month: string) {
  const [y, m] = month.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("en", { year: "numeric", month: "long" });
}

const MEDAL = ["🥇", "🥈", "🥉"] as const;
const PODIUM_BORDER = [
  "ring-amber-400 bg-amber-50 shadow-[0_0_12px_rgba(245,158,11,0.5)]",
  "ring-slate-300 bg-slate-50 shadow-[0_0_8px_rgba(148,163,184,0.4)]",
  "ring-amber-600 bg-amber-50/50 shadow-[0_0_6px_rgba(180,83,9,0.3)]",
];
const PODIUM_ORDER = ["order-2", "order-1", "order-3"];

function ChampionCard({
  entry,
  rank,
}: {
  entry: ArenaHallOfFameEntry;
  rank: number;
}) {
  const idx = rank - 1;

  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 ring-2 ${PODIUM_BORDER[idx]} ${PODIUM_ORDER[idx]}`}
    >
      <span className="text-3xl">{MEDAL[idx]}</span>
      {entry.avatar ? (
        <img
          src={entry.avatar}
          alt={entry.username}
          className={`h-14 w-14 shrink-0 rounded-full border-2 object-cover ${
            idx === 0
              ? "border-amber-400"
              : idx === 1
                ? "border-slate-300"
                : "border-amber-600"
          }`}
          loading="lazy"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-blue-200 bg-blue-50 text-lg font-bold text-blue-400">
          #{rank}
        </div>
      )}
      <p className="text-center text-sm font-bold text-blue-700">
        {entry.username}
      </p>
      <p className="text-center text-xs text-blue-500">Lv {entry.level}</p>
      <p className="text-center text-xs font-bold text-purple-600">
        {entry.eloRating} ELO
      </p>
      <p className="text-center text-[10px] text-slate-500">
        peak {entry.peakElo} · {entry.eloMatches} matches
      </p>
      {idx === 0 ? (
        <span className="text-2xl" title="Champion Trophy">
          🏆
        </span>
      ) : null}
    </div>
  );
}

function Podium({
  entries,
}: {
  entries: ArenaHallOfFameEntry[];
}) {
  return (
    <div className="flex items-end justify-center gap-3 px-2 pt-4">
      {entries.slice(0, 3).map((entry) => (
        <ChampionCard
          key={entry.userId}
          entry={entry}
          rank={entry.rank}
        />
      ))}
    </div>
  );
}

const ArenaHallOfFame = () => {
  const [data, setData] = useState<ArenaHallOfFameResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  usePageSeo({
    canonical: "https://mirabellier.com/arena/hall-of-fame",
    structuredDataId: "arena-hall-of-fame-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Hall of Fame",
      description: "Monthly ELO champions and past legends of the Arena.",
      url: "https://mirabellier.com/arena/hall-of-fame",
    },
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await fetchArenaHallOfFame({ page });
        if (cancelled) return;
        setData(result);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const months = data?.months || [];
  const totalPages = data?.totalPages || 1;

  return (
    <div className="min-h-screen flex flex-col font-[sans-serif] text-blue-900">
      <Header />
      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-4 p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>
          <main className="w-full space-y-2 p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/60 p-4">
              <div>
                <h2 className="text-4xl font-bold text-blue-900">Hall of Fame {`>^. .^<`}</h2>
                <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                  <span className="text-amber-400">✦</span> Monthly ELO champions — the highest-rated fighters each month{" "}
                  <span className="text-amber-400">✦</span>
                </p>
              </div>

              <ArenaSubNav />

              {loading && !data ? (
                <p className="text-blue-500">Loading hall of fame...</p>
              ) : data ? (
                <>
                  {months.length === 0 ? (
                    <p className="text-sm text-blue-500">No entries yet. The first month hasn't ended!</p>
                  ) : (
                    months.map((monthData) => (
                      <div key={monthData.month} className="border-b border-blue-100 pb-6 last:border-b-0 last:pb-0">
                        <h3 className="text-center text-lg font-bold text-blue-700 mb-2">
                          {monthLabel(monthData.month)}
                        </h3>
                        <Podium entries={monthData.entries} />
                      </div>
                    ))
                  )}

                  {totalPages > 1 ? (
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="arena-redraw-button hover:animate-wiggle disabled:opacity-40"
                      >
                        [ « prev ]
                      </button>
                      <span className="text-sm font-semibold text-blue-700">
                        {page} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="arena-redraw-button hover:animate-wiggle disabled:opacity-40"
                      >
                        [ next » ]
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}

              {errorMessage ? (
                <ArenaErrorNotice message={errorMessage} />
              ) : null}
            </section>
            <Divider />
          </main>
          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-2 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">hall of fame</h2>
                <p>Top 3 ELO players are recorded on the 1st of each month at midnight UTC.</p>
                <p>After recording, all player ELO resets to 1000 — a fresh climb for everyone.</p>
                <p>Each month is a new season. Past champions are forever enshrined here.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaHallOfFame;
