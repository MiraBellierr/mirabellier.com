import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import NormalCursor from "./cursor/NormalCursor";
import PointerCursor from "./cursor/PointerCursor";
import TextCursor from "./cursor/TextCursor";
import { useCursor } from "../states/CursorContext";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import normalCursorSrc from "/cursors/Normal.gif";
import pointerCursorSrc from "/cursors/Pointer.gif";
import textCursorSrc from "/cursors/Text.gif";

// Same three glyphs the rest of the site already sprinkles around
// (Home.tsx, Footer.tsx) — the trail borrows the site's own motif instead
// of inventing a new one.
const SPARKLE_GLYPHS = ["⋆", "✿", "✧"];
const SPARKLE_MIN_DISTANCE = 28;
const SPARKLE_LIFETIME_MS = 650;

// The three cursor GIFs (see NormalCursor/PointerCursor/TextCursor). They are
// decoded here before the native cursor is hidden, so the swap never leaves a
// frame with no visible cursor while the images are still downloading.
const CURSOR_IMAGE_SOURCES = [
  normalCursorSrc,
  pointerCursorSrc,
  textCursorSrc,
];

type Sparkle = { key: number; x: number; y: number; glyph: string };
type CursorKind = { isText: boolean; isPointer: boolean };

function useCursorImagesReady(enabled: boolean) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled || ready || typeof window === "undefined") return;

    let cancelled = false;
    const loads = CURSOR_IMAGE_SOURCES.map(async (src) => {
      const image = new Image();
      image.src = src;
      try {
        // `decode()` resolves once the bitmap is actually ready to paint (and
        // rejects on a broken source). Fall back to nothing so a decode
        // failure can't keep the native cursor visible forever.
        await image.decode();
      } catch {
        // Ignore: the <img> nodes will report the failure themselves.
      }
    });

    void Promise.all(loads).then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, ready]);

  return ready;
}

export default function CursorManager() {
  const { isCustomCursor, getPointerPosition } = useCursor();
  const reducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(false);
  const [cursorState, setCursorState] = useState<CursorKind>({
    isText: false,
    isPointer: false,
  });
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const lastSparklePos = useRef({ x: 0, y: 0 });
  const sparkleKey = useRef(0);

  const imagesReady = useCursorImagesReady(isCustomCursor);

  // `true` once the pointer has been over the document at least once. This
  // component may mount long after the page (it is lazy-loaded), so the first
  // mouse move can have happened before we existed — `getPointerPosition()`
  // recovers it from CursorProvider.
  const [hasPointerPosition, setHasPointerPosition] = useState(
    () => getPointerPosition() !== null,
  );
  const hasPointerPositionRef = useRef(hasPointerPosition);

  // Pointer position is tracked outside React: `mousemove` can fire at 100+ Hz,
  // and re-rendering the cursor nodes (plus every sparkle) for each event is
  // wasted work when the browser only paints once per frame anyway. The latest
  // coordinates land in `--cursor-x`/`--cursor-y` on the wrapper, which the
  // three nodes read directly from CSS.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const pendingPos = useRef<{ x: number; y: number } | null>(null);
  const frameId = useRef<number | null>(null);
  const cursorStateRef = useRef<CursorKind>({ isText: false, isPointer: false });

  const flushPosition = useCallback(() => {
    frameId.current = null;
    const next = pendingPos.current;
    const wrapper = wrapperRef.current;
    if (!next || !wrapper) return;
    wrapper.style.setProperty("--cursor-x", `${next.x}px`);
    wrapper.style.setProperty("--cursor-y", `${next.y}px`);
  }, []);

  // Native-cursor suppression lives here — not in CursorProvider — so it
  // starts exactly when the custom cursor can actually be painted: after the
  // GIFs have decoded, this component has mounted (its chunk can load well
  // after the page), and the pointer has a known position. Until then the
  // default cursor stays visible, so enabling the custom cursor never leaves a
  // cursor-less window on first load.
  //
  // The position check reads the provider ref directly (not just the local
  // `hasPointerPosition`): toggling the cursor on from a click needs to swap
  // immediately using the move that brought the pointer to the button.
  //
  // `useLayoutEffect` (not `useEffect`) so the node position and the class flip
  // land in the same commit, before paint.
  useLayoutEffect(() => {
    if (!isCustomCursor || !isVisible || !imagesReady) return;

    const wrapper = wrapperRef.current;
    const position = pendingPos.current ?? getPointerPosition();
    if (!wrapper || !position) return;

    wrapper.style.setProperty("--cursor-x", `${position.x}px`);
    wrapper.style.setProperty("--cursor-y", `${position.y}px`);

    const root = document.documentElement;
    root.classList.add("custom-cursor");
    return () => {
      root.classList.remove("custom-cursor");
    };
  }, [
    isCustomCursor,
    isVisible,
    imagesReady,
    hasPointerPosition,
    getPointerPosition,
  ]);

  useEffect(() => {
    if (!isCustomCursor) {
      setIsVisible(false);
      return;
    }

    // Set visible immediately if custom cursor is turned on
    setIsVisible(true);

    const recordPointer = (clientX: number, clientY: number) => {
      pendingPos.current = { x: clientX, y: clientY };
      if (!hasPointerPositionRef.current) {
        hasPointerPositionRef.current = true;
        setHasPointerPosition(true);
      }
      if (frameId.current === null) {
        frameId.current = window.requestAnimationFrame(flushPosition);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      recordPointer(e.clientX, e.clientY);

      const target = e.target as HTMLElement;

      const isTextElement = target.closest("input, textarea");

      const isClickable =
        !isTextElement &&
        target.closest(
          'a, button, [role="button"], [onclick], [data-clickable]',
        );

      // Only touch React state when the hovered kind actually changes: moving
      // across a long link, or across plain text, must not re-render.
      const nextState = {
        isText: !!isTextElement,
        isPointer: !!isClickable,
      };
      const prevState = cursorStateRef.current;
      if (
        nextState.isText !== prevState.isText ||
        nextState.isPointer !== prevState.isPointer
      ) {
        cursorStateRef.current = nextState;
        setCursorState(nextState);
      }

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
      if (frameId.current !== null) {
        window.cancelAnimationFrame(frameId.current);
        frameId.current = null;
      }
      setSparkles([]);
    };
  }, [isCustomCursor, reducedMotion, flushPosition]);

  if (!isCustomCursor || !isVisible) return null;

  return (
    <div ref={wrapperRef} aria-hidden="true">
      <NormalCursor isActive={!cursorState.isText && !cursorState.isPointer} />
      <PointerCursor isActive={cursorState.isPointer && !cursorState.isText} />
      <TextCursor isActive={cursorState.isText} />
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
    </div>
  );
}
