import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useReducedMotion } from "./use-reduced-motion";

const AUTO_CYCLE_MS = 5000;
const SNAP_STIFFNESS = 0.008;
const SNAP_DAMPING = 0.1;
const SNAP_PRECISION = 0.0005;
const BLEND_DECAY = 0.92;
const BLEND_EPSILON = 0.0005;

// Touch-first devices don't get the auto tilt: a card that wobbles on its own
// behind a finger is noise, and the rAF loop it needs is pure battery burn
// when a market page mounts 20+ cards at once. Same predicate CursorContext
// uses to keep the custom cursor off.
const COARSE_POINTER_QUERY = "(hover: none), (pointer: coarse)";

type HoloTiltOptions = {
  auto?: boolean;
};

function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
}

/**
 * Write a tilt frame straight onto the element.
 *
 * This is deliberately *not* React state: the auto cycle runs every animation
 * frame, and a `setState` per frame would re-render the card (and its whole
 * subtree) 60 times a second. The values are CSS custom properties plus a
 * transform, so they can be applied to the node directly — the same technique
 * `CursorManager` uses for the pointer position.
 */
function applyTilt(
  el: HTMLElement,
  x: number,
  y: number,
  opacity: string,
  transition?: string,
): void {
  const rotateX = (y - 0.5) * -24;
  const rotateY = (x - 0.5) * 24;
  const fromCenter = Math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2) * 2;

  el.style.setProperty("--pointer-x", `${x * 100}%`);
  el.style.setProperty("--pointer-y", `${y * 100}%`);
  el.style.setProperty("--card-opacity", opacity);
  el.style.setProperty("--pointer-from-left", `${x}`);
  el.style.setProperty("--pointer-from-top", `${y}`);
  el.style.setProperty("--pointer-from-center", `${fromCenter}`);
  el.style.setProperty("--background-x", `${(x * 100 - 50) * 0.5 + 50}%`);
  el.style.setProperty("--background-y", `${(y * 100 - 50) * 0.5 + 50}%`);
  el.style.transform = `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;

  // `undefined` means "let the stylesheet's transition apply" — which also has
  // to *clearing* a previous inline `transition: none`, not just skipping the
  // write.
  if (transition === undefined) {
    el.style.removeProperty("transition");
  } else {
    el.style.transition = transition;
  }
}

function autoPos(phaseOffset: number) {
  const elapsed = performance.now() / AUTO_CYCLE_MS + phaseOffset / (Math.PI * 2);
  const angle = (elapsed % 1) * Math.PI * 2;
  return {
    x: 0.5 + Math.sin(angle) * 0.35,
    y: 0.25 + Math.sin(angle * 2 + 1.2) * 0.2,
  };
}

/**
 * Toggle the compositor-layer hint for the duration of the tilt.
 *
 * `will-change: transform` promotes the element to its own layer, which is
 * worth it while a transform is animating and pure overhead when it isn't —
 * a market page mounts 20+ cards, and a permanent hint would park all of them
 * on their own layer. Clearing the inline value deliberately falls back to the
 * stylesheet's `:hover`/`:focus-visible` rule rather than fighting it.
 */
function setWillChange(el: HTMLElement, active: boolean): void {
  if (active) {
    el.style.willChange = "transform";
  } else {
    el.style.removeProperty("will-change");
  }
}

// One IntersectionObserver for every card on the page. A market/trade page can
// mount 20+ cards, and 20+ observers is its own cost; the registry fans the
// single observer's entries back out to each hook.
type VisibilityCallback = (visible: boolean) => void;

const visibilityCallbacks = new Map<Element, VisibilityCallback>();
let sharedObserver: IntersectionObserver | null = null;

function observeVisibility(el: Element, callback: VisibilityCallback): () => void {
  if (typeof IntersectionObserver === "undefined") {
    callback(true);
    return () => {};
  }

  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        visibilityCallbacks.get(entry.target)?.(entry.isIntersecting);
      }
    });
  }

  visibilityCallbacks.set(el, callback);
  sharedObserver.observe(el);

  return () => {
    visibilityCallbacks.delete(el);
    sharedObserver?.unobserve(el);
  };
}

export function useHoloTilt(options?: HoloTiltOptions) {
  const reducedMotion = useReducedMotion();
  const auto = (options?.auto ?? false) && !reducedMotion && !isCoarsePointer();

  const elementRef = useRef<HTMLElement | null>(null);
  const [element, setElement] = useState<HTMLElement | null>(null);

  const pointerOver = useRef(false);
  const rafRef = useRef(0);
  const springRafRef = useRef(0);
  const phaseOffset = useRef(Math.random() * Math.PI * 2);
  const lastPos = useRef({ x: 0.5, y: 0.5 });
  const autoBlend = useRef({ x: 0, y: 0 });
  // Read by the ref callback, whose identity must stay stable across commits.
  const autoRef = useRef(auto);
  autoRef.current = auto;

  // Ref callback rather than `style={...}`: the initial frame is still applied
  // before the first paint (refs run in the commit phase), but every later
  // frame bypasses React entirely. `setElement` only fires on attach/detach
  // because the callback identity is stable.
  const tiltRef = useCallback((node: HTMLElement | null) => {
    elementRef.current = node;
    // Cards that start on the auto cycle start fully visible; the rest start
    // settled flat so there is no highlight flash before the first frame.
    if (node) applyTilt(node, 0.5, 0.5, autoRef.current ? "1" : "0");
    setElement((current) => (current === node ? current : node));
  }, []);

  useEffect(() => {
    if (!auto || !element) return;

    let first = true;
    let running = false;

    const tick = () => {
      if (!running) return;

      const elapsed = performance.now() / AUTO_CYCLE_MS + phaseOffset.current / (Math.PI * 2);
      const angle = (elapsed % 1) * Math.PI * 2;
      const rawX = 0.5 + Math.sin(angle) * 0.35;
      const rawY = 0.25 + Math.sin(angle * 1.6 + 1.2) * 0.2;

      if (first) {
        first = false;
        autoBlend.current = { x: 0.5 - rawX, y: 0.5 - rawY };
      }

      const b = autoBlend.current;
      if (b.x !== 0 || b.y !== 0) {
        b.x *= BLEND_DECAY;
        b.y *= BLEND_DECAY;
        if (Math.abs(b.x) < BLEND_EPSILON) b.x = 0;
        if (Math.abs(b.y) < BLEND_EPSILON) b.y = 0;
      }

      if (!pointerOver.current) {
        applyTilt(element, rawX + b.x, rawY + b.y, "1");
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      setWillChange(element, true);
      rafRef.current = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      setWillChange(element, false);
    };

    // An off-screen card has nothing to animate; the shared observer parks the
    // loop until it scrolls back into view.
    const stopObserving = observeVisibility(element, (visible) => {
      if (visible) start();
      else stop();
    });

    return () => {
      stopObserving();
      stop();
    };
  }, [auto, element]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(springRafRef.current);
      const el = elementRef.current;
      if (el) setWillChange(el, false);
    };
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    pointerOver.current = true;
    cancelAnimationFrame(springRafRef.current);
    autoBlend.current = { x: 0, y: 0 };

    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    lastPos.current = { x, y };
    applyTilt(el, x, y, "1");
  }, []);

  const onPointerLeave = useCallback(() => {
    const el = elementRef.current;
    if (!el) return;

    cancelAnimationFrame(springRafRef.current);
    pointerOver.current = false;

    // Reduced motion asked for no spring at all — settle flat immediately.
    if (reducedMotion) {
      applyTilt(el, 0.5, 0.5, "0");
      setWillChange(el, false);
      return;
    }

    // When the auto cycle is running it owns the layer hint (its effect sets
    // and clears it), and the settle hands straight back to it. Only the
    // pointer-only card needs the hint for its own settle, which ends at rest.
    if (!auto) setWillChange(el, true);

    const { x: startX, y: startY } = lastPos.current;

    if (auto) {
      const state = { x: startX, y: startY, vx: 0, vy: 0, opacity: 1, vOpacity: 0 };
      const targetX = 0.5;
      const targetY = 0.25;
      const targetOpacity = 1;

      const animate = () => {
        const fx = (targetX - state.x) * SNAP_STIFFNESS;
        state.vx = state.vx + fx - state.vx * SNAP_DAMPING;
        state.x = state.x + state.vx;

        const fy = (targetY - state.y) * SNAP_STIFFNESS;
        state.vy = state.vy + fy - state.vy * SNAP_DAMPING;
        state.y = state.y + state.vy;

        const fo = (targetOpacity - state.opacity) * SNAP_STIFFNESS;
        state.vOpacity = state.vOpacity + fo - state.vOpacity * SNAP_DAMPING;
        state.opacity = state.opacity + state.vOpacity;

        const dist = Math.abs(targetX - state.x) + Math.abs(targetY - state.y);
        const vel = Math.abs(state.vx) + Math.abs(state.vy);

        if (dist < 0.01 && vel < 0.01) {
          const ap = autoPos(phaseOffset.current);
          autoBlend.current = { x: state.x - ap.x, y: state.y - ap.y };
          return;
        }

        applyTilt(el, state.x, state.y, String(state.opacity), "none");
        springRafRef.current = requestAnimationFrame(animate);
      };

      springRafRef.current = requestAnimationFrame(animate);
      return;
    }

    const state = { x: startX, y: startY, vx: 0, vy: 0, opacity: 1, vOpacity: 0 };
    const targetX = 0.5;
    const targetY = 0.5;
    const targetOpacity = 0;

    const animate = () => {
      const fx = (targetX - state.x) * SNAP_STIFFNESS;
      state.vx = state.vx + fx - state.vx * SNAP_DAMPING;
      state.x = state.x + state.vx;

      const fy = (targetY - state.y) * SNAP_STIFFNESS;
      state.vy = state.vy + fy - state.vy * SNAP_DAMPING;
      state.y = state.y + state.vy;

      const fo = (targetOpacity - state.opacity) * SNAP_STIFFNESS;
      state.vOpacity = state.vOpacity + fo - state.vOpacity * SNAP_DAMPING;
      state.opacity = state.opacity + state.vOpacity;

      const dist =
        Math.abs(targetX - state.x) +
        Math.abs(targetY - state.y) +
        Math.abs(targetOpacity - state.opacity);
      const vel =
        Math.abs(state.vx) + Math.abs(state.vy) + Math.abs(state.vOpacity);

      if (dist < SNAP_PRECISION && vel < SNAP_PRECISION) {
        applyTilt(el, targetX, targetY, "0");
        setWillChange(el, false);
        return;
      }

      applyTilt(el, state.x, state.y, String(state.opacity), "none");
      springRafRef.current = requestAnimationFrame(animate);
    };

    springRafRef.current = requestAnimationFrame(animate);
  }, [auto, reducedMotion]);

  return { tiltRef, onPointerMove, onPointerLeave };
}
