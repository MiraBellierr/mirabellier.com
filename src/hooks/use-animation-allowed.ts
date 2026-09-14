import * as React from "react";

import { shouldAllowAnimation } from "@/lib/animation-gate";

// The same `min-width: 1024px` gate `Home`'s hero uses.
const WIDE_QUERY = "(min-width: 1024px)";
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type ConnectionInfo = {
  saveData?: boolean;
  effectiveType?: string;
};

function readAnimationAllowed(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  const connection = (navigator as Navigator & { connection?: ConnectionInfo })
    .connection;

  return shouldAllowAnimation({
    wide: window.matchMedia(WIDE_QUERY).matches,
    reducedMotion: window.matchMedia(MOTION_QUERY).matches,
    saveData: connection?.saveData,
    effectiveType: connection?.effectiveType,
  });
}

// One set of media-query listeners for the whole page rather than one per
// sticker (Uses renders three, Blog two).
const subscribers = new Set<() => void>();
let mediaQueries: MediaQueryList[] | null = null;

function notify() {
  for (const subscriber of subscribers) subscriber();
}

function subscribe(onChange: () => void) {
  if (mediaQueries === null && typeof window !== "undefined") {
    mediaQueries = [
      window.matchMedia(WIDE_QUERY),
      window.matchMedia(MOTION_QUERY),
    ];
    for (const mql of mediaQueries) mql.addEventListener("change", notify);
  }

  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
}

/**
 * Whether an animated sticker may replace its still on this device. Read
 * synchronously on the first client render so a desktop visitor never sees the
 * still flash before the animation.
 */
export function useAnimationAllowed(): boolean {
  return React.useSyncExternalStore(subscribe, readAnimationAllowed, () => false);
}
