/**
 * Timers that stop while the tab is hidden.
 *
 * A `setInterval` keeps firing in a backgrounded tab (throttled, but still
 * waking the CPU and — on a phone — the radio when its callback fetches). For
 * a page that polls every 2s, leaving it backgrounded overnight is thousands
 * of pointless wakeups.
 *
 * This module is the browser-free half: it schedules a repeating task and
 * tells you when that task is allowed to run. `src/hooks/use-visibility-interval.ts`
 * subscribes the visibility state; tests drive the same logic with plain
 * `setTimeout` fakes.
 */

export type VisibilityTimerOptions = {
  /**
   * Run the task immediately when the tab becomes visible again, instead of
   * waiting out a full interval. Default: `true` — a poll that resumes should
   * refresh at once, so the user doesn't stare at stale data.
   */
  runOnVisible?: boolean;
  /**
   * Run the task once on start. Default: `false`; callers that want an
   * immediate first run (a poll typically does) call it themselves so the
   * initial load and the error handling around it stay in one place.
   */
  immediate?: boolean;
};

type TimerHandle = ReturnType<typeof setTimeout>;

/**
 * A self-rescheduling timer that can be paused (tab hidden) and resumed.
 *
 * Deliberately uses `setTimeout` chains rather than `setInterval`: a paused
 * interval still fires its outstanding tick on resume, which is exactly the
 * stale-data case this exists to avoid.
 */
export class VisibilityTimer {
  private readonly task: () => void;
  private readonly delayMs: number;
  private readonly options: Required<VisibilityTimerOptions>;

  private handle: TimerHandle | null = null;
  private running = false;
  private disposed = false;

  constructor(
    task: () => void,
    delayMs: number,
    options: VisibilityTimerOptions = {},
  ) {
    this.task = task;
    this.delayMs = delayMs;
    this.options = {
      runOnVisible: options.runOnVisible ?? true,
      immediate: options.immediate ?? false,
    };
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;

    if (this.options.immediate) this.task();
    if (!this.running) return; // task may have paused/disposed us

    this.schedule();
  }

  pause(): void {
    this.running = false;
    this.clear();
  }

  /** Resume after a pause; optionally runs the task at once. */
  resume(): void {
    if (this.running || this.disposed) return;
    this.running = true;

    if (this.options.runOnVisible) {
      this.task();
      if (!this.running) return;
    }

    this.schedule();
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    this.clear();
  }

  get isRunning(): boolean {
    return this.running;
  }

  private schedule(): void {
    this.clear();
    this.handle = setTimeout(() => {
      this.handle = null;
      if (!this.running || this.disposed) return;
      this.task();
      if (this.running && !this.disposed) this.schedule();
    }, this.delayMs);
  }

  private clear(): void {
    if (this.handle !== null) {
      clearTimeout(this.handle);
      this.handle = null;
    }
  }
}
