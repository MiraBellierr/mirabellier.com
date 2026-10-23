const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const { webpush } = require("../lib/push-config");
const { maybeNotifyNewQuestionOfTheDayPush } = require("../lib/question-of-the-day-push");

function createTestDb() {
  const db = new Database(":memory:");
  initializeSchema(db);
  return db;
}

function insertQuestion(db, { recordedDate, prompt, archivedAt = null }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO daily_questions (recordedDate, prompt, archivedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(recordedDate, prompt, archivedAt, now, now);
}

function withVapidConfig(t) {
  const keys = webpush.generateVAPIDKeys();
  const previous = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  t.after(() => {
    process.env.VAPID_PUBLIC_KEY = previous.pub;
    process.env.VAPID_PRIVATE_KEY = previous.priv;
  });
}

function mockSendNotification(t, impl) {
  const original = webpush.sendNotification;
  webpush.sendNotification = impl;
  t.after(() => {
    webpush.sendNotification = original;
  });
}

test("no active question: skipped, nothing sent", async (t) => {
  withVapidConfig(t);
  const db = createTestDb();
  let called = false;
  mockSendNotification(t, async () => {
    called = true;
  });

  const result = await maybeNotifyNewQuestionOfTheDayPush(db, { now: new Date("2026-09-11") });
  assert.equal(result.skipped, true);
  assert.equal(called, false);
});

test("sends once for a fresh active question and marks it pushNotifiedAt", async (t) => {
  withVapidConfig(t);
  const db = createTestDb();
  insertQuestion(db, { recordedDate: "2026-09-11", prompt: "favourite season?" });

  let sentPayload = null;
  mockSendNotification(t, async (_subscription, payload) => {
    sentPayload = JSON.parse(payload);
  });
  db.prepare(
    "INSERT INTO push_subscriptions (id, userId, topic, endpoint, p256dh, auth, createdAt) VALUES (?, NULL, 'qotd:new', ?, 'p', 'a', ?)",
  ).run("s1", "https://push.example/qotd", new Date().toISOString());

  const result = await maybeNotifyNewQuestionOfTheDayPush(db, { now: new Date("2026-09-11") });
  assert.equal(result.ok, true);
  assert.equal(result.sent, 1);
  assert.equal(sentPayload.body, "favourite season?");

  const row = db.prepare("SELECT pushNotifiedAt FROM daily_questions WHERE recordedDate = ?").get("2026-09-11");
  assert.ok(row.pushNotifiedAt);
});

test("does not resend once pushNotifiedAt is set", async (t) => {
  withVapidConfig(t);
  const db = createTestDb();
  insertQuestion(db, { recordedDate: "2026-09-11", prompt: "favourite season?" });
  db.prepare("UPDATE daily_questions SET pushNotifiedAt = ? WHERE recordedDate = ?").run(
    new Date().toISOString(),
    "2026-09-11",
  );

  let called = false;
  mockSendNotification(t, async () => {
    called = true;
  });

  const result = await maybeNotifyNewQuestionOfTheDayPush(db, { now: new Date("2026-09-11") });
  assert.equal(result.skipped, true);
  assert.equal(called, false);
});

test("an archived question is not treated as active", async (t) => {
  withVapidConfig(t);
  const db = createTestDb();
  insertQuestion(db, {
    recordedDate: "2026-09-10",
    prompt: "yesterday's question",
    archivedAt: new Date().toISOString(),
  });

  let called = false;
  mockSendNotification(t, async () => {
    called = true;
  });

  const result = await maybeNotifyNewQuestionOfTheDayPush(db, { now: new Date("2026-09-11") });
  assert.equal(result.skipped, true);
  assert.equal(called, false);
});
