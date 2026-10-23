const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const registerPushRoutes = require("../routes/push");
const { followTopic, isSubscribed } = require("../lib/push-subscriptions");

// authFromReq reads a fake `x-test-user` header instead of a real session,
// so tests can act as an arbitrary signed-in user (or none) without going
// through the real auth stack.
function fakeAuthFromReq(req) {
  const id = req.get("x-test-user");
  return id ? { id, username: `user-${id}` } : null;
}

function makeApp() {
  const db = new Database(":memory:");
  initializeSchema(db);
  const app = express();
  app.use(express.json());
  registerPushRoutes(app, { db, authFromReq: fakeAuthFromReq });
  const server = app.listen(0);
  return { db, server };
}

function withApp(run) {
  return async () => {
    const { db, server } = makeApp();
    await new Promise((resolve) => server.once("listening", resolve));
    try {
      const { port } = server.address();
      await run({ db, base: `http://127.0.0.1:${port}` });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    }
  };
}

function subscribeBody(topic, endpoint) {
  return {
    topic,
    subscription: { endpoint, keys: { p256dh: "p", auth: "a" } },
  };
}

test(
  "GET /push/vapid-public-key returns null when unconfigured",
  withApp(async ({ base }) => {
    const previous = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    try {
      const res = await fetch(`${base}/push/vapid-public-key`);
      assert.deepEqual(await res.json(), { publicKey: null });
    } finally {
      process.env.VAPID_PUBLIC_KEY = previous.pub;
      process.env.VAPID_PRIVATE_KEY = previous.priv;
    }
  }),
);

test(
  "anyone can subscribe to a sitewide topic (blog:new-post) without auth",
  withApp(async ({ base, db }) => {
    const res = await fetch(`${base}/push/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscribeBody("blog:new-post", "https://push.example/anon")),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, topic: "blog:new-post" });
    assert.equal(isSubscribed(db, { topic: "blog:new-post", endpoint: "https://push.example/anon" }), true);
  }),
);

test(
  "subscribing to your own follow topic works when signed in",
  withApp(async ({ base, db }) => {
    const res = await fetch(`${base}/push/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "u1" },
      body: JSON.stringify(subscribeBody(followTopic("u1"), "https://push.example/u1")),
    });
    assert.equal(res.status, 200);
    assert.equal(isSubscribed(db, { topic: followTopic("u1"), endpoint: "https://push.example/u1" }), true);
  }),
);

test(
  "subscribing to someone else's follow topic is forbidden",
  withApp(async ({ base, db }) => {
    const res = await fetch(`${base}/push/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "attacker" },
      body: JSON.stringify(subscribeBody(followTopic("victim"), "https://push.example/attacker")),
    });
    assert.equal(res.status, 403);
    assert.equal(isSubscribed(db, { topic: followTopic("victim"), endpoint: "https://push.example/attacker" }), false);
  }),
);

test(
  "subscribing to a follow topic while signed out is forbidden",
  withApp(async ({ base }) => {
    const res = await fetch(`${base}/push/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscribeBody(followTopic("victim"), "https://push.example/anon2")),
    });
    assert.equal(res.status, 403);
  }),
);

test(
  "an unknown topic is rejected",
  withApp(async ({ base }) => {
    const res = await fetch(`${base}/push/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscribeBody("literally:anything", "https://push.example/x")),
    });
    assert.equal(res.status, 403);
  }),
);

test(
  "status + unsubscribe round-trip for a sitewide topic",
  withApp(async ({ base }) => {
    const endpoint = "https://push.example/roundtrip";
    await fetch(`${base}/push/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscribeBody("qotd:new", endpoint)),
    });

    const statusRes = await fetch(
      `${base}/push/status?topic=qotd:new&endpoint=${encodeURIComponent(endpoint)}`,
    );
    assert.deepEqual(await statusRes.json(), { subscribed: true });

    const deleteRes = await fetch(
      `${base}/push/subscribe?topic=qotd:new&endpoint=${encodeURIComponent(endpoint)}`,
      { method: "DELETE" },
    );
    assert.equal(deleteRes.status, 200);

    const statusAfter = await fetch(
      `${base}/push/status?topic=qotd:new&endpoint=${encodeURIComponent(endpoint)}`,
    );
    assert.deepEqual(await statusAfter.json(), { subscribed: false });
  }),
);
