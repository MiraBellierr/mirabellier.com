const path = require("path");
const crypto = require("crypto");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const {
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  buildProfileEmbedPath,
  buildProfileImageVersion,
  renderProfileEmbedBuffer,
} = require("../lib/profile-embed");
const {
  handleHumanSpaRequest,
  sendFrontendRedirectConfigError,
} = require("../lib/spa-entry");
const { isLikelyCrawler } = require("../lib/share-preview-utils");
const { getUserPermissions, getUserRoles } = require("../lib/authz");
const { devOriginsEnabled } = require("../lib/dev-origins");
const {
  FollowError,
  getFollowState,
  toggleFollow,
} = require("../lib/user-follows");
const { getUserActivity } = require("../lib/user-activity");

function configureDiscordStrategy(findOrCreateDiscordUser) {
  passport.use(
    new DiscordStrategy(
      {
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL:
          process.env.DISCORD_CALLBACK_URL ||
          "http://localhost:3000/auth/discord/callback",
        scope: ["identify"],
      },
      async (accessToken, refreshToken, profile, cb) => {
        try {
          const user = await findOrCreateDiscordUser(profile);
          return cb(null, user);
        } catch (err) {
          return cb(err);
        }
      },
    ),
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseJsonArray(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// `/user/:id/stats` is unauthenticated and used to scan every row of `posts`
// (all likes/comments blobs) on every request. Aggregate the per-user like /
// comment counts in a single pass and memoize for a short window so the scan
// happens at most once per TTL regardless of how many profiles are requested.
const USER_STATS_AGGREGATE_TTL_MS = 60_000;
let userStatsAggregateCache = null;

function computePostInteractionAggregate(db) {
  const rows = db.prepare("SELECT likes, comments FROM posts").all();
  const byUser = new Map();
  const bump = (userId, field) => {
    if (!userId) return;
    const entry = byUser.get(userId) || { likesCount: 0, commentsCount: 0 };
    entry[field] += 1;
    byUser.set(userId, entry);
  };

  for (const row of rows) {
    for (const likerId of parseJsonArray(row.likes)) bump(likerId, "likesCount");
    for (const comment of parseJsonArray(row.comments)) {
      if (comment && comment.userId) bump(comment.userId, "commentsCount");
    }
  }

  return byUser;
}

function getPostInteractionAggregate(db, now = Date.now()) {
  if (
    !userStatsAggregateCache ||
    now - userStatsAggregateCache.computedAt >= USER_STATS_AGGREGATE_TTL_MS
  ) {
    userStatsAggregateCache = {
      computedAt: now,
      byUser: computePostInteractionAggregate(db),
    };
  }
  return userStatsAggregateCache.byUser;
}

function buildProfileSeoPage({
  user,
  protocol,
  host,
  requestPath,
  spaPath,
}) {
  const title = `${escapeHtml(user.username)}'s Profile`;

  const imageVersion = buildProfileImageVersion(user);
  const imageUrl = `${protocol}://${host}${buildProfileEmbedPath(
    user.username,
    imageVersion,
  )}`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
    <meta property="og:type" content="profile" />
    <meta property="og:title" content="${title}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:width" content="${PREVIEW_WIDTH}" />
    <meta property="og:image:height" content="${PREVIEW_HEIGHT}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:url" content="${protocol}://${host}${requestPath}" />
    <meta property="profile:username" content="${escapeHtml(user.username)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <link rel="canonical" href="${protocol}://${host}${spaPath}" />
  </head>
  <body>
  </body>
</html>`;
}

async function maybeOptimizeUploadedImage(
  files,
  key,
  optimizeImage,
  imagesDir,
) {
  if (!files?.[key]) return undefined;

  const uploadedFile = files[key][0];
  await optimizeImage(path.join(imagesDir, uploadedFile.filename));
  return `/images/${uploadedFile.filename}`;
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function isLocalhostHost(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function resolveFrontendOrigin(rawOrigin, fallbackFrontendUrl) {
  const fallbackOrigin = normalizeOrigin(fallbackFrontendUrl);
  const requestedOrigin = normalizeOrigin(rawOrigin);

  if (!requestedOrigin) return fallbackOrigin || "http://localhost:5173";

  const fallback = fallbackOrigin ? new URL(fallbackOrigin) : null;
  const requested = new URL(requestedOrigin);

  if (fallback && requested.origin === fallback.origin) {
    return requested.origin;
  }

  if (isLocalhostHost(requested.hostname) && devOriginsEnabled()) {
    return requested.origin;
  }

  return fallbackOrigin || "http://localhost:5173";
}

// Constant-time string compare for the OAuth state nonce.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const OAUTH_ORIGIN_COOKIE = "oauth_frontend_origin";
const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || "mirabellier_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = Number.parseInt(
  process.env.SESSION_COOKIE_MAX_AGE_SECONDS || "",
  10,
);

function isSecureRequest(req) {
  if (req.secure) return true;
  const forwardedProto = req.get("x-forwarded-proto");
  if (!forwardedProto) return false;
  return forwardedProto.split(",")[0].trim().toLowerCase() === "https";
}

function buildAuthenticatedUserPayload(user, userPublic) {
  return {
    ...userPublic(user),
    roles: getUserRoles(user),
    permissions: getUserPermissions(user),
  };
}

function shouldUseSecureCookies(req) {
  const configured = String(process.env.SESSION_COOKIE_SECURE || "").trim();
  if (configured.toLowerCase() === "true") return true;
  if (configured.toLowerCase() === "false") return false;
  return isSecureRequest(req);
}

function buildCookieString(req, name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, maxAgeSeconds)}`,
  ];

  if (shouldUseSecureCookies(req)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function appendSetCookieHeader(res, cookieValue) {
  const existing = res.getHeader("Set-Cookie");

  if (!existing) {
    res.setHeader("Set-Cookie", [cookieValue]);
    return;
  }

  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookieValue]);
    return;
  }

  res.setHeader("Set-Cookie", [existing, cookieValue]);
}

// The OAuth cookie carries a per-request CSRF nonce alongside the redirect
// origin (`<nonce>|<origin>`). The nonce is echoed back through the provider's
// `state` param and must match on callback, so a login flow the user did not
// start (Discord login CSRF) is rejected.
function setOauthOriginCookie(req, res, nonce, origin) {
  appendSetCookieHeader(
    res,
    buildCookieString(
      req,
      OAUTH_ORIGIN_COOKIE,
      `${nonce}|${origin}`,
      600,
    ),
  );
}

function parseOauthOriginCookie(req) {
  const raw = readCookieValue(req, OAUTH_ORIGIN_COOKIE);
  const separatorIndex = raw.indexOf("|");
  if (separatorIndex === -1) return { nonce: "", origin: raw };
  return {
    nonce: raw.slice(0, separatorIndex),
    origin: raw.slice(separatorIndex + 1),
  };
}

function clearOauthOriginCookie(req, res) {
  appendSetCookieHeader(
    res,
    buildCookieString(req, OAUTH_ORIGIN_COOKIE, "", 0),
  );
}

function setSessionCookie(req, res, token) {
  const maxAge = Number.isFinite(SESSION_COOKIE_MAX_AGE_SECONDS)
    ? SESSION_COOKIE_MAX_AGE_SECONDS
    : 60 * 60 * 24 * 30;
  appendSetCookieHeader(
    res,
    buildCookieString(req, SESSION_COOKIE_NAME, token, maxAge),
  );
}

function clearSessionCookie(req, res) {
  appendSetCookieHeader(res, buildCookieString(req, SESSION_COOKIE_NAME, "", 0));
}

function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (!auth) return "";
  const parts = auth.split(" ");
  if (parts.length !== 2) return "";
  return parts[1];
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

function getRequestedFrontendOrigin(req) {
  if (typeof req.query.redirect_origin === "string") {
    return req.query.redirect_origin;
  }

  if (typeof req.headers.origin === "string") {
    return req.headers.origin;
  }

  if (typeof req.headers.referer === "string") {
    return req.headers.referer;
  }

  return "";
}

function shouldRedirectToSpa(req) {
  return !isLikelyCrawler(req.get("user-agent"));
}

async function handleProfileEmbedImage(req, res, getUserByUsername, imagesDir) {
  try {
    const user = getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).send("User not found");
    }

    const imageBuffer = await renderProfileEmbedBuffer({
      user,
      imagesDir,
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", String(imageBuffer.length));
    res.setHeader(
      "Cache-Control",
      typeof req.query.v === "string" && req.query.v.trim().length > 0
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
    );
    return res.send(imageBuffer);
  } catch {
    return res.status(500).send("Failed to render profile preview image");
  }
}

module.exports = function registerAuthRoutes(app, deps) {
  const {
    db,
    IMAGES_DIR,
    optimizeImage,
    makeToken,
    createSession,
    deleteSession,
    revokeUserSessions,
    getUserByUsername,
    getUserById,
    updateUserById,
    userPublic,
    authFromReq,
    imageUpload,
    findOrCreateDiscordUser,
  } = deps;

  configureDiscordStrategy(findOrCreateDiscordUser);

  // Discord OAuth login
  app.get("/auth/discord", (req, res, next) => {
    const configuredFrontendUrl =
      process.env.FRONTEND_URL || "http://localhost:5173";
    const rawRequestedOrigin = getRequestedFrontendOrigin(req);
    const frontendOrigin = resolveFrontendOrigin(
      rawRequestedOrigin,
      configuredFrontendUrl,
    );
    const stateNonce = crypto.randomBytes(16).toString("hex");
    setOauthOriginCookie(req, res, stateNonce, frontendOrigin);

    return passport.authenticate("discord", { state: stateNonce })(
      req,
      res,
      next,
    );
  });

  // Discord OAuth callback
  app.get(
    "/auth/discord/callback",
    passport.authenticate("discord", {
      session: false,
      failureRedirect: "/login",
    }),
    (req, res) => {
      try {
        const user = req.user;
        const token = makeToken();
        createSession(token, user.id);
        setSessionCookie(req, res, token);

        const configuredFrontendUrl =
          process.env.FRONTEND_URL || "http://localhost:5173";
        const returnedState =
          typeof req.query.state === "string" ? req.query.state : "";
        const { nonce: cookieNonce, origin: cookieOrigin } =
          parseOauthOriginCookie(req);
        clearOauthOriginCookie(req, res);

        if (!safeEqual(cookieNonce, returnedState)) {
          return res.redirect("/login?error=auth_state_mismatch");
        }

        const frontendOrigin = resolveFrontendOrigin(
          cookieOrigin,
          configuredFrontendUrl,
        );

        res.redirect(`${frontendOrigin}/auth/callback`);
      } catch {
        res.redirect("/login?error=auth_failed");
      }
    },
  );

  app.get("/me", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });
      res.json(buildAuthenticatedUserPayload(user, userPublic));
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  app.get("/user/:id", (req, res) => {
    try {
      const user = getUserById(req.params.id);
      if (!user) return res.status(404).json({ error: "not found" });

      // Cache user profiles for 5 minutes
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(userPublic(user));
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  app.get("/user/by-username/:username", (req, res) => {
    try {
      const user = getUserByUsername(req.params.username);
      if (!user) return res.status(404).json({ error: "not found" });

      // Cache user profiles for 5 minutes
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(userPublic(user));
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Follow graph ──
  function handleFollowError(err, res) {
    if (err instanceof FollowError) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(500).json({ error: "failed" });
  }

  app.get("/user/:id/follow", (req, res) => {
    try {
      const viewer = authFromReq(req);
      res.setHeader("Cache-Control", "no-store");
      res.json(getFollowState(db, viewer, req.params.id));
    } catch (err) {
      handleFollowError(err, res);
    }
  });

  app.post("/user/:id/follow", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });
      res.setHeader("Cache-Control", "no-store");
      res.json(toggleFollow(db, user, req.params.id));
    } catch (err) {
      handleFollowError(err, res);
    }
  });

  app.get("/profile-embed/:username.png", (req, res) =>
    handleProfileEmbedImage(req, res, getUserByUsername, IMAGES_DIR),
  );
  app.get("/api/profile-embed/:username.png", (req, res) =>
    handleProfileEmbedImage(req, res, getUserByUsername, IMAGES_DIR),
  );

  app.post("/logout", (req, res) => {
    try {
      const bearerToken = getBearerToken(req);
      const cookieToken = readCookieValue(req, SESSION_COOKIE_NAME);
      const tokens = Array.from(
        new Set([bearerToken, cookieToken].filter((value) => value)),
      );

      if (tokens.length === 0) {
        clearSessionCookie(req, res);
        return res.status(401).json({ error: "unauthenticated" });
      }

      for (const token of tokens) {
        deleteSession(token);
      }

      clearSessionCookie(req, res);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "logout failed" });
    }
  });

  app.post(
    "/me",
    imageUpload.fields([
      { name: "avatar", maxCount: 1 },
      { name: "banner", maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const user = authFromReq(req);
        if (!user) return res.status(401).json({ error: "unauthenticated" });

        let avatar = req.body && req.body.avatar ? req.body.avatar : undefined;
        let banner = req.body && req.body.banner ? req.body.banner : undefined;

        const optimizedAvatar = await maybeOptimizeUploadedImage(
          req.files,
          "avatar",
          optimizeImage,
          IMAGES_DIR,
        );
        if (optimizedAvatar !== undefined) avatar = optimizedAvatar;

        const optimizedBanner = await maybeOptimizeUploadedImage(
          req.files,
          "banner",
          optimizeImage,
          IMAGES_DIR,
        );
        if (optimizedBanner !== undefined) banner = optimizedBanner;

        const usernameChanged =
          typeof req.body.username === "string" &&
          req.body.username.trim() !== "" &&
          req.body.username.trim() !== user.username;

        const updated = updateUserById(user.id, {
          username: req.body.username,
          avatar,
          banner,
          bio: req.body.bio,
          location: req.body.location,
          website: req.body.website,
        });

        // An identity change revokes every existing session (other devices are
        // signed out); re-issue one for the device that made the change.
        if (usernameChanged) {
          revokeUserSessions(user.id);
          const freshToken = makeToken();
          createSession(freshToken, user.id);
          setSessionCookie(req, res, freshToken);
        }

        res.json(buildAuthenticatedUserPayload(updated, userPublic));
      } catch (err) {
        if (err.message === "username taken") {
          return res.status(409).json({ error: "username taken" });
        }
        if (err.message === "invalid username") {
          return res.status(400).json({ error: "invalid username" });
        }
        res.status(500).json({ error: "update failed" });
      }
    },
  );

  app.get("/user/:id/stats", (req, res) => {
    try {
      const id = req.params.id;
      const user = getUserById(id);
      if (!user) return res.status(404).json({ error: "not found" });

      const postsCount =
        db
          .prepare("SELECT COUNT(*) as count FROM posts WHERE userId = ?")
          .get(id)?.count || 0;

      const interactions = getPostInteractionAggregate(db).get(id) || {
        likesCount: 0,
        commentsCount: 0,
      };

      const recentPosts = db
        .prepare(
          "SELECT id, title, createdAt FROM posts WHERE userId = ? ORDER BY createdAt DESC LIMIT 5",
        )
        .all(id);

      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({
        postsCount,
        likesCount: interactions.likesCount,
        commentsCount: interactions.commentsCount,
        recentPosts,
      });
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // Merged "what this user has done" timeline — see lib/user-activity.js
  // for why likes are excluded (no per-like timestamp exists to sort by).
  app.get("/user/:id/activity", (req, res) => {
    try {
      const id = req.params.id;
      const user = getUserById(id);
      if (!user) return res.status(404).json({ error: "not found" });

      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({ events: getUserActivity(db, id) });
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });

  // Server-side rendered profile page for social sharing
  app.get("/profile/:username", (req, res) => {
    try {
      const username = req.params.username;
      const user = getUserByUsername(username);
      if (!user) return res.status(404).send("User not found");
      const spaPath = `/profile/${username}`;
      if (shouldRedirectToSpa(req)) {
        if (handleHumanSpaRequest(req, res, spaPath)) return;
        return sendFrontendRedirectConfigError(req, res, spaPath);
      }

      const host = req.get("host");
      const protocol =
        req.headers["x-forwarded-proto"] || req.protocol || "http";
      const requestPath = req.originalUrl || req.path || `/profile/${username}`;

      const html = buildProfileSeoPage({
        user,
        protocol,
        host,
        requestPath,
        spaPath,
      });

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch {
      res.status(500).send("Server error");
    }
  });
};
