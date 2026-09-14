import { test } from "node:test";
import assert from "node:assert/strict";

import { VisibilityTimer } from "./visibility-timer.ts";

/**
 * `VisibilityTimer` is driven by real `setTimeout`; these tests install a tiny
 * fake so the schedule can be advanced deterministically.
 */
function withFakeTimers<T>(run: (clock: FakeClock) => T): T {
  const clock = new FakeClock();
  const originalTimeout = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;

  // @ts-expect-error - test double
  globalThis.setTimeout = clock.setTimeout;
  // @ts-expect-error - test double
  globalThis.clearTimeout = clock.clearTimeout;

  try {
    return run(clock);
  } finally {
    globalThis.setTimeout = originalTimeout;
    globalThis.clearTimeout = originalClear;
  }
}

class FakeClock {
  private now = 0;
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; fn: () => void }>();

  setTimeout = (fn: () => void, delay = 0): number => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + delay, fn });
    return id;
  };

  clearTimeout = (id: number): void => {
    this.timers.delete(id);
  };

  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at);

      if (due.length === 0) break;

      const [id, timer] = due[0];
      this.timers.delete(id);
      this.now = timer.at;
      timer.fn();
    }
    this.now = target;
  }

  get pending(): number {
    return this.timers.size;
  }
}

test("start runs the task immediately when immediate is set", () => {
  withFakeTimers(() => {
    let runs = 0;
    const timer = new VisibilityTimer(() => runs++, 1000, { immediate: true });
    timer.start();

    assert.equal(runs, 1);
    timer.dispose();
  });
});

test("start does not run the task when immediate is not set", () => {
  withFakeTimers((clock) => {
    let runs = 0;
    const timer = new VisibilityTimer(() => runs++, 1000);
    timer.start();

    assert.equal(runs, 0);
    clock.advance(1000);
    assert.equal(runs, 1);
    timer.dispose();
  });
});

test("ticks on the given delay while running", () => {
  withFakeTimers((clock) => {
    let runs = 0;
    const timer = new VisibilityTimer(() => runs++, 500);
    timer.start();

    clock.advance(500);
    assert.equal(runs, 1);
    clock.advance(500);
    assert.equal(runs, 2);
    clock.advance(1500);
    assert.equal(runs, 5);

    timer.dispose();
  });
});

test("pause stops ticking and resume restarts", () => {
  withFakeTimers((clock) => {
    let runs = 0;
    const timer = new VisibilityTimer(() => runs++, 500);
    timer.start();

    clock.advance(500);
    assert.equal(runs, 1);

    timer.pause();
    clock.advance(5000);
    assert.equal(runs, 1, "paused timer must not fire");

    timer.resume();
    assert.equal(runs, 2, "resume refreshes immediately by default");
    clock.advance(500);
    assert.equal(runs, 3);

    timer.dispose();
  });
});

test("resume can skip the immediate refresh", () => {
  withFakeTimers((clock) => {
    let runs = 0;
    const timer = new VisibilityTimer(() => runs++, 500, {
      runOnVisible: false,
    });
    timer.start();

    clock.advance(500);
    assert.equal(runs, 1);

    timer.pause();
    timer.resume();
    assert.equal(runs, 1, "no eager run when runOnVisible is false");

    clock.advance(500);
    assert.equal(runs, 2);

    timer.dispose();
  });
});

test("a paused timer leaves no pending work", () => {
  withFakeTimers((clock) => {
    const timer = new VisibilityTimer(() => {}, 500);
    timer.start();
    timer.pause();

    assert.equal(clock.pending, 0);
    timer.dispose();
  });
});

test("dispose stops everything and is idempotent", () => {
  withFakeTimers((clock) => {
    let runs = 0;
    const timer = new VisibilityTimer(() => runs++, 500, { immediate: true });
    timer.start();
    assert.equal(runs, 1);

    timer.dispose();
    timer.dispose();

    clock.advance(5000);
    assert.equal(runs, 1);
    assert.equal(clock.pending, 0);
  });
});

test("a task that pauses itself does not reschedule", () => {
  withFakeTimers((clock) => {
    let runs = 0;
    const timer: VisibilityTimer = new VisibilityTimer(() => {
      runs += 1;
      timer.pause();
    }, 500, { immediate: true });

    timer.start();
    assert.equal(runs, 1);

    clock.advance(5000);
    assert.equal(runs, 1);
    timer.dispose();
  });
});
