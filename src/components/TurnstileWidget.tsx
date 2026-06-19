import { useEffect, useRef } from "react";

const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "auto";
      size: "flexible";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const loaded = () => resolve();
    const failed = () => {
      scriptPromise = null;
      reject(new Error("Cloudflare Turnstile failed to load."));
    };

    if (existing) {
      existing.addEventListener("load", loaded, { once: true });
      existing.addEventListener("error", failed, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export default function TurnstileWidget({
  action,
  onTokenChange,
  resetKey = 0,
}: {
  action: string;
  onTokenChange: (token: string | null) => void;
  resetKey?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbackRef = useRef(onTokenChange);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || "";
  const isDev = import.meta.env.DEV;

  // In development, emit a dummy token so the Fight button works
  // without needing the Cloudflare Turnstile widget.
  useEffect(() => {
    if (!isDev) return;
    onTokenChange("dev-bypass-token");
  }, [isDev, onTokenChange]);

  useEffect(() => {
    callbackRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    let cancelled = false;
    if (!siteKey || !containerRef.current) {
      if (!isDev) callbackRef.current(null);
      return;
    }

    void loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: "auto",
          size: "flexible",
          callback: (token) => callbackRef.current(token),
          "expired-callback": () => callbackRef.current(null),
          "error-callback": () => callbackRef.current(null),
        });
      })
      .catch(() => callbackRef.current(null));

    return () => {
      cancelled = true;
      if (!isDev) callbackRef.current(null);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [action, siteKey, isDev]);

  useEffect(() => {
    if (!isDev) callbackRef.current(null);
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey, isDev]);

  // In dev mode, don't render the real widget — just a hidden placeholder.
  if (isDev) {
    return <div className="hidden" aria-hidden />;
  }

  if (!siteKey) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        Human verification is not configured.
      </p>
    );
  }

  return <div ref={containerRef} className="min-h-[65px] w-full" />;
}
