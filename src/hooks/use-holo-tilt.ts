import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const AUTO_CYCLE_MS = 5000;

type HoloTiltOptions = {
  auto?: boolean;
};

function computeTiltStyle(x: number, y: number, opacity: string): CSSProperties {
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
  } as CSSProperties;
}

export function useHoloTilt(options?: HoloTiltOptions) {
  const auto = options?.auto ?? false;

  const [style, setStyle] = useState<CSSProperties>(() =>
    computeTiltStyle(0.5, 0.1, auto ? "1" : "0"),
  );

  const pointerOver = useRef(false);
  const rafRef = useRef(0);
  const phaseOffset = useRef(Math.random() * Math.PI * 2);

  useEffect(() => {
    if (!auto) return;

    const tick = () => {
      if (!pointerOver.current) {
        const elapsed = performance.now() / AUTO_CYCLE_MS + phaseOffset.current / (Math.PI * 2);
        const angle = (elapsed % 1) * Math.PI * 2;
        const x = 0.5 + Math.sin(angle) * 0.35;
        const y = 0.25 + Math.sin(angle * 1.6 + 1.2) * 0.2;
        setStyle(computeTiltStyle(x, y, "1"));
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [auto]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    pointerOver.current = true;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setStyle(computeTiltStyle(x, y, "1"));
  }, []);

  const onPointerLeave = useCallback(() => {
    pointerOver.current = false;
    if (!auto) {
      setStyle(computeTiltStyle(0.5, 0.1, "0"));
    }
  }, [auto]);

  return { tiltStyle: style, onPointerMove, onPointerLeave };
}
