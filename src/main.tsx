import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { API_BASE } from "./lib/config";
import "./index.css";
const CHUNK_RELOAD_GUARD = "mirabellier-chunk-reload";

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
  if (sessionStorage.getItem(CHUNK_RELOAD_GUARD) === "1") {
    return;
  }

  sessionStorage.setItem(CHUNK_RELOAD_GUARD, "1");
  window.location.reload();
}

window.addEventListener("pageshow", () => {
  sessionStorage.removeItem(CHUNK_RELOAD_GUARD);
});

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
