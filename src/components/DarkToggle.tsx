import React, { useEffect, useState } from "react";

const STORAGE_KEY = "mirabellier-theme";

const safely = (fn: () => void) => {
  try {
    fn();
  } catch {
    // Ignore storage/document access failures in restricted environments.
  }
};

const setDocumentDark = (isDark: boolean) => {
  safely(() => {
    const element = document.documentElement;
    if (isDark) element.classList.add("dark");
    else element.classList.remove("dark");
  });
};

const DarkToggle: React.FC = () => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    let storedValue: string | null = null;
    safely(() => {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v) storedValue = v;
    });
    if (storedValue) return storedValue === "dark";
    return false;
  });

  useEffect(() => {
    setDocumentDark(isDark);
    safely(() => {
      localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
    });
    safely(() => {
      // Clear any stale inline theme background so CSS variables from the
      // current stylesheet control the page background.
      document.documentElement.style.removeProperty("--page-bg");
    });
  }, [isDark]);

  return (
    <button
      aria-label="Toggle dark mode"
      onClick={() => setIsDark((s) => !s)}
      className="inline-flex items-center justify-center gap-1 text-sm text-center font-bold text-blue-500 hover:underline"
      type="button"
    >
      <img
        className="h-4 w-4"
        src={isDark ? "/moon.png" : "/sun.png"}
        width="16"
        height="16"
        alt={isDark ? "moon icon" : "sun icon"}
      />
      {isDark ? (
        <>
          <span className="hidden sm:inline">dark theme</span> on
        </>
      ) : (
        <>
          <span className="hidden sm:inline">dark theme</span> off
        </>
      )}
    </button>
  );
};

export default DarkToggle;
