import { useEffect, useRef } from "react";

import { VisibilityTimer } from "@/lib/visibility-timer";

type Options = {
  /** Re-run immediately on tab focus instead of waiting out an interval. */
  runOnVisible?: boolean;
  /** Run the callback once when the effect starts. Default: true. */
  immediate?: boolean;
  /** Set false to keep ticking in a hidden tab (rare — a clock, say). */
  pauseWhenHidden?: boolean;
};

/**
 * `setInterval`, but the timer stops while the tab is hidden.
 *
 * Use this for every poll/refresh. A backgrounded mobile tab that keeps
 * fetching wakes the radio for data nobody is looking at; this parks the
 * timer on `visibilitychange` and (by default) refreshes once on return so
 * the first thing the user sees isn't stale.
 *
 * `callback` is read through a ref, so callers don't need to memoise it — the
 * timer is only rebuilt when `delayMs` (or the options) actually change.
 */
export function useVisibilityInterval(
  callback: () => void,
  delayMs: number | null,
  options: Options = {},
): void {
  const {
    runOnVisible = true,
    immediate = true,
    pauseWhenHidden = true,
  } = options;

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (delayMs === null) return;

    const timer = new VisibilityTimer(() => callbackRef.current(), delayMs, {
      runOnVisible,
      immediate,
    });

    const isHidden = () =>
      pauseWhenHidden && document.visibilityState === "hidden";

    const sync = () => {
      if (isHidden()) {
        timer.pause();
      } else if (!timer.isRunning) {
        // Only a *resume* runs the task eagerly; the initial start is handled
        // below so `immediate: false` doesn't fire on mount.
        timer.resume();
      }
    };

    // `start()` honours `immediate`; `sync` would otherwise treat the initial
    // visible state as a resume and always run the task.
    if (!isHidden()) timer.start();

    document.addEventListener("visibilitychange", sync);

    return () => {
      document.removeEventListener("visibilitychange", sync);
      timer.dispose();
    };
  }, [delayMs, runOnVisible, immediate, pauseWhenHidden]);
}
