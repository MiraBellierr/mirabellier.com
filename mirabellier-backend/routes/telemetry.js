// Real-user monitoring intake for the SPA (src/lib/telemetry.ts):
//
//   POST /telemetry/vitals   Core Web Vitals samples for a page view
//   POST /telemetry/errors   one uncaught error / unhandled rejection
//
// Both are unauthenticated and fire-and-forget (the client uses
// `navigator.sendBeacon`, so it never reads the response). They are already
// behind the app-wide global + write rate limiters. Rows are append-only and
// self-pruned to a 30-day window.

const express = require("express");

const VITALS_METRICS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);
const VITALS_RATINGS = new Set(["good", "needs-improvement", "poor"]);
const NAV_TYPES = new Set([
  "navigate",
  "reload",
  "back-forward",
  "back_forward",
  "back-forward-cache",
  "prerender",
  "restore",
]);
const ERROR_KINDS = new Set(["error", "unhandledrejection"]);

// web-vitals values are milliseconds except CLS (unitless, small). 1h is a
// generous ceiling that still rejects garbage.
const MAX_METRIC_VALUE = 3_600_000;
const MAX_METRICS_PER_BEACON = 12;
const PRUNE_SAMPLE_RATE = 0.02;
const RETENTION_DAYS = 30;

function str(value, maxLen) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function finiteNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(value) {
  const n = finiteNumber(value);
  return n === null ? null : Math.trunc(n);
}

function maybePrune(db) {
  if (Math.random() >= PRUNE_SAMPLE_RATE) return;
  try {
    const cutoff = `-${RETENTION_DAYS} days`;
    db.prepare(
      `DELETE FROM client_vitals WHERE receivedAt < datetime('now', ?)`,
    ).run(cutoff);
    db.prepare(
      `DELETE FROM client_errors WHERE receivedAt < datetime('now', ?)`,
    ).run(cutoff);
  } catch {
    // Pruning is best-effort; never fail the intake over it.
  }
}

module.exports = function registerTelemetryRoutes(app, deps) {
  const { db } = deps;

  // Small dedicated body cap — a vitals/error beacon is a few hundred bytes.
  // A malformed body is swallowed to an empty object rather than 400'd: these
  // are fire-and-forget beacons and garbage input shouldn't get a signal back.
  const parseJson = express.json({ limit: "16kb" });
  const tolerantJson = (req, res, next) => {
    parseJson(req, res, (err) => {
      if (err) req.body = {};
      next();
    });
  };

  const insertVital = db.prepare(
    `INSERT INTO client_vitals
       (receivedAt, metric, value, rating, navigationType, path, connection, ua)
     VALUES (@receivedAt, @metric, @value, @rating, @navigationType, @path, @connection, @ua)`,
  );

  const insertError = db.prepare(
    `INSERT INTO client_errors
       (receivedAt, kind, message, stack, source, lineno, colno, path, ua)
     VALUES (@receivedAt, @kind, @message, @stack, @source, @lineno, @colno, @path, @ua)`,
  );

  app.post("/telemetry/vitals", tolerantJson, (req, res) => {
    try {
      const body = req.body || {};
      const rawMetrics = Array.isArray(body.metrics) ? body.metrics : [];
      const receivedAt = new Date().toISOString();
      const ua = str(req.get("user-agent"), 300);
      const path = str(body.path, 512);
      const navigationType = NAV_TYPES.has(body.nav) ? String(body.nav) : null;
      const connection = str(body.conn, 24);

      const rows = [];
      for (const entry of rawMetrics.slice(0, MAX_METRICS_PER_BEACON)) {
        if (!entry || typeof entry !== "object") continue;
        const metric = String(entry.name || "").toUpperCase();
        if (!VITALS_METRICS.has(metric)) continue;
        const value = finiteNumber(entry.value);
        if (value === null || value < 0 || value > MAX_METRIC_VALUE) continue;
        rows.push({
          receivedAt,
          metric,
          value,
          rating: VITALS_RATINGS.has(entry.rating) ? entry.rating : null,
          navigationType,
          path,
          connection,
          ua,
        });
      }

      if (rows.length) {
        const insertMany = db.transaction((items) => {
          for (const item of items) insertVital.run(item);
        });
        insertMany(rows);
        maybePrune(db);
      }

      res.status(204).end();
    } catch {
      res.status(204).end();
    }
  });

  app.post("/telemetry/errors", tolerantJson, (req, res) => {
    try {
      const body = req.body || {};
      const kind = ERROR_KINDS.has(body.kind) ? body.kind : null;
      const message = str(body.message, 1000);

      if (!kind || !message) {
        res.status(204).end();
        return;
      }

      insertError.run({
        receivedAt: new Date().toISOString(),
        kind,
        message,
        stack: str(body.stack, 4000),
        source: str(body.source, 512),
        lineno: intOrNull(body.lineno),
        colno: intOrNull(body.colno),
        path: str(body.path, 512),
        ua: str(req.get("user-agent"), 300),
      });
      maybePrune(db);

      res.status(204).end();
    } catch {
      res.status(204).end();
    }
  });
};
