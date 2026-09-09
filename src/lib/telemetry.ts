/**
 * Real-user monitoring: beacons Core Web Vitals and uncaught client errors to
 * the backend (`routes/telemetry.js`). Production + real host only; every path
 * is wrapped so a telemetry failure can never affect the app.
 *
 * Transport is `navigator.sendBeacon` (survives the unload that finalizes
 * CLS/INP), with a `fetch(..., { keepalive })` fallback.
 */
import { API_BASE } from "./config";

const VITALS_ENDPOINT = `${API_BASE}/telemetry/vitals`;
const ERRORS_ENDPOINT = `${API_BASE}/telemetry/errors`;

const MAX_ERRORS_PER_PAGE = 8;

// Deploy-time dynamic-import failures are already handled in main.tsx (it
// reloads onto the new build); no need to also log them as errors.
const IGNORED_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "ChunkLoadError",
  "error loading dynamically imported module",
];

let started = false;

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function currentPath(): string {
  try {
    return location.pathname.slice(0, 512);
  } catch {
    return "";
  }
}

function connectionType(): string | undefined {
  try {
    const conn = (
      navigator as Navigator & { connection?: { effectiveType?: string } }
    ).connection;
    return typeof conn?.effectiveType === "string"
      ? conn.effectiveType
      : undefined;
  } catch {
    return undefined;
  }
}

function navigationType(): string | undefined {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    return entry?.type;
  } catch {
    return undefined;
  }
}

function send(url: string, body: unknown): void {
  try {
    const json = JSON.stringify(body);
    const blob = new Blob([json], { type: "application/json" });
    if (typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(url, blob)) return;
    }
    void fetch(url, {
      method: "POST",
      body: json,
      headers: { "content-type": "application/json" },
      keepalive: true,
      mode: "cors",
      credentials: "omit",
    }).catch(() => {});
  } catch {
    // Telemetry must never throw.
  }
}

function initVitals(): void {
  void import("web-vitals")
    .then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
      const buffer: { name: string; value: number; rating: string }[] = [];
      const queue = (metric: {
        name: string;
        value: number;
        rating: string;
      }) => {
        buffer.push({
          name: metric.name,
          value: Math.round(metric.value * 1000) / 1000,
          rating: metric.rating,
        });
      };

      onCLS(queue);
      onFCP(queue);
      onINP(queue);
      onLCP(queue);
      onTTFB(queue);

      const flush = () => {
        if (buffer.length === 0) return;
        send(VITALS_ENDPOINT, {
          path: currentPath(),
          nav: navigationType(),
          conn: connectionType(),
          metrics: buffer.splice(0),
        });
      };

      // web-vitals finalizes each metric by the first `hidden`; flush again on
      // later hides so a long SPA session still reports INP/CLS deltas.
      addEventListener(
        "visibilitychange",
        () => {
          if (document.visibilityState === "hidden") flush();
        },
        { capture: true },
      );
      addEventListener("pagehide", flush, { capture: true });
    })
    .catch(() => {});
}

function initErrors(): void {
  const seen = new Set<string>();
  let count = 0;

  const report = (
    kind: "error" | "unhandledrejection",
    data: {
      message?: string;
      stack?: string;
      source?: string;
      lineno?: number;
      colno?: number;
    },
  ) => {
    try {
      const message = clip(data.message, 1000);
      if (!message) return;
      if (IGNORED_ERROR_PATTERNS.some((p) => message.includes(p))) return;
      if (count >= MAX_ERRORS_PER_PAGE) return;

      const key = `${kind}|${message}|${data.source ?? ""}|${data.lineno ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      count += 1;

      send(ERRORS_ENDPOINT, {
        kind,
        path: currentPath(),
        message,
        stack: clip(data.stack, 4000),
        source: clip(data.source, 512),
        lineno: Number.isFinite(data.lineno) ? data.lineno : undefined,
        colno: Number.isFinite(data.colno) ? data.colno : undefined,
      });
    } catch {
      // ignore
    }
  };

  addEventListener("error", (event) => {
    // Ignore resource-load errors (broken <img>/<script>) — those aren't
    // ErrorEvents with a real message.
    if (!(event instanceof ErrorEvent)) return;
    const err = event.error as Error | undefined;
    report("error", {
      message: event.message || err?.message || "uncaught error",
      stack: err?.stack,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  addEventListener("unhandledrejection", (event) => {
    const reason: unknown = event.reason;
    let message: string;
    if (reason instanceof Error) {
      message = reason.message;
    } else if (typeof reason === "string") {
      message = reason;
    } else {
      try {
        message = JSON.stringify(reason);
      } catch {
        message = String(reason);
      }
    }
    report("unhandledrejection", {
      message: message || "unhandled promise rejection",
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

export function initTelemetry(): void {
  if (started) return;
  started = true;

  if (!import.meta.env.PROD) return;

  try {
    const host = location.hostname;
    if (!host || host === "localhost" || host === "127.0.0.1") return;

    initErrors();
    initVitals();
  } catch {
    // ignore
  }
}
