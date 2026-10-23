const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const { webpush } = require("../lib/push-config");
const {
  TOPIC_NEW_POST,
  TOPIC_NEW_QOTD,
  followTopic,
  saveSubscription,
  removeSubscription,
  isSubscribed,
  sendToTopic,
  notifyFollowersOfNewPixie,
} = require("../lib/push-subscriptions");

function createTestDb() {
  const db = new Database(":memory:");
  initializeSchema(db);
  return db;
}

function withVapidConfig(t) {
  const keys = webpush.generateVAPIDKeys();
  const previous = {
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  };
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  t.after(() => {
    process.env.VAPID_PUBLIC_KEY = previous.VAPID_PUBLIC_KEY;
    process.env.VAPID_PRIVATE_KEY = previous.VAPID_PRIVATE_KEY;
  });
}

function mockSendNotification(t, impl) {
  const original = webpush.sendNotification;
  webpush.sendNotification = impl;
  t.after(() => {
    webpush.sendNotification = original;
  });
}

test("followTopic scopes a topic string to one account", () => {
  assert.equal(followTopic("u1"), "pixie:follows:u1");
  assert.notEqual(followTopic("u1"), followTopic("u2"));
});

test("saveSubscription / isSubscribed / removeSubscription round-trip", () => {
  const db = createTestDb();
  const sub = { topic: TOPIC_NEW_POST, userId: "u1", endpoint: "https://push.example/a", p256dh: "p", auth: "a" };

  assert.equal(isSubscribed(db, sub), false);

  saveSubscription(db, sub);
  assert.equal(isSubscribed(db, sub), true);

  removeSubscription(db, sub);
  assert.equal(isSubscribed(db, sub), false);
});

test("saveSubscription upserts on (endpoint, topic) instead of duplicating", () => {
  const db = createTestDb();
  const endpoint = "https://push.example/b";

  saveSubscription(db, { topic: TOPIC_NEW_QOTD, userId: "u1", endpoint, p256dh: "p1", auth: "a1" });
  saveSubscription(db, { topic: TOPIC_NEW_QOTD, userId: "u1", endpoint, p256dh: "p2", auth: "a2" });

  const rows = db.prepare("SELECT * FROM push_subscriptions WHERE topic = ?").all(TOPIC_NEW_QOTD);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].p256dh, "p2");
});

test("a subscription on one topic doesn't answer isSubscribed for another topic on the same endpoint", () => {
  const db = createTestDb();
  const endpoint = "https://push.example/c";
  saveSubscription(db, { topic: TOPIC_NEW_POST, userId: null, endpoint, p256dh: "p", auth: "a" });

  assert.equal(isSubscribed(db, { topic: TOPIC_NEW_POST, endpoint }), true);
  assert.equal(isSubscribed(db, { topic: TOPIC_NEW_QOTD, endpoint }), false);
});

test("sendToTopic reports not-configured when VAPID keys are unset", async (t) => {
  const previous = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  t.after(() => {
    process.env.VAPID_PUBLIC_KEY = previous.pub;
    process.env.VAPID_PRIVATE_KEY = previous.priv;
  });

  const db = createTestDb();
  const result = await sendToTopic(db, TOPIC_NEW_POST, { title: "hi" });
  assert.deepEqual(result, { ok: false, sent: 0, removed: 0, error: "not-configured" });
});

test("sendToTopic sends to every subscriber of that topic only", async (t) => {
  withVapidConfig(t);
  const db = createTestDb();
  saveSubscription(db, { topic: TOPIC_NEW_POST, userId: null, endpoint: "https://push.example/d", p256dh: "p", auth: "a" });
  saveSubscription(db, { topic: TOPIC_NEW_POST, userId: null, endpoint: "https://push.example/e", p256dh: "p", auth: "a" });
  saveSubscription(db, { topic: TOPIC_NEW_QOTD, userId: null, endpoint: "https://push.example/f", p256dh: "p", auth: "a" });

  const sentTo = [];
  mockSendNotification(t, async (subscription) => {
    sentTo.push(subscription.endpoint);
  });

  const result = await sendToTopic(db, TOPIC_NEW_POST, { title: "New post" });
  assert.equal(result.ok, true);
  assert.equal(result.sent, 2);
  assert.deepEqual(sentTo.sort(), ["https://push.example/d", "https://push.example/e"]);
});

