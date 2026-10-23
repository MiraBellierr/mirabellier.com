const express = require("express");

const { readPushConfig, hasPushConfig } = require("../lib/push-config");
const {
  TOPIC_NEW_POST,
  TOPIC_NEW_QOTD,
  followTopic,
  saveSubscription,
  removeSubscription,
  isSubscribed,
} = require("../lib/push-subscriptions");

const SITEWIDE_TOPICS = new Set([TOPIC_NEW_POST, TOPIC_NEW_QOTD]);
const FOLLOW_TOPIC_PREFIX = "pixie:follows:";

function setNoStoreHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

// A "follow" topic is scoped to one account — only that signed-in user may
// subscribe to it, otherwise anyone could register push endpoints against
// someone else's followers and read on their upload activity via delivery
// timing. Sitewide topics (new post / new QOTD) need no auth, same as Twitch.
function authorizeTopic(topic, user) {
  if (SITEWIDE_TOPICS.has(topic)) return true;
  if (topic.startsWith(FOLLOW_TOPIC_PREFIX)) {
    return Boolean(user) && followTopic(user.id) === topic;
  }
  return false;
}

// Generic Web Push endpoints for every non-Twitch push topic — new blog
// post, new QOTD, and "someone I follow posted a Pixie". See
// lib/push-subscriptions.js for why Twitch keeps its own /twitch/push/*
// routes and table instead of moving onto this one.
module.exports = function registerPushRoutes(app, deps) {
  const { db, authFromReq } = deps;
  const router = express.Router();

  router.get("/vapid-public-key", (req, res) => {
    setNoStoreHeaders(res);
    const config = readPushConfig();
    res.json({ publicKey: hasPushConfig(config) ? config.publicKey : null });
  });

  router.post("/subscribe", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const topic = String(req.body?.topic || "").trim();
      const endpoint = String(req.body?.subscription?.endpoint || "").trim();
      const p256dh = String(req.body?.subscription?.keys?.p256dh || "").trim();
      const auth = String(req.body?.subscription?.keys?.auth || "").trim();

      if (!topic || !endpoint || !p256dh || !auth) {
        return res
          .status(400)
          .json({ error: "topic and subscription are required" });
      }

      const user = authFromReq(req);
      if (!authorizeTopic(topic, user)) {
        return res.status(403).json({ error: "forbidden" });
      }

      saveSubscription(db, {
        topic,
        userId: user?.id || null,
        endpoint,
        p256dh,
        auth,
      });

      res.json({ ok: true, topic });
    } catch {
      res.status(500).json({ error: "Failed to save notification subscription" });
    }
  });

  router.delete("/subscribe", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const topic = String(req.query.topic || "").trim();
      const endpoint = String(req.query.endpoint || "").trim();

      if (!topic || !endpoint) {
        return res.status(400).json({ error: "topic and endpoint are required" });
      }

      removeSubscription(db, { topic, endpoint });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to remove notification subscription" });
    }
  });

  router.get("/status", (req, res) => {
    setNoStoreHeaders(res);
    try {
      const topic = String(req.query.topic || "").trim();
      const endpoint = String(req.query.endpoint || "").trim();
      if (!topic || !endpoint) {
        return res.json({ subscribed: false });
      }

      res.json({ subscribed: isSubscribed(db, { topic, endpoint }) });
    } catch {
      res.status(500).json({ error: "Failed to read notification status" });
    }
  });

  app.use("/push", router);
};
