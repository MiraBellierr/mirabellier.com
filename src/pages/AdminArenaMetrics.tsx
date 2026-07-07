import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import { ArenaApiError } from "@/lib/arena";
import { joinApi } from "@/lib/config";
import { usePageSeo } from "@/lib/seo";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import { useAuth } from "@/states/AuthContext";

type DailyArenaMetric = {
  day: string;
  fights: number;
  wins: number;
  losses: number;
  winRate: number;
  coinInflow: number;
};

type ArenaMetrics = {
  window: {
    days: number;
    since: string;
  };
  activity: {
    fights: number;
    wins: number;
    losses: number;
    winRate: number;
    xpInflow: number;
    coinInflow: number;
    fightsPerDay: number;
    daily: DailyArenaMetric[];
  };
  economy: {
    profiles: number;
    currentCoins: number;
    lifetimeCoinsEarned: number;
    estimatedCoinOutflow: number;
    fightCoinInflow: number;
  };
  balance: {
    alertCount: number;
    highDamageTurns: Array<{
      fightId: string;
      userId: string;
      opponentUserId: string | null;
      createdAt: string;
      turn: number;
      attacker: string;
      damage: number;
    }>;
    highEvasionProfiles: Array<{
      userId: string;
      evasionPct: number;
      level: number;
      winStreak: number;
    }>;
    highStreakProfiles: Array<{
      userId: string;
      winStreak: number;
      level: number;
      eloRating: number;
    }>;
  };
};

function formatNumber(value: number) {
  return value.toLocaleString();
}

function formatPct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function makeAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    throw new ArenaApiError(body?.error || `Request failed (${response.status})`, {
      status: response.status,
    });
  } catch (error) {
    if (error instanceof ArenaApiError) throw error;
    throw new ArenaApiError("Arena metrics request failed", {
      status: response.status,
    });
  }
}

