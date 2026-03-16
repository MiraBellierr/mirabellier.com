import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { API_BASE } from "./lib/config";

const loadCss = () => import("./index.css");
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

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore registration failures and keep loading the app.
    });
  });
}

// Preload theme background images for faster LCP
const preloadBackgrounds = () => {
  let storedTheme: string | null = null;

  try {
    storedTheme = window.localStorage.getItem("mirabellier-theme");
  } catch {
    // Ignore storage access failures and fall back to system preference.
  }

  const isDark =
    storedTheme === "dark"
      ? true
      : storedTheme === "light"
        ? false
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
  const bgPath = isDark ? "/dark.jpg" : "/light.jpg";

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = bgPath;
  link.type = "image/jpeg";
  link.fetchPriority = "high";
  document.head.appendChild(link);
};

// Kick CSS loading as soon as the first frame can be scheduled to avoid idle delays.
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => {
    preconnectOrigin(API_BASE);
    loadCss();
    preloadBackgrounds();
  });
} else {
  setTimeout(() => {
    preconnectOrigin(API_BASE);
    loadCss();
    preloadBackgrounds();
  }, 0);
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
