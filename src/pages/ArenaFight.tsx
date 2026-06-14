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

type DmgFloater = { key: number; value: number; crit: boolean; x: number; y: number };

function HpBar({ current, max, label }: { current: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const color = pct > 60 ? "bg-emerald-500" : pct > 30 ? "bg-amber-400" : "bg-red-500";

  return (
    <div>
      <p className="text-xs font-semibold text-blue-500 mb-1">{label}</p>
      <div className="h-5 w-full rounded-full bg-slate-200 overflow-hidden border border-slate-300">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-600 mt-0.5">{current} / {max}</p>
    </div>
  );
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
  const [floaters, setFloaters] = useState<DmgFloater[]>([]);
  const [playerFallen, setPlayerFallen] = useState(false);
  const [opponentFallen, setOpponentFallen] = useState(false);
  const playerCardRef = useRef<HTMLDivElement | null>(null);
  const opponentCardRef = useRef<HTMLDivElement | null>(null);
  const floaterKey = useRef(0);

  const shakeCard = (ref: React.RefObject<HTMLDivElement | null>, hard: boolean) => {
    const el = ref.current;
    if (!el) return;
    const keyframes = hard
      ? [
          { transform: "translateX(0) rotate(0deg)" },
          { transform: "translateX(-8px) rotate(-2deg)", offset: 0.1 },
          { transform: "translateX(8px) rotate(2deg)", offset: 0.25 },
          { transform: "translateX(-6px) rotate(-1deg)", offset: 0.4 },
          { transform: "translateX(6px) rotate(1deg)", offset: 0.55 },
          { transform: "translateX(-3px) rotate(0deg)", offset: 0.7 },
          { transform: "translateX(3px) rotate(0deg)", offset: 0.85 },
          { transform: "translateX(0) rotate(0deg)" },
        ]
      : [
          { transform: "translateX(0)" },
          { transform: "translateX(-5px)", offset: 0.15 },
          { transform: "translateX(5px)", offset: 0.3 },
          { transform: "translateX(-3px)", offset: 0.45 },
          { transform: "translateX(3px)", offset: 0.6 },
          { transform: "translateX(-1px)", offset: 0.75 },
          { transform: "translateX(0)" },
        ];
    el.animate(keyframes, { duration: hard ? 600 : 450, easing: "ease-out" });
  };
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

  // Trigger card fall on defeat
  useEffect(() => {
    if (!playbackDone || !fight) return;
    const playerLost = fight.battle.finalHp.player <= 0;
    const opponentLost = fight.battle.finalHp.opponent <= 0;
    if (playerLost) setPlayerFallen(true);
    if (opponentLost) setOpponentFallen(true);
  }, [playbackDone, fight]);

  // Reset fall on new fight
  useEffect(() => {
    if (!fight) return;
    setPlayerFallen(false);
    setOpponentFallen(false);
  }, [fight]);

  // Spawn floaters + shakes synced to console playback events
  const lastPlayedIdx = useRef(-1);
  useEffect(() => {
    if (!fight || visibleConsole.length === 0) return;
    const rounds = fight.rounds || [];
    if (rounds.length === 0) return;

    // Only process rounds that just appeared in the console
    for (let i = lastPlayedIdx.current + 1; i < rounds.length && i < visibleConsole.length; i++) {
      const r = rounds[i];
      const attacker = String(r.attacker || "");
      const isPlayerDefending = attacker === "opponent";

      if (r.avoided) {
        // Miss floater on the defender's side
        const key = floaterKey.current++;
        const mx = isPlayerDefending ? 8 + Math.random() * 28 : 64 + Math.random() * 28;
        setFloaters((prev) => [...prev, { key, value: 0, crit: false, x: mx, y: 20 + Math.random() * 40 }]);
        setTimeout(() => setFloaters((prev) => prev.filter((f) => f.key !== key)), 1400);
        lastPlayedIdx.current = i;
        continue;
      }

      const dmg = Number(r.damage) || 0;
      if (dmg <= 0) { lastPlayedIdx.current = i; continue; }

      const isCrit = Boolean(r.critical);

      // Damage floater on defender's side
      const key = floaterKey.current++;
      const fx = isPlayerDefending ? 8 + Math.random() * 28 : 64 + Math.random() * 28;
      setFloaters((prev) => [...prev, { key, value: dmg, crit: isCrit, x: fx, y: 20 + Math.random() * 40 }]);
      setTimeout(() => setFloaters((prev) => prev.filter((f) => f.key !== key)), 1800);

      // Shake
      if (attacker === "player") {
        shakeCard(opponentCardRef, isCrit);
      } else if (attacker === "opponent") {
        shakeCard(playerCardRef, isCrit);
      }

      lastPlayedIdx.current = i;
    }
  }, [visibleConsole, fight]);

  // Reset on new fight
  useEffect(() => {
    if (!fight) return;
    setFloaters([]);
    lastPlayedIdx.current = -1;
  }, [fight]);

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
                <div className="space-y-5 max-w-lg mx-auto">
                  {/* Card vs Card display */}
                  <div className="relative">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                      {/* Player card */}
                      <div className="text-center">
                        <div ref={playerCardRef} className={playerFallen ? "card-fall-off" : ""}>
                          <div className="mx-auto inline-block">
                            {profile?.selectedCard ? (
                              <ArenaPortraitCard card={profile.selectedCard} level={profile.level} size="compact" showIvLine={false} />
                            ) : null}
                          </div>
                        </div>
                        <p className="text-xs font-bold text-slate-700 mt-2 truncate">{profile?.selectedCard?.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{profile?.selectedCard ? formatIvBlock(profile.selectedCard.iv) : ""}</p>
                      </div>

                      {/* VS */}
                      <span className="text-2xl font-black text-pink-400 select-none shrink-0 self-center">VS</span>

                      {/* Opponent card */}
                      <div className="text-center">
                        <div ref={opponentCardRef} className={opponentFallen ? "card-fall-off" : ""}>
                          <div className="mx-auto inline-block">
                            {fight?.opponent?.selectedCard ? (
                              <ArenaPortraitCard card={fight.opponent.selectedCard} level={fight.opponent.level} size="compact" showIvLine={false} />
                            ) : (
                              <div className="mx-auto h-[140px] w-[100px] rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center">
                                <span className="text-sm text-slate-400 font-bold">?</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {fight?.opponent?.selectedCard ? (
                          <>
                            <p className="text-xs font-bold text-slate-700 mt-2 truncate">{fight.opponent.selectedCard.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{formatIvBlock(fight.opponent.selectedCard.iv)}</p>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400 mt-2">Fight to reveal</p>
                        )}
                        {fight?.opponent ? (
                          <p className="text-xs text-slate-500 mt-0.5">{fight.opponent.displayName}{fight.opponent.isNpc ? " (NPC)" : ""}</p>
                        ) : null}
                      </div>
                    </div>

                    {/* Floating damage over cards */}
                    {floaters.map((f) => (
                      <span
                        key={f.key}
                        className={f.value === 0 ? "dmg-float dmg-float--miss" : f.crit ? "dmg-float dmg-float--crit" : "dmg-float dmg-float--hit"}
                        style={{ left: `${f.x}%`, top: `${f.y}%` }}
                      >
                        {f.value === 0 ? "MISS!" : f.crit ? `CRIT ${f.value}!` : `-${f.value}`}
                      </span>
                    ))}
                  </div>

                  {/* HP bars — only after fight starts */}
                  {fight ? (
                    <div className="grid grid-cols-2 gap-3">
                      <HpBar current={hpSnapshot?.playerHp ?? fight.battle.maxHp.player} max={fight.battle.maxHp.player} label="Your HP" />
                      <HpBar current={hpSnapshot?.opponentHp ?? fight.battle.maxHp.opponent} max={fight.battle.maxHp.opponent} label="Opponent HP" />
                    </div>
                  ) : null}

                  {/* Result summary */}
                  {playbackDone && fight ? (
                    <div className={`rounded-lg p-3 text-center text-sm font-semibold ${fight.result === "win" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {fight.result === "win" ? "VICTORY!" : "DEFEAT"} — +{fight.rewards.xp} XP · +{fight.rewards.coins} 🪙
                    </div>
                  ) : null}

                  {/* Buttons */}
                  <div className="flex flex-wrap justify-center gap-2">
                    {SPEED_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSpeedMode(option.id)}
                        className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                          option.id === speedMode
                            ? "bg-pink-500 text-white"
                            : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void handleFight()}
                      disabled={fighting || !playbackDone}
                      className="rounded-full bg-pink-500 px-6 py-2 text-sm font-bold text-white transition hover:bg-pink-600 disabled:opacity-60"
                    >
                      {fighting ? "fighting..." : !playbackDone ? "wait..." : "fight!"}
                    </button>
                  </div>

                  {/* Battle console — last 3 events */}
                  {fight ? (
                    <div>
                      <p className="text-xs font-semibold text-blue-500 mb-1">console</p>
                      <div
                        ref={consoleRef}
                        className="fight-console rounded-lg border border-slate-300 bg-slate-950 p-2 font-mono text-xs text-green-300"
                      >
                        {visibleConsole.length > 0 ? (
                          visibleConsole.slice(-3).map((entry, index) => (
                            <p key={`log-${index}`} className="leading-snug">{entry.line}</p>
                          ))
                        ) : (
                          <p className="leading-snug">waiting for battle...</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

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
