const express = require("express");
const { isOwner } = require("../lib/authz");
const {
  CONFIG_ERROR_CODE,
  createApiError,
  hasConfig,
  readConfig,
} = require("../lib/twitch-api");
const {
  backfillChannel,
  ensureChannelUser,
  getChannelByLogin,
  getChannelEvents,
  getOpenEvent,
  listEnabledChannels,
} = require("../lib/twitch-scheduler");
const { buildPrediction } = require("../lib/twitch-prediction");
const { getChannelProfile } = require("../lib/twitch-profile");
const { buildChannelStats } = require("../lib/twitch-stats");
const { hasConfig: hasPushConfig, readConfig: readPushConfig } = require("../lib/twitch-push");

function setNoStoreHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

function nowIso() {
  return new Date().toISOString();
}

function readChannelPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    login: row.login,
    displayName: row.displayName,
    profileImageUrl: row.profileImageUrl || null,
    addedAt: row.createdAt,
    lastGameName: row.lastGameName || null,
    lastViewerCount:
      row.lastViewerCount == null ? null : Number(row.lastViewerCount),
  };
}

function readLiveState(db, channel) {
  const openEvent = getOpenEvent(db, channel.id);
  if (!openEvent) {
    return { isLive: false, live: null };
  }

  return {
    isLive: true,
    live: {
      startedAt: openEvent.startedAt,
    },
  };
}

function eventsToPredictionInput(rows) {
  return rows.map((row) => ({
    startedAtMs: Date.parse(row.startedAt),
    endedAtMs: row.endedAt ? Date.parse(row.endedAt) : null,
    durationMinutes: row.durationMinutes,
  }));
}

function buildPredictionPayload(db, channel) {
  const events = getChannelEvents(db, channel.id, 2000);
  const prediction = buildPrediction(eventsToPredictionInput(events));

  const payload = {
    channel: readChannelPublic(channel),
    isLive: false,
    live: null,
    prediction,
    fetchedAt: nowIso(),
  };

  const openEvent = getOpenEvent(db, channel.id);
  if (openEvent) {
    payload.isLive = true;
    payload.live = {
      startedAt: openEvent.startedAt,
      predictedEndAt: prediction.medianDurationMinutes
        ? new Date(Date.parse(openEvent.startedAt) + prediction.medianDurationMinutes * 60 * 1000).toISOString()
        : null,
    };
  }

  return payload;
}

function sendTwitchError(res, error) {
  setNoStoreHeaders(res);
  const code = error?.code || null;
  if (code === CONFIG_ERROR_CODE) {
    return res.status(503).json({ code, error: error.message });
  }
  return res.status(502).json({
    code: code || "TWITCH_UNAVAILABLE",
    error: error?.message || "Twitch API request failed.",
  });
}

function requireTwitchConfig(res) {
  if (!hasConfig(readConfig())) {
    const error = new Error(
      "Twitch config missing. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in mirabellier-backend/.env.",
    );
    error.code = CONFIG_ERROR_CODE;
    sendTwitchError(res, error);
    return false;
  }
  return true;
}

