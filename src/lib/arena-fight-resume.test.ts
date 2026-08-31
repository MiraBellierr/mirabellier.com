import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FightResumeMachine,
  FIGHT_SPEED_DELAYS_MS,
  RESUME_RETRY_INTERVAL_MS,
  RESUME_STALE_LOCK_ATTEMPTS,
  ADVANCE_SAFETY_TIMEOUT_MS,
  type CancelTimer,
  type FightResumeEffect,
  type FightResumeFight,
  type FightSpeed,
  type TimerScheduler,
} from "./arena-fight-resume.ts";

interface PendingTimer {
  id: number;
  at: number;
  fn: () => void;
  cancelled: boolean;
}

class ManualScheduler implements TimerScheduler {
  private idSeq = 0;
  private now = 0;
  private pending: PendingTimer[] = [];

  setTimeout(fn: () => void, ms: number): CancelTimer {
    const id = ++this.idSeq;
    this.pending.push({ id, at: this.now + ms, fn, cancelled: false });
    return () => {
      const timer = this.pending.find((t) => t.id === id);
      if (timer) timer.cancelled = true;
    };
  }

  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const next = this.pending
        .filter((t) => !t.cancelled)
        .sort((a, b) => a.at - b.at)[0];
      if (!next || next.at > target) break;
      this.now = next.at;
      next.cancelled = true;
      next.fn();
    }
    this.now = target;
  }

  pendingCount(): number {
    return this.pending.filter((t) => !t.cancelled).length;
  }
}

function createHarness(speed: FightSpeed = "normal") {
  const scheduler = new ManualScheduler();
  const effects: FightResumeEffect[] = [];
  let currentSpeed = speed;
  const machine = new FightResumeMachine({
    scheduler,
    getSpeed: () => currentSpeed,
    onEffect: (effect) => effects.push(effect),
  });
  return {
    machine,
    scheduler,
    effects,
    setSpeed(next: FightSpeed) {
      currentSpeed = next;
    },
  };
}

function fight(overrides: Partial<FightResumeFight> = {}): FightResumeFight {
  return { fightId: "fight-1", isFinished: false, ...overrides };
}

function openResumeGate(harness: ReturnType<typeof createHarness>, f: FightResumeFight = fight()) {
  harness.machine.setFight(f);
  harness.machine.setConnected(true);
  harness.machine.setVerified(true);
}

test("resume waits for the socket and verification before advancing", () => {
  const h = createHarness();
  h.machine.setFight(fight());
  assert.deepEqual(h.effects, []);
  assert.equal(h.machine.getState().needsResume, true);

  h.machine.setVerified(true);
  assert.deepEqual(h.effects, []);
  assert.equal(h.machine.getState().needsResume, true);

  h.machine.setConnected(true);
  assert.deepEqual(h.effects, [{ type: "advance" }]);
  assert.equal(h.machine.getState().needsResume, false);
  assert.equal(h.machine.getState().advanceLocked, true);
});

test("a fight that is already finished is never resumed", () => {
  const h = createHarness();
  h.machine.setFight(fight({ isFinished: true }));
  assert.equal(h.machine.getState().needsResume, false);
  h.machine.setConnected(true);
  h.machine.setVerified(true);
  assert.deepEqual(h.effects, []);
});

test("the resume flag is consumed exactly once", () => {
  const h = createHarness();
  openResumeGate(h);
  assert.equal(h.effects.length, 1);

  h.machine.setConnected(false);
  h.machine.setConnected(true);
  h.machine.setVerified(true);
  assert.equal(h.effects.filter((e) => e.type === "advance").length, 1);
});

