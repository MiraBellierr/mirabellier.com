import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import { usePageSeo } from "@/lib/seo";
import {
  ArenaApiError,
  type ArenaLeaderboardResponse,
  type ArenaMetric,
  fetchArenaLeaderboard,
} from "@/lib/arena-api";

const METRICS: Array<{ id: ArenaMetric; label: string }> = [
  { id: "elo", label: "ELO" },
  { id: "level", label: "level" },
  { id: "win_rate", label: "win rate" },
  { id: "rich", label: "rich" },
];

function formatPercent(value: number, fractionDigits = 1) {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena request failed.";
}

const PER_PAGE = 10;

const ArenaLeaderboard = () => {
  const [activeMetric, setActiveMetric] = useState<ArenaMetric>("elo");
  const [leaderboards, setLeaderboards] = useState<
    Partial<Record<ArenaMetric, ArenaLeaderboardResponse>>
  >({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  usePageSeo({
    canonical: "https://mirabellier.com/arena/leaderboard",
    structuredDataId: "arena-leaderboard-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Leaderboards",
      description: "ELO, level, win-rate, and rich all-time rankings.",
      url: "https://mirabellier.com/arena/leaderboard",
    },
  });

  useEffect(() => {
    setPage(1);
  }, [activeMetric]);

  useEffect(() => {
    let cancelled = false;
    const loadBoard = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const board = await fetchArenaLeaderboard(activeMetric, {
          page,
          perPage: PER_PAGE,
        });
        if (cancelled) return;
        setLeaderboards((prev) => ({ ...prev, [activeMetric]: board }));
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadBoard();
    return () => {
      cancelled = true;
    };
  }, [activeMetric, page]);

  const board = leaderboards[activeMetric];

  const entries = board?.entries || [];
  const totalPages = board?.totalPages || 1;

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
              <div className="">
                <h2 className="text-4xl font-bold text-blue-900">Leaderboards {`>^. .^<`}</h2>
                <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                  <span className="text-pink-300">✿</span> Top trainers ranked by ELO, level, win rate, and wealth!{" "}
                  <span className="text-pink-300">✿</span>
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-3 pb-3 border-b border-sky-100">
                <Link to="/arena" className="arena-redraw-button hover:animate-wiggle">
                  [ Arena Home ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/fight" className="arena-redraw-button hover:animate-wiggle">
                  [ Fight ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/shop" className="arena-redraw-button hover:animate-wiggle">
                  [ Shop ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/crafting" className="arena-redraw-button hover:animate-wiggle">
                  [ Craft ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/inventory" className="arena-redraw-button hover:animate-wiggle">
                  [ Inventory ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/collection" className="arena-redraw-button hover:animate-wiggle">
                  [ Collection ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/market" className="arena-redraw-button hover:animate-wiggle">
                  [ Market ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/skill-tree" className="arena-redraw-button hover:animate-wiggle">
                  [ Skill Tree ]
                </Link>
              </div>

              <div className="flex flex-wrap gap-2">
                {METRICS.map((metric) => (
                  <button
                    key={metric.id}
                    type="button"
                    onClick={() => setActiveMetric(metric.id)}
                    className="arena-redraw-button hover:animate-wiggle"
                  >
                    {metric.id === activeMetric
                      ? `[ » ${metric.label} « ]`
                      : `[ ${metric.label} ]`}
                  </button>
                ))}
              </div>

              {loading && !board ? (
                <p className="text-blue-500">Loading leaderboard...</p>
              ) : board ? (
                <>
                <ol className="space-y-1">
                  {entries.length === 0 ? (
                    <p className="text-sm text-blue-500">No entries yet.</p>
                  ) : (
                    entries.map((entry) => (
                      <li
                        key={`${activeMetric}-${entry.user.id}`}
                        className="border-b border-blue-100 pb-3 last:border-b-0 last:pb-0"
                      >
                        <article className="flex items-start gap-3">
                          {entry.user.avatar ? (
                            <img
                              src={entry.user.avatar}
                              alt={entry.user.username}
                              className="h-12 w-12 shrink-0 rounded-lg border border-blue-100 object-cover shadow-sm"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-blue-200 bg-blue-50 text-lg text-blue-400 font-bold">
                              {entry.rank}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-blue-700">
                              #{entry.rank} {entry.user.username}
                            </p>
                            {activeMetric === "elo" ? (
                              <p className="text-xs text-slate-600">
                                ELO {entry.eloRating} · Peak {entry.peakElo} ·{" "}
                                {entry.eloMatches} rated fights
                                {entry.eloProvisional ? " · provisional" : ""}
                              </p>
                            ) : activeMetric === "level" ? (
                              <p className="text-xs text-slate-600">
                                Lv {entry.level} · {entry.xp} XP · {formatPercent(entry.xpProgress)} to next
                              </p>
                            ) : activeMetric === "win_rate" ? (
                              <p className="text-xs text-slate-600">
                                Win Rate {formatPercent(entry.winRate)} · {entry.wins}W {entry.losses}L ({entry.totalFights} fights)
                              </p>
                            ) : (
                              <p className="text-xs text-slate-600">
                                {entry.coins} 🪙 · Lifetime {entry.lifetimeCoinsEarned} 🪙
                              </p>
                            )}
                          </div>
                        </article>
                      </li>
                    ))
                  )}
                </ol>

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
                <h2 className="text-center text-lg font-bold text-blue-700">rank rules</h2>
                <p>ELO board ranks rating, rated fights, then peak ELO.</p>
                <p>Ratings are provisional for the first 20 rated fights.</p>
                <p>Level board ranks by level then XP progress.</p>
                <p>Win-rate board requires at least 50 fights.</p>
                <p>Rich board ranks by coins and lifetime earnings.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaLeaderboard;