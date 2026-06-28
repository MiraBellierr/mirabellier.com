import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaSubNav from "@/parts/ArenaSubNav";
import TurnstileWidget from "@/components/TurnstileWidget";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import type { Socket } from "socket.io-client";
import { createDedicatedSocket } from "@/lib/websocket";
import { usePageSeo } from "@/lib/seo";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ArenaApiError,
  type ArenaActiveFight,
  type ArenaBattleConsoleEvent,
  type ArenaProfile,
  fetchArenaProfile,
  fetchFightState,
  verifyArena,
} from "@/lib/arena";
import { formatActiveEffects } from "@/lib/arena-shop-ui";

const ELEMENT_COLORS: Record<string, string> = {
  Fire: "#e74c3c",
  Water: "#3498db",
  Earth: "#27ae60",
  Wind: "#2ecc71",
  Light: "#f1c40f",
  Dark: "#8e44ad",
};

const WEAKNESS_ROWS = [
  { element: "Fire", beats: "Earth", color: ELEMENT_COLORS.Fire, beatsColor: ELEMENT_COLORS.Earth },
  { element: "Water", beats: "Fire", color: ELEMENT_COLORS.Water, beatsColor: ELEMENT_COLORS.Fire },
  { element: "Earth", beats: "Water", color: ELEMENT_COLORS.Earth, beatsColor: ELEMENT_COLORS.Water },
  { element: "Wind", beats: "Light", color: ELEMENT_COLORS.Wind, beatsColor: ELEMENT_COLORS.Light },
  { element: "Light", beats: "Dark", color: ELEMENT_COLORS.Light, beatsColor: ELEMENT_COLORS.Dark },
  { element: "Dark", beats: "Wind", color: ELEMENT_COLORS.Dark, beatsColor: ELEMENT_COLORS.Wind },
];

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena request failed.";
}

type DmgFloater = { key: number; value: number; crit: boolean; x: number; y: number };
type ElemFloater = { key: number; label: string; color: string; x: number; y: number };

