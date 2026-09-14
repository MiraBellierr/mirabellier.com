import * as React from "react";

const BREAKPOINT_QUERY = (breakpoint: number) => `(max-width: ${breakpoint - 1}px)`;

function readIsMobile(breakpoint: number): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(BREAKPOINT_QUERY(breakpoint)).matches;
}

/**
 * `true` below `breakpoint` (default 768px).
 *
 * The initial value is read synchronously from `matchMedia` rather than
 * starting as `undefined`/`false`: callers render different trees per branch
 * (e.g. `ArenaFight` passes `auto={!isMobile}` into the card tilt), so a
 * desktop-first first render meant a phone did a frame of desktop work — and,
 * for `useHoloTilt`, actually started a rAF loop — before the effect corrected
 * it. Reading `matchMedia` in the initialiser gives the right answer in the
 * very first render.
 *
 * The effect stays for the live case (rotation, a resized window, a desktop
 * user dragging the window narrow).
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = React.useState(() =>
    readIsMobile(breakpoint),
  );

  React.useEffect(() => {
    const mql = window.matchMedia(BREAKPOINT_QUERY(breakpoint));
    const onChange = () => {
      setIsMobile(mql.matches);
    };
    mql.addEventListener("change", onChange);
    // Re-sync on mount: the window may have been resized between the initial
    // render and this effect, and `matchMedia` is the source of truth.
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isMobile;
}
