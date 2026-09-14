/* eslint-disable no-console -- entry file boot diagnostics */
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { API_BASE } from "./lib/config";
import { initTelemetry } from "./lib/telemetry";
import {
  consumeChunkReloadGuardFromUrl,
  isChunkLoadErrorMessage,
  isIOS,
  reloadForUpdatedBuild,
} from "./lib/chunk-reload";
import "./index.css";

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

const SKIP_CHUNK_RELOAD = isIOS();

if (SKIP_CHUNK_RELOAD) {
  console.log("[chunk guard] skipping chunk reload guard on iOS");
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

consumeChunkReloadGuardFromUrl();

if (!SKIP_CHUNK_RELOAD) {
  window.addEventListener("vite:preloadError", (event) => {
    // Only suppress the throw when a reload is actually happening — if the
    // cooldown blocks it, let the error propagate so the error boundary
    // reports something real instead of `lazy` reading `.default` off
    // `undefined`.
    if (reloadForUpdatedBuild()) {
      event.preventDefault();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      typeof event.reason === "string"
        ? event.reason
        : event.reason instanceof Error
          ? event.reason.message
          : "";

    if (isChunkLoadErrorMessage(reason)) {
      if (reloadForUpdatedBuild()) {
        event.preventDefault();
      }
    }
  });
} else {
  window.addEventListener("vite:preloadError", (event) => {
    console.warn("[chunk guard] vite:preloadError on iOS — NOT reloading", event);
  });
}

const initializeNonCriticalBoot = () => {
  preconnectOrigin(API_BASE);
  initTelemetry();

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    // `updateViaCache: "none"` + an explicit `update()` are deliberate: without
    // them the browser may serve `sw.js` itself from the HTTP cache, so a
    // deployed fix to the worker can go unnoticed for as long as the script's
    // cache lifetime (see commit 561c051, which added both after a stale
    // worker served an old app shell).
    //
    // iOS is no longer excluded. The `!isIOS()` gate dates from when this
    // worker cached the app shell (the stale-layout bug); the worker is now
    // scoped to `/assets/` script/style requests only (`public/sw.js`), which
    // are content-hashed and immutable, so `index.html` can never be served
    // from cache and the failure it guarded against is gone. iOS also already
    // registers this same worker through the push flows (`NotifyToggle`,
    // `Twitch`), so the gate only ever suppressed the passive cache — exactly
    // the repeat-visit win Safari needs most.
    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
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