function HpBar({
  current,
  max,
  shield = 0,
  label,
}: {
  current: number;
  max: number;
  shield?: number;
  label: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const shieldPct =
    max > 0 && shield > 0
      ? Math.min(100, (shield / max) * 100)
      : 0;
  const color = pct > 60 ? "bg-emerald-500" : pct > 30 ? "bg-amber-400" : "bg-red-500";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold">
        <p className="text-blue-500">{label}</p>
        {shield > 0 ? <p className="text-cyan-600">Shield +{shield}</p> : null}
      </div>
      <div
        className="relative h-5 w-full overflow-hidden rounded-full border border-slate-300 bg-slate-200"
        aria-label={`${label}: ${current} of ${max}${shield > 0 ? `, shield ${shield}` : ""}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
        {shield > 0 ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 rounded-full border-2 border-cyan-400 shadow-[inset_0_0_5px_rgba(34,211,238,0.9),0_0_6px_rgba(34,211,238,0.65)] transition-all duration-500 ease-out"
            style={{ width: `${shieldPct}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <p className="text-xs text-slate-600 mt-0.5">{current} / {max}</p>
    </div>
  );
}

const ArenaFight = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const socketRef = useRef<Socket | null>(null);
  const [fightConnected, setFightConnected] = useState(false);
  const isMobile = useIsMobile();

  const [profile, setProfile] = useState<ArenaProfile | null>(null);
  const [activeFight, setActiveFight] = useState<ArenaActiveFight | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [floaters, setFloaters] = useState<DmgFloater[]>([]);
  const [elemFloaters, setElemFloaters] = useState<ElemFloater[]>([]);
  const [playerFallen, setPlayerFallen] = useState(false);
  const [opponentFallen, setOpponentFallen] = useState(false);
  const [autoBattle, setAutoBattle] = useState(false);
  const [nextAutoFightAt, setNextAutoFightAt] = useState<number | null>(null);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const playerCardRef = useRef<HTMLDivElement | null>(null);
  const opponentCardRef = useRef<HTMLDivElement | null>(null);
  const floaterKey = useRef(0);
  const consoleRef = useRef<HTMLDivElement | null>(null);

  const lastCursor = useRef(0);
  const needsResumeRef = useRef(false);
  const autoTimerRef = useRef<number | null>(null);
  const advanceTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  const resumeRetryRef = useRef<number | null>(null);
  const pageVisible = useRef(true);
  const advanceLockRef = useRef(false);
  const playedTurnIndices = useRef(new Set<number>());

  const boostedIv = useMemo(() => {
    if (!profile?.selectedCard?.iv || !profile.effects?.ivBoostCharges || profile.effects.ivBoostCharges <= 0) return null;
    const base = profile.selectedCard.iv;
    const iv = { power: base.power, guard: base.guard, speed: base.speed, effectHit: base.effectHit, total: base.total };
    const stats = ["power", "guard", "speed", "effectHit"] as const;
    for (let i = 0; i < 5; i++) {
      const stat = stats[Math.floor(Math.random() * stats.length)];
      iv[stat] = Math.min(iv[stat] + 1, 31);
    }
    iv.total = iv.power + iv.guard + iv.speed + iv.effectHit;
    return iv;
  }, [profile?.selectedCard?.iv, profile?.effects?.ivBoostCharges]);
  const startPendingRef = useRef(false);
  const isAutoStartRef = useRef(false);

  const tokenRef = useRef(token);
  const activeFightRef = useRef(activeFight);
  const countdownRef = useRef<HTMLSpanElement | null>(null);

  tokenRef.current = token;
  activeFightRef.current = activeFight;

  const activeFightId = activeFight?.fightId ?? null;
  const activeFightCursor = activeFight?.cursor ?? null;
  const activeFightFinished = activeFight?.isFinished ?? false;
  const activeFightPlayerHp = activeFight?.battle.currentHp.player ?? 0;
  const activeFightOpponentHp = activeFight?.battle.currentHp.opponent ?? 0;

  const TURN_ADVANCE_DELAY_MS = 800;
  const isSocketConnected = fightConnected;

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const clearAutoTimer = useCallback(() => {
    if (autoTimerRef.current !== null) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setNextAutoFightAt(null);
  }, []);

  const queueFightCommand = useCallback(
    (type: "arena:fight:advance" | "arena:fight:skip" | "arena:fight:start") => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        advanceLockRef.current = false;
        startPendingRef.current = false;
        setStarting(false);
        setErrorMessage("Connection lost. Please refresh and try again.");
        return false;
      }
      socket.emit("message", { type });
      return true;
    },
    [],
  );

  useEffect(() => {
    if (nextAutoFightAt === null) return;
    const el = countdownRef.current;
    if (!el) return;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((nextAutoFightAt - Date.now()) / 1000));
      el.textContent = `Next fight in ${seconds}s`;
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [nextAutoFightAt]);

  // On unmount — clear all timers
  useEffect(() => {
    return () => {
      clearAutoTimer();
      clearAdvanceTimer();
      clearSafetyTimer();
    };
  }, [clearAutoTimer, clearAdvanceTimer, clearSafetyTimer]);

  // Pause auto-battle when tab loses focus; reconnect handler resumes on foreground
  useEffect(() => {
    const onVisibility = () => {
      pageVisible.current = document.visibilityState === "visible";
      if (!pageVisible.current) {
        clearAutoTimer();
      }
    };
    const onPageHide = () => {
      clearAutoTimer();
      clearAdvanceTimer();
      clearSafetyTimer();
      advanceLockRef.current = false;
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [clearAutoTimer, clearAdvanceTimer, clearSafetyTimer]);

  // Page-load verification — verify Turnstile token once
  useEffect(() => {
    if (!token || !turnstileToken || verified) return;
    verifyArena(token, turnstileToken)
      .then(() => setVerified(true))
      .catch(() => setTurnstileToken(null)); // reset widget on failure
  }, [token, turnstileToken, verified]);

  // Auto-battle must stay off while Cloudflare is asking for verification.
  useEffect(() => {
    if (!verified) setAutoBattle(false);
  }, [verified]);

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
        if (payload.activeFight) {
          setActiveFight(payload.activeFight);
          lastCursor.current = payload.activeFight.cursor;
          if (!payload.activeFight.isFinished) {
            needsResumeRef.current = true;
          }
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

  const triggerTurnEffects = useCallback((prevCursor: number, fight: ArenaActiveFight) => {
    const turns = fight.turns || [];
    const seen = playedTurnIndices.current;
    for (let i = prevCursor; i < fight.cursor; i++) {
      if (seen.has(i)) continue;
      seen.add(i);
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
      if (dmg > 0) {
        const isCrit = Boolean(turn.critical);
        const key = floaterKey.current++;
        const fx = isPlayerDefender ? 8 + Math.random() * 28 : 64 + Math.random() * 28;
        setFloaters((prev) => [...prev, { key, value: dmg, crit: isCrit, x: fx, y: 20 + Math.random() * 40 }]);
        setTimeout(() => setFloaters((prev) => prev.filter((f) => f.key !== key)), 1800);
        shakeCard(isPlayerDefender ? playerCardRef : opponentCardRef, isCrit);
      }

      if (turn.elementEffective) {
        const ek = floaterKey.current++;
        const ex = isPlayerDefender ? 10 + Math.random() * 24 : 66 + Math.random() * 24;
        const isEffective = turn.elementEffective === "super-effective";
        const label = isEffective ? "Super Effective" : "Weak...";
        const color = turn.elementAttacker && ELEMENT_COLORS[turn.elementAttacker]
          ? ELEMENT_COLORS[turn.elementAttacker]
          : isEffective ? "#ffbe0b" : "#94a3b8";
        setElemFloaters((prev) => [...prev, { key: ek, label, color, x: ex, y: 10 + Math.random() * 30 }]);
        setTimeout(() => setElemFloaters((prev) => prev.filter((f) => f.key !== ek)), 1600);
      }
    }
  }, []);

  // Fall animation when fight finishes
  useEffect(() => {
    if (!activeFightFinished) return;
    if (activeFightPlayerHp <= 0) setPlayerFallen(true);
    if (activeFightOpponentHp <= 0) setOpponentFallen(true);
  }, [activeFightFinished, activeFightOpponentHp, activeFightPlayerHp]);

  // Reset fall when new fight starts
  useEffect(() => {
    if (!activeFightId || activeFightCursor !== 0) return;
    setFloaters([]);
    setElemFloaters([]);
    setPlayerFallen(false);
    setOpponentFallen(false);
    lastCursor.current = 0;
    playedTurnIndices.current.clear();
  }, [activeFightCursor, activeFightId]);

  // Resume fight loop when returning to an in-progress fight
  useEffect(() => {
    if (!activeFightId || activeFightFinished || !needsResumeRef.current) return;
    needsResumeRef.current = false;

    let attempts = 0;
    const tryResume = () => {
      if (advanceLockRef.current) {
        if (attempts >= 20) {
          advanceLockRef.current = false;
          attempts = 0;
        }
        attempts++;
        resumeRetryRef.current = window.setTimeout(tryResume, 500);
        return;
      }
      advanceLockRef.current = true;
      queueFightCommand("arena:fight:advance");
    };

    tryResume();

    return () => {
      if (resumeRetryRef.current !== null) {
        window.clearTimeout(resumeRetryRef.current);
        resumeRetryRef.current = null;
      }
    };
  }, [activeFightFinished, activeFightId, queueFightCommand]);

  // ---- WebSocket event handlers ----

  const processFightState = useCallback((state: ArenaActiveFight) => {
    const prev = lastCursor.current;
    lastCursor.current = state.cursor;
    setActiveFight(state);
    if (state.cursor > prev) {
      triggerTurnEffects(prev, state);
    }
    return state;
  }, [triggerTurnEffects]);

  // ---- Dedicated Socket.IO setup for fight ----

  useEffect(() => {
    const socket = createDedicatedSocket();

    socket.on("connect", () => setFightConnected(true));
    socket.on("disconnect", () => setFightConnected(false));
    socket.on("connect_error", () => setFightConnected(false));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socket.removeAllListeners();
      socketRef.current = null;
    };
  }, []);

  // Connect socket when ready (authenticated + verified)
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !token || !verified) return;
    if (!socket.connected) {
      socket.connect();
    }
  }, [token, verified]);

  // Sync fight state on reconnection
  const wasDisconnectedRef = useRef(false);

  useEffect(() => {
    if (!fightConnected) {
      wasDisconnectedRef.current = true;
      return;
    }
    if (!wasDisconnectedRef.current) return;
    wasDisconnectedRef.current = false;

    const t = tokenRef.current;
    const fight = activeFightRef.current;
    if (!t || !fight || fight.isFinished) return;

    fetchFightState(t)
      .then(({ activeFight: fresh }) => {
        if (!fresh || fresh.fightId !== fight.fightId) return;
        processFightState(fresh);
        if (!fresh.isFinished && !advanceLockRef.current) {
          advanceLockRef.current = true;
          queueFightCommand("arena:fight:advance");
        }
      })
      .catch(() => {});
  }, [fightConnected, processFightState, queueFightCommand]);

  // ---- WS action helpers ----

  const sendAdvance = useCallback(() => {
    if (advanceLockRef.current) return;
    advanceLockRef.current = true;
    if (!queueFightCommand("arena:fight:advance")) return;
    clearSafetyTimer();
    safetyTimerRef.current = window.setTimeout(() => {
      safetyTimerRef.current = null;
      advanceLockRef.current = false;
      if (socketRef.current?.connected) {
        sendAdvance();
      }
    }, 10000);
  }, [clearSafetyTimer, queueFightCommand]);

  // Register fight event listeners on the dedicated socket
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handler = (msg: { type: string; data: unknown }) => {
      switch (msg.type) {
        case "arena:fight:turn": {
          const state = msg.data as ArenaActiveFight;
          advanceLockRef.current = false;
          clearSafetyTimer();
          if (startPendingRef.current) {
            startPendingRef.current = false;
            setStarting(false);
          }
          processFightState(state);
          if (!state.isFinished) {
            clearAdvanceTimer();
            advanceTimerRef.current = window.setTimeout(() => {
              advanceTimerRef.current = null;
              sendAdvance();
            }, TURN_ADVANCE_DELAY_MS);
          } else {
            clearAdvanceTimer();
            const t = tokenRef.current;
            if (t) fetchArenaProfile(t).then((p) => {
              setProfile(p);
              if (p.level >= 5 && !p.tutorialComplete) setShowTutorialModal(true);
            }).catch(() => {});
          }
          break;
        }
        case "arena:fight:finished": {
          const state = msg.data as ArenaActiveFight;
          advanceLockRef.current = false;
          clearSafetyTimer();
          if (startPendingRef.current) {
            startPendingRef.current = false;
            setStarting(false);
          }
          processFightState(state);
          const t = tokenRef.current;
          if (t) fetchArenaProfile(t).then((p) => {
            setProfile(p);
            if (p.level >= 5 && !p.tutorialComplete) setShowTutorialModal(true);
          }).catch(() => {});
          break;
        }
        case "arena:fight:error": {
          advanceLockRef.current = false;
          clearSafetyTimer();
          if (startPendingRef.current) {
            startPendingRef.current = false;
            setStarting(false);
          }
          const err = msg.data as { code?: string; message?: string; retryAfterMs?: number };
          if (err.code === "ARENA_FIGHT_COOLDOWN" && isAutoStartRef.current) {
            const retryAfterMs = Math.max(err.retryAfterMs || 250, 250);
            if (autoTimerRef.current !== null) {
              window.clearTimeout(autoTimerRef.current);
            }
            autoTimerRef.current = window.setTimeout(() => {
              autoTimerRef.current = null;
              setNextAutoFightAt(null);
              if (pageVisible.current) {
                void handleStartFightRef.current(true);
              }
            }, retryAfterMs + 50);
            return;
          }
          setErrorMessage(err.message || "Arena fight error");
          break;
        }
      }
    };

    socket.on("message", handler);
    return () => { socket.off("message", handler); };
  }, [processFightState, sendAdvance, clearAdvanceTimer, clearSafetyTimer]);

  // ---- User actions ----

  const handleStartFightRef = useRef<(automatic?: boolean) => void>(() => {});

  const handleStartFight = useCallback((automatic = false) => {
    if (!token || starting) return;
    if (activeFight && !activeFight.isFinished) return;
    if (!automatic && !isSocketConnected) {
      setErrorMessage("Connecting to Arena. Please try again in a moment.");
      return;
    }

    needsResumeRef.current = false;
    setStarting(true);
    setErrorMessage(null);
    startPendingRef.current = true;
    isAutoStartRef.current = automatic;
    advanceLockRef.current = true;
    queueFightCommand("arena:fight:start");
  }, [
    token,
    starting,
    activeFight,
    isSocketConnected,
    queueFightCommand,
  ]);

  handleStartFightRef.current = handleStartFight;

  const handleSkip = useCallback(() => {
    if (advanceLockRef.current) return;
    advanceLockRef.current = true;
    queueFightCommand("arena:fight:skip");
  }, [queueFightCommand]);

  const handleSkipRef = useRef(handleSkip);
  handleSkipRef.current = handleSkip;

  // Auto-battle: restart when a fight finishes and auto is enabled
  useEffect(() => {
    if (!autoBattle || !activeFightFinished || !pageVisible.current) return;
    clearAutoTimer();
    setNextAutoFightAt(Date.now() + 1500);
    autoTimerRef.current = window.setTimeout(() => {
      autoTimerRef.current = null;
      setNextAutoFightAt(null);
      void handleStartFightRef.current(true);
    }, 1500);
    return () => clearAutoTimer();
  }, [activeFightFinished, autoBattle, clearAutoTimer]);

  // ---- Derived display state ----

  const fightInProgress = activeFight && !activeFight.isFinished;
  const fightFinished = activeFight?.isFinished;
  const consoleLines: ArenaBattleConsoleEvent[] = activeFight?.battle?.console || [];

  // Auto-scroll console
  useLayoutEffect(() => {
    const el = consoleRef.current;
    if (!el) return;
    const timer = setTimeout(() => {
      el.scrollTop = el.scrollHeight;
    }, 50);
    return () => clearTimeout(timer);
  }, [consoleLines.length]);

  const hpCurrent = activeFight
    ? activeFight.battle.currentHp
    : { player: 0, opponent: 0 };
  const hpMax = activeFight
    ? activeFight.battle.maxHp
    : { player: 0, opponent: 0 };
  const shieldCurrent = activeFight?.battle.currentShield ?? {
    player: 0,
    opponent: 0,
  };

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
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-4 p-2 sm:p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>

          <main className="w-full min-w-0 space-y-2 p-0 sm:p-4 lg:w-3/5">
            <div className="arena-duel-panel arena-fight-panel relative mx-auto max-w-2xl overflow-hidden p-2 shadow-[0_18px_45px_rgba(67,151,211,0.24)] sm:p-4">
              <div className="relative space-y-4">
                <div className="">
                  <h2 className="text-[clamp(1.75rem,9vw,2.25rem)] font-bold leading-tight text-blue-900 sm:text-4xl">
                    Time For Battle !{`>^. .^<`}
                  </h2>
                  <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                    <span className="text-pink-300">✿</span> Let's see if your card is superior than your opponent!{" "}
                    <span className="text-pink-300">✿</span>
                  </p>
                </div>

                <ArenaSubNav />

                {profile ? (
                  (() => {
                    const effects = formatActiveEffects(profile);
                    return effects.length > 0 ? (
                      <div className="pt-2 text-center text-xs text-blue-700 dark:text-purple-200">
                        {effects.join(" · ")}
                      </div>
                    ) : null;
                  })()
                ) : null}

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
                    <div className="relative">
                      <div className="arena-fight-stage">
                        <div className="arena-fight-combatant">
                          <div ref={playerCardRef} className={playerFallen ? "card-fall-off" : ""}>
                            <div className="arena-chosen-card-body">
                              <div className="arena-card-portrait-slot">
                                {profile?.selectedCard ? (
                                  <ArenaPortraitCard card={profile.selectedCard} level={profile.level} className="arena-duel-card" interactive auto={!isMobile} boostedIv={boostedIv} />
                                ) : null}
                              </div>
                            </div>
                            {profile ? (
                              <p className="mt-1 text-center text-xs text-slate-500">
                                ELO {profile.eloRating}
                                {profile.eloProvisional ? " · provisional" : ""}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="arena-fight-versus" aria-hidden="true">
                          <span className="select-none text-2xl font-black text-pink-400">VS</span>
                        </div>

                        <div className="arena-fight-combatant">
                          <div ref={opponentCardRef} className={opponentFallen ? "card-fall-off" : ""}>
                            {activeFight?.opponent?.selectedCard ? (
                              <div className="arena-chosen-card-body">
                                <div className="arena-card-portrait-slot">
                                  <ArenaPortraitCard card={activeFight.opponent.selectedCard} level={activeFight.opponent.level} className="arena-duel-card" interactive auto={!isMobile} />
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
                                {activeFight.opponent.displayName}
                                {activeFight.opponent.isNpc
                                  ? " · NPC · unrated"
                                  : ` · ELO ${activeFight.opponent.eloRating}${
                                      activeFight.opponent.eloProvisional
                                        ? " · provisional"
                                        : ""
                                    }`}
                              </p>
                            ) : null}
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

                    {activeFight ? (
                      <div className="grid grid-cols-2 gap-3">
                        <HpBar
                          current={hpCurrent.player}
                          max={hpMax.player}
                          shield={shieldCurrent.player}
                          label="Your HP"
                        />
                        <HpBar
                          current={hpCurrent.opponent}
                          max={hpMax.opponent}
                          shield={shieldCurrent.opponent}
                          label="Opponent HP"
                        />
                      </div>
                    ) : null}

                    {fightFinished ? (
                      <div className={`p-3 text-center text-sm font-semibold ${activeFight?.result === "win" ? "text-emerald-700" : "text-red-700"}`}>
                        <p>{resultText}</p>
                        <p className="mt-1 text-xs font-bold text-blue-700 dark:text-sky-200">
                          +{activeFight?.rewards?.xp ?? 0} EXP · +
                          {activeFight?.rewards?.coins ?? 0} coins
                        </p>
                        {activeFight?.rewards?.elo?.rated ? (
                          <p className="mt-1 text-xs font-bold text-purple-600 dark:text-purple-200">
                            ELO {activeFight.rewards.elo.playerDelta >= 0 ? "+" : ""}
                            {activeFight.rewards.elo.playerDelta} ·{" "}
                            {activeFight.rewards.elo.playerAfter}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs font-normal text-slate-500 dark:text-slate-300">
                            Unrated NPC fight
                          </p>
                        )}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap justify-center gap-2">
                      {!fightInProgress ? (
                        <button
                          type="button"
                          onClick={() => void handleStartFight()}
                          disabled={
                            starting ||
                            !verified ||
                            !isSocketConnected ||
                            (!!activeFight && !activeFight.isFinished)
                          }
                          className="arena-redraw-button hover:animate-wiggle"
                        >
                          {starting
                            ? "[ Starting... ]"
                            : !verified
                              ? "[ Verify first ]"
                              : !isSocketConnected
                                ? "[ Connecting... ]"
                              : fightFinished
                                ? "[ Fight Again! ]"
                                : "[ Fight! ]"}
                        </button>
                      ) : null}
                    </div>

                    <div className="flex justify-center">
                      <label
                        className={`flex items-center gap-2 text-sm font-bold select-none ${
                          verified
                            ? "cursor-pointer text-blue-800"
                            : "cursor-not-allowed text-slate-400"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={autoBattle}
                          disabled={!verified}
                          onChange={(e) => setAutoBattle(e.target.checked)}
                          className="accent-blue-600 w-4 h-4 disabled:cursor-not-allowed"
                        />
                        Auto
                      </label>
                      {autoBattle && nextAutoFightAt !== null ? (
                        <span
                          ref={countdownRef}
                          className="ml-3 text-sm font-bold text-blue-600 dark:text-sky-200"
                          aria-live="polite"
                        >
                          Next fight in...s
                        </span>
                      ) : null}
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

            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <h2 className="text-center text-lg font-bold text-blue-700 mb-2">weakness chart</h2>
              <div className="space-y-1 text-xs">
                {WEAKNESS_ROWS.map((row) => (
                  <div key={row.element} className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-14 px-1.5 py-0.5 rounded-full text-center font-bold text-white text-[0.6rem]"
                      style={{ backgroundColor: row.color }}
                    >
                      {row.element}
                    </span>
                    <span className="text-slate-500">beats</span>
                    <span
                      className="inline-block px-1.5 py-0.5 rounded-full text-center font-bold text-white text-[0.6rem]"
                      style={{ backgroundColor: row.beatsColor }}
                    >
                      {row.beats}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={verified ? "hidden" : undefined}
              aria-hidden={verified ? "true" : undefined}
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
      {showTutorialModal
        ? createPortal(
            <div
              className="fixed inset-0 z-[230000] flex items-center justify-center bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-950/70"
              onClick={() => setShowTutorialModal(false)}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="tutorial-modal-title"
                className="card-border w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl dark:bg-slate-900"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-500">
                      Tutorial Complete
                    </p>
                    <h2 id="tutorial-modal-title" className="mt-2 text-xl font-bold text-blue-700 dark:text-purple-100">
                      Congratulations!
                    </h2>
                  </div>

                  <div className="space-y-2 text-sm text-blue-800 dark:text-slate-200">
                    <p>You completed the tutorial!</p>
                    <p>
                      From now on, you'll face <strong>real opponents</strong> in the Arena.
                    </p>
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">
                      Here's 10,000 coins to get you started. Good luck!
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowTutorialModal(false)}
                    className="arena-redraw-button hover:animate-wiggle"
                  >
                    [ nice! ]
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};

export default ArenaFight;
