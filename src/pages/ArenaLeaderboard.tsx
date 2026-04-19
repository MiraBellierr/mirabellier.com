import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import { usePageSeo } from "@/lib/seo";
import {
  ArenaApiError,
  type ArenaLeaderboardResponse,
  type ArenaMetric,
  fetchArenaLeaderboard,
} from "@/lib/arena-api";

const METRICS: Array<{ id: ArenaMetric; label: string }> = [
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

const ArenaLeaderboard = () => {
  const [activeMetric, setActiveMetric] = useState<ArenaMetric>("level");
  const [leaderboards, setLeaderboards] = useState<
    Partial<Record<ArenaMetric, ArenaLeaderboardResponse>>
  >({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/arena/leaderboard",
    structuredDataId: "arena-leaderboard-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Leaderboards",
      description: "Level, win-rate, and rich all-time rankings.",
      url: "https://mirabellier.com/arena/leaderboard",
    },
  });

  useEffect(() => {
    let cancelled = false;
    const loadBoards = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [levelBoard, winRateBoard, richBoard] = await Promise.all([
          fetchArenaLeaderboard("level"),
          fetchArenaLeaderboard("win_rate"),
          fetchArenaLeaderboard("rich"),
        ]);
        if (cancelled) return;
        setLeaderboards({
          level: levelBoard,
          win_rate: winRateBoard,
          rich: richBoard,
        });
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadBoards();
    return () => {
      cancelled = true;
    };
  }, []);

  const board = leaderboards[activeMetric];

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
              <h2 className="text-2xl font-bold text-blue-700">arena leaderboard</h2>
              <div className="flex flex-wrap gap-2">
                <Link to="/arena" className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                  arena home
                </Link>
                <Link to="/arena/fight" className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                  fight
                </Link>
                <Link to="/arena/shop" className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                  shop
                </Link>
                <Link
                  to="/arena/crafting"
                  className="rounded-full bg-sky-600 px-3 py-1 text-xs font-bold text-white"
                >
                  crafting
                </Link>
                <Link
                  to="/arena/collection"
                  className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white"
                >
                  collection
                </Link>
              </div>

              <div className="flex flex-wrap gap-2">
                {METRICS.map((metric) => (
                  <button
                    key={metric.id}
                    type="button"
                    onClick={() => setActiveMetric(metric.id)}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      metric.id === activeMetric
                        ? "bg-pink-500 text-white"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {metric.label}
                  </button>
                ))}
              </div>

              {loading && !board ? (
                <p className="text-blue-500">Loading leaderboard...</p>
              ) : board ? (
                <ol className="space-y-2">
                  {board.entries.length === 0 ? (
                    <p className="text-sm text-blue-500">No entries yet.</p>
                  ) : (
                    board.entries.map((entry) => (
                      <li
                        key={`${activeMetric}-${entry.user.id}`}
                        className="rounded-xl border border-blue-200 bg-white/70 p-3"
                      >
                        <p className="font-semibold text-blue-700">
                          #{entry.rank} {entry.user.username}
                        </p>
                        <p className="text-xs text-slate-700">
                          Lv {entry.level} | Win Rate {formatPercent(entry.winRate)} | Coins {entry.coins}
                        </p>
                      </li>
                    ))
                  )}
                </ol>
              ) : null}

              {errorMessage ? (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}
            </section>
            <Divider />
          </main>
          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-2 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">rank rules</h2>
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
