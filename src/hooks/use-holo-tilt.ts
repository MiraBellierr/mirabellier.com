import { useCallback, useState } from "react";
import type { CSSProperties } from "react";

const DEFAULT_TRANSFORM = "rotateY(0deg) rotateX(0deg)";

export function useHoloTilt() {
  const [style, setStyle] = useState<CSSProperties>(() => ({
    "--pointer-x": "50%",
    "--pointer-y": "10%",
    "--card-opacity": "0",
    transform: DEFAULT_TRANSFORM,
  } as CSSProperties));

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const rotateX = (y - 0.5) * -24;
    const rotateY = (x - 0.5) * 24;

    setStyle({
      "--pointer-x": `${x * 100}%`,
      "--pointer-y": `${y * 100}%`,
      "--card-opacity": "1",
      transform: `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`,
    } as CSSProperties);
  }, []);

  const onPointerLeave = useCallback(() => {
    setStyle({
      "--pointer-x": "50%",
      "--pointer-y": "10%",
      "--card-opacity": "0",
      transform: DEFAULT_TRANSFORM,
      transition: "transform 300ms ease",
    } as CSSProperties);
  }, []);

  return { tiltStyle: style, onPointerMove, onPointerLeave };
}
