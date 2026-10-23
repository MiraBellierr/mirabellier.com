const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const {
  addDaysToRecordedDate,
  createQuestionOfTheDayLiveStore,
  daysBetweenRecordedDates,
} = require("../lib/question-of-the-day-active");

function createTestDb() {
  const db = new Database(":memory:");
  initializeSchema(db);
  return db;
}

function insertQuestion(db, { recordedDate, prompt = "prompt" }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO daily_questions (recordedDate, prompt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?)`,
  ).run(recordedDate, prompt, now, now);
}

function insertAnswer(db, { id, recordedDate }) {
  db.prepare(
    `INSERT INTO daily_question_answers
       (id, recordedDate, identityType, identityKey, answer, createdAt)
     VALUES (?, ?, 'user', 'u1', 'answer', ?)`,
  ).run(id, recordedDate, new Date().toISOString());
}

function questionDates(db) {
  return db
    .prepare("SELECT recordedDate FROM daily_questions ORDER BY recordedDate")
    .all()
    .map((row) => row.recordedDate);
}

test("date helpers add days and measure spans across month boundaries", () => {
  assert.equal(addDaysToRecordedDate("2026-04-30", 158), "2026-10-05");
  assert.equal(addDaysToRecordedDate("2026-08-31", 2), "2026-09-02");
  assert.equal(daysBetweenRecordedDates("2026-04-30", "2026-10-05"), 158);
  assert.equal(daysBetweenRecordedDates("not-a-date", "2026-10-05"), 0);
});

test("an unanswered question is carried to today and the queue shifts", () => {
  const db = createTestDb();
  insertQuestion(db, { recordedDate: "2026-04-30", prompt: "carried one" });
  insertQuestion(db, { recordedDate: "2026-05-01", prompt: "next one" });
  insertQuestion(db, { recordedDate: "2026-05-02", prompt: "after that" });

  const store = createQuestionOfTheDayLiveStore(db);
  const active = store.getActiveQuestionRow("2026-10-05");

  assert.equal(active.recordedDate, "2026-10-05");
  assert.equal(active.prompt, "carried one");
  assert.equal(active.carriedFromRecordedDate, "2026-04-30");
  // The question itself moved to today; the date did not tag along.
  assert.deepEqual(questionDates(db), ["2026-10-05", "2026-10-06", "2026-10-07"]);
});

test("a carried question keeps its original carried-from day across days", () => {
  const db = createTestDb();
  insertQuestion(db, { recordedDate: "2026-04-30", prompt: "carried one" });
  insertQuestion(db, { recordedDate: "2026-05-01", prompt: "next one" });

  const store = createQuestionOfTheDayLiveStore(db);
  store.getActiveQuestionRow("2026-10-05");
  const tomorrow = store.getActiveQuestionRow("2026-10-06");

  assert.equal(tomorrow.recordedDate, "2026-10-06");
  assert.equal(tomorrow.carriedFromRecordedDate, "2026-04-30");
  assert.deepEqual(questionDates(db), ["2026-10-06", "2026-10-07"]);
});

test("carrying moves answers along with their question", () => {
  // Defensive: answers cannot normally exist behind an unanswered active
  // question, but if they do the archive join must stay aligned.
  const db = createTestDb();
  insertQuestion(db, { recordedDate: "2026-04-30", prompt: "carried one" });
  insertQuestion(db, { recordedDate: "2026-05-01", prompt: "next one" });
  insertAnswer(db, { id: "a1", recordedDate: "2026-05-01" });

  const store = createQuestionOfTheDayLiveStore(db);
  store.getActiveQuestionRow("2026-10-05");

  const answer = db
    .prepare("SELECT recordedDate FROM daily_question_answers WHERE id = 'a1'")
    .get();
  assert.equal(answer.recordedDate, "2026-10-06");
});

test("a question that is already live today is not touched", () => {
  const db = createTestDb();
  insertQuestion(db, { recordedDate: "2026-10-05", prompt: "today's" });

  const store = createQuestionOfTheDayLiveStore(db);
  const active = store.getActiveQuestionRow("2026-10-05");

  assert.equal(active.recordedDate, "2026-10-05");
  assert.equal(active.carriedFromRecordedDate, null);
  assert.deepEqual(questionDates(db), ["2026-10-05"]);
});

test("a question answered today stays on its own date", () => {
  const db = createTestDb();
  insertQuestion(db, { recordedDate: "2026-10-05", prompt: "answered today" });
  insertAnswer(db, { id: "a1", recordedDate: "2026-10-05" });
  db.prepare(
    "UPDATE daily_questions SET lockedAt = ? WHERE recordedDate = '2026-10-05'",
  ).run("2026-10-05T09:00:00.000Z");

  const store = createQuestionOfTheDayLiveStore(db);
  const active = store.getActiveQuestionRow("2026-10-05");

  assert.equal(active.recordedDate, "2026-10-05");
  assert.equal(active.lockedAt, "2026-10-05T09:00:00.000Z");
});

test("an archived question is skipped when resolving the active one", () => {
  const db = createTestDb();
  insertQuestion(db, { recordedDate: "2026-04-30", prompt: "archived" });
  db.prepare(
    "UPDATE daily_questions SET archivedAt = ? WHERE recordedDate = '2026-04-30'",
  ).run("2026-05-01T00:00:00.000Z");
  insertQuestion(db, { recordedDate: "2026-05-01", prompt: "next" });

  const store = createQuestionOfTheDayLiveStore(db);
  const active = store.getActiveQuestionRow("2026-10-05");

  assert.equal(active.prompt, "next");
  assert.equal(active.recordedDate, "2026-10-05");
});

test("no active question yields null without touching the queue", () => {
  const db = createTestDb();
  const store = createQuestionOfTheDayLiveStore(db);
  assert.equal(store.getActiveQuestionRow("2026-10-05"), null);
});
