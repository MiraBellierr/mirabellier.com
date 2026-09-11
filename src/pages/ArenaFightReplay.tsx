import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaHpBar from "@/parts/ArenaHpBar";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import ArenaSubNav from "@/parts/ArenaSubNav";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageSeo } from "@/lib/seo";
import {
  ELEMENT_COLORS,
  normalizeArenaError,
  type ArenaBattleTurn,
  type ArenaFightReplayRecord,
  fetchArenaFightReplay,
} from "@/lib/arena";

const STEP_MS = 900;

// Mirrors ArenaFight.tsx's live combat floaters/shake exactly, just driven by
// the `revealed` counter advancing instead of server-pushed turn messages.
type DmgFloater = { key: number; value: number; crit: boolean; x: number; y: number };
type ElemFloater = { key: number; label: string; color: string; x: number; y: number };

function shakeCard(ref: React.RefObject<HTMLDivElement | null>, hard: boolean) {
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
}

// `arena_fights.roundsJson` only stores the raw per-turn numbers, not the
// human-readable console lines an *active* fight's simulation carries — those
// live only in the short-lived arena_active_fights row. So the replay
// reconstructs the same two-line-per-turn format from the round fields
// themselves instead of re-fetching anything.
function describeRound(round: ArenaBattleTurn): string[] {
  const lines = [`${round.attackerName} is attacking ${round.defenderName}`];
  if (round.avoided) {
    lines.push(`${round.defenderName} evaded the attack`);
  } else {
    lines.push(
      `${round.attackerName} dealt ${round.damage} damage${round.critical ? " (CRIT)" : ""}`,
    );
  }
  return lines;
}

function deriveMaxHp(rounds: ArenaBattleTurn[]) {
  return {
    player: rounds.reduce((max, r) => Math.max(max, r.playerHp), 0),
    opponent: rounds.reduce((max, r) => Math.max(max, r.opponentHp), 0),
  };
}

