import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const AUTO_CYCLE_MS = 5000;
const SNAP_STIFFNESS = 0.008;
const SNAP_DAMPING = 0.1;
const SNAP_PRECISION = 0.0005;
const BLEND_DECAY = 0.92;
const BLEND_EPSILON = 0.0005;

type HoloTiltOptions = {
  auto?: boolean;
};

function computeTiltStyle(
  x: number,
  y: number,
  opacity: string,
  transition?: string,
): CSSProperties {
  const rotateX = (y - 0.5) * -24;
  const rotateY = (x - 0.5) * 24;
  const fromCenter = Math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2) * 2;

  return {
    "--pointer-x": `${x * 100}%`,
    "--pointer-y": `${y * 100}%`,
    "--card-opacity": opacity,
    "--pointer-from-left": `${x}`,
    "--pointer-from-top": `${y}`,
    "--pointer-from-center": `${fromCenter}`,
    "--background-x": `${(x * 100 - 50) * 0.5 + 50}%`,
    "--background-y": `${(y * 100 - 50) * 0.5 + 50}%`,
    transform: `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`,
    ...(transition !== undefined ? { transition } : {}),
  } as CSSProperties;
}

function autoPos(phaseOffset: number) {
  const elapsed = performance.now() / AUTO_CYCLE_MS + phaseOffset / (Math.PI * 2);
  const angle = (elapsed % 1) * Math.PI * 2;
  return {
    x: 0.5 + Math.sin(angle) * 0.35,
    y: 0.25 + Math.sin(angle * 2 + 1.2) * 0.2,
  };
}

export function useHoloTilt(options?: HoloTiltOptions) {
  const auto = options?.auto ?? false;

  const [style, setStyle] = useState<CSSProperties>(() =>
    computeTiltStyle(0.5, 0.5, auto ? "1" : "0"),
  );

  const pointerOver = useRef(false);
  const rafRef = useRef(0);
  const springRafRef = useRef(0);
  const phaseOffset = useRef(Math.random() * Math.PI * 2);
  const lastPos = useRef({ x: 0.5, y: 0.5 });
  const autoBlend = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!auto) return;

    let first = true;

    const tick = () => {
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
        setStyle(computeTiltStyle(rawX + b.x, rawY + b.y, "1"));
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [auto]);

  useEffect(() => {
    return () => cancelAnimationFrame(springRafRef.current);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    pointerOver.current = true;
    cancelAnimationFrame(springRafRef.current);
    autoBlend.current = { x: 0, y: 0 };

    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    lastPos.current = { x, y };
    setStyle(computeTiltStyle(x, y, "1"));
  }, []);

  const onPointerLeave = useCallback(() => {
    cancelAnimationFrame(springRafRef.current);

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
          pointerOver.current = false;
          return;
        }

        setStyle(
          computeTiltStyle(state.x, state.y, String(state.opacity), "none"),
        );
        springRafRef.current = requestAnimationFrame(animate);
      };

      springRafRef.current = requestAnimationFrame(animate);
      return;
    }

    pointerOver.current = false;

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
        setStyle(computeTiltStyle(targetX, targetY, "0"));
        return;
      }

      setStyle(
        computeTiltStyle(state.x, state.y, String(state.opacity), "none"),
      );
      springRafRef.current = requestAnimationFrame(animate);
    };

    springRafRef.current = requestAnimationFrame(animate);
  }, [auto]);

  return { tiltStyle: style, onPointerMove, onPointerLeave };
}