test("sendToTopic drops a subscription the push service reports gone (404/410)", async (t) => {
  withVapidConfig(t);
  const db = createTestDb();
  saveSubscription(db, { topic: TOPIC_NEW_POST, userId: null, endpoint: "https://push.example/dead", p256dh: "p", auth: "a" });
  saveSubscription(db, { topic: TOPIC_NEW_POST, userId: null, endpoint: "https://push.example/alive", p256dh: "p", auth: "a" });

  mockSendNotification(t, async (subscription) => {
    if (subscription.endpoint.endsWith("/dead")) {
      const error = new Error("gone");
      error.statusCode = 410;
      throw error;
    }
  });

  const result = await sendToTopic(db, TOPIC_NEW_POST, { title: "New post" });
  assert.equal(result.sent, 1);
  assert.equal(result.removed, 1);
  assert.equal(isSubscribed(db, { topic: TOPIC_NEW_POST, endpoint: "https://push.example/dead" }), false);
  assert.equal(isSubscribed(db, { topic: TOPIC_NEW_POST, endpoint: "https://push.example/alive" }), true);
});

test("sendToTopic keeps a subscription on a non-gone error (e.g. transient 500)", async (t) => {
  withVapidConfig(t);
  const db = createTestDb();
  saveSubscription(db, { topic: TOPIC_NEW_POST, userId: null, endpoint: "https://push.example/flaky", p256dh: "p", auth: "a" });

  mockSendNotification(t, async () => {
    const error = new Error("server error");
    error.statusCode = 500;
    throw error;
  });

  const result = await sendToTopic(db, TOPIC_NEW_POST, { title: "New post" });
  assert.equal(result.sent, 0);
  assert.equal(result.removed, 0);
  assert.equal(isSubscribed(db, { topic: TOPIC_NEW_POST, endpoint: "https://push.example/flaky" }), true);
});

test("notifyFollowersOfNewPixie is a no-op with no followers", async () => {
  const db = createTestDb();
  const result = await notifyFollowersOfNewPixie(db, {
    posterId: "poster",
    posterUsername: "mira",
    videoId: "v1",
    title: "a clip",
  });
  assert.deepEqual(result, { ok: true, sent: 0, removed: 0 });
});

test("notifyFollowersOfNewPixie sends only to the poster's own followers, on their per-account topic", async (t) => {
  withVapidConfig(t);
  const db = createTestDb();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO user_follows (followerId, followingId, createdAt) VALUES (?, ?, ?)").run("follower1", "poster", now);
  db.prepare("INSERT INTO user_follows (followerId, followingId, createdAt) VALUES (?, ?, ?)").run("follower2", "poster", now);
  db.prepare("INSERT INTO user_follows (followerId, followingId, createdAt) VALUES (?, ?, ?)").run("not-a-follower", "someone-else", now);

  saveSubscription(db, { topic: followTopic("follower1"), userId: "follower1", endpoint: "https://push.example/f1", p256dh: "p", auth: "a" });
  saveSubscription(db, { topic: followTopic("not-a-follower"), userId: "not-a-follower", endpoint: "https://push.example/nf", p256dh: "p", auth: "a" });
  // follower2 has no push subscription at all — should be silently skipped.

  const sentTo = [];
  mockSendNotification(t, async (subscription, payload) => {
    sentTo.push(subscription.endpoint);
    const body = JSON.parse(payload);
    assert.match(body.title, /mira posted a new Pixie/);
    assert.equal(body.url, "https://mirabellier.com/pixies/v1");
  });

  const result = await notifyFollowersOfNewPixie(db, {
    posterId: "poster",
    posterUsername: "mira",
    videoId: "v1",
    title: "a clip",
  });

  assert.equal(result.sent, 1);
  assert.deepEqual(sentTo, ["https://push.example/f1"]);
});
