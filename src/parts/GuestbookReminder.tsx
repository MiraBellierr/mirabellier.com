import { useEffect, useState } from "react";

const STORAGE_KEY = "mirabellier-guestbook-reminder-shown";
const SHOW_DELAY_MS = 2000;
const DISPLAY_DURATION_MS = 4000;
const EXIT_DURATION_MS = 760;

type ReminderState = "hidden" | "pending" | "entering" | "visible" | "leaving";

function getInitialState(): ReminderState {
  if (typeof window === "undefined") {
    return "hidden";
  }

  try {
    if (window.sessionStorage.getItem(STORAGE_KEY) === "1") {
      return "hidden";
    }

    window.sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Ignore storage failures and still show the reminder once.
  }

  return "pending";
}

const GuestbookReminder = () => {
  const [state, setState] = useState<ReminderState>(getInitialState);

  useEffect(() => {
    if (state !== "pending") {
      return;
    }

    const timer = window.setTimeout(() => {
      setState("entering");
    }, SHOW_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [state]);

  useEffect(() => {
    if (state !== "entering") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setState("visible");
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [state]);

  useEffect(() => {
    if (state !== "visible") {
      return;
    }

    const timer = window.setTimeout(() => {
      setState("leaving");
    }, DISPLAY_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [state]);

  useEffect(() => {
    if (state !== "leaving") {
      return;
    }

    const timer = window.setTimeout(() => {
      setState("hidden");
    }, EXIT_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [state]);

  if (state === "hidden" || state === "pending") {
    return null;
  }

  return (
    <div
      className={`site-entry-toast-shell ${state === "visible" ? "site-entry-toast-shell--visible" : ""} ${state === "leaving" ? "site-entry-toast-shell--leaving" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="site-entry-toast">
        <p className="site-entry-toast__message">
          {"Before you leave\nPlease sign your attendance in the guestbook!\n♡⸜(˶˃ ᵕ ˂˶)⸝♡"}
        </p>
      </div>
    </div>
  );
};

export default GuestbookReminder;
