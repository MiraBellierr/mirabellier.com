const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectFeedItems,
  collectQuestionFeedItems,
  buildAtomFeed,
  buildJsonFeed,
  BLOG_FEED,
  QUESTIONS_FEED,
  MAX_ITEMS,
} = require("../lib/feed");

// Minimal stand-in for the better-sqlite3 handle: `prepare(...).all(...args)`
// returns whatever rows we hand it (honouring a trailing LIMIT argument), so
// the tests never touch a real database. `options.activeRecordedDate` backs the
// `.get()` lookup that resolves the archive cutoff.
function fakeDb(rows, options = {}) {
  return {
    prepare() {
      return {
        all(...args) {
          const limit = args[args.length - 1];
          return typeof limit === "number" ? rows.slice(0, limit) : rows;
        },
        get() {
          return options.activeRecordedDate === null
            ? undefined
            : { recordedDate: options.activeRecordedDate ?? "2026-03-01" };
        },
      };
    },
  };
}

const sampleRows = [
  {
    id: "100",
    title: "Hello & <world>",
    content: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First paragraph body text." }],
        },
      ],
    }),
    shortDescription: null,
    thumbnail: "https://mirabellier.com/images/hero.png",
    tags: JSON.stringify(["life", "notes"]),
    createdAt: "2026-01-02T03:04:05.000Z",
    updatedAt: "2026-01-05T06:07:08.000Z",
    authorName: "mira",
    legacyAuthor: null,
  },
  {
    id: "101",
    title: "Second post",
    content: null,
    shortDescription: "  Hand-written summary.  ",
    thumbnail: null,
    tags: null,
    createdAt: "2025-12-01T00:00:00.000Z",
    updatedAt: null,
    authorName: null,
    legacyAuthor: "legacy-name",
  },
];

test("collectFeedItems normalises rows into feed items", () => {
  const items = collectFeedItems(fakeDb(sampleRows));
  assert.equal(items.length, 2);

  const [first, second] = items;
  assert.equal(
    first.url,
    "https://mirabellier.com/blog/hello-world-100",
    "slug matches the sitemap/route slug shape",
  );
  assert.equal(first.id, first.url);
  assert.equal(first.published, "2026-01-02T03:04:05.000Z");
  assert.equal(first.updated, "2026-01-05T06:07:08.000Z");
  assert.deepEqual(first.tags, ["life", "notes"]);
  assert.equal(first.image, "https://mirabellier.com/images/hero.png");
  assert.equal(first.author, "mira");
  assert.match(first.summary, /First paragraph body text/);

  // shortDescription wins over derived text and is trimmed; updated falls back
  // to published; author falls back to the legacy column.
  assert.equal(second.summary, "Hand-written summary.");
  assert.equal(second.updated, second.published);
  assert.equal(second.author, "legacy-name");
});

test("collectFeedItems caps the number of items and survives a broken table", () => {
  const many = Array.from({ length: MAX_ITEMS + 25 }, (_, i) => ({
    ...sampleRows[1],
    id: String(2000 + i),
    title: `Post ${i}`,
  }));
  assert.equal(collectFeedItems(fakeDb(many)).length, MAX_ITEMS);

  const throwingDb = {
    prepare() {
      throw new Error("no such table: posts");
    },
  };
  assert.deepEqual(collectFeedItems(throwingDb), []);
});

test("buildAtomFeed escapes markup and lists every item", () => {
  const items = collectFeedItems(fakeDb(sampleRows));
  const xml = buildAtomFeed(items, BLOG_FEED);

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(
    xml,
    /<link href="https:\/\/mirabellier\.com\/feed\.xml" rel="self"/,
  );
  assert.equal((xml.match(/<entry>/g) || []).length, 2);
  // Title characters must be escaped, never emitted raw.
  assert.match(xml, /<title>Hello &amp; &lt;world&gt;<\/title>/);
  assert.ok(!xml.includes("<title>Hello & <world></title>"));
  assert.match(xml, /<category term="life" \/>/);
});

test("buildJsonFeed emits valid JSON Feed 1.1", () => {
  const items = collectFeedItems(fakeDb(sampleRows));
  const parsed = JSON.parse(buildJsonFeed(items, BLOG_FEED));

  assert.equal(parsed.version, "https://jsonfeed.org/version/1.1");
  assert.equal(parsed.feed_url, "https://mirabellier.com/feed.json");
  assert.equal(parsed.home_page_url, "https://mirabellier.com/blog");
  assert.equal(parsed.items.length, 2);

  const [first] = parsed.items;
  assert.equal(first.id, "https://mirabellier.com/blog/hello-world-100");
  assert.equal(first.title, "Hello & <world>"); // JSON carries the raw string
  assert.equal(first.date_published, "2026-01-02T03:04:05.000Z");
  assert.equal(first.date_modified, "2026-01-05T06:07:08.000Z");
  assert.deepEqual(first.tags, ["life", "notes"]);
  assert.equal(first.image, "https://mirabellier.com/images/hero.png");
  assert.equal(typeof first.content_text, "string");
  assert.ok(first.content_text.length > 0);

  // Item without tags/image omits those keys rather than emitting null/[].
  assert.ok(!("tags" in parsed.items[1]));
  assert.ok(!("image" in parsed.items[1]));
});

