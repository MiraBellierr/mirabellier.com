const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const fs = require("fs");
const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const passport = require("passport");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { DEV_ORIGINS, devOriginsEnabled } = require("./lib/dev-origins");
const {
  createApiHostNoindexMiddleware,
} = require("./lib/indexable-hosts");
const {
  DEFAULT_JSON_LIMIT,
  createJsonBodyParser,
} = require("./lib/body-limits");

const app = express();
const PORT = process.env.PORT || 5000;
const API_PREFIX = "/v1";
const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || "mirabellier_session";

function createCompressionMiddleware() {
  return compression({
    level: 6, // Balance between speed and compression
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  });
}

function keepAliveMiddleware(req, res, next) {
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Keep-Alive", "timeout=5, max=100");
  next();
}

function normalizeApiPrefixMiddleware(req, _res, next) {
  if (req.url === API_PREFIX || req.url.startsWith(`${API_PREFIX}/`)) {
    const normalizedPath = req.url.slice(API_PREFIX.length);
    req.url = normalizedPath || "/";
  }
  next();
}

function createCorsMiddleware() {
  const normalizeOrigin = (origin) => String(origin || "").trim().replace(/\/$/, "");
  const configuredFrontendUrl = normalizeOrigin(process.env.FRONTEND_URL || "");
  const configuredFrontendUrls = String(process.env.FRONTEND_URLS || "")
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);
  const allowedOrigins = new Set([
    configuredFrontendUrl,
    ...configuredFrontendUrls,
    "https://mirabellier.com",
    "https://www.mirabellier.com",
    // Local dev servers are only trusted when ALLOW_DEV_ORIGINS=true, so a page
    // on a victim's localhost cannot make credentialed calls to production.
    ...(devOriginsEnabled() ? DEV_ORIGINS : []),
  ].filter(Boolean));

  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(normalizeOrigin(origin))) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Origin",
      "Accept",
      "X-Requested-With",
    ],
  });
}

function serverTimingMiddleware(req, res, next) {
  const startedAt = Date.now();
  const originalSend = res.send;

  res.send = function patchedSend(...args) {
    const durationMs = Date.now() - startedAt;
    if (!res.headersSent) {
      res.setHeader("Server-Timing", `total;dur=${durationMs}`);
    }
    return originalSend.apply(res, args);
  };

  next();
}

const USER_AGENT_VARY_PREFIXES = [
  "/anime",
  "/blog",
  "/profile",
  "/pixies",
  "/question-of-the-day",
  "/quotes",
  "/shrine",
];

function varyUserAgentForSpaPreviewRoutes(req, res, next) {
  if (req.method !== "GET") {
    next();
    return;
  }

  const path = String(req.path || "");
  const shouldVary = USER_AGENT_VARY_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );

  if (!shouldVary) {
    next();
    return;
  }

  const existingVary = String(res.getHeader("Vary") || "");
  if (!/\bUser-Agent\b/i.test(existingVary)) {
    const nextVary = existingVary ? `${existingVary}, User-Agent` : "User-Agent";
    res.setHeader("Vary", nextVary);
  }

  next();
}

function readCookieValue(req, key) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return "";

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const cookieKey = trimmed.slice(0, separatorIndex);
    if (cookieKey !== key) continue;
    const rawValue = trimmed.slice(separatorIndex + 1);
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return "";
}

function getBearerTokenFromReq(req) {
  const auth = req.headers.authorization;
  if (!auth) return "";
  const parts = auth.split(" ");
  if (parts.length !== 2) return "";
  return parts[1];
}

function getSessionCookieTokenFromReq(req) {
  return readCookieValue(req, SESSION_COOKIE_NAME);
}

const TRUST_PROXY_HOPS = (() => {
  const raw = Number.parseInt(process.env.TRUST_PROXY_HOPS || "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1;
})();

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Baseline per-IP ceiling for every request, plus a much tighter one for
// mutations (login, profile edits, comments, guestbook, uploads, follows, TCG).
// In-memory store: counters reset on restart and are not shared across nodes —
// fine for the single-node deployment, revisit before scaling out.
function createGlobalRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    limit: parsePositiveInt(process.env.RATE_LIMIT_GLOBAL_PER_MIN, 600),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "rate_limited" },
  });
}

function createWriteRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    limit: parsePositiveInt(process.env.RATE_LIMIT_WRITE_PER_MIN, 60),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      req.method === "GET" ||
      req.method === "HEAD" ||
      req.method === "OPTIONS",
    message: { error: "rate_limited" },
  });
}

// `/auth/ws-token` mints a short-lived WebSocket credential. The 60/min write
// limiter covers it (it's a POST), but that is loose for a credential mint — a
// dedicated bucket holds it to ~10/min per authenticated user (falling back to
// per-IP for the unauthenticated case, which 401s anyway). Resolving the user
// here repeats the handler's `authFromReq` lookup; negligible at this volume.
function createWsTokenRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    limit: parsePositiveInt(process.env.RATE_LIMIT_WS_TOKEN_PER_MIN, 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const user = authFromReq(req);
      return user && user.id
        ? `user:${user.id}`
        : rateLimit.ipKeyGenerator(req.ip);
    },
    message: { error: "rate_limited" },
  });
}

// Permissive-but-real CSP. The API, the SSR SEO/embed pages, and the built
// SPA entry (`dist/index.html`) all share this origin, so the directives have
// to cover everything those pages actually pull in:
//   - the SPA entry ships two inline <script> blocks (boot-route + theme) and
//     an inline critical-CSS <style>  -> 'unsafe-inline' for script/style
//   - it also loads its bundle from /assets on this origin                -> 'self'
//   - React renders `style={{…}}` as inline style attributes             -> covered by style-src
//   - object URLs for video posters / avatar previews / downloads        -> blob:
//   - remote images (Discord CDN avatars, proxied fan art)               -> https: data:
//   - the realtime layer opens a WebSocket                               -> ws: wss:
//   - Twitch player/clip and Ko-fi embeds are iframed                    -> frame-src https:
// `script-src-attr 'none'` still blocks on*="" handler attributes, and
// `frame-ancestors 'none'` keeps other sites from framing us (matches the
// existing X-Frame-Options).
//
// Shipped as Content-Security-Policy-Report-Only first (see `reportOnly` below):
// violations surface in the browser console without blocking anything. Once the
// console is clean in prod, drop `reportOnly` to enforce.
const CONTENT_SECURITY_POLICY_DIRECTIVES = {
  "default-src": ["'self'"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'"],
  "script-src-attr": ["'none'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "media-src": ["'self'", "data:", "blob:", "https:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'", "https:", "ws:", "wss:"],
  "worker-src": ["'self'", "blob:"],
  "frame-src": ["'self'", "https:"],
  // No `upgrade-insecure-requests`: local dev is served over http.
};

function registerMiddlewares(app) {
  // Behind Cloudflare (+ any reverse proxy): trust exactly the configured hop
  // count so req.ip is the real client and rate-limit buckets are per-visitor.
  app.set("trust proxy", TRUST_PROXY_HOPS);
  app.use(createCompressionMiddleware());
  app.use(keepAliveMiddleware);
  app.use(normalizeApiPrefixMiddleware);
  // Registered before the rate limiters and every route so error, 404, and
  // 429 responses carry the directive too. See lib/indexable-hosts.js for why
  // this is host-gated rather than blanket, and why media is exempt.
  app.use(createApiHostNoindexMiddleware());
  app.use(createCorsMiddleware());
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        reportOnly: true,
        directives: CONTENT_SECURITY_POLICY_DIRECTIVES,
      },
      // The frontend loads /images and /videos from this (cross-origin) API.
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(createGlobalRateLimiter());
  app.use(createWriteRateLimiter());
  app.use(varyUserAgentForSpaPreviewRoutes);
  // JSON parsing with a per-route size cap: post save gets headroom for a
  // whole inline document (and is owner-gated before the body is buffered),
  // everything else stays on the small default that keeps the "buffer up to
  // 1GB per POST" DoS surface away. lib/body-limits.js has the full rationale.
  app.use(createJsonBodyParser({ authFromReq }));
  app.use(
    bodyParser.urlencoded({ limit: DEFAULT_JSON_LIMIT, extended: true }),
  );
  app.use(passport.initialize());
  app.use(serverTimingMiddleware);
}

const { db } = require("./lib/db");
const users = require("./lib/users");
const uploads = require("./lib/uploads");
const { isOwner } = require("./lib/authz");
const { generateSitemap } = require("./lib/sitemap");
const { generateFeeds } = require("./lib/feed");
const { ensureIndexNowKeyFile } = require("./lib/indexnow");
const { startQuoteOfTheDayScheduler } = require("./lib/quote-of-the-day");
const {
  maybeNotifyNewQuestionOfTheDayDrop,
  startQuestionOfTheDayDiscordScheduler,
} = require("./lib/question-of-the-day-discord");
const {
  maybeNotifyNewQuestionOfTheDayPush,
  startQuestionOfTheDayPushScheduler,
} = require("./lib/question-of-the-day-push");

function authFromReq(req) {
  const bearerToken = getBearerTokenFromReq(req);
  if (bearerToken) {
    const userFromBearer = users.getUserByToken(bearerToken);
    if (userFromBearer) {
      return userFromBearer;
    }
  }

  const cookieToken = getSessionCookieTokenFromReq(req);
  if (!cookieToken) return null;
  return users.getUserByToken(cookieToken);
}

// Gate a route on the site owner. Must run *before* any multer middleware so an
// unauthenticated request is rejected before anything is written to disk.
function requireOwner(req, res, next) {
  const user = authFromReq(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!isOwner(user)) return res.status(403).json({ error: "forbidden" });
  req.authUser = user;
  next();
}

function registerRoutes(app) {
  require("./routes/posts")(app, {
    db,
    getUserById: users.getUserById,
    userPublic: users.userPublic,
    authFromReq,
  });

  require("./routes/images")(app, {
    IMAGES_DIR: uploads.IMAGES_DIR,
    authFromReq,
    isOwner,
  });
  require("./routes/pixies")(app, {
    db,
    authFromReq,
    VIDEOS_DIR: uploads.VIDEOS_DIR,
    IMAGES_DIR: uploads.IMAGES_DIR,
    videoUpload: uploads.videoUpload,
  });
  require("./routes/quotes")(app);
  require("./routes/shrines")(app, { db, authFromReq });
  require("./routes/site-now")(app, { db, authFromReq });
  require("./routes/site-changelog")(app, { db, authFromReq });
  require("./routes/site-links")(app, { db, authFromReq });
  require("./routes/search")(app, { db });
  require("./routes/site-stats")(app, { db });

  require("./routes/auth")(app, {
    db,
    IMAGES_DIR: uploads.IMAGES_DIR,
    optimizeImage: uploads.optimizeImage,
    makeToken: users.makeToken,
    createSession: users.createSession,
    deleteSession: users.deleteSession,
    revokeUserSessions: users.revokeUserSessions,
    getUserByUsername: users.getUserByUsername,
    getUserById: users.getUserById,
    getUserByToken: users.getUserByToken,
    updateUserById: users.updateUserById,
    userPublic: users.userPublic,
    authFromReq,
    imageUpload: uploads.imageUpload,
    findOrCreateDiscordUser: users.findOrCreateDiscordUser,
  });

  require("./routes/anime")(app, { db, authFromReq });
  require("./routes/fanart")(app);
  require("./routes/telemetry")(app, { db });
  require("./routes/twitch")(app, { db, authFromReq });
  require("./routes/arena")(app, { db, authFromReq });
  require("./routes/tcg")(app, { db, authFromReq });
  require("./routes/admin")(app, { db, authFromReq });
  require("./routes/guestbook")(app, {
    db,
    authFromReq,
    getUserById: users.getUserById,
    userPublic: users.userPublic,
  });
  require("./routes/question-of-the-day")(app, {
    db,
    authFromReq,
    getUserById: users.getUserById,
    userPublic: users.userPublic,
    imagesDir: uploads.IMAGES_DIR,
    generateSitemap,
    generateFeeds,
    notifyQuestionOfTheDayDrop: () =>
      Promise.allSettled([
        maybeNotifyNewQuestionOfTheDayDrop(db),
        maybeNotifyNewQuestionOfTheDayPush(db),
      ]),
  });
  require("./routes/push")(app, { db, authFromReq });
  require("./routes/hsr")(app, {});
}

function imageUploadHandler(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "No image provided" });
  }

  const imagePath = path.join(uploads.IMAGES_DIR, req.file.filename);
  return uploads
    .optimizeImage(imagePath)
    .then(() =>
      res.json({
        path: `/images/${req.file.filename}`,
        webp: `/images/${path.basename(req.file.filename, path.extname(req.file.filename))}.webp`,
      }),
    )
    .catch(() => res.status(500).json({ error: "Upload failed" }));
}

