import { useEffect, useRef, useState } from "react";
import NormalCursor from "./cursor/NormalCursor";
import PointerCursor from "./cursor/PointerCursor";
import TextCursor from "./cursor/TextCursor";
import { useCursor } from "../states/CursorContext";
import { useReducedMotion } from "../hooks/use-reduced-motion";

// Same three glyphs the rest of the site already sprinkles around
// (Home.tsx, Footer.tsx) — the trail borrows the site's own motif instead
// of inventing a new one.
const SPARKLE_GLYPHS = ["⋆", "✿", "✧"];
const SPARKLE_MIN_DISTANCE = 28;
const SPARKLE_LIFETIME_MS = 650;

type Sparkle = { key: number; x: number; y: number; glyph: string };

export default function CursorManager() {
  const { isCustomCursor } = useCursor();
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [cursorState, setCursorState] = useState({
    isText: false,
    isPointer: false,
  });
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const lastSparklePos = useRef({ x: 0, y: 0 });
  const sparkleKey = useRef(0);

  useEffect(() => {
    if (!isCustomCursor) {
      setIsVisible(false);
      return;
    }

    // Set visible immediately if custom cursor is turned on
    setIsVisible(true);

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });

      const target = e.target as HTMLElement;

      const isTextElement = target.closest("input, textarea");

      const isClickable =
        !isTextElement &&
        target.closest(
          'a, button, [role="button"], [onclick], [data-clickable]',
        );

      setCursorState({
        isText: !!isTextElement,
        isPointer: !!isClickable,
      });

      // Reduced motion or a text field: no trail. Otherwise, spawn a
      // sparkle only once the pointer has actually traveled a bit, so
      // moving the mouse a pixel doesn't flood the DOM.
      if (reducedMotion || isTextElement) return;
      const dx = e.clientX - lastSparklePos.current.x;
      const dy = e.clientY - lastSparklePos.current.y;
      if (dx * dx + dy * dy < SPARKLE_MIN_DISTANCE * SPARKLE_MIN_DISTANCE) return;
      lastSparklePos.current = { x: e.clientX, y: e.clientY };

      const key = sparkleKey.current++;
      const glyph = SPARKLE_GLYPHS[key % SPARKLE_GLYPHS.length];
      setSparkles((prev) => [...prev, { key, x: e.clientX, y: e.clientY, glyph }]);
      setTimeout(() => {
        setSparkles((prev) => prev.filter((s) => s.key !== key));
      }, SPARKLE_LIFETIME_MS);
    };

    const handleMouseEnter = () => setIsVisible(true);
    const handleMouseLeave = () => setIsVisible(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.body.addEventListener("mouseenter", handleMouseEnter);
    document.body.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.body.removeEventListener("mouseenter", handleMouseEnter);
      document.body.removeEventListener("mouseleave", handleMouseLeave);
      setSparkles([]);
    };
  }, [isCustomCursor, reducedMotion]);

  if (!isCustomCursor || !isVisible) return null;

  return (
    <>
      <NormalCursor
        position={position}
        isActive={!cursorState.isText && !cursorState.isPointer}
      />
      <PointerCursor
        position={position}
        isActive={cursorState.isPointer && !cursorState.isText}
      />
      <TextCursor position={position} isActive={cursorState.isText} />
      {sparkles.map((s) => (
        <span
          key={s.key}
          className="cursor-sparkle"
          style={{ left: `${s.x}px`, top: `${s.y}px` }}
          aria-hidden="true"
        >
          {s.glyph}
        </span>
      ))}
    </>
  );
}
