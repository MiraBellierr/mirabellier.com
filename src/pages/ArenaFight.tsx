import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  ArenaApiError,
  type ArenaBattleConsoleEvent,
  type ArenaFightResponse,
  type ArenaProfile,
  fetchArenaProfile,
  runArenaFight,
} from "@/lib/arena-api";

type FightSpeedMode = "real_time" | "double" | "instant";

const SPEED_OPTIONS: Array<{ id: FightSpeedMode; label: string; delayMs: number }> = [
  { id: "real_time", label: "real time", delayMs: 850 },
  { id: "double", label: "double", delayMs: 425 },
  { id: "instant", label: "instant", delayMs: 0 },
];

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena request failed.";
}

function formatIvBlock(stats: { power: number; guard: number; speed: number; luck: number }) {
  return `P ${stats.power} | G ${stats.guard} | S ${stats.speed} | L ${stats.luck}`;
}

const ArenaFight = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const [profile, setProfile] = useState<ArenaProfile | null>(null);
  const [fight, setFight] = useState<ArenaFightResponse | null>(null);
  const [visibleConsole, setVisibleConsole] = useState<ArenaBattleConsoleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [fighting, setFighting] = useState(false);
  const [playbackDone, setPlaybackDone] = useState(true);
  const [speedMode, setSpeedMode] = useState<FightSpeedMode>("real_time");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/arena/fight",
    structuredDataId: "arena-fight-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Fight",
      description: "Fight opponents using your chosen daily character card.",
      url: "https://mirabellier.com/arena/fight",
    },
  });

  const clearPlayback = () => {
    if (playbackTimerRef.current !== null) {
      window.clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  };

  const startConsolePlayback = (payload: ArenaFightResponse, mode: FightSpeedMode) => {
    clearPlayback();

    const events = payload.battle.console || [];
    if (mode === "instant" || events.length === 0) {
      setVisibleConsole(events);
      setPlaybackDone(true);
      return;
    }

    setVisibleConsole([]);
    setPlaybackDone(false);

    let index = 0;
    const delay = SPEED_OPTIONS.find((entry) => entry.id === mode)?.delayMs ?? 850;

    playbackTimerRef.current = window.setInterval(() => {
      index += 1;
      setVisibleConsole(events.slice(0, index));

      if (index >= events.length) {
        clearPlayback();
        setPlaybackDone(true);
      }
    }, delay);
  };

  useEffect(() => {
    return () => {
      clearPlayback();
    };
  }, []);

  useEffect(() => {
    if (!consoleRef.current) return;
    consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [visibleConsole, fight]);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setProfile(null);
      return () => {
        cancelled = true;
      };
    }

    const loadProfile = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const payload = await fetchArenaProfile(token);
        if (cancelled) return;
        setProfile(payload);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleFight = async () => {
    if (!token || fighting || !playbackDone) return;
    setFighting(true);
    setErrorMessage(null);
    try {
      const payload = await runArenaFight(token);
      setFight(payload);
      setProfile(payload.profile);
      startConsolePlayback(payload, speedMode);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setFighting(false);
    }
  };

  const hpSnapshot = fight
    ? visibleConsole.length > 0
      ? visibleConsole[visibleConsole.length - 1]
      : {
          line: "",
          playerHp: fight.battle.maxHp.player,
          opponentHp: fight.battle.maxHp.opponent,
        }
    : null;

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
              <h2 className="text-2xl font-bold text-blue-700">arena fight</h2>

              <div className="flex flex-wrap gap-2">
                <Link to="/arena" className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                  arena home
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
                  to="/arena/leaderboard"
                  className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white"
                >
                  leaderboard
                </Link>
                <Link
                  to="/arena/collection"
                  className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white"
                >
                  collection
                </Link>
              </div>

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
                  <p className="font-semibold">Login is required to fight.</p>
                  <Link to="/login" className="mt-2 inline-block underline">
                    go to login
                  </Link>
                </div>
              ) : loading && !profile ? (
                <p className="text-blue-500">Loading profile...</p>
              ) : profile && !profile.selectedCard ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
                  <p className="font-semibold">Draw a card to start.</p>
                  <Link to="/arena" className="mt-2 inline-block underline">
                    go to arena home
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="rounded-xl border border-blue-200 bg-white/70 p-3">
                      <p className="font-semibold text-blue-700">Your Card</p>
                      <div className="mt-2 flex items-start gap-3">
                        {profile?.selectedCard ? (
                          <ArenaPortraitCard
                            card={profile.selectedCard}
                            level={profile.level}
                            size="compact"
                            showIvLine={false}
                          />
                        ) : null}
                        <div>
                          <p className="text-sm text-slate-700">{profile?.selectedCard?.title}</p>
                          <p className="text-xs text-slate-600">
                            {profile?.selectedCard ? formatIvBlock(profile.selectedCard.iv) : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-white/70 p-3">
                      <p className="font-semibold text-blue-700">Opponent&apos;s Card</p>
                      {fight?.opponent?.selectedCard ? (
                        <div className="mt-2 flex items-start gap-3">
                          <ArenaPortraitCard
                            card={fight.opponent.selectedCard}
                            level={fight.opponent.level}
                            size="compact"
                            showIvLine={false}
                          />
                          <div>
                            <p className="text-sm text-slate-700">{fight.opponent.selectedCard.title}</p>
                            <p className="text-xs text-slate-600">
                              {formatIvBlock(fight.opponent.selectedCard.iv)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-600">
                          Fight to reveal opponent card.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {SPEED_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSpeedMode(option.id)}
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          option.id === speedMode
                            ? "bg-pink-500 text-white"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleFight()}
                    disabled={fighting || !playbackDone}
                    className="rounded-full bg-pink-500 px-6 py-2 text-sm font-bold text-white transition hover:bg-pink-600 disabled:opacity-60"
                  >
                    {fighting ? "fighting..." : !playbackDone ? "wait for console..." : "fight"}
                  </button>
                </div>
              )}

              {errorMessage ? (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}
            </section>

            {fight ? (
              <section className="card-border space-y-3 bg-white/60 p-4">
                <h3 className="text-xl font-bold text-blue-700">battle console</h3>
                {playbackDone ? (
                  <p className="text-sm font-semibold text-slate-700">
                    You {fight.result} | +{fight.rewards.xp} EXP | +{fight.rewards.coins} coins
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-slate-700">
                    Battle in progress...
                  </p>
                )}
                <p className="text-sm text-slate-700">
                  Opponent: {fight.opponent.displayName} {fight.opponent.isNpc ? "(NPC)" : ""}
                </p>

                <div className="grid grid-cols-1 gap-2 rounded-xl border border-blue-200 bg-white/70 p-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-blue-500">Your HP</p>
                    <p className="font-semibold text-blue-700">
                      {hpSnapshot?.playerHp ?? fight.battle.maxHp.player} / {fight.battle.maxHp.player}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-500">Opponent HP</p>
                    <p className="font-semibold text-blue-700">
                      {hpSnapshot?.opponentHp ?? fight.battle.maxHp.opponent} / {fight.battle.maxHp.opponent}
                    </p>
                  </div>
                </div>

                {!playbackDone ? (
                  <p className="text-xs text-blue-600">battle playback running...</p>
                ) : null}

                <div
                  ref={consoleRef}
                  className="max-h-72 overflow-y-auto rounded-xl border border-slate-300 bg-slate-950 p-3 font-mono text-xs text-green-300"
                >
                  {visibleConsole.length > 0 ? (
                    visibleConsole.map((entry, index) => (
                      <p key={`battle-log-${index}`}>{entry.line}</p>
                    ))
                  ) : (
                    <p>no battle events yet</p>
                  )}
                </div>
              </section>
            ) : null}
            <Divider />
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-2 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">fight info</h2>
                <p>HP reaches 0 first loses.</p>
                <p>Use battle speed mode to watch real-time, double, or instant replay.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaFight;
