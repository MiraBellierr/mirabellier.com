import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const CURSOR_STORAGE_KEY = "mirabellier-cursor-enabled";

type PointerPosition = { x: number; y: number };

type CursorContextType = {
  isCustomCursor: boolean;
  toggleCursor: () => void;
  /**
   * The last pointer position seen over the document, or null if the pointer
   * has not moved over the page yet. `CursorManager` uses this to place the
   * custom cursor (and suppress the native one) the instant it loads, instead
   * of waiting for the next `mousemove`.
   */
  getPointerPosition: () => PointerPosition | null;
};

function getStoredCursorEnabled() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(CURSOR_STORAGE_KEY);

    if (storedValue === "true") {
      return true;
    }

    if (storedValue === "false") {
      return false;
    }
  } catch {
    // Ignore storage failures and fall back to device defaults.
  }

  return null;
}

function getDefaultCursorEnabled() {
  const storedValue = getStoredCursorEnabled();
  if (storedValue !== null) {
    return storedValue;
  }

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }

  // Touch-first devices do not benefit much from the custom cursor, and
  // someone who's asked their OS for less motion didn't ask for a cursor
  // that follows the pointer everywhere — keep it off by default unless the
  // user explicitly turns it on.
  return !window.matchMedia(
    "(hover: none), (pointer: coarse), (prefers-reduced-motion: reduce)",
  ).matches;
}

const CursorContext = createContext<CursorContextType>({
  isCustomCursor: true,
  toggleCursor: () => {},
  getPointerPosition: () => null,
});

export function CursorProvider({ children }: { children: React.ReactNode }) {
  const [isCustomCursor, setIsCustomCursor] = useState(getDefaultCursorEnabled);
  const pointerPositionRef = useRef<PointerPosition | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CURSOR_STORAGE_KEY,
        isCustomCursor ? "true" : "false",
      );
    } catch {
      // Ignore storage failures and keep the setting working for this session.
    }
  }, [isCustomCursor]);

  // Track the pointer from the first movement — long before the lazy
  // `CursorManager` chunk loads — so the native-to-custom swap can happen at
  // the exact position the pointer already is. The native cursor is *not*
  // hidden here: CursorManager owns that (see the note there), so a visitor
  // who enables the custom cursor never has a cursor-less window while the
  // chunk is still loading.
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
    };

    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const getPointerPosition = useCallback(
    () => pointerPositionRef.current,
    [],
  );

  const toggleCursor = () => setIsCustomCursor((value) => !value);

  return (
    <CursorContext.Provider
      value={{ isCustomCursor, toggleCursor, getPointerPosition }}
    >
      {children}
    </CursorContext.Provider>
  );
}

export const useCursor = () => useContext(CursorContext);
