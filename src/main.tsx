import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { API_BASE } from "./lib/config";
import "./index.css";
const CHUNK_RELOAD_GUARD = "mirabellier-chunk-reload";
const CHUNK_RELOAD_QUERY = "__chunk_reload";
const CHUNK_RELOAD_COOLDOWN_MS = 90_000;

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

function writeChunkReloadGuardToSession(timestamp: number) {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_GUARD, String(timestamp));
  } catch {
    // Safari can deny storage access in some modes; URL guard still applies.
  }
}

function consumeChunkReloadGuardFromUrl() {
  const url = new URL(window.location.href);
  const queryTimestamp = parsePositiveInteger(
    url.searchParams.get(CHUNK_RELOAD_QUERY),
  );
  if (!queryTimestamp) return;

  writeChunkReloadGuardToSession(queryTimestamp);
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

function reloadForUpdatedBuild() {
  const now = Date.now();
  const lastReloadTimestamp = readLastChunkReloadTimestamp();
  if (
    lastReloadTimestamp > 0 &&
    now - lastReloadTimestamp < CHUNK_RELOAD_COOLDOWN_MS
  ) {
    return;
  }

  writeChunkReloadGuardToSession(now);
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(CHUNK_RELOAD_QUERY, String(now));
  window.location.replace(nextUrl.toString());
}

consumeChunkReloadGuardFromUrl();

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

const initializeNonCriticalBoot = () => {
  preconnectOrigin(API_BASE);

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
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
