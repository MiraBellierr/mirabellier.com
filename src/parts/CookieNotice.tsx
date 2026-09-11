import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const COOKIE_NOTICE_KEY = "mirabellier-cookie-notice-acknowledged";
const SHOW_DELAY_MS = 2000;

const safely = <T,>(fn: () => T): T | undefined => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const acknowledged = safely(() =>
      window.localStorage.getItem(COOKIE_NOTICE_KEY),
    );
    if (acknowledged === "1") return;
    setDismissed(false);
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (dismissed) return null;

  const acknowledge = () => {
    setVisible(false);
    safely(() => window.localStorage.setItem(COOKIE_NOTICE_KEY, "1"));
    window.setTimeout(() => setDismissed(true), 300);
  };

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className={`fixed inset-x-3 bottom-3 z-[230000] mx-auto flex max-w-xl flex-col gap-3 rounded-2xl bg-pink-100/95 p-4 text-sm text-pink-900 shadow-2xl backdrop-blur transition-all duration-300 sm:flex-row sm:items-center sm:justify-between dark:bg-pink-950/95 dark:text-pink-100 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      }`}
      // Tailwind's `border-*` utilities trip a global `[class*="border-"][class*="rounded"]`
      // rule in index.css that force-overrides background/border/text color — the
      // border is set inline instead so this element carries no `border-*` class.
      style={{ borderWidth: 1, borderStyle: "solid", borderColor: "rgba(244, 114, 182, 0.5)" }}
    >
      <p>
        Mirabellier.com uses essential cookies to keep you signed in and
        protect the site from abuse. See the{" "}
        <Link
          to="/privacy"
          className="font-semibold underline underline-offset-4"
        >
          Privacy Policy
        </Link>{" "}
        for details.
      </p>
      <button
        type="button"
        onClick={acknowledge}
        className="shrink-0 rounded-full bg-pink-600 px-4 py-1.5 font-semibold text-white transition hover:bg-pink-700 dark:bg-pink-600 dark:hover:bg-pink-500"
      >
        Got it
      </button>
    </div>
  );
}