function recordPrediction(db, channelId, prediction) {
  if (!prediction || prediction.nextStartAt == null) return;

  const last = db
    .prepare(
      `SELECT predictedAt FROM twitch_predictions
       WHERE channelId = ? ORDER BY predictedAt DESC LIMIT 1`,
    )
    .get(channelId);
  const lastPredictedAtMs = Date.parse(last?.predictedAt || "");
  if (Number.isFinite(lastPredictedAtMs) && Date.now() - lastPredictedAtMs < 30 * 60 * 1000) {
    return;
  }

  db.prepare(
    `INSERT INTO twitch_predictions (
      channelId, predictedAt, horizonHours, nextStartAt, confidence, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    channelId,
    nowIso(),
    7 * 24,
    new Date(prediction.nextStartAt).toISOString(),
    prediction.confidence,
    nowIso(),
  );
}

function reconcilePredictions(db, channelId) {
  const rows = db
    .prepare(
      `SELECT * FROM twitch_predictions
       WHERE channelId = ? AND actualStartedAt IS NULL
       ORDER BY predictedAt DESC LIMIT 200`,
    )
    .all(channelId);

  const events = getChannelEvents(db, channelId, 2000).map((row) => ({
    startedAtMs: Date.parse(row.startedAt),
  }));

  for (const row of rows) {
    const predictedAtMs = Date.parse(row.predictedAt);
    const nextStartAtMs = Date.parse(row.nextStartAt);
    if (!Number.isFinite(predictedAtMs) || !Number.isFinite(nextStartAtMs)) continue;
    if (Date.now() < nextStartAtMs + 2 * 60 * 60 * 1000) continue;

    const match = events
      .filter((event) => event.startedAtMs > predictedAtMs)
      .sort((left, right) =>
        Math.abs(left.startedAtMs - nextStartAtMs) - Math.abs(right.startedAtMs - nextStartAtMs),
      )[0];

    if (match) {
      db.prepare(
        "UPDATE twitch_predictions SET actualStartedAt = ? WHERE id = ?",
      ).run(new Date(match.startedAtMs).toISOString(), row.id);
    }
  }
}

module.exports = function registerTwitchRoutes(app, deps) {
  const { db, authFromReq } = deps;
  const router = express.Router();

  router.get("/channels", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const channels = listEnabledChannels(db).map((channel) => ({
        ...readChannelPublic(channel),
        ...readLiveState(db, channel),
      }));
      res.json({ channels });
    } catch (error) {
      res.status(500).json({ error: "Failed to list Twitch channels" });
    }
  });

  router.get("/channels/:login/prediction", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const channel = getChannelByLogin(db, req.params.login);
      if (!channel) {
        return res.status(404).json({ error: "Twitch channel not found" });
      }

      reconcilePredictions(db, channel.id);
      const payload = buildPredictionPayload(db, channel);
      recordPrediction(db, channel.id, payload.prediction);
      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: "Failed to build Twitch prediction" });
    }
  });

  router.get("/channels/:login/profile", async (req, res) => {
    setNoStoreHeaders(res);
    try {
      const channel = getChannelByLogin(db, req.params.login);
      if (!channel) {
        return res.status(404).json({ error: "Twitch channel not found" });
      }

      const events = getChannelEvents(db, channel.id, 5000);
      const stats = buildChannelStats(events);
      const starts = events
        .map((event) => Date.parse(event.startedAt))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((left, right) => left - right)
        .slice(-1000);
      const statsWithStarts = { ...stats, starts };

      try {
        const profile = await getChannelProfile(db, channel);
        res.json({
          channel: readChannelPublic(channel),
          profile,
          profileError: null,
          stats: statsWithStarts,
          fetchedAt: nowIso(),
        });
      } catch (profileError) {
        if (profileError?.code === CONFIG_ERROR_CODE) {
          res.json({
            channel: readChannelPublic(channel),
            profile: null,
            profileError: CONFIG_ERROR_CODE,
            stats: statsWithStarts,
            fetchedAt: nowIso(),
          });
          return;
        }
        res.json({
          channel: readChannelPublic(channel),
          profile: null,
          profileError: "TWITCH_UNAVAILABLE",
          stats: statsWithStarts,
          fetchedAt: nowIso(),
        });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to load Twitch channel profile" });
    }
  });

  router.get("/channels/:login/accuracy", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const channel = getChannelByLogin(db, req.params.login);
      if (!channel) {
        return res.status(404).json({ error: "Twitch channel not found" });
      }

      reconcilePredictions(db, channel.id);
      const rows = db
        .prepare(
          `SELECT * FROM twitch_predictions
           WHERE channelId = ? AND actualStartedAt IS NOT NULL
           ORDER BY predictedAt DESC LIMIT 500`,
        )
        .all(channel.id);

      const errorsMinutes = rows
        .map((row) => Math.abs(Date.parse(row.actualStartedAt) - Date.parse(row.nextStartAt)) / (60 * 1000))
        .filter((value) => Number.isFinite(value));

      const meanError =
        errorsMinutes.length > 0
          ? Math.round(errorsMinutes.reduce((sum, value) => sum + value, 0) / errorsMinutes.length)
          : null;

      res.json({
        channel: readChannelPublic(channel),
        evaluatedPredictions: rows.length,
        meanAbsoluteErrorMinutes: meanError,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to read Twitch prediction accuracy" });
    }
  });

  router.post("/channels", async (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });
      if (!requireTwitchConfig(res)) return;

      const login = String(req.body?.login || "").trim().toLowerCase();
      if (!login || !/^[a-z0-9_]{1,25}$/.test(login)) {
        return res.status(400).json({ error: "A valid Twitch login is required" });
      }

      const existing = getChannelByLogin(db, login);
      if (existing) {
        return res.status(409).json({ error: "That Twitch channel is already tracked" });
      }

      const config = readConfig();
      const normalized = await ensureChannelUser(db, login, config);
      if (!normalized) {
        throw createApiError("Twitch could not find a user with that login.");
      }

      const now = nowIso();
      const result = db.prepare(
        `INSERT INTO twitch_channels (
          login, displayName, broadcasterId, profileImageUrl, addedBy, enabled, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        normalized.login,
        normalized.displayName,
        normalized.broadcasterId,
        normalized.profileImageUrl,
        user.id,
        now,
        now,
      );

      const channel = db
        .prepare("SELECT * FROM twitch_channels WHERE id = ?")
        .get(result.lastInsertRowid);

      backfillChannel(db, channel.id).catch((error) => {
        console.error("[twitch] Backfill failed:", error?.message || error);
      });

      res.status(201).json({ channel: readChannelPublic(channel) });
    } catch (error) {
      sendTwitchError(res, error);
    }
  });

  router.delete("/channels/:login", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      const channel = getChannelByLogin(db, req.params.login);
      if (!channel) {
        return res.status(404).json({ error: "Twitch channel not found" });
      }

      db.prepare("DELETE FROM twitch_channels WHERE id = ?").run(channel.id);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove Twitch channel" });
    }
  });

  router.post("/channels/:login/backfill", async (req, res) => {
    setNoStoreHeaders(res);
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });
      if (!requireTwitchConfig(res)) return;

      const channel = getChannelByLogin(db, req.params.login);
      if (!channel) {
        return res.status(404).json({ error: "Twitch channel not found" });
      }

      const result = await backfillChannel(db, channel.id);
      res.json(result);
    } catch (error) {
      sendTwitchError(res, error);
    }
  });

  router.get("/push/vapid-public-key", (req, res) => {
    setNoStoreHeaders(res);
    const config = readPushConfig();
    res.json({
      publicKey: hasPushConfig(config) ? config.publicKey : null,
    });
  });

  router.post("/push/subscribe", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const channelLogin = String(req.body?.channelLogin || "").trim().toLowerCase();
      const endpoint = String(req.body?.subscription?.endpoint || "").trim();
      const p256dh = String(req.body?.subscription?.keys?.p256dh || "").trim();
      const auth = String(req.body?.subscription?.keys?.auth || "").trim();

      if (!channelLogin || !endpoint || !p256dh || !auth) {
        return res.status(400).json({ error: "channelLogin and subscription are required" });
      }

      const channel = getChannelByLogin(db, channelLogin);
      if (!channel) {
        return res.status(404).json({ error: "Twitch channel not found" });
      }

      const user = authFromReq(req);
      const now = nowIso();
      db.prepare(
        `INSERT INTO twitch_push_subscriptions (
          id, userId, channelLogin, endpoint, p256dh, auth, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(endpoint, channelLogin) DO UPDATE SET
          userId = excluded.userId,
          p256dh = excluded.p256dh,
          auth = excluded.auth,
          createdAt = excluded.createdAt`,
      ).run(
        `sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        user?.id || null,
        channelLogin,
        endpoint,
        p256dh,
        auth,
        now,
      );

      res.json({ ok: true, channelLogin });
    } catch (error) {
      res.status(500).json({ error: "Failed to save notification subscription" });
    }
  });

  router.delete("/push/subscribe", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const channelLogin = String(req.query.channelLogin || "").trim().toLowerCase();
      const endpoint = String(req.query.endpoint || "").trim();

      if (!channelLogin || !endpoint) {
        return res.status(400).json({ error: "channelLogin and endpoint are required" });
      }

      db.prepare(
        "DELETE FROM twitch_push_subscriptions WHERE channelLogin = ? AND endpoint = ?",
      ).run(channelLogin, endpoint);

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove notification subscription" });
    }
  });

  router.get("/push/status", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const channelLogin = String(req.query.channelLogin || "").trim().toLowerCase();
      const endpoint = String(req.query.endpoint || "").trim();
      if (!channelLogin || !endpoint) {
        return res.json({ subscribed: false });
      }

      const row = db
        .prepare(
          "SELECT id FROM twitch_push_subscriptions WHERE channelLogin = ? AND endpoint = ?",
        )
        .get(channelLogin, endpoint);

      res.json({ subscribed: Boolean(row) });
    } catch (error) {
      res.status(500).json({ error: "Failed to read notification status" });
    }
  });

  app.use("/twitch", router);
};
