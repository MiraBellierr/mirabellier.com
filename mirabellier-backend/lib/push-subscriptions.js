"use strict";

// Generic Web Push subscriptions, one row per (endpoint, topic) pair in the
// `push_subscriptions` table. Three topics exist today: a sitewide "new blog
// post", a sitewide "new question of the day", and one per account —
// "people I follow posted a Pixie" — fanned out to each follower's own
// topic on upload. Twitch's "channel went live" push stays on its own
// dedicated table/module (lib/twitch-push.js) — it shipped first and already
// has real subscriber rows, so there's nothing to gain by migrating it here.

const {
  webpush,
  readPushConfig,
  hasPushConfig,
  ensureVapidDetails,
} = require("./push-config");
const { getFollowerIds } = require("./user-follows");

const TOPIC_NEW_POST = "blog:new-post";
const TOPIC_NEW_QOTD = "qotd:new";

function followTopic(userId) {
  return `pixie:follows:${userId}`;
}

function makeSubscriptionId() {
  return `psub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function saveSubscription(db, { topic, userId, endpoint, p256dh, auth }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO push_subscriptions (id, userId, topic, endpoint, p256dh, auth, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint, topic) DO UPDATE SET
       userId = excluded.userId,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       createdAt = excluded.createdAt`,
  ).run(makeSubscriptionId(), userId || null, topic, endpoint, p256dh, auth, now);
}

function removeSubscription(db, { topic, endpoint }) {
  db.prepare(
    `DELETE FROM push_subscriptions WHERE topic = ? AND endpoint = ?`,
  ).run(topic, endpoint);
}

function isSubscribed(db, { topic, endpoint }) {
  if (!topic || !endpoint) return false;
  return Boolean(
    db
      .prepare(
        `SELECT id FROM push_subscriptions WHERE topic = ? AND endpoint = ?`,
      )
      .get(topic, endpoint),
  );
}

// Sends `payload` to every subscriber of `topic`, dropping subscriptions the
// push service reports as gone (404/410 — the browser unsubscribed or the
// endpoint expired). Mirrors lib/twitch-push.js `sendLiveNotification`.
async function sendToTopic(db, topic, payload) {
  const config = readPushConfig();
  if (!hasPushConfig(config)) {
    return { ok: false, sent: 0, removed: 0, error: "not-configured" };
  }

  ensureVapidDetails(config);

  const subscriptions = db
    .prepare("SELECT * FROM push_subscriptions WHERE topic = ?")
    .all(topic);

  const body = JSON.stringify(payload);
  let sent = 0;
  let removed = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        body,
      );
      sent += 1;
    } catch (error) {
      const statusCode = Number(error?.statusCode);
      if (statusCode === 404 || statusCode === 410) {
        db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(
          subscription.id,
        );
        removed += 1;
      }
    }
  }

  return { ok: true, sent, removed };
}

// Fans a "new Pixie" push out to every one of `posterId`'s followers, on
// their own per-account `pixie:follows:<followerId>` topic.
async function notifyFollowersOfNewPixie(
  db,
  { posterId, posterUsername, videoId, title },
) {
  const followerIds = getFollowerIds(db, posterId);
  if (followerIds.length === 0) {
    return { ok: true, sent: 0, removed: 0 };
  }

  const payload = {
    title: `${posterUsername} posted a new Pixie`,
    body: title || "Tap to watch",
    url: `https://mirabellier.com/pixies/${videoId}`,
  };

  let sent = 0;
  let removed = 0;
  for (const followerId of followerIds) {
    const result = await sendToTopic(db, followTopic(followerId), payload);
    if (result.ok) {
      sent += result.sent;
      removed += result.removed;
    }
  }

  return { ok: true, sent, removed };
}

module.exports = {
  TOPIC_NEW_POST,
  TOPIC_NEW_QOTD,
  followTopic,
  saveSubscription,
  removeSubscription,
  isSubscribed,
  sendToTopic,
  notifyFollowersOfNewPixie,
};