function createStaticMiddleware(directory) {
  return express.static(directory, {
    maxAge: "365d",
    immutable: true,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("X-Content-Type-Options", "nosniff");
      // Force a download rather than inline rendering if the URL is opened
      // directly, so an uploaded file can never execute as a page on this origin.
      res.setHeader("Content-Disposition", "attachment");
    },
  });
}

registerMiddlewares(app);
registerRoutes(app);
// Carry an unanswered question to today before the discovery files are
// generated, so the sitemap and feeds ship today's date on a cold boot instead
// of waiting for the first read of the live page.
const { createQuestionOfTheDayLiveStore } = require("./lib/question-of-the-day-active");
createQuestionOfTheDayLiveStore(db).getActiveQuestionRow();
generateSitemap(db);
generateFeeds(db);
startQuoteOfTheDayScheduler();
startQuestionOfTheDayDiscordScheduler(db);
startQuestionOfTheDayPushScheduler(db);
const { startHallOfFameScheduler } = require("./lib/arena-hall-of-fame-scheduler");
startHallOfFameScheduler(db);
const { startTwitchScheduler } = require("./lib/twitch-scheduler");
startTwitchScheduler(db);
// Auto-import the newest video from each tracked TikTok creator every few
// minutes. Authors are managed at /admin/pixies; TIKTOK_FEED_AUTHOR seeds the
// list on boot. Needs the Pixies import queue from routes/pixies.js.
const {
  seedAuthorsFromEnv: seedTikTokFeedAuthors,
  startTikTokFeedScheduler,
} = require("./lib/tiktok-feed-scheduler");
seedTikTokFeedAuthors(db);
startTikTokFeedScheduler({ db, importQueue: app.locals.pixieImport });
// Daily Honkai: Star Rail character/team sync from prydwen.gg. Fetches only the
// characters whose roster entry changed, with a periodic full sweep; JSON
// lands in data/hsr/ and images in images/hsr/. HSR_SYNC_DISABLED=1 turns it off.
const { startHsrSyncScheduler } = require("./lib/hsr-sync-scheduler");
startHsrSyncScheduler();
const indexNowKeyResult = ensureIndexNowKeyFile();
if (indexNowKeyResult.ok === false) {
  console.warn(`[indexnow] ${indexNowKeyResult.error}`);
}

