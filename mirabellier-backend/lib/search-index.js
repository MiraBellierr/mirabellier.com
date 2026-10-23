"use strict";

// Sitewide search: one FTS5 virtual table (`search_index`) holding a denormalised
// copy of searchable text from posts, shrine pages, QOTD prompts, and QOTD
// answers. Kept in sync by triggers on the source tables (installed once, at
// schema init) so every existing insert/update/delete route keeps working
// unmodified — nothing outside this file needs to know the index exists.
//
// Rows are addressed by `<kind offset> + <source table rowid>` so four tables
// can share one rowid space without collisions; offsets are generous (1e9
// apart) for a personal-site amount of data.

const KIND_OFFSETS = {
  post: 0,
  shrine: 1_000_000_000,
  question: 2_000_000_000,
  answer: 3_000_000_000,
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SNIPPET_LENGTH = 12;

function normalizeSearchLimit(value) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

// Generic Tiptap/ProseMirror doc walker: collects every leaf text node plus
// image captions. Not a full per-node-type switch (contrast
// src/lib/blog-reading.ts on the frontend) — for search matching, "every
// string that was ever meant to be read" is all that matters, so a single
// recursive rule (text nodes + attrs.caption) covers it in far less code.
function extractPlainText(node) {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractPlainText).join(" ");
  if (typeof node !== "object") return "";

  let text = "";
  if (node.type === "text" && typeof node.text === "string") {
    text += `${node.text} `;
  }
  if (node.attrs && typeof node.attrs.caption === "string") {
    text += `${node.attrs.caption} `;
  }
  if (Array.isArray(node.content)) {
    text += extractPlainText(node.content);
  }
  return text;
}

function extractPostText(contentJson) {
  if (!contentJson) return "";
  try {
    return extractPlainText(JSON.parse(contentJson)).trim();
  } catch {
    return "";
  }
}

function parseTagsText(tagsJson) {
  if (!tagsJson) return "";
  try {
    const tags = JSON.parse(tagsJson);
    return Array.isArray(tags) ? tags.join(" ") : "";
  } catch {
    return "";
  }
}

function rebuildSearchIndex(db) {
  db.prepare("DELETE FROM search_index").run();

  const insert = db.prepare(
    `INSERT INTO search_index (rowid, title, body, kind, refId, href)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  for (const post of db
    .prepare("SELECT rowid, id, title, content, tags FROM posts")
    .all()) {
    insert.run(
      KIND_OFFSETS.post + post.rowid,
      post.title || "",
      `${extractPostText(post.content)} ${parseTagsText(post.tags)}`.trim(),
      "post",
      post.id,
      `/blog/${post.id}`,
    );
  }

  for (const shrine of db
    .prepare(
      "SELECT rowid, slug, path, title, description, excerpt FROM shrine_pages",
    )
    .all()) {
    insert.run(
      KIND_OFFSETS.shrine + shrine.rowid,
      shrine.title || "",
      `${shrine.description || ""} ${shrine.excerpt || ""}`.trim(),
      "shrine",
      shrine.slug,
      shrine.path,
    );
  }

  for (const question of db
    .prepare("SELECT rowid, recordedDate, prompt FROM daily_questions")
    .all()) {
    insert.run(
      KIND_OFFSETS.question + question.rowid,
      question.prompt || "",
      question.prompt || "",
      "question",
      question.recordedDate,
      `/question-of-the-day/archive/${question.recordedDate}`,
    );
  }

  for (const answer of db
    .prepare(
      "SELECT rowid, id, recordedDate, answer FROM daily_question_answers",
    )
    .all()) {
    insert.run(
      KIND_OFFSETS.answer + answer.rowid,
      (answer.answer || "").slice(0, 80),
      answer.answer || "",
      "answer",
      answer.id,
      `/question-of-the-day/archive/${answer.recordedDate}`,
    );
  }
}

function installTriggers(db) {
  // Posts: title + extracted body text + tags.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS search_index_posts_ai AFTER INSERT ON posts BEGIN
      INSERT INTO search_index (rowid, title, body, kind, refId, href)
      VALUES (${KIND_OFFSETS.post} + NEW.rowid, NEW.title,
        mb_extract_post_text(NEW.content) || ' ' || mb_parse_tags(NEW.tags),
        'post', NEW.id, '/blog/' || NEW.id);
    END;
    CREATE TRIGGER IF NOT EXISTS search_index_posts_au AFTER UPDATE ON posts BEGIN
      DELETE FROM search_index WHERE rowid = ${KIND_OFFSETS.post} + OLD.rowid;
      INSERT INTO search_index (rowid, title, body, kind, refId, href)
      VALUES (${KIND_OFFSETS.post} + NEW.rowid, NEW.title,
        mb_extract_post_text(NEW.content) || ' ' || mb_parse_tags(NEW.tags),
        'post', NEW.id, '/blog/' || NEW.id);
    END;
    CREATE TRIGGER IF NOT EXISTS search_index_posts_ad AFTER DELETE ON posts BEGIN
      DELETE FROM search_index WHERE rowid = ${KIND_OFFSETS.post} + OLD.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS search_index_shrines_ai AFTER INSERT ON shrine_pages BEGIN
      INSERT INTO search_index (rowid, title, body, kind, refId, href)
      VALUES (${KIND_OFFSETS.shrine} + NEW.rowid, NEW.title,
        coalesce(NEW.description, '') || ' ' || coalesce(NEW.excerpt, ''),
        'shrine', NEW.slug, NEW.path);
    END;
    CREATE TRIGGER IF NOT EXISTS search_index_shrines_au AFTER UPDATE ON shrine_pages BEGIN
      DELETE FROM search_index WHERE rowid = ${KIND_OFFSETS.shrine} + OLD.rowid;
      INSERT INTO search_index (rowid, title, body, kind, refId, href)
      VALUES (${KIND_OFFSETS.shrine} + NEW.rowid, NEW.title,
        coalesce(NEW.description, '') || ' ' || coalesce(NEW.excerpt, ''),
        'shrine', NEW.slug, NEW.path);
    END;
    CREATE TRIGGER IF NOT EXISTS search_index_shrines_ad AFTER DELETE ON shrine_pages BEGIN
      DELETE FROM search_index WHERE rowid = ${KIND_OFFSETS.shrine} + OLD.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS search_index_questions_ai AFTER INSERT ON daily_questions BEGIN
      INSERT INTO search_index (rowid, title, body, kind, refId, href)
      VALUES (${KIND_OFFSETS.question} + NEW.rowid, NEW.prompt, NEW.prompt,
        'question', NEW.recordedDate, '/question-of-the-day/archive/' || NEW.recordedDate);
    END;
    CREATE TRIGGER IF NOT EXISTS search_index_questions_au AFTER UPDATE ON daily_questions BEGIN
      DELETE FROM search_index WHERE rowid = ${KIND_OFFSETS.question} + OLD.rowid;
      INSERT INTO search_index (rowid, title, body, kind, refId, href)
      VALUES (${KIND_OFFSETS.question} + NEW.rowid, NEW.prompt, NEW.prompt,
        'question', NEW.recordedDate, '/question-of-the-day/archive/' || NEW.recordedDate);
    END;
    CREATE TRIGGER IF NOT EXISTS search_index_questions_ad AFTER DELETE ON daily_questions BEGIN
      DELETE FROM search_index WHERE rowid = ${KIND_OFFSETS.question} + OLD.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS search_index_answers_ai AFTER INSERT ON daily_question_answers BEGIN
      INSERT INTO search_index (rowid, title, body, kind, refId, href)
      VALUES (${KIND_OFFSETS.answer} + NEW.rowid, substr(NEW.answer, 1, 80), NEW.answer,
        'answer', NEW.id, '/question-of-the-day/archive/' || NEW.recordedDate);
    END;
    CREATE TRIGGER IF NOT EXISTS search_index_answers_au AFTER UPDATE ON daily_question_answers BEGIN
      DELETE FROM search_index WHERE rowid = ${KIND_OFFSETS.answer} + OLD.rowid;
      INSERT INTO search_index (rowid, title, body, kind, refId, href)
      VALUES (${KIND_OFFSETS.answer} + NEW.rowid, substr(NEW.answer, 1, 80), NEW.answer,
        'answer', NEW.id, '/question-of-the-day/archive/' || NEW.recordedDate);
    END;
    CREATE TRIGGER IF NOT EXISTS search_index_answers_ad AFTER DELETE ON daily_question_answers BEGIN
      DELETE FROM search_index WHERE rowid = ${KIND_OFFSETS.answer} + OLD.rowid;
    END;
  `);
}

