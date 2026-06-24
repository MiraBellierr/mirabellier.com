import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { API_BASE } from "./lib/config";
import "./index.css";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isLocalDev(): boolean {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

((): void => {
  const navigation = performance.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming | undefined;

  const bootCount =
    Number(
      ((): string => {
        try {
          return sessionStorage.getItem("mirabellier-boot-count") || "0";
        } catch {
          return "0";
        }
      })(),
    ) + 1;

  try {
    sessionStorage.setItem("mirabellier-boot-count", String(bootCount));
  } catch {
    // sessionStorage may be unavailable
  }

  console.log("[app boot]", {
    time: new Date().toISOString(),
    navigationType: navigation?.type ?? "unknown",
    bootCount,
    isIOS: isIOS(),
    isLocalDev: isLocalDev(),
    url: window.location.href,
  });

  window.addEventListener("pageshow", (event) => {
    console.log("[pageshow]", {
      persisted: event.persisted,
      time: new Date().toISOString(),
    });
  });

  window.addEventListener("pagehide", (event) => {
    console.log("[pagehide]", {
      persisted: event.persisted,
      time: new Date().toISOString(),
    });
  });

  window.addEventListener("error", (event) => {
    console.error("[window error]", event.error || event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("[unhandled rejection]", event.reason);
  });
})();

const CHUNK_RELOAD_GUARD = "mirabellier-chunk-reload";
const CHUNK_RELOAD_QUERY = "__chunk_reload";
const CHUNK_RELOAD_COOLDOWN_MS = 90_000;
const CHUNK_FAILURE_KEY = "mirabellier-chunk-failures";
const CHUNK_FAILURE_WINDOW_MS = 30_000;
const CHUNK_FAILURE_THRESHOLD = 3;

const SKIP_CHUNK_RELOAD = isIOS();

if (SKIP_CHUNK_RELOAD) {
  console.log("[chunk guard] skipping chunk reload guard on iOS");
}

function parsePositiveInteger(value: string | null) {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readChunkReloadGuardFromSession() {
  try {
    return parsePositiveInteger(sessionStorage.getItem(CHUNK_RELOAD_GUARD));
  } catch {
    return 0;
  }
}

function writeChunkReloadGuardToSession(timestamp: number): boolean {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_GUARD, String(timestamp));
    return true;
  } catch {
    // Safari can deny storage access in some modes; URL guard still applies.
    return false;
  }
}

function consumeChunkReloadGuardFromUrl() {
  const url = new URL(window.location.href);
  const queryTimestamp = parsePositiveInteger(
    url.searchParams.get(CHUNK_RELOAD_QUERY),
  );
  if (!queryTimestamp) return;

  const sessionWriteOk = writeChunkReloadGuardToSession(queryTimestamp);
  if (!sessionWriteOk) return;

  url.searchParams.delete(CHUNK_RELOAD_QUERY);

  try {
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    // Ignore history API failures and keep app boot resilient.
  }
}

function readChunkFailureTimestamps(): number[] {
  try {
    const raw = sessionStorage.getItem(CHUNK_FAILURE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  } catch {
    return [];
  }
}

function recordChunkFailure(): number {
  const now = Date.now();
  let timestamps = readChunkFailureTimestamps();
  timestamps = timestamps.filter((t) => now - t < CHUNK_FAILURE_WINDOW_MS);
  timestamps.push(now);
  try {
    sessionStorage.setItem(CHUNK_FAILURE_KEY, JSON.stringify(timestamps));
  } catch {
    // Ignore storage failures.
  }
  return timestamps.length;
}

function readLastChunkReloadTimestamp() {
  const sessionTimestamp = readChunkReloadGuardFromSession();
  const urlTimestamp = parsePositiveInteger(
    new URL(window.location.href).searchParams.get(CHUNK_RELOAD_QUERY),
  );
  return Math.max(sessionTimestamp, urlTimestamp);
}

function preconnectOrigin(url: string) {
  if (typeof document === "undefined") {
    return;
  }

  try {
    const origin = new URL(url, window.location.origin).origin;

    if (origin === window.location.origin) {
      return;
    }

    if (!document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
      const preconnect = document.createElement("link");
      preconnect.rel = "preconnect";
      preconnect.href = origin;
      preconnect.crossOrigin = "";
      document.head.appendChild(preconnect);
    }

    if (!document.head.querySelector(`link[rel="dns-prefetch"][href="${origin}"]`)) {
      const dnsPrefetch = document.createElement("link");
      dnsPrefetch.rel = "dns-prefetch";
      dnsPrefetch.href = origin;
      document.head.appendChild(dnsPrefetch);
    }
  } catch {
    // Ignore malformed API URLs and keep app boot resilient.
  }
}

function shouldReload(): boolean {
  const now = Date.now();
  const lastReloadTimestamp = readLastChunkReloadTimestamp();
  if (
    lastReloadTimestamp > 0 &&
    now - lastReloadTimestamp < CHUNK_RELOAD_COOLDOWN_MS
  ) {
    return false;
  }

  const failures = recordChunkFailure();
  if (failures < CHUNK_FAILURE_THRESHOLD) {
    return false;
  }

  return true;
}

function reloadForUpdatedBuild() {
  if (!shouldReload()) return;

  const now = Date.now();
  writeChunkReloadGuardToSession(now);
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(CHUNK_RELOAD_QUERY, String(now));
  window.location.replace(nextUrl.toString());
}

consumeChunkReloadGuardFromUrl();

if (!SKIP_CHUNK_RELOAD) {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadForUpdatedBuild();
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      typeof event.reason === "string"
        ? event.reason
        : event.reason instanceof Error
          ? event.reason.message
          : "";

    if (
      reason.includes("Failed to fetch dynamically imported module") ||
      reason.includes("Importing a module script failed") ||
      reason.includes("ChunkLoadError")
    ) {
      event.preventDefault();
      reloadForUpdatedBuild();
    }
  });
} else {
  window.addEventListener("vite:preloadError", (event) => {
    console.warn("[chunk guard] vite:preloadError on iOS — NOT reloading", event);
  });
}

const initializeNonCriticalBoot = () => {
  preconnectOrigin(API_BASE);

  if (import.meta.env.PROD && "serviceWorker" in navigator && !isIOS()) {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore registration failures and keep loading the app.
    });
  }
};

if (document.readyState === "complete") {
  initializeNonCriticalBoot();
} else {
  window.addEventListener("load", initializeNonCriticalBoot, { once: true });
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