// Image upload endpoint for blog posts with optimization. Auth is checked before
// multer touches disk; multer errors (bad type, oversize) unlink any partial
// file and return without falling through to the handler.
app.post("/posts-img", requireOwner, (req, res) => {
  uploads.imageUpload.single("image")(req, res, (err) => {
    if (err) {
      if (req.file && req.file.path) {
        fs.promises.unlink(req.file.path).catch(() => {});
      }
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ error: err.message || "Upload failed" });
    }
    return imageUploadHandler(req, res);
  });
});

// Read-aloud mp3/wav upload for blog posts — replaces the browser TTS voice
// with this file when a post has one. Same auth-then-multer ordering as
// /posts-img.
app.post("/posts-audio", requireOwner, (req, res) => {
  uploads.audioUpload.single("audio")(req, res, (err) => {
    if (err) {
      if (req.file && req.file.path) {
        fs.promises.unlink(req.file.path).catch(() => {});
      }
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ error: err.message || "Upload failed" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No audio provided" });
    }
    return res.json({ path: `/audio/${req.file.filename}` });
  });
});

// Serve static files with long cache headers. `nosniff` keeps the browser from
// re-interpreting an uploaded file as HTML/script regardless of its extension.
// The resize middleware only engages for `?w=<allow-listed>` and otherwise
// falls straight through to the static handler.
const {
  createImageResizeMiddleware,
} = require("./lib/image-resize");
app.use("/images", createImageResizeMiddleware(uploads.IMAGES_DIR));
app.use("/images", createStaticMiddleware(uploads.IMAGES_DIR));