test("a stale advance lock is force-released after the retry budget", () => {
  const h = createHarness();
  h.machine.onStartFight(); // locks the advance
  h.effects.length = 0;

  openResumeGate(h);
  assert.equal(h.machine.getState().resumePending, true);
  assert.deepEqual(h.effects, []);

  const staleReleaseDelay =
    (RESUME_STALE_LOCK_ATTEMPTS + 1) * RESUME_RETRY_INTERVAL_MS;
  h.scheduler.advance(staleReleaseDelay - RESUME_RETRY_INTERVAL_MS);
  assert.deepEqual(h.effects, []);

  h.scheduler.advance(RESUME_RETRY_INTERVAL_MS);
  assert.deepEqual(h.effects, [{ type: "advance" }]);
  assert.equal(h.machine.getState().advanceLocked, true);
  assert.equal(h.machine.getState().resumePending, false);
});

test("disconnecting stops the resume retry loop and reconnect sync recovers it", () => {
  const h = createHarness();
  h.machine.onStartFight();
  h.effects.length = 0;

  openResumeGate(h);
  assert.equal(h.scheduler.pendingCount(), 1); // retry loop scheduled

  h.machine.setConnected(false);
  assert.equal(h.scheduler.pendingCount(), 0);
  assert.equal(h.machine.getState().resumePending, false);

  h.machine.setConnected(true);
  assert.deepEqual(h.effects, []); // flag consumed, nothing to resume

  h.machine.onReconnectSync(fight(), true);
  assert.deepEqual(h.effects, [{ type: "advance" }]);
});

test("confirming an advance arms the HTTP safety fallback", () => {
  const h = createHarness();
  openResumeGate(h);
  h.machine.confirmAdvance(true);
  assert.equal(h.scheduler.pendingCount(), 1);

  h.scheduler.advance(ADVANCE_SAFETY_TIMEOUT_MS - 1);
  assert.deepEqual(h.effects, [{ type: "advance" }]);

  h.scheduler.advance(1);
  assert.deepEqual(h.effects, [{ type: "advance" }, { type: "http-fallback" }]);
});

test("a fallback that recovers an unfinished fight keeps advancing instead of stalling", () => {
  const h = createHarness();
  openResumeGate(h);
  h.machine.confirmAdvance(true);
  h.scheduler.advance(ADVANCE_SAFETY_TIMEOUT_MS);
  assert.equal(h.effects.at(-1)?.type, "http-fallback");

  h.machine.onFallbackResult(fight(), true);
  assert.equal(h.machine.getState().advanceLocked, false);
  assert.equal(h.scheduler.pendingCount(), 1); // next advance scheduled

  h.scheduler.advance(FIGHT_SPEED_DELAYS_MS.normal);
  assert.equal(h.effects.at(-1)?.type, "advance");
});

test("a fallback returning a finished fight emits finished and stops advancing", () => {
  const h = createHarness();
  openResumeGate(h);
  h.machine.confirmAdvance(true);
  h.scheduler.advance(ADVANCE_SAFETY_TIMEOUT_MS);
  h.effects.length = 0;

  h.machine.onFallbackResult(fight({ isFinished: true }), true);
  assert.deepEqual(h.effects, [{ type: "finished" }]);
  assert.equal(h.scheduler.pendingCount(), 0);
  assert.equal(h.machine.getState().advanceLocked, false);

  h.scheduler.advance(60000);
  assert.equal(h.effects.length, 1); // nothing else ever fires
});

test("a fallback that cannot reach the server marks the fight stalled", () => {
  const h = createHarness();
  openResumeGate(h);
  h.machine.confirmAdvance(true);
  h.scheduler.advance(ADVANCE_SAFETY_TIMEOUT_MS);
  h.effects.length = 0;

  h.machine.onFallbackResult(null, false);
  assert.deepEqual(h.effects, [{ type: "stall-error" }]);
  assert.equal(h.machine.getState().stalled, true);
  assert.equal(h.machine.getState().advanceLocked, false);
  assert.equal(h.scheduler.pendingCount(), 0);
});

test("aborting a fallback for a finished fight releases the lock silently", () => {
  const h = createHarness();
  openResumeGate(h);
  h.machine.confirmAdvance(true);
  h.effects.length = 0;

  h.machine.onFallbackAborted();
  assert.deepEqual(h.effects, []);
  assert.equal(h.machine.getState().advanceLocked, false);
  assert.equal(h.scheduler.pendingCount(), 0);
});

