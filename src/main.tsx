import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";

declare const __SW_VERSION__: string;

const loadCss = () => import("./index.css");
const CHUNK_RELOAD_GUARD = "mirabellier-chunk-reload";
const serviceWorkerUrl = `/sw.js?v=${encodeURIComponent(__SW_VERSION__)}`;

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

if ("serviceWorker" in navigator) {
  let isRefreshing = false;

  const refreshWorker = () =>
    navigator.serviceWorker.getRegistration().then((registration) => {
      return registration?.update();
    });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (isRefreshing) return;
    isRefreshing = true;
    window.location.reload();
  });

  window.addEventListener("pageshow", () => {
    refreshWorker().catch(() => {});
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshWorker().catch(() => {});
    }
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(serviceWorkerUrl, { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {});
  });
}

// Preload theme background images for faster LCP
const preloadBackgrounds = () => {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
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
    loadCss();
    preloadBackgrounds();
  });
} else {
  setTimeout(() => {
    loadCss();
    preloadBackgrounds();
  }, 0);
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