// Serve uploaded pixie video files with range request support. These live under
// /videos/ (kept as-is): the JSON API moved to /pixies, but the raw media path
// stays here to avoid colliding with the `/pixies/:videoId` share-link route.
app.use("/videos", createStaticMiddleware(uploads.VIDEOS_DIR));

// Uploaded read-aloud mp3/wav files for blog posts.
app.use("/audio", createStaticMiddleware(uploads.AUDIO_DIR));

// ── WebSocket infrastructure ──

const WebSocketEvents = require("./lib/websocket-events");
const { initWebSocketServer } = require("./lib/websocket-server");
const {
  startPlaybackFight,
  advancePlaybackFightTurn,
  skipPlaybackFightToEnd,
  getPlaybackFightState,
} = require("./lib/arena/playback");
const { isArenaFightVerified } = require("./lib/arena-fight-verification");
const { checkArenaFightRateLimit, checkArenaPlaybackRateLimit } = require("./lib/arena-fight-guard");
const { getCurrentlyWatchingAnimeFeed } = require("./lib/mal-anime");

const ARENA_VERIFICATION_REQUIRED = "ARENA_VERIFICATION_REQUIRED";
const ARENA_FIGHT_RATE_LIMIT = "ARENA_FIGHT_RATE_LIMIT";

// WS auth token endpoint — returns a short-lived token for WebSocket connection
app.post("/auth/ws-token", createWsTokenRateLimiter(), (req, res) => {
  try {
    const user = authFromReq(req);
    if (!user) return res.status(401).json({ error: "unauthenticated" });
    const wsManager = require("./lib/websocket-server").getWebSocketManager();
    if (!wsManager) return res.status(503).json({ error: "WebSocket not available" });
    const token = wsManager.createWsToken(user.id);
    res.json({ token });
  } catch {
    res.status(500).json({ error: "failed" });
  }
});

// ── Terminal handlers ──
// Every route above answers JSON. Without these two, an unmatched path or an
// unhandled (or async-rejected) error falls through to Express's *default*
// handler, which sends an HTML body — and, when NODE_ENV !== "production", the
// full stack trace with it (see security #1). Frontend callers all do
// `res.json()`, so that surfaces as an opaque parse failure instead of the
// app's own `{ error }` shape. Registered last so they only see what nothing
// else matched.
app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

