export type FightSpeed = "normal" | "fast" | "instant";

export const FIGHT_SPEED_DELAYS_MS: Record<FightSpeed, number> = {
  normal: 800,
  fast: 400,
  instant: 0,
};

export const RESUME_RETRY_INTERVAL_MS = 500;
export const RESUME_STALE_LOCK_ATTEMPTS = 20;
export const ADVANCE_SAFETY_TIMEOUT_MS = 10000;

export interface FightResumeFight {
  fightId: string;
  isFinished: boolean;
}

export type FightResumeEffect =
  | { type: "advance" }
  | { type: "skip" }
  | { type: "start" }
  | { type: "http-fallback" }
  | { type: "finished" }
  | { type: "stall-error" }
  | { type: "connection-error" };

export type CancelTimer = () => void;

export interface TimerScheduler {
  setTimeout(fn: () => void, ms: number): CancelTimer;
}

export interface FightResumeMachineDeps {
  scheduler: TimerScheduler;
  getSpeed: () => FightSpeed;
  onEffect: (effect: FightResumeEffect) => void;
}

export interface FightResumeMachineState {
  needsResume: boolean;
  advanceLocked: boolean;
  resumePending: boolean;
  resumeAttempts: number;
  stalled: boolean;
  connected: boolean;
  verified: boolean;
  pageVisible: boolean;
  fight: FightResumeFight | null;
}

/**
 * Owns the resume/advance/fallback cycle for an active arena fight.
 *
 * All timers run through the injected scheduler and every side effect is
 * reported through `onEffect`, so the full lifecycle can be driven
 * deterministically in tests. The component stays a thin adapter.
 *
 * Invariants enforced here:
 * - A resume is only consumed once the fight socket is connected AND the
 *   user passed Turnstile verification, otherwise the advance command would
 *   be dropped and the fight would wedge between active and finished. The
 *   server independently rejects unverified fight messages with
 *   ARENA_VERIFICATION_REQUIRED (see lib/arena-fight-verification.js); this
 *   gate is only the client-side UX half.
 * - A stale advance lock is force-released after the retry budget so an
 *   interrupted fight always gets another advance attempt.
 * - An unanswered advance falls back to HTTP after the safety timeout; a
 *   fallback that recovers an unfinished fight keeps advancing instead of
 *   stalling.
 * - A finished fight cancels every timer and never emits another advance.
 */
export class FightResumeMachine {
  private state: FightResumeMachineState = {
    needsResume: false,
    advanceLocked: false,
    resumePending: false,
    resumeAttempts: 0,
    stalled: false,
    connected: false,
    verified: false,
    pageVisible: true,
    fight: null,
  };

  private safetyCancel: CancelTimer | null = null;
  private retryCancel: CancelTimer | null = null;
  private advanceCancel: CancelTimer | null = null;
  private disposed = false;
  private deps: FightResumeMachineDeps;

  constructor(deps: FightResumeMachineDeps) {
    this.deps = deps;
  }

  getState(): FightResumeMachineState {
    return { ...this.state };
  }

  dispose(): void {
    this.disposed = true;
    this.cancelSafety();
    this.cancelRetry();
    this.cancelAdvance();
  }

  /**
   * Called when the fight state is loaded (initial profile load) or replaced.
   * An unfinished fight arms the resume flag.
   */
  setFight(fight: FightResumeFight | null): void {
    if (this.disposed) return;
    this.state.fight = fight;
    if (fight && !fight.isFinished) {
      this.state.needsResume = true;
    } else {
      this.state.needsResume = false;
      if (fight) {
        this.state.resumePending = false;
        this.cancelRetry();
      }
    }
    this.state.stalled = false;
    this.evaluateResume();
  }

  setConnected(connected: boolean): void {
    if (this.disposed) return;
    this.state.connected = connected;
    if (!connected) {
      this.state.resumePending = false;
      this.cancelRetry();
    }
    this.evaluateResume();
  }

  setVerified(verified: boolean): void {
    if (this.disposed) return;
    this.state.verified = verified;
    this.evaluateResume();
  }

  onPageVisibility(hidden: boolean): void {
    if (this.disposed) return;
    this.state.pageVisible = !hidden;
    if (hidden) {
      this.state.resumePending = false;
      this.cancelSafety();
      this.cancelRetry();
      this.cancelAdvance();
      this.state.advanceLocked = false;
    }
  }

  /** Starting a fresh fight always clears any pending resume. */
  onStartFight(): void {
    if (this.disposed) return;
    this.cancelSafety();
    this.cancelRetry();
    this.cancelAdvance();
    this.state.needsResume = false;
    this.state.resumePending = false;
    this.state.stalled = false;
    this.state.advanceLocked = true;
    this.emit({ type: "start" });
  }

  /** Component reports whether the emitted start command was sent. */
  confirmStart(ok: boolean): void {
    if (this.disposed || ok) return;
    this.state.advanceLocked = false;
    this.emit({ type: "connection-error" });
  }

  /**
   * Component reports whether the emitted advance command reached the
   * socket. On success the HTTP safety fallback is armed.
   */
  confirmAdvance(ok: boolean): void {
    if (this.disposed) return;
    if (!ok) {
      this.state.advanceLocked = false;
      this.state.resumePending = false;
      this.cancelRetry();
      this.emit({ type: "connection-error" });
      return;
    }
    this.armSafety();
  }