const ArenaFightReplay = () => {
  const { id } = useParams<{ id: string }>();
  const isMobile = useIsMobile();
  const [fight, setFight] = useState<ArenaFightReplayRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [floaters, setFloaters] = useState<DmgFloater[]>([]);
  const [elemFloaters, setElemFloaters] = useState<ElemFloater[]>([]);
  const [playerFallen, setPlayerFallen] = useState(false);
  const [opponentFallen, setOpponentFallen] = useState(false);
  const floaterKey = useRef(0);
  const processedRounds = useRef(0);
  const playerCardRef = useRef<HTMLDivElement | null>(null);
  const opponentCardRef = useRef<HTMLDivElement | null>(null);

  usePageSeo({
    canonical: `https://mirabellier.com/arena/fight/${id}`,
    structuredDataId: "arena-fight-replay-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Fight Replay",
      description: "Watch a completed Arena fight play out, turn by turn.",
      url: `https://mirabellier.com/arena/fight/${id}`,
    },
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const controller = new AbortController();

    fetchArenaFightReplay(id, controller.signal)
      .then((record) => {
        if (cancelled) return;
        setFight(record);
        setRevealed(record ? Math.min(1, record.rounds.length) : 0);
        setErrorMessage(record ? null : "This fight wasn't found.");
      })
      .catch((error) => {
        if (!cancelled) setErrorMessage(normalizeArenaError(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id]);

  const totalTurns = fight?.rounds.length || 0;

  useEffect(() => {
    if (!playing || revealed >= totalTurns) return;
    const timer = window.setTimeout(() => setRevealed((n) => n + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, revealed, totalTurns]);

  // New fight loaded, or restarted (revealed dropped back down) — clear effects.
  useEffect(() => {
    if (revealed >= processedRounds.current) return;
    processedRounds.current = 0;
    setFloaters([]);
    setElemFloaters([]);
    setPlayerFallen(false);
    setOpponentFallen(false);
  }, [revealed, fight?.id]);

  const triggerRoundEffects = useCallback((round: ArenaBattleTurn) => {
    const isPlayerDefender = round.defender === "player";

    if (round.avoided) {
      const key = floaterKey.current++;
      const mx = isPlayerDefender ? 8 + Math.random() * 28 : 64 + Math.random() * 28;
      setFloaters((prev) => [...prev, { key, value: 0, crit: false, x: mx, y: 20 + Math.random() * 40 }]);
      setTimeout(() => setFloaters((prev) => prev.filter((f) => f.key !== key)), 1400);
      shakeCard(isPlayerDefender ? playerCardRef : opponentCardRef, false);
      return;
    }

    const dmg = Number(round.damage) || 0;
    if (dmg > 0) {
      const isCrit = Boolean(round.critical);
      const key = floaterKey.current++;
      const fx = isPlayerDefender ? 8 + Math.random() * 28 : 64 + Math.random() * 28;
      setFloaters((prev) => [...prev, { key, value: dmg, crit: isCrit, x: fx, y: 20 + Math.random() * 40 }]);
      setTimeout(() => setFloaters((prev) => prev.filter((f) => f.key !== key)), 1800);
      shakeCard(isPlayerDefender ? playerCardRef : opponentCardRef, isCrit);
    }

    if (round.elementEffective) {
      const ek = floaterKey.current++;
      const ex = isPlayerDefender ? 10 + Math.random() * 24 : 66 + Math.random() * 24;
      const isEffective = round.elementEffective === "super-effective";
      const label = isEffective ? "Super Effective" : "Weak...";
      const color = round.elementAttacker && ELEMENT_COLORS[round.elementAttacker]
        ? ELEMENT_COLORS[round.elementAttacker]
        : isEffective ? "#ffbe0b" : "#94a3b8";
      setElemFloaters((prev) => [...prev, { key: ek, label, color, x: ex, y: 10 + Math.random() * 30 }]);
      setTimeout(() => setElemFloaters((prev) => prev.filter((f) => f.key !== ek)), 1600);
    }
  }, []);

  useEffect(() => {
    if (!fight) return;
    for (let i = processedRounds.current; i < revealed; i++) {
      const round = fight.rounds[i];
      if (round) triggerRoundEffects(round);
    }
    processedRounds.current = revealed;
  }, [fight, revealed, triggerRoundEffects]);

  const maxHp = useMemo(() => (fight ? deriveMaxHp(fight.rounds) : { player: 0, opponent: 0 }), [fight]);
  const revealedRounds = fight ? fight.rounds.slice(0, revealed) : [];
  const lastRound = revealedRounds[revealedRounds.length - 1];
  const currentHp = {
    player: lastRound?.playerHp ?? maxHp.player,
    opponent: lastRound?.opponentHp ?? maxHp.opponent,
  };
  const opponentName = fight?.rounds.find((r) => r.attacker === "opponent")?.attackerName
    || fight?.rounds.find((r) => r.defender === "opponent")?.defenderName
    || "opponent";
  const isDone = revealed >= totalTurns;

  useEffect(() => {
    if (!isDone || totalTurns === 0) return;
    if (currentHp.player <= 0) setPlayerFallen(true);
    if (currentHp.opponent <= 0) setOpponentFallen(true);
  }, [isDone, totalTurns, currentHp.player, currentHp.opponent]);

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
                <h2 className="text-4xl font-bold text-blue-900">Replay {`>^. .^<`}</h2>
                <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                  <span className="text-pink-300">✿</span> A completed fight, turn by turn.{" "}
                  <span className="text-pink-300">✿</span>
                </p>
              </div>

              <ArenaSubNav />

              {loading ? (
                <p className="text-blue-500">Loading replay...</p>
              ) : !fight ? (
                <ArenaErrorNotice message={errorMessage || "This fight wasn't found."} />
              ) : (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-blue-600">
                    {fight.username} vs {opponentName} ·{" "}
                    <span className={fight.result === "win" ? "text-emerald-600" : "text-red-500"}>
                      {fight.result === "win" ? "won" : "lost"}
                    </span>{" "}
                    · {new Date(fight.createdAt).toLocaleDateString()}
                  </p>

                  <div className="relative">
                    <div className="arena-fight-stage">
                      <div className="arena-fight-combatant">
                        <div ref={playerCardRef} className={playerFallen ? "card-fall-off" : ""}>
                          <div className="arena-chosen-card-body">
                            <div className="arena-card-portrait-slot">
                              {fight.playerCard ? (
                                <ArenaPortraitCard
                                  card={fight.playerCard}
                                  className="arena-duel-card"
                                  auto={!isMobile}
                                />
                              ) : (
                                <div className="arena-empty-card">?</div>
                              )}
                            </div>
                          </div>
                          <p className="mt-1 text-center text-xs text-slate-500">{fight.username}</p>
                        </div>
                      </div>

                      <div className="arena-fight-versus" aria-hidden="true">
                        <span className="select-none text-2xl font-black text-pink-400">VS</span>
                      </div>

                      <div className="arena-fight-combatant">
                        <div ref={opponentCardRef} className={opponentFallen ? "card-fall-off" : ""}>
                          <div className="arena-chosen-card-body">
                            <div className="arena-card-portrait-slot">
                              {fight.opponentCard ? (
                                <ArenaPortraitCard
                                  card={fight.opponentCard}
                                  className="arena-duel-card"
                                  auto={!isMobile}
                                />
                              ) : (
                                <div className="arena-empty-card">?</div>
                              )}
                            </div>
                          </div>
                          <p className="mt-1 text-center text-xs text-slate-500">{opponentName}</p>
                        </div>
                      </div>
                    </div>

                    {floaters.map((f) => (
                      <span
                        key={f.key}
                        className={f.value === 0 ? "dmg-float dmg-float--miss" : f.crit ? "dmg-float dmg-float--crit" : "dmg-float dmg-float--hit"}
                        style={{ left: `${f.x}%`, top: `${f.y}%` }}
                      >
                        {f.value === 0 ? "MISS!" : f.crit ? `CRIT ${f.value}!` : `-${f.value}`}
                      </span>
                    ))}
                    {elemFloaters.map((f) => (
                      <span
                        key={f.key}
                        className="elem-float"
                        style={{ left: `${f.x}%`, top: `${f.y}%`, color: f.color, textShadow: `0 0 10px ${f.color}, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.6)` }}
                      >
                        {f.label}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <ArenaHpBar
                      current={currentHp.player}
                      max={maxHp.player}
                      shield={lastRound?.playerShield ?? 0}
                      label={fight.username}
                    />
                    <ArenaHpBar
                      current={currentHp.opponent}
                      max={maxHp.opponent}
                      shield={lastRound?.opponentShield ?? 0}
                      label={opponentName}
                    />
                  </div>

                  <div
                    className={`flex h-24 flex-col items-center justify-center p-3 text-center text-sm font-semibold ${
                      isDone
                        ? fight.result === "win"
                          ? "text-emerald-700"
                          : "text-red-700"
                        : "text-pink-400"
                    }`}
                    aria-live="polite"
                  >
                    {isDone ? (
                      <>
                        <p>{fight.result === "win" ? "You won! (´｀*)" : "You lost. Better luck next time!"}</p>
                        <p className="mt-1 text-xs font-bold text-blue-700 dark:text-sky-200">
                          +{fight.xpDelta} EXP · +{fight.coinDelta} coins
                        </p>
                      </>
                    ) : (
                      <p>Turn {revealed} of {totalTurns}...</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPlaying((p) => !p)}
                      disabled={isDone}
                      className="arena-redraw-button hover:animate-wiggle disabled:opacity-40"
                    >
                      {isDone ? "[ done ]" : playing ? "[ pause ]" : "[ play ]"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setRevealed(totalTurns);
                      }}
                      disabled={isDone}
                      className="arena-redraw-button hover:animate-wiggle disabled:opacity-40"
                    >
                      [ skip to end ]
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRevealed(Math.min(1, totalTurns));
                        setPlaying(true);
                      }}
                      className="arena-redraw-button hover:animate-wiggle"
                    >
                      [ restart ]
                    </button>
                  </div>

                  <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-sm">
                    {revealedRounds.length === 0 ? (
                      <p className="text-blue-400">No turns recorded for this fight.</p>
                    ) : (
                      revealedRounds.map((round, index) => (
                        <div key={index}>
                          {describeRound(round).map((line, lineIndex) => (
                            <p key={lineIndex} className="text-slate-700">
                              {line}
                            </p>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </section>
            <Divider />
          </main>
          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-2 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">about replays</h2>
                <p>Every completed fight can be watched again, turn by turn.</p>
                <p>Nothing here affects the original result.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaFightReplay;