const AdminArenaMetrics = () => {
  const auth = useAuth();
  const isOwner = canAccessAdminPanel(auth.user);
  const token = auth.token || null;
  const [metrics, setMetrics] = useState<ArenaMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/admin/arena-metrics",
    structuredDataId: "admin-arena-metrics-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Metrics Admin",
      description: "Owner-only Arena balance and economy metrics.",
      url: "https://mirabellier.com/admin/arena-metrics",
    },
  });

  useEffect(() => {
    if (!token || !isOwner) return;
    const controller = new AbortController();
    setLoading(true);
    setErrorMessage(null);
    fetch(joinApi("/admin/arena/metrics?days=7"), {
      credentials: "include",
      headers: makeAuthHeaders(token),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw await readApiError(response);
        return response.json() as Promise<ArenaMetrics>;
      })
      .then((payload) => setMetrics(payload))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          setErrorMessage(
            error instanceof Error ? error.message : "Arena metrics request failed.",
          );
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [isOwner, token]);

  if (!auth.user || !isOwner) {
    return (
      <div className="flex min-h-screen flex-col font-[sans-serif] text-blue-900 dark:text-purple-100">
        <Header />
        <main className="mx-auto w-full max-w-3xl flex-1 p-6">
          <section className="card-border bg-white/70 p-6 text-center dark:bg-purple-950/50">
            <h1 className="text-2xl font-bold text-blue-700 dark:!text-purple-100">
              {!auth.user ? "Please log in" : "Not authorized"}
            </h1>
            <Link
              to={!auth.user ? "/login" : "/"}
              className="mt-4 inline-block font-bold text-pink-500 underline dark:!text-pink-200"
            >
              {!auth.user ? "Go to login" : "Back to home"}
            </Link>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col font-[sans-serif] text-blue-900 dark:text-purple-100">
      <Header />
      <div
        className="flex flex-1 flex-col bg-cover bg-scroll bg-no-repeat"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-4 p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>

          <main className="w-full space-y-4 p-4 lg:w-3/5">
            <section className="card-border space-y-5 bg-white/60 p-4 dark:bg-purple-950/50">
              <div>
                <Link
                  to="/admin"
                  className="text-sm font-bold text-pink-500 underline dark:!text-pink-200"
                >
                  ← admin home
                </Link>
                <h1 className="mt-2 text-3xl font-bold text-blue-700 dark:!text-purple-100">
                  Arena Metrics
                </h1>
                <p className="text-sm text-blue-500 dark:!text-purple-200">
                  Last {metrics?.window.days ?? 7} days of fight, economy, and balance signals.
                </p>
              </div>

              {loading ? (
                <p className="text-sm text-blue-500 dark:!text-purple-200">
                  Loading metrics...
                </p>
              ) : null}
              {errorMessage ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-300/30 dark:bg-red-950/50 dark:!text-red-100">
                  {errorMessage}
                </p>
              ) : null}

              {metrics ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-blue-100 bg-white/75 p-4 dark:border-purple-300/20 dark:bg-slate-950/60">
                      <h2 className="text-sm font-bold uppercase text-blue-500 dark:!text-purple-200">Activity</h2>
                      <p className="mt-2 text-3xl font-bold text-blue-700 dark:!text-purple-50">
                        {formatNumber(metrics.activity.fights)}
                      </p>
                      <p className="text-sm text-slate-600 dark:!text-purple-200">
                        fights, {formatPct(metrics.activity.winRate)} win rate
                      </p>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-white/75 p-4 dark:border-purple-300/20 dark:bg-slate-950/60">
                      <h2 className="text-sm font-bold uppercase text-blue-500 dark:!text-purple-200">Economy</h2>
                      <p className="mt-2 text-3xl font-bold text-blue-700 dark:!text-purple-50">
                        {formatNumber(metrics.economy.fightCoinInflow)}
                      </p>
                      <p className="text-sm text-slate-600 dark:!text-purple-200">
                        coins from fights, {formatNumber(metrics.economy.estimatedCoinOutflow)} estimated spent
                      </p>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-white/75 p-4 dark:border-purple-300/20 dark:bg-slate-950/60">
                      <h2 className="text-sm font-bold uppercase text-blue-500 dark:!text-purple-200">Pace</h2>
                      <p className="mt-2 text-3xl font-bold text-blue-700 dark:!text-purple-50">
                        {metrics.activity.fightsPerDay}
                      </p>
                      <p className="text-sm text-slate-600 dark:!text-purple-200">fights per day</p>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-white/75 p-4 dark:border-purple-300/20 dark:bg-slate-950/60">
                      <h2 className="text-sm font-bold uppercase text-blue-500 dark:!text-purple-200">Alerts</h2>
                      <p className="mt-2 text-3xl font-bold text-blue-700 dark:!text-purple-50">
                        {formatNumber(metrics.balance.alertCount)}
                      </p>
                      <p className="text-sm text-slate-600 dark:!text-purple-200">balance threshold hits</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-blue-700 dark:!text-purple-100">Daily fights</h2>
                    <div className="overflow-x-auto rounded-lg border border-blue-100 bg-white/75 dark:border-purple-300/20 dark:bg-slate-950/60">
                      <table className="w-full min-w-[520px] text-left text-sm dark:text-purple-100">
                        <thead className="bg-blue-50 text-blue-700 dark:bg-purple-950/70 dark:text-purple-100">
                          <tr>
                            <th className="px-3 py-2">Day</th>
                            <th className="px-3 py-2">Fights</th>
                            <th className="px-3 py-2">Wins</th>
                            <th className="px-3 py-2">Losses</th>
                            <th className="px-3 py-2">Win rate</th>
                            <th className="px-3 py-2">Coins</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.activity.daily.map((day) => (
                            <tr
                              key={day.day}
                              className="border-t border-blue-50 dark:border-purple-300/10"
                            >
                              <td className="px-3 py-2">{day.day}</td>
                              <td className="px-3 py-2">{formatNumber(day.fights)}</td>
                              <td className="px-3 py-2">{formatNumber(day.wins)}</td>
                              <td className="px-3 py-2">{formatNumber(day.losses)}</td>
                              <td className="px-3 py-2">{formatPct(day.winRate)}</td>
                              <td className="px-3 py-2">{formatNumber(day.coinInflow)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <AlertList
                      title="High damage"
                      empty="No hits above threshold."
                      items={metrics.balance.highDamageTurns.map((turn) => ({
                        key: `${turn.fightId}-${turn.turn}`,
                        label: `${formatNumber(turn.damage)} damage`,
                        detail: `${turn.userId} turn ${turn.turn}`,
                      }))}
                    />
                    <AlertList
                      title="High evasion"
                      empty="No evasion buffs above threshold."
                      items={metrics.balance.highEvasionProfiles.map((profile) => ({
                        key: profile.userId,
                        label: `${profile.evasionPct}% evade`,
                        detail: `${profile.userId}, Lv ${profile.level}`,
                      }))}
                    />
                    <AlertList
                      title="Long streaks"
                      empty="No streaks above threshold."
                      items={metrics.balance.highStreakProfiles.map((profile) => ({
                        key: profile.userId,
                        label: `${formatNumber(profile.winStreak)} wins`,
                        detail: `${profile.userId}, ELO ${profile.eloRating}`,
                      }))}
                    />
                  </div>
                </>
              ) : null}
            </section>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
};

function AlertList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; label: string; detail: string }>;
}) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white/75 p-4 dark:border-purple-300/20 dark:bg-slate-950/60">
      <h2 className="font-bold text-blue-700 dark:!text-purple-100">{title}</h2>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((item) => (
            <li
              key={item.key}
              className="border-t border-blue-50 pt-2 first:border-t-0 first:pt-0 dark:border-purple-300/10"
            >
              <strong className="block text-slate-700 dark:!text-purple-50">
                {item.label}
              </strong>
              <span className="text-blue-500 dark:!text-purple-200">
                {item.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-blue-500 dark:!text-purple-200">{empty}</p>
      )}
    </div>
  );
}

export default AdminArenaMetrics;