function initializeSearchIndex(db) {
  // Both custom functions are deterministic pure functions of their input, so
  // registering them once per process (idempotent — better-sqlite3 just
  // rebinds the name) is safe to call from a trigger body.
  db.function("mb_extract_post_text", (contentJson) => extractPostText(contentJson));
  db.function("mb_parse_tags", (tagsJson) => parseTagsText(tagsJson));

  db.prepare(
    `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      title, body, kind UNINDEXED, refId UNINDEXED, href UNINDEXED
    )`,
  ).run();

  installTriggers(db);

  const { count } = db
    .prepare("SELECT count(*) AS count FROM search_index")
    .get();
  if (count === 0) {
    rebuildSearchIndex(db);
  }
}

// Wraps each whitespace-separated token in a quoted, prefix-matched FTS5
// phrase ("foo"*) so user input can never be read as FTS5 query syntax
// (column filters, AND/OR/NOT, parentheses) — typing them just searches for
// their literal text instead.
function buildMatchQuery(rawQuery) {
  const tokens = String(rawQuery || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  if (tokens.length === 0) return null;
  return tokens
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(" AND ");
}

const KIND_GROUPS = {
  post: "blog posts",
  shrine: "shrines",
  question: "question of the day",
  answer: "question of the day answers",
};

function searchIndex(db, rawQuery, limit) {
  const match = buildMatchQuery(rawQuery);
  if (!match) return [];

  const rows = db
    .prepare(
      `SELECT kind, refId, title, href,
              snippet(search_index, 1, '', '', '…', ${SNIPPET_LENGTH}) AS snippet
       FROM search_index
       WHERE search_index MATCH ?
       ORDER BY bm25(search_index)
       LIMIT ?`,
    )
    .all(match, normalizeSearchLimit(limit));

  return rows.map((row) => ({
    kind: row.kind,
    group: KIND_GROUPS[row.kind] || row.kind,
    id: row.refId,
    title: row.title,
    href: row.href,
    snippet: row.snippet || "",
  }));
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  KIND_OFFSETS,
  extractPlainText,
  extractPostText,
  parseTagsText,
  buildMatchQuery,
  normalizeSearchLimit,
  initializeSearchIndex,
  rebuildSearchIndex,
  searchIndex,
};
