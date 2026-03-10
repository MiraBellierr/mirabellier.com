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
      className="flex items-center space-x-2 bg-white/80 dark:bg-purple-900/70 backdrop-blur rounded-full p-1.5 shadow-md border border-blue-200 dark:border-purple-400/30"
    >
      <div className="relative w-12 h-6 flex items-center rounded-full transition-colors duration-300">
        <div
          className={`absolute left-0 top-0 w-full h-full rounded-full ${isDark ? "bg-gradient-to-r from-purple-700 to-blue-600" : "bg-gradient-to-r from-blue-200 to-cyan-100"}`}
        />
        <div
          className={`relative z-10 h-5 w-5 rounded-full bg-white dark:bg-purple-950 transform transition-transform duration-300 ${isDark ? "translate-x-6 rotate-12" : "translate-x-0 -rotate-6"}`}
        />
      </div>
      <div className="text-sm hidden sm:block select-none">
        {isDark ? "Night 🌙" : "Day ✨"}
      </div>
    </button>
  );
};

export default DarkToggle;
