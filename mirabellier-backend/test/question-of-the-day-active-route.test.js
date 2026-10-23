const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const {
  addDaysToRecordedDate,
  daysBetweenRecordedDates,
} = require("../lib/question-of-the-day-active");
const registerQuestionOfTheDayRoutes = require("../routes/question-of-the-day");

// authFromReq reads a fake `x-test-user` header instead of a real session so
// tests can act as a signed-in user without the real auth stack.
function fakeAuthFromReq(req) {
  const id = req.get("x-test-user");
  return id ? { id, username: `user-${id}` } : null;
}

function makeApp() {
  const db = new Database(":memory:");
  initializeSchema(db);
  const app = express();
  app.use(express.json());
  registerQuestionOfTheDayRoutes(app, {
    db,
    authFromReq: fakeAuthFromReq,
    getUserById: () => null,
    userPublic: (user) => user,
    generateSitemap: () => {},
    generateFeeds: () => {},
    notifyQuestionOfTheDayDrop: () => Promise.resolve({ skipped: true }),
  });
  const server = app.listen(0);
  return { db, server };
}

function withApp(run) {
  return async () => {
    const { db, server } = makeApp();
    await new Promise((resolve) => server.once("listening", resolve));
    const previousBypass = process.env.TURNSTILE_DEV_BYPASS;
    process.env.TURNSTILE_DEV_BYPASS = "true";
    try {
      const { port } = server.address();
      await run({ db, base: `http://127.0.0.1:${port}` });
    } finally {
      if (previousBypass === undefined) {
        delete process.env.TURNSTILE_DEV_BYPASS;
      } else {
        process.env.TURNSTILE_DEV_BYPASS = previousBypass;
      }
      await new Promise((resolve) => server.close(resolve));
      db.close();
    }
  };
}

function insertQuestion(db, { recordedDate, prompt }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO daily_questions (recordedDate, prompt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?)`,
  ).run(recordedDate, prompt, now, now);
}

test(
  "GET current reports a long-past unanswered question under today's date",
  withApp(async ({ base, db }) => {
    insertQuestion(db, { recordedDate: "2026-04-30", prompt: "carried one" });
    insertQuestion(db, { recordedDate: "2026-05-01", prompt: "next one" });

    const res = await fetch(`${base}/question-of-the-day/current`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    const today = new Date().toISOString().slice(0, 10);

    assert.equal(payload.question.recordedDate, today);
    assert.equal(payload.question.carriedFromRecordedDate, "2026-04-30");
    assert.equal(payload.question.prompt, "carried one");

    // The queued question sits directly behind the carried one, preserving the
    // one-question-per-day chain, instead of staying on its old calendar slot.
    const queued = db
      .prepare(
        "SELECT recordedDate FROM daily_questions WHERE prompt = 'next one'",
      )
      .get();
    const expectedNext = addDaysToRecordedDate(
      "2026-05-01",
      daysBetweenRecordedDates("2026-04-30", today),
    );
    assert.equal(queued.recordedDate, expectedNext);
  }),
);

test(
  "answering a carried question files it under the day it was answered",
  withApp(async ({ base, db }) => {
    insertQuestion(db, { recordedDate: "2026-04-30", prompt: "carried one" });

    const currentRes = await fetch(`${base}/question-of-the-day/current`);
    const current = await currentRes.json();
    const liveDate = current.question.recordedDate;

    const answerRes = await fetch(
      `${base}/question-of-the-day/current/answers`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answer: "an answer",
          name: "guest",
          guestToken: "qotd:guest:abcdefghijkl",
          turnstileToken: "dev",
        }),
      },
    );
    assert.equal(answerRes.status, 201);
    const answer = await answerRes.json();
    assert.equal(answer.recordedDate, liveDate);

    // The question and its answer are keyed by the day it was answered, and the
    // original queue slot is only remembered for the "carried" indicator.
    const question = db
      .prepare(
        "SELECT recordedDate, carriedFromRecordedDate, lockedAt FROM daily_questions",
      )
      .get();
    assert.equal(question.recordedDate, liveDate);
    assert.equal(question.carriedFromRecordedDate, "2026-04-30");
    assert.ok(question.lockedAt);

    const storedAnswer = db
      .prepare("SELECT recordedDate FROM daily_question_answers")
      .get();
    assert.equal(storedAnswer.recordedDate, liveDate);

    // It stays on the live page for the rest of the day (the existing
    // "answered today" rule) and only enters the public archive on the next
    // UTC day.
    const stillCurrentRes = await fetch(`${base}/question-of-the-day/current`);
    const stillCurrent = await stillCurrentRes.json();
    assert.equal(stillCurrent.question.recordedDate, liveDate);
    assert.equal(stillCurrent.hasAnswered, false);
  }),
);
