import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import TurnstileWidget from "@/components/TurnstileWidget";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  ArenaApiError,
  type ArenaActiveFight,
  type ArenaBattleConsoleEvent,
  type ArenaProfile,
  advanceFightTurn,
  fetchArenaProfile,
  fetchFightState,
  startPlaybackFight,
} from "@/lib/arena-api";

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena request failed.";
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
  const [activeFight, setActiveFight] = useState<ArenaActiveFight | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [floaters, setFloaters] = useState<DmgFloater[]>([]);
  const [playerFallen, setPlayerFallen] = useState(false);
  const [opponentFallen, setOpponentFallen] = useState(false);
  const [autoBattle, setAutoBattle] = useState(false);
  const playerCardRef = useRef<HTMLDivElement | null>(null);
  const opponentCardRef = useRef<HTMLDivElement | null>(null);
  const floaterKey = useRef(0);
  const consoleRef = useRef<HTMLDivElement | null>(null);

  const syncTimerRef = useRef<number | null>(null);
  const lastCursor = useRef(0);
  const autoTimerRef = useRef<number | null>(null);
  const pageVisible = useRef(true);

  const clearTimers = useCallback(() => {
    if (syncTimerRef.current !== null) {
      window.clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  }, []);

  const clearAutoTimer = useCallback(() => {
    if (autoTimerRef.current !== null) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);

  // On unmount — clear all timers
  useEffect(() => {
    return () => {
      clearTimers();
      clearAutoTimer();
    };
  }, [clearTimers, clearAutoTimer]);

  // Pause auto-battle when tab loses focus
  useEffect(() => {
    const onVisibility = () => {
      pageVisible.current = document.visibilityState === "visible";
      if (!pageVisible.current) {
        clearAutoTimer();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [clearAutoTimer]);

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

  // ---- Load profile on mount ----
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setProfile(null);
      setActiveFight(null);
      return () => { cancelled = true; };
    }

    const loadProfile = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const payload = await fetchArenaProfile(token);
        if (cancelled) return;
        setProfile(payload);
        // If there's an active fight, resume it
        if (payload.activeFight) {
          setActiveFight(payload.activeFight);
          lastCursor.current = payload.activeFight.cursor;
        }
        // Always start polling — so other tabs pick up new fights
        if (!payload.activeFight?.isFinished) {
          startSyncLoop();
        }
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadProfile();
    return () => { cancelled = true; };
  }, [token]);

  // ---- Visual effects ----

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

  // Detect new turns from cursor changes and spawn floaters/shakes
  const triggerTurnEffects = useCallback((prevCursor: number, fight: ArenaActiveFight) => {
    const turns = fight.turns || [];
    // Only process the newly revealed turn(s)
    for (let i = prevCursor; i < fight.cursor; i++) {
      const turn = turns[i];
      if (!turn) continue;

      const isPlayerDefender = turn.defender === "player";

      if (turn.avoided) {
        const key = floaterKey.current++;
        const mx = isPlayerDefender ? 8 + Math.random() * 28 : 64 + Math.random() * 28;
        setFloaters((prev) => [...prev, { key, value: 0, crit: false, x: mx, y: 20 + Math.random() * 40 }]);
        setTimeout(() => setFloaters((prev) => prev.filter((f) => f.key !== key)), 1400);
        shakeCard(isPlayerDefender ? playerCardRef : opponentCardRef, false);
        continue;
      }

      const dmg = Number(turn.damage) || 0;
      if (dmg <= 0) continue;

      const isCrit = Boolean(turn.critical);
      const key = floaterKey.current++;
      const fx = isPlayerDefender ? 8 + Math.random() * 28 : 64 + Math.random() * 28;
      setFloaters((prev) => [...prev, { key, value: dmg, crit: isCrit, x: fx, y: 20 + Math.random() * 40 }]);
      setTimeout(() => setFloaters((prev) => prev.filter((f) => f.key !== key)), 1800);
      shakeCard(isPlayerDefender ? playerCardRef : opponentCardRef, isCrit);
    }
  }, []);

  // Fall animation when fight finishes
  useEffect(() => {
    if (!activeFight?.isFinished) return;
    const playerLost = activeFight.battle.currentHp.player <= 0;
    const opponentLost = activeFight.battle.currentHp.opponent <= 0;
    if (playerLost) setPlayerFallen(true);
    if (opponentLost) setOpponentFallen(true);
  }, [activeFight?.isFinished]);

  // Reset fall when new fight starts
  useEffect(() => {
    if (!activeFight || activeFight.cursor > 0) return;
    setFloaters([]);
    setPlayerFallen(false);
    setOpponentFallen(false);
    lastCursor.current = 0;
  }, [activeFight?.fightId]);

  // Auto-scroll console
  useEffect(() => {
    if (!consoleRef.current) return;
    consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [activeFight?.turns.length, activeFight?.cursor]);

  // ---- Sync loop (poll state + advance) ----

  const doSync = useCallback(async () => {
    if (!token || advancing) return;

    // Step 1: fetch current server state
    setAdvancing(true);
    try {
      const { activeFight: state } = await fetchFightState(token);
      if (!state) {
        // No fight yet — keep polling, another tab might start one
        setActiveFight(null);
        return;
      }

      const prev = lastCursor.current;

      // Step 2: if fight is still active, advance one turn on the server
      if (!state.isFinished) {
        const updated = await advanceFightTurn(token);
        lastCursor.current = updated.cursor;
        setActiveFight(updated);
        if (updated.cursor > prev) {
          triggerTurnEffects(prev, updated);
        }
        if (updated.isFinished) {
          clearTimers();
          try {
            const refreshed = await fetchArenaProfile(token);
            setProfile(refreshed);
          } catch { /* ignore */ }
        }
        return;
      }

      // Fight already finished — just sync display
      if (state.cursor > prev) {
        lastCursor.current = state.cursor;
        setActiveFight(state);
        triggerTurnEffects(prev, state);
      }
      clearTimers();
      try {
        const refreshed = await fetchArenaProfile(token);
        setProfile(refreshed);
      } catch { /* ignore */ }
    } catch {
      // ignore — retry on next tick
    } finally {
      setAdvancing(false);
    }
  }, [token, advancing, clearTimers, triggerTurnEffects]);

  const startSyncLoop = useCallback(() => {
    if (syncTimerRef.current !== null) return;
    syncTimerRef.current = window.setInterval(() => {
      void doSync();
    }, 800);
  }, [doSync]);

  // ---- User actions ----

  const handleStartFightRef = useRef<() => Promise<void>>(async () => {});

  const handleStartFight = async () => {
    if (!token || !turnstileToken || starting) return;
    // If there's already an active fight, don't start a new one
    if (activeFight && !activeFight.isFinished) return;

    setStarting(true);
    setErrorMessage(null);
    try {
      const fight = await startPlaybackFight(token, turnstileToken);
      setActiveFight(fight);
      lastCursor.current = fight.cursor;
      // Refresh profile (the start endpoint already updates profile on server)
      try {
        const refreshed = await fetchArenaProfile(token);
        setProfile(refreshed);
      } catch { /* ignore */ }
      startSyncLoop();
    } catch (error) {
      // If Turnstile token expired, clear it so the widget reappears
      if (error instanceof ArenaApiError && (error.code === "TURNSTILE_INVALID" || error.code === "TURNSTILE_TOKEN_REQUIRED")) {
        setTurnstileToken(null);
        setErrorMessage("Verification expired — please re-verify below.");
      } else {
        setErrorMessage(normalizeArenaError(error));
      }
    } finally {
      setStarting(false);
    }
  };

  handleStartFightRef.current = handleStartFight;

  // Auto-battle: restart when a fight finishes and auto is enabled
  useEffect(() => {
    const finished = activeFight?.isFinished;
    if (!autoBattle || !finished || !pageVisible.current || !turnstileToken) return;
    clearAutoTimer();
    autoTimerRef.current = window.setTimeout(() => {
      autoTimerRef.current = null;
      void handleStartFightRef.current();
    }, 1500);
    return () => clearAutoTimer();
  }, [autoBattle, activeFight?.isFinished, turnstileToken, clearAutoTimer]);

  // ---- Derived display state ----

  const fightInProgress = activeFight && !activeFight.isFinished;
  const fightFinished = activeFight?.isFinished;
  const consoleLines: ArenaBattleConsoleEvent[] = activeFight?.battle?.console || [];

  const hpCurrent = activeFight
    ? activeFight.battle.currentHp
    : { player: 0, opponent: 0 };
  const hpMax = activeFight
    ? activeFight.battle.maxHp
    : { player: 0, opponent: 0 };

  const resultText = activeFight?.result
    ? activeFight.result === "win"
      ? "VICTORY!"
      : "DEFEAT"
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
            <div className="arena-duel-panel relative mx-auto max-w-2xl overflow-hidden p-3 shadow-[0_18px_45px_rgba(67,151,211,0.24)] sm:p-4">
              <div className="relative space-y-4">
                <div className="">
                  <h2 className="text-4xl font-bold text-blue-900">Time For Battle !{`>^. .^<`}</h2>
                  <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                    <span className="text-pink-300">✿</span> Let's see if your card is superior than your opponent!{" "}
                    <span className="text-pink-300">✿</span>
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-3 pt-3 border-b border-sky-100 pb-3">
                  <Link to="/arena" className="arena-redraw-button hover:animate-wiggle">
                    [ Arena Home ]
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
                  <Link to="/arena/leaderboard" className="arena-redraw-button hover:animate-wiggle">
                    [ Leaderboard ]
                  </Link>
                  <span className="font-bold">|</span>
                  <Link to="/arena/collection" className="arena-redraw-button hover:animate-wiggle">
                    [ Collection ]
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
                  <div className="space-y-5 mx-auto">
                    {/* Card vs Card display */}
                    <div className="relative">
                      <div className="grid grid-cols-3 items-center gap-4">
                        {/* Player card */}
                        <div className="flex justify-center">
                          <div ref={playerCardRef} className={playerFallen ? "card-fall-off" : ""}>
                            <div className="arena-chosen-card-body">
                              <div className="arena-card-portrait-slot">
                                {profile?.selectedCard ? (
                                  <ArenaPortraitCard card={profile.selectedCard} level={profile.level} className="arena-duel-card" />
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* VS */}
                        <div className="flex justify-center">
                          <span className="text-2xl font-black text-pink-400 select-none shrink-0">VS</span>
                        </div>

                        {/* Opponent card */}
                        <div className="flex justify-center">
                          <div ref={opponentCardRef} className={opponentFallen ? "card-fall-off" : ""}>
                            {activeFight?.opponent?.selectedCard ? (
                              <div className="arena-chosen-card-body">
                                <div className="arena-card-portrait-slot">
                                  <ArenaPortraitCard card={activeFight.opponent.selectedCard} level={activeFight.opponent.level} className="arena-duel-card" />
                                </div>
                              </div>
                            ) : (
                              <div className="arena-chosen-card-body">
                                <div className="arena-card-portrait-slot">
                                  <div className="arena-empty-card">?</div>
                                </div>
                              </div>
                            )}
                            {activeFight?.opponent ? (
                              <p className="text-xs text-slate-500 mt-1 text-center">
                                {activeFight.opponent.displayName}{activeFight.opponent.isNpc ? " (NPC)" : ""}
                              </p>
                            ) : null}
                          </div>
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

                    {/* HP bars */}
                    {activeFight ? (
                      <div className="grid grid-cols-2 gap-3">
                        <HpBar current={hpCurrent.player} max={hpMax.player} label="Your HP" />
                        <HpBar current={hpCurrent.opponent} max={hpMax.opponent} label="Opponent HP" />
                      </div>
                    ) : null}

                    {/* Result summary */}
                    {fightFinished ? (
                      <div className={`p-3 text-center text-sm font-semibold ${activeFight?.result === "win" ? "text-emerald-700" : "text-red-700"}`}>
                        {resultText}
                      </div>
                    ) : null}

                    {/* Buttons */}
                    <div className="flex flex-wrap justify-center gap-2">
                      {/* Fight / Start button */}
                      {!fightInProgress ? (
                        <button
                          type="button"
                          onClick={() => void handleStartFight()}
                          disabled={starting || !turnstileToken || (!!activeFight && !activeFight.isFinished)}
                          className="arena-redraw-button hover:animate-wiggle"
                        >
                          {starting
                            ? "[ Starting... ]"
                            : !turnstileToken
                              ? "[ Verify first ]"
                              : fightFinished
                                ? "[ Fight Again! ]"
                                : "[ Fight! ]"}
                        </button>
                      ) : null}

                    </div>

                    {/* Auto checkbox */}
                    <div className="flex justify-center">
                      <label className="flex items-center gap-2 text-sm font-bold text-blue-800 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoBattle}
                          onChange={(e) => setAutoBattle(e.target.checked)}
                          className="accent-blue-600 w-4 h-4"
                        />
                        Auto
                      </label>
                    </div>

                    {errorMessage ? (
                      <ArenaErrorNotice message={errorMessage} />
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <Divider />
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            {activeFight ? (
              <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
                <h2 className="text-center text-lg font-bold text-blue-700 mb-2">console</h2>
                <div
                  ref={consoleRef}
                  className="max-h-80 overflow-y-auto rounded-lg border border-slate-300 bg-slate-950 p-2 font-mono text-xs text-green-300"
                >
                  {consoleLines.length > 0 ? (
                    consoleLines.map((entry, index) => (
                      <p key={`log-${index}`} className="leading-snug">{entry.line}</p>
                    ))
                  ) : (
                    <p className="leading-snug">waiting for battle...</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
                <div className="space-y-2 text-sm text-blue-600">
                  <h2 className="text-center text-lg font-bold text-blue-700">fight info</h2>
                  <p>HP reaches 0 first loses.</p>
                </div>
              </div>
            )}

            <div
              className={turnstileToken ? "hidden" : undefined}
              aria-hidden={turnstileToken ? "true" : undefined}
            >
              <TurnstileWidget
                action="arena_fight"
                onTokenChange={setTurnstileToken}
              />
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaFight;
