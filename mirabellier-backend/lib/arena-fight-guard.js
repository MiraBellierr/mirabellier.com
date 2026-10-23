// Rate limits for the Arena fight endpoints, keyed by account and source IP.
//
//  - FIGHT_WINDOWS gates fight creation (`/fight`, `/fight/start`).
//  - PLAYBACK_WINDOWS gates playback stepping (`/fight/advance`, `/fight/skip`),
//    which is called many times per fight, so it needs a much higher ceiling —
//    still far below what a script hammering the reward-finalizing endpoints
//    would produce.
const FIGHT_WINDOWS = [
  { scope: "account", durationMs: 60_000, limit: 30 },
  { scope: "ip", durationMs: 60_000, limit: 30 },
];

const PLAYBACK_WINDOWS = [
  { scope: "account", durationMs: 60_000, limit: 600 },
  { scope: "ip", durationMs: 60_000, limit: 600 },
];

const LONGEST_WINDOW_MS = Math.max(
  ...FIGHT_WINDOWS.map((window) => window.durationMs),
  ...PLAYBACK_WINDOWS.map((window) => window.durationMs),
);

// A full sweep of the attempts map is wasted work on every request; expired
// timestamps are already filtered per key in checkWindow. Sweep at most this
// often, only to reclaim memory for keys that have gone idle.
const PRUNE_INTERVAL_MS = 30_000;

const attemptsByKey = new Map();
let lastPruneAt = 0;

function normalizeIp(req) {
  if (!req) return "ws";
  const cloudflareIp = String(req.headers?.["cf-connecting-ip"] || "").trim();
  return cloudflareIp || req.ip || req.socket?.remoteAddress || "unknown";
}

function pruneAttempts(now) {
  lastPruneAt = now;
  attemptsByKey.forEach((timestamps, key) => {
    const active = timestamps.filter((timestamp) => now - timestamp < LONGEST_WINDOW_MS);
    if (active.length > 0) attemptsByKey.set(key, active);
    else attemptsByKey.delete(key);
  });
}

function checkWindow(key, durationMs, limit, now) {
  const timestamps = attemptsByKey.get(key) || [];
  const active = timestamps.filter((timestamp) => now - timestamp < durationMs);
  if (active.length < limit) return null;

  return Math.max(durationMs - (now - active[0]), 1000);
}

function checkRateLimit(prefix, windows, req, userId, now) {
  if (now - lastPruneAt > PRUNE_INTERVAL_MS) pruneAttempts(now);

  // On the WebSocket path there is no request and therefore no real client IP.
  // Applying the `ip` window there would funnel every socket user onto one
  // shared `fight:ip:ws` bucket, letting a single player lock everyone else out.
  // Account-scoped limiting still applies.
  const activeWindows = req
    ? windows
    : windows.filter((window) => window.scope !== "ip");

  const identities = {
    account: String(userId || "unknown"),
    ip: normalizeIp(req),
  };
  const keyFor = (window) => `${prefix}:${window.scope}:${identities[window.scope]}`;

  for (const window of activeWindows) {
    const retryAfterMs = checkWindow(
      keyFor(window),
      window.durationMs,
      window.limit,
      now,
    );
    if (retryAfterMs !== null) {
      return { allowed: false, retryAfterMs };
    }
  }

  for (const window of activeWindows) {
    const key = keyFor(window);
    const timestamps = attemptsByKey.get(key) || [];
    timestamps.push(now);
    attemptsByKey.set(key, timestamps);
  }

  return { allowed: true, retryAfterMs: 0 };
}

function checkArenaFightRateLimit(req, userId, now = Date.now()) {
  return checkRateLimit("fight", FIGHT_WINDOWS, req, userId, now);
}

function checkArenaPlaybackRateLimit(req, userId, now = Date.now()) {
  return checkRateLimit("playback", PLAYBACK_WINDOWS, req, userId, now);
}

function resetArenaFightRateLimits() {
  attemptsByKey.clear();
  lastPruneAt = 0;
}

module.exports = {
  checkArenaFightRateLimit,
  checkArenaPlaybackRateLimit,
  resetArenaFightRateLimits,
};
