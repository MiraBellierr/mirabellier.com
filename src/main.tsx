import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";

const loadCss = () => import("./index.css");
const CHUNK_RELOAD_GUARD = "mirabellier-chunk-reload";
const SERVICE_WORKER_CLEANUP_RELOAD_GUARD =
  "mirabellier-service-worker-cleanup-reload";

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

async function cleanupServiceWorkers() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  let hadRegistration = false;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    hadRegistration = registrations.length > 0;

    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
  } catch {
    // Ignore service worker cleanup failures and keep loading the app.
  }

  if ("caches" in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("mirabellier-"))
          .map((cacheName) => caches.delete(cacheName)),
      );
    } catch {
      // Ignore cache cleanup failures and keep loading the app.
    }
  }

  if (
    hadRegistration &&
    sessionStorage.getItem(SERVICE_WORKER_CLEANUP_RELOAD_GUARD) !== "1"
  ) {
    sessionStorage.setItem(SERVICE_WORKER_CLEANUP_RELOAD_GUARD, "1");
    window.location.reload();
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void cleanupServiceWorkers();
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