// Four args: Express only treats a middleware as an error handler when its
// arity is 4, so `req` stays in the signature even though it is unused here.
app.use((err, req, res, next) => {
  // A handler that already started the response can't be rescued — hand back to
  // Express so it can abort the connection.
  if (res.headersSent) return next(err);

  const status =
    Number.isInteger(err && err.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  // Log the real error server-side; never ship its details to the client.
  if (status >= 500) {
    console.error("[unhandled]", err);
  }

  res.status(status).json({ error: status >= 500 ? "internal" : "request failed" });
});

const httpServer = http.createServer(app);

initWebSocketServer(httpServer, {
  db,
  handleMessage(userId, msg, reply, socket) {
    if (msg.type === WebSocketEvents.C2S.ARENA_FIGHT_SPECTATE_JOIN) {
      const fighterUserId = String(msg.data?.userId || "").trim();
      if (!fighterUserId) return;
      socket.join(`arena:fight:${fighterUserId}`);
      // Send the current state immediately so the spectator isn't staring
      // at nothing until the fighter's next turn.
      const state = getPlaybackFightState(db, fighterUserId);
      reply({
        type: state
          ? WebSocketEvents.S2C.ARENA_FIGHT_SPECTATOR_UPDATE
          : WebSocketEvents.S2C.ARENA_FIGHT_ERROR,
        data: state || { code: "ARENA_FIGHT_NOT_FOUND", message: "No active fight." },
      });
      return;
    }
    if (msg.type === WebSocketEvents.C2S.ARENA_FIGHT_SPECTATE_LEAVE) {
      const fighterUserId = String(msg.data?.userId || "").trim();
      if (fighterUserId) socket.leave(`arena:fight:${fighterUserId}`);
      return;
    }

    const isFightMessage =
      msg.type === WebSocketEvents.C2S.ARENA_FIGHT_START ||
      msg.type === WebSocketEvents.C2S.ARENA_FIGHT_ADVANCE ||
      msg.type === WebSocketEvents.C2S.ARENA_FIGHT_SKIP;
    if (isFightMessage && !isArenaFightVerified(userId)) {
      reply({
        type: WebSocketEvents.S2C.ARENA_FIGHT_ERROR,
        data: {
          code: ARENA_VERIFICATION_REQUIRED,
          message: "Complete human verification before fighting.",
        },
      });
      return;
    }
    if (isFightMessage) {
      const rateLimit =
        msg.type === WebSocketEvents.C2S.ARENA_FIGHT_START
          ? checkArenaFightRateLimit(null, userId)
          : checkArenaPlaybackRateLimit(null, userId);
      if (!rateLimit.allowed) {
        reply({
          type: WebSocketEvents.S2C.ARENA_FIGHT_ERROR,
          data: {
            code: ARENA_FIGHT_RATE_LIMIT,
            message: "Too many fight actions. Please slow down.",
            retryAfterMs: rateLimit.retryAfterMs,
          },
        });
        return;
      }
    }
    switch (msg.type) {
      case WebSocketEvents.C2S.ARENA_FIGHT_START: {
        startPlaybackFight(db, userId).then(
          (state) => reply({ type: WebSocketEvents.S2C.ARENA_FIGHT_TURN, data: state }),
          (err) => reply({
            type: WebSocketEvents.S2C.ARENA_FIGHT_ERROR,
            data: { code: err.code || "ARENA_FIGHT_ERROR", message: err.message },
          }),
        );
        break;
      }
      case WebSocketEvents.C2S.ARENA_FIGHT_ADVANCE: {
        try {
          const state = advancePlaybackFightTurn(db, userId);
          if (state.isFinished) {
            reply({ type: WebSocketEvents.S2C.ARENA_FIGHT_FINISHED, data: state });
          } else {
            reply({ type: WebSocketEvents.S2C.ARENA_FIGHT_TURN, data: state });
          }
        } catch (err) {
          reply({
            type: WebSocketEvents.S2C.ARENA_FIGHT_ERROR,
            data: { code: err.code || "ARENA_FIGHT_ERROR", message: err.message },
          });
        }
        break;
      }
      case WebSocketEvents.C2S.ARENA_FIGHT_SKIP: {
        try {
            const state = skipPlaybackFightToEnd(db, userId);
          reply({ type: WebSocketEvents.S2C.ARENA_FIGHT_FINISHED, data: state });
        } catch (err) {
          reply({
            type: WebSocketEvents.S2C.ARENA_FIGHT_ERROR,
            data: { code: err.code || "ARENA_FIGHT_ERROR", message: err.message },
          });
        }
        break;
      }
      case WebSocketEvents.C2S.ANIME_SUBSCRIBE: {
        getCurrentlyWatchingAnimeFeed(db).then(
          (data) => reply({ type: WebSocketEvents.S2C.ANIME_CURRENTLY_WATCHING, data }),
          (err) => reply({
            type: WebSocketEvents.S2C.ANIME_CURRENTLY_WATCHING,
            data: { code: err.code || "MAL_UNAVAILABLE", error: err.message },
          }),
        );
        break;
      }
    }
  },
});

httpServer.listen(PORT);