test("a turn cancels the safety timer and schedules the next advance", () => {
  const h = createHarness();
  openResumeGate(h);
  h.machine.confirmAdvance(true);
  h.effects.length = 0;

  h.machine.onTurn(fight());
  assert.equal(h.machine.getState().advanceLocked, false);
  assert.equal(h.scheduler.pendingCount(), 1); // only the next-advance timer

  h.scheduler.advance(FIGHT_SPEED_DELAYS_MS.normal - 1);
  assert.deepEqual(h.effects, []);

  h.scheduler.advance(1);
  assert.deepEqual(h.effects, [{ type: "advance" }]);
});

test("fast speed advances after the shorter delay", () => {
  const h = createHarness("fast");
  openResumeGate(h);
  h.machine.confirmAdvance(true);
  h.machine.onTurn(fight());

  h.scheduler.advance(FIGHT_SPEED_DELAYS_MS.fast);
  assert.equal(h.effects.filter((e) => e.type === "advance").length, 2);
});

test("instant speed skips instead of advancing", () => {
  const h = createHarness("instant");
  openResumeGate(h);
  h.machine.confirmAdvance(true);
  h.effects.length = 0;

  h.machine.onTurn(fight());
  assert.equal(h.scheduler.pendingCount(), 1);

  h.scheduler.advance(0);
  assert.deepEqual(h.effects, [{ type: "skip" }]);
});

test("a finished fight stops every timer and never advances again", () => {
  const h = createHarness();
  openResumeGate(h);
  h.machine.confirmAdvance(true);
  h.effects.length = 0;

  h.machine.onFinished(fight({ isFinished: true }));
  assert.deepEqual(h.effects, [{ type: "finished" }]);
  assert.equal(h.machine.getState().advanceLocked, false);
  assert.equal(h.machine.getState().needsResume, false);
  assert.equal(h.scheduler.pendingCount(), 0);

  h.scheduler.advance(60000);
  assert.deepEqual(h.effects, [{ type: "finished" }]);
});

test("hiding the page cancels timers and releases the lock", () => {
  const h = createHarness();
  openResumeGate(h);
  h.machine.confirmAdvance(true);
  h.machine.onTurn(fight()); // schedules the next advance

  h.machine.onPageVisibility(true);
  assert.equal(h.machine.getState().advanceLocked, false);
  assert.equal(h.scheduler.pendingCount(), 0);

  h.scheduler.advance(60000);
  assert.deepEqual(h.effects, [{ type: "advance" }]); // only the initial advance
});

test("showing the page again does not re-advance a consumed resume", () => {
  const h = createHarness();
  openResumeGate(h);
  h.effects.length = 0;

  h.machine.onPageVisibility(true);
  h.machine.onPageVisibility(false);
  assert.deepEqual(h.effects, []);
});

test("reconnect sync re-advances the same unfinished fight and ignores others", () => {
  const h = createHarness();
  h.machine.onStartFight(); // leaves a stale lock behind
  h.effects.length = 0;

  h.machine.onReconnectSync(fight(), true);
  assert.deepEqual(h.effects, [{ type: "advance" }]);

  h.effects.length = 0;
  h.machine.onReconnectSync(fight({ fightId: "other-fight" }), false);
  assert.deepEqual(h.effects, []);
});

test("a dead socket releases the lock and reports a connection error", () => {
  const h = createHarness();
  openResumeGate(h);
  h.effects.length = 0;

  h.machine.confirmAdvance(false);
  assert.deepEqual(h.effects, [{ type: "connection-error" }]);
  assert.equal(h.machine.getState().advanceLocked, false);
  assert.equal(h.scheduler.pendingCount(), 0);
});

test("an unanswered start command releases the lock on failure", () => {
  const h = createHarness();
  h.machine.onStartFight();
  assert.equal(h.machine.getState().advanceLocked, true);
  h.effects.length = 0;

  h.machine.confirmStart(false);
  assert.deepEqual(h.effects, [{ type: "connection-error" }]);
  assert.equal(h.machine.getState().advanceLocked, false);
});