  /** Component reports whether the emitted skip command was sent. */
  confirmSkip(ok: boolean): void {
    if (this.disposed || ok) return;
    this.state.advanceLocked = false;
    this.emit({ type: "connection-error" });
  }

  /** A turn arrived for the current fight. */
  onTurn(fight: FightResumeFight): void {
    if (this.disposed) return;
    this.cancelSafety();
    this.cancelRetry();
    this.cancelAdvance();
    this.state.advanceLocked = false;
    this.state.resumePending = false;
    this.state.stalled = false;
    this.state.needsResume = false;
    this.state.fight = fight;
    if (!fight.isFinished) {
      this.scheduleNextAdvance();
    } else {
      this.emit({ type: "finished" });
    }
  }

  /** The fight reached a finished state. */
  onFinished(fight: FightResumeFight): void {
    if (this.disposed) return;
    this.cancelSafety();
    this.cancelRetry();
    this.cancelAdvance();
    this.state.advanceLocked = false;
    this.state.resumePending = false;
    this.state.needsResume = false;
    this.state.stalled = false;
    this.state.fight = fight;
    this.emit({ type: "finished" });
  }

  /** An error was reported for the current fight command. */
  onError(): void {
    if (this.disposed) return;
    this.cancelSafety();
    this.cancelRetry();
    this.state.advanceLocked = false;
    this.state.resumePending = false;
  }

  /**
   * Component reports the outcome of the HTTP fallback: the (possibly null)
   * fresh fight state and whether it was obtained from the server.
   */
  onFallbackResult(fight: FightResumeFight | null, synced: boolean): void {
    if (this.disposed) return;
    this.cancelSafety();
    this.cancelRetry();
    this.state.advanceLocked = false;
    this.state.resumePending = false;
    if (!synced) {
      this.state.stalled = true;
      this.emit({ type: "stall-error" });
      return;
    }
    this.state.stalled = false;
    if (fight) {
      this.state.fight = fight;
    }
    if (fight && !fight.isFinished) {
      this.scheduleNextAdvance();
    } else {
      if (fight) this.state.needsResume = false;
      this.emit({ type: "finished" });
    }
  }

  /** Fallback could not run (no token, no fight, or fight already finished). */
  onFallbackAborted(): void {
    if (this.disposed) return;
    this.cancelSafety();
    this.cancelRetry();
    this.state.advanceLocked = false;
    this.state.resumePending = false;
  }

  /** State re-synced after a socket reconnect for the same fight. */
  onReconnectSync(fight: FightResumeFight | null, sameFight: boolean): void {
    if (this.disposed) return;
    if (!fight || !sameFight) return;
    this.state.advanceLocked = false;
    this.state.resumePending = false;
    this.state.stalled = false;
    this.state.fight = fight;
    if (!fight.isFinished) {
      this.sendAdvance();
    }
  }

  private emit(effect: FightResumeEffect): void {
    if (!this.disposed) this.deps.onEffect(effect);
  }

  private cancelSafety(): void {
    if (this.safetyCancel) {
      this.safetyCancel();
      this.safetyCancel = null;
    }
  }

  private cancelRetry(): void {
    if (this.retryCancel) {
      this.retryCancel();
      this.retryCancel = null;
    }
  }

  private cancelAdvance(): void {
    if (this.advanceCancel) {
      this.advanceCancel();
      this.advanceCancel = null;
    }
  }

  private evaluateResume(): void {
    const s = this.state;
    if (!s.needsResume || !s.fight || s.fight.isFinished || !s.connected || !s.verified) {
      return;
    }
    s.needsResume = false;
    s.resumePending = true;
    s.resumeAttempts = 0;
    this.tryResume();
  }

  private tryResume(): void {
    const s = this.state;
    this.cancelRetry();
    if (s.advanceLocked) {
      if (s.resumeAttempts >= RESUME_STALE_LOCK_ATTEMPTS) {
        s.advanceLocked = false;
        s.resumeAttempts = 0;
      }
      s.resumeAttempts += 1;
      this.retryCancel = this.deps.scheduler.setTimeout(
        () => this.tryResume(),
        RESUME_RETRY_INTERVAL_MS,
      );
      return;
    }
    s.resumePending = false;
    this.sendAdvance();
  }

  private sendAdvance(): void {
    if (this.state.advanceLocked) return;
    this.state.advanceLocked = true;
    this.emit({ type: "advance" });
  }

  private requestSkip(): void {
    if (this.state.advanceLocked) return;
    this.state.advanceLocked = true;
    this.emit({ type: "skip" });
  }

  private armSafety(): void {
    this.cancelSafety();
    this.safetyCancel = this.deps.scheduler.setTimeout(() => {
      this.safetyCancel = null;
      this.onSafetyExpired();
    }, ADVANCE_SAFETY_TIMEOUT_MS);
  }

  private onSafetyExpired(): void {
    const s = this.state;
    if (!s.fight || s.fight.isFinished) {
      s.advanceLocked = false;
      s.resumePending = false;
      return;
    }
    this.emit({ type: "http-fallback" });
  }

  private scheduleNextAdvance(): void {
    this.cancelAdvance();
    const delayMs = FIGHT_SPEED_DELAYS_MS[this.deps.getSpeed()];
    this.advanceCancel = this.deps.scheduler.setTimeout(() => {
      this.advanceCancel = null;
      if (this.deps.getSpeed() === "instant") {
        this.requestSkip();
      } else {
        this.sendAdvance();
      }
    }, delayMs);
  }
}