// ── Question of the Day feed ───────────────────────────────────────────────

const questionRows = [
  {
    recordedDate: "2026-03-10",
    prompt: "What small thing made you smile today?",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    recordedDate: "2026-03-09",
    prompt: "If today had a soundtrack, what would the opening song be?",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-03-11T09:00:00.000Z",
  },
];

test("collectQuestionFeedItems anchors dates to the recorded day", () => {
  const items = collectQuestionFeedItems(fakeDb(questionRows));
  assert.equal(items.length, 2);

  const [first, second] = items;
  assert.equal(
    first.url,
    "https://mirabellier.com/question-of-the-day/archive/2026-03-10",
  );
  assert.equal(first.id, first.url);
  assert.equal(first.title, "What small thing made you smile today?");
  assert.equal(first.published, "2026-03-10T12:00:00.000Z");
  // Bulk-import updatedAt (before the recorded day) is ignored...
  assert.equal(first.updated, first.published);
  // ...but a genuine later edit is kept.
  assert.equal(second.updated, "2026-03-11T09:00:00.000Z");
  assert.deepEqual(first.tags, []);

  const throwingDb = {
    prepare() {
      throw new Error("no such table: daily_questions");
    },
  };
  assert.deepEqual(collectQuestionFeedItems(throwingDb), []);
});

test("collectQuestionFeedItems uses the active question as the archive cutoff", () => {
  // The query must be `recordedDate < <active day>`, not `< today`: queued
  // prompts after the active day are not published yet, and `recordedDate`
  // values between the active day and today would otherwise leak into the feed.
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        all(...args) {
          calls.push({ sql, args });
          return [];
        },
        get() {
          return { recordedDate: "2026-06-12" };
        },
      };
    },
  };

  collectQuestionFeedItems(db);

  const archiveCall = calls.find((call) => /FROM daily_questions/.test(call.sql));
  assert.ok(archiveCall, "expected the archive query to run");
  assert.equal(archiveCall.args[0], "2026-06-12");
});

// The feed previously re-derived the cutoff as "oldest unarchived row", which
// disagrees with the archive route (and the sitemap) whenever the carried
// question has answers from an earlier day: the live feed carried zero entries
// while the archive listed 26 public days. Sharing the resolver keeps all three
// on one definition.
test("the feed cutoff matches the public archive route's predicate", () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        all(...args) {
          calls.push({ sql, args });
          return [];
        },
        get(...args) {
          calls.push({ sql, args });
          // Only the grouped carried-question query may answer with a row; a
          // plain "oldest unarchived" lookup must not.
          if (/GROUP BY/.test(sql)) return { recordedDate: "2026-04-30" };
          return { recordedDate: "2026-04-04" };
        },
      };
    },
  };

  collectQuestionFeedItems(db);

  const cutoffCall = calls.find(
    (call) => /FROM daily_questions/.test(call.sql) && /GROUP BY/.test(call.sql),
  );
  assert.ok(cutoffCall, "expected the carried-question query");

  // The archive read is the one that selects prompt text.
  const archiveCall = calls.find(
    (call) => /FROM daily_questions/.test(call.sql) && /SELECT recordedDate, prompt/.test(call.sql),
  );
  assert.ok(archiveCall, "expected the archive query");
  assert.equal(archiveCall.args[0], "2026-04-30", "must use the carried day, not the oldest row");
  // The public set is `archivedAt IS NOT NULL OR recordedDate < ?`, matching the
  // route, rather than `recordedDate < ?` alone.
  assert.match(archiveCall.sql, /archivedAt IS NOT NULL OR recordedDate < \?/);
});

test("question feed builders use the questions metadata", () => {
  const items = collectQuestionFeedItems(fakeDb(questionRows));
  const xml = buildAtomFeed(items, QUESTIONS_FEED);
  assert.match(xml, /<title>Mirabellier Question of the Day<\/title>/);
  assert.match(
    xml,
    /<link href="https:\/\/mirabellier\.com\/feed\/questions\.xml" rel="self"/,
  );
  assert.equal((xml.match(/<entry>/g) || []).length, 2);

  const json = JSON.parse(buildJsonFeed(items, QUESTIONS_FEED));
  assert.equal(json.feed_url, "https://mirabellier.com/feed/questions.json");
  assert.equal(
    json.home_page_url,
    "https://mirabellier.com/question-of-the-day/archive",
  );
  assert.equal(json.items[0].title, "What small thing made you smile today?");
});
