const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  buildMatchQuery,
  extractPlainText,
  extractPostText,
  normalizeSearchLimit,
  searchIndex,
} = require("../lib/search-index");

function createTestDb() {
  const db = new Database(":memory:");
  initializeSchema(db);
  return db;
}

const now = new Date().toISOString();

function insertPost(db, { id, title, content, tags = [] }) {
  db.prepare(
    `INSERT INTO posts (id, title, content, userId, author, tags, createdAt, updatedAt)
     VALUES (?, ?, ?, 'u1', 'mira', ?, ?, ?)`,
  ).run(id, title, JSON.stringify(content), JSON.stringify(tags), now, now);
}

function insertShrine(db, { slug, path, title, description, excerpt }) {
  db.prepare(
    `INSERT INTO shrine_pages (slug, path, title, description, excerpt, payloadJson, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, '{}', ?, ?)`,
  ).run(slug, path, title, description, excerpt, now, now);
}

function insertQuestion(db, { recordedDate, prompt }) {
  db.prepare(
    `INSERT INTO daily_questions (recordedDate, prompt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?)`,
  ).run(recordedDate, prompt, now, now);
}

function insertAnswer(db, { id, recordedDate, answer }) {
  db.prepare(
    `INSERT INTO daily_question_answers
       (id, recordedDate, identityType, identityKey, answer, createdAt)
     VALUES (?, ?, 'user', 'u1', ?, ?)`,
  ).run(id, recordedDate, answer, now);
}

test("buildMatchQuery quotes tokens so user input can't be read as FTS5 syntax", () => {
  assert.equal(buildMatchQuery("hello world"), `"hello"* AND "world"*`);
  // a literal quote in the input is escaped, never closes our own phrase early
  assert.equal(buildMatchQuery('say "hi"'), `"say"* AND """hi"""*`);
  assert.equal(buildMatchQuery(""), null);
  assert.equal(buildMatchQuery("   "), null);
  // AND/OR/NOT/column-filter syntax stays a literal quoted phrase, not an operator
  assert.equal(buildMatchQuery("title:x OR 1"), `"title:x"* AND "OR"* AND "1"*`);
});

test("extractPlainText walks text nodes and image captions", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
      { type: "image", attrs: { src: "x.png", caption: "a cat" } },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "text", text: "item one" }] },
        ],
      },
    ],
  };
  const text = extractPlainText(doc);
  assert.match(text, /Hello/);
  assert.match(text, /a cat/);
  assert.match(text, /item one/);
});

test("extractPostText tolerates invalid JSON", () => {
  assert.equal(extractPostText(""), "");
  assert.equal(extractPostText("not json"), "");
});

test("normalizeSearchLimit clamps to sane bounds", () => {
  assert.equal(normalizeSearchLimit(undefined), DEFAULT_LIMIT);
  assert.equal(normalizeSearchLimit("0"), DEFAULT_LIMIT);
  assert.equal(normalizeSearchLimit("abc"), DEFAULT_LIMIT);
  assert.equal(normalizeSearchLimit("5"), 5);
  assert.equal(normalizeSearchLimit("9999"), MAX_LIMIT);
});

test("insert triggers index posts, shrines, questions, and answers", () => {
  const db = createTestDb();

  insertPost(db, {
    id: "p1",
    title: "Cozy corner update",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "a soft internet spring" }],
        },
      ],
    },
    tags: ["blog", "cozy"],
  });
  insertShrine(db, {
    slug: "kanna",
    path: "/shrine/kanna",
    title: "Kanna Shrine",
    description: "a dragon maid",
    excerpt: "small and sharp",
  });
  insertQuestion(db, { recordedDate: "2026-09-10", prompt: "favourite season?" });
  insertAnswer(db, { id: "a1", recordedDate: "2026-09-10", answer: "definitely autumn weather" });

  assert.equal(searchIndex(db, "cozy corner").length, 1);
  assert.deepEqual(
    searchIndex(db, "cozy corner").map((r) => ({ kind: r.kind, href: r.href, group: r.group })),
    [{ kind: "post", href: "/blog/p1", group: "blog posts" }],
  );

  assert.equal(searchIndex(db, "soft internet")[0].kind, "post"); // matches body, not just title
  assert.equal(searchIndex(db, "dragon maid")[0].href, "/shrine/kanna");
  assert.equal(searchIndex(db, "favourite season")[0].href, "/question-of-the-day/archive/2026-09-10");
  const answerHit = searchIndex(db, "autumn weather")[0];
  assert.equal(answerHit.kind, "answer");
  assert.equal(answerHit.href, "/question-of-the-day/archive/2026-09-10");
});

test("update trigger replaces the indexed row instead of duplicating it", () => {
  const db = createTestDb();
  insertPost(db, {
    id: "p1",
    title: "Old title",
    content: { type: "doc", content: [] },
  });

  db.prepare("UPDATE posts SET title = ? WHERE id = ?").run("New title", "p1");

  assert.equal(searchIndex(db, "old title").length, 0);
  assert.equal(searchIndex(db, "new title").length, 1);
});

test("delete trigger removes the indexed row", () => {
  const db = createTestDb();
  insertPost(db, {
    id: "p1",
    title: "Vanishing post",
    content: { type: "doc", content: [] },
  });
  assert.equal(searchIndex(db, "vanishing").length, 1);

  db.prepare("DELETE FROM posts WHERE id = ?").run("p1");

  assert.equal(searchIndex(db, "vanishing").length, 0);
});

test("no query returns no results instead of every row", () => {
  const db = createTestDb();
  insertPost(db, { id: "p1", title: "Something", content: { type: "doc", content: [] } });
  assert.deepEqual(searchIndex(db, ""), []);
  assert.deepEqual(searchIndex(db, "   "), []);
});
