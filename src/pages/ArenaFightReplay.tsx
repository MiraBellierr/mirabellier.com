import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaHpBar from "@/parts/ArenaHpBar";
import ArenaSubNav from "@/parts/ArenaSubNav";
import { usePageSeo } from "@/lib/seo";
import {
  normalizeArenaError,
  type ArenaBattleTurn,
  type ArenaFightReplayRecord,
  fetchArenaFightReplay,
} from "@/lib/arena";

const STEP_MS = 900;

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
  const [fight, setFight] = useState<ArenaFightReplayRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(true);

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

                  <div className="grid grid-cols-2 gap-4">
                    <ArenaHpBar current={currentHp.player} max={maxHp.player} label={fight.username} />
                    <ArenaHpBar current={currentHp.opponent} max={maxHp.opponent} label={opponentName} />
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

                  <p className="text-center text-xs text-blue-400">
                    Turn {revealed} of {totalTurns}
                    {isDone ? ` · +${fight.xpDelta} XP, +${fight.coinDelta} coins` : null}
                  </p>
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
