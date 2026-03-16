import { createContext, useContext, useState, useEffect } from "react";

const CURSOR_STORAGE_KEY = "mirabellier-cursor-enabled";

type CursorContextType = {
  isCustomCursor: boolean;
  toggleCursor: () => void;
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

  // Touch-first devices do not benefit much from the custom cursor, so keep
  // it off unless the user explicitly turns it on.
  return !window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

const CursorContext = createContext<CursorContextType>({
  isCustomCursor: true,
  toggleCursor: () => {},
});

export function CursorProvider({ children }: { children: React.ReactNode }) {
  const [isCustomCursor, setIsCustomCursor] = useState(getDefaultCursorEnabled);

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

  useEffect(() => {
    if (!isCustomCursor) {
      document.body.style.cursor = "default";
    } else {
      document.body.style.cursor = "none";
    }
  }, [isCustomCursor]);

  useEffect(() => {
    document.body.style.cursor = isCustomCursor ? "none" : "default";
    const interactiveSelectors = 'a, button, input, [role="button"], [onclick]';
    const interactiveElements = document.querySelectorAll(interactiveSelectors);

    interactiveElements.forEach((el) => {
      (el as HTMLElement).style.cursor = isCustomCursor ? "none" : "";
    });
  }, [isCustomCursor]);

  const toggleCursor = () => {
    const newValue = !isCustomCursor;
    setIsCustomCursor(newValue);
    if (newValue) {
      document.body.style.cursor = "none";
    } else {
      document.body.style.cursor = "default";
    }
  };

  return (
    <CursorContext.Provider value={{ isCustomCursor, toggleCursor }}>
      {children}
    </CursorContext.Provider>
  );
}

export const useCursor = () => useContext(CursorContext);
