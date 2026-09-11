import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaHpBar from "@/parts/ArenaHpBar";
import ArenaSubNav from "@/parts/ArenaSubNav";
import { usePageSeo } from "@/lib/seo";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { useWebSocket } from "@/states/WebSocketProvider";
import { useWebSocketEvent } from "@/hooks/use-websocket";
import {
  normalizeArenaError,
  type ArenaActiveFight,
  type ArenaActiveFighter,
  fetchActiveArenaFighters,
  fetchSpectatedFight,
} from "@/lib/arena";

// The WS layer requires a signed-in session (see mirabellier-backend/app.js
// `/auth/ws-token`, which 401s when signed out), so instant pushes via the
// `arena:fight:<userId>` room (lib/arena/playback.js `broadcastSpectatorUpdate`)
// only reach logged-in viewers — everyone else falls back to a plain poll.
const LIST_POLL_MS = 5000;
const FIGHT_POLL_MS = 2000;
const SPECTATE_JOIN = "arena:fight:spectate:join";
const SPECTATE_LEAVE = "arena:fight:spectate:leave";
const SPECTATOR_UPDATE = "arena:fight:spectator-update";
const FIGHT_ERROR = "arena:fight:error";

function SpectateList() {
  const [fighters, setFighters] = useState<ArenaActiveFighter[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const list = await fetchActiveArenaFighters();
        if (!cancelled) {
          setFighters(list);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!cancelled) setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(load, LIST_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (loading) return <p className="text-blue-500">Checking who's fighting...</p>;
  if (errorMessage) return <ArenaErrorNotice message={errorMessage} />;
  if (fighters.length === 0) {
    return <p className="text-sm text-blue-500">Nobody's fighting right now — check back later.</p>;
  }

  return (
    <ol className="space-y-1">
      {fighters.map((fighter) => (
        <li
          key={fighter.userId}
          className="border-b border-blue-100 pb-3 last:border-b-0 last:pb-0"
        >
          <Link
            to={`/arena/spectate/${fighter.userId}`}
            className="flex items-center justify-between gap-3 font-bold text-blue-700 hover:text-pink-600"
          >
            <span>{fighter.username}</span>
            <span className="text-sm font-semibold text-pink-500">watch »</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function SpectateFight({ userId }: { userId: string }) {
  const auth = useOptionalAuth();
  const isLoggedIn = Boolean(auth?.user);
  const ws = useWebSocket();
  const [fight, setFight] = useState<ArenaActiveFight | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initial paint for everyone, then — logged out only — a plain poll.
  // Logged-in viewers get pushed updates instead (see the effect + the two
  // useWebSocketEvent subscriptions below).
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const state = await fetchSpectatedFight(userId, controller.signal);
        if (cancelled) return;
        setFight(state);
        setErrorMessage(state ? null : "This fight has ended.");
      } catch (error) {
        if (!cancelled) setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    if (isLoggedIn) {
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const interval = window.setInterval(() => {
      // Stop hammering the server once the fight is over — nothing left to change.
      setFight((current) => {
        if (!current || !current.isFinished) void load();
        return current;
      });
    }, FIGHT_POLL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [userId, isLoggedIn]);

  // Join/leave the fighter's spectator room whenever the fighter changes —
  // and always leave on unmount, so navigating away stops the pushes.
  useEffect(() => {
    if (!isLoggedIn) return;
    ws.sendWhenReady({ type: SPECTATE_JOIN, data: { userId } });
    return () => {
      ws.sendWhenReady({ type: SPECTATE_LEAVE, data: { userId } });
    };
  }, [isLoggedIn, userId, ws]);

  useWebSocketEvent(SPECTATOR_UPDATE, (raw) => {
    setFight(raw as ArenaActiveFight);
    setErrorMessage(null);
    setLoading(false);
  });

  // arena:fight:error is shared with the fighter's own action errors (rate
  // limits, verification) — only react to the join-specific code so an
  // unrelated error from this viewer's own fight in another tab can't be
  // mistaken for this one ending.
  useWebSocketEvent(FIGHT_ERROR, (raw) => {
    const err = raw as { code?: string };
    if (err?.code !== "ARENA_FIGHT_NOT_FOUND") return;
    setFight(null);
    setErrorMessage("This fight has ended.");
    setLoading(false);
  });

  if (loading) return <p className="text-blue-500">Loading fight...</p>;
  if (!fight) {
    return (
      <ArenaErrorNotice message={errorMessage || "This fight has ended."} />
    );
  }

  const { battle, opponent, score, turns, isFinished, result } = fight;

  return (
    <div className="space-y-4">
      <p className="text-right text-xs font-semibold text-blue-400">
        {isLoggedIn ? "🔴 live" : "updates every few seconds"}
      </p>
      <div className="grid grid-cols-2 gap-4">
        <ArenaHpBar
          current={battle.currentHp.player}
          max={battle.maxHp.player}
          shield={battle.currentShield?.player}
          label="fighter"
        />
        <ArenaHpBar
          current={battle.currentHp.opponent}
          max={battle.maxHp.opponent}
          shield={battle.currentShield?.opponent}
          label={opponent.displayName}
        />
      </div>

      <p className="text-center text-sm font-semibold text-blue-600">
        Round score {score.player} – {score.opponent}
      </p>

      {isFinished ? (
        <p className="text-center text-lg font-bold text-pink-600">
          Fight over — {result === "win" ? "the fighter won!" : "the fighter lost."}
        </p>
      ) : null}

      <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-sm">
        {battle.console.length === 0 ? (
          <p className="text-blue-400">Waiting for the first move...</p>
        ) : (
          battle.console.map((event, index) => (
            <p key={index} className="text-slate-700">
              {event.line}
            </p>
          ))
        )}
      </div>

      <p className="text-center text-xs text-blue-400">
        Turn {fight.cursor} of {fight.totalTurns} · {turns.length} revealed
      </p>
    </div>
  );
}

const ArenaSpectate = () => {
  const { userId } = useParams<{ userId?: string }>();

  usePageSeo({
    canonical: userId
      ? `https://mirabellier.com/arena/spectate/${userId}`
      : "https://mirabellier.com/arena/spectate",
    structuredDataId: "arena-spectate-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Spectate",
      description: "Watch an Arena fight unfold, turn by turn, in real time.",
      url: "https://mirabellier.com/arena/spectate",
    },
  });

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
                <h2 className="text-4xl font-bold text-blue-900">Spectate {`>^. .^<`}</h2>
                <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                  <span className="text-pink-300">✿</span> Watch a fight unfold, read-only.{" "}
                  <span className="text-pink-300">✿</span>
                </p>
              </div>

              <ArenaSubNav />

              {userId ? (
                <>
                  <Link
                    to="/arena/spectate"
                    className="text-sm font-semibold text-blue-500 hover:text-pink-600"
                  >
                    « back to who's fighting
                  </Link>
                  <SpectateFight userId={userId} />
                </>
              ) : (
                <SpectateList />
              )}
            </section>
            <Divider />
          </main>
          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-2 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">about spectating</h2>
                <p>Pick anyone currently fighting and watch their turns play out.</p>
                <p>It's read-only — nothing you do here affects the fight.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaSpectate;
