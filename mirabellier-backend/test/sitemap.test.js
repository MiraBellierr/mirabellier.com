const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectSitemapEntries,
  generateSitemap,
  resolveArchiveCutoffRecordedDate,
  toLastmodDate,
} = require("../lib/sitemap");

// The archive block in `collectSitemapEntries` must use the same cutoff as the
// public archive route (`getArchiveCutoffRecordedDate`): the active carried
// question, not today. Using today published URLs whose route 404s and leaked
// queued prompts (the live sitemap carried 94 such soft-404s).
//
// `lastmodRows` backs the per-page change-date queries (`LASTMOD_QUERIES`) by
// matching on a distinctive table name, so a test can assert that a route's
// date comes from the right source.
function fakeDb({
  activeRecordedDate = "2026-06-12",
  archiveRows = [],
  postRows = [],
  shrineRows = [],
  lastmodRows = {},
} = {}) {
  const calls = [];

  const lastmodKeyFor = (sql) => {
    for (const table of [
      "site_now",
      "site_links",
      "site_changelog",
      "myanimelist_anime_snapshots",
      "quote_snapshots",
      "user_videos",
      "daily_questions",
      "posts",
      "guestbook_entries",
      "daily_question_answers",
    ]) {
      if (new RegExp(`FROM ${table}`).test(sql)) return table;
    }
    return null;
  };

  return {
    calls,
    prepare(sql) {
      return {
        all(...args) {
          calls.push({ sql, args });
          if (/FROM daily_questions/.test(sql)) return archiveRows;
          if (/FROM posts/.test(sql)) return postRows;
          if (/FROM shrine_pages/.test(sql)) return shrineRows;
          return [];
        },
        get(...args) {
          calls.push({ sql, args });
          // The cutoff query is the grouped one; every other statement against
          // daily_questions is a lastmod lookup and must not be answered with
          // the cutoff row's shape.
          if (/FROM daily_questions/.test(sql) && /GROUP BY/.test(sql)) {
            return activeRecordedDate === null
              ? undefined
              : { recordedDate: activeRecordedDate };
          }
          const key = lastmodKeyFor(sql);
          if (key && key in lastmodRows) {
            return lastmodRows[key] === null
              ? undefined
              : { updatedAt: lastmodRows[key] };
          }
          return undefined;
        },
      };
    },
  };
}

test("archive URLs use the active question as the cutoff", () => {
  const db = fakeDb({
    activeRecordedDate: "2026-06-12",
    archiveRows: [
      { recordedDate: "2026-06-11", createdAt: "2026-06-11T00:00:00.000Z" },
      { recordedDate: "2026-06-10", createdAt: "2026-06-10T00:00:00.000Z" },
    ],
  });

  collectSitemapEntries(db);

  const archiveCall = db.calls.find((call) =>
    /FROM daily_questions[\s\S]*recordedDate < \?/.test(call.sql),
  );
  assert.ok(archiveCall, "expected an archive query with a cutoff");
  assert.equal(archiveCall.args[0], "2026-06-12");
});

test("archive URLs fall back to today when no question is active", () => {
  const db = fakeDb({ activeRecordedDate: null, archiveRows: [] });

  collectSitemapEntries(db);

  const archiveCall = db.calls.find((call) =>
    /FROM daily_questions[\s\S]*recordedDate < \?/.test(call.sql),
  );
  assert.ok(archiveCall, "expected an archive query with a cutoff");
  assert.equal(archiveCall.args[0], new Date().toISOString().slice(0, 10));
});

test("archive URLs are emitted with the question priority and changefreq", () => {
  const db = fakeDb({
    activeRecordedDate: "2026-06-12",
    archiveRows: [
      { recordedDate: "2026-06-11", createdAt: "2026-06-11T00:00:00.000Z" },
    ],
  });

  const entries = collectSitemapEntries(db);
  const archiveEntry = entries.find((entry) =>
    entry.url.endsWith("/question-of-the-day/archive/2026-06-11"),
  );

  assert.ok(archiveEntry, "expected the archived day to be listed");
  assert.equal(archiveEntry.priority, "0.6");
  assert.equal(archiveEntry.changefreq, "monthly");
  assert.equal(archiveEntry.lastmod, "2026-06-11");
});

test("no archive entries are listed when the archive is empty", () => {
  const db = fakeDb({ activeRecordedDate: "2026-06-12", archiveRows: [] });

  const entries = collectSitemapEntries(db);
  assert.equal(
    entries.filter((entry) => entry.url.includes("/question-of-the-day/archive/"))
      .length,
    0,
  );
});

test("/home is not listed (it is a client-side alias of /)", () => {
  const entries = collectSitemapEntries(fakeDb());
  assert.equal(
    entries.some((entry) => entry.url === "https://mirabellier.com/home"),
    false,
  );
  assert.equal(
    entries.some((entry) => entry.url === "https://mirabellier.com/"),
    true,
  );
});

test("posts carry an image entry when they have a thumbnail", () => {
  const db = fakeDb({
    postRows: [
      {
        id: "1",
        title: "With thumbnail",
        thumbnail: "/images/hero.png",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        title: "Without thumbnail",
        thumbnail: null,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ],
  });

  const entries = collectSitemapEntries(db);
  const withImage = entries.find((entry) => entry.url.endsWith("/blog/with-thumbnail-1"));
  const withoutImage = entries.find((entry) =>
    entry.url.endsWith("/blog/without-thumbnail-2"),
  );

  assert.ok(withImage, "expected the post URL to use the canonical slug shape");
  assert.deepEqual(withImage.images, [
    { url: "https://mirabellier.com/images/hero.png", title: "With thumbnail" },
  ]);
  assert.equal(withoutImage.images, undefined);
});

test("blog slugs match the canonical NFKD + 80-char shape", () => {
  // 100+ characters, accented — the naive slugifier used here previously kept
  // the accents and an unbounded length, so the sitemap URL disagreed with the
  // page's own canonical.
  const longTitle =
    "Café Naïve — Ünicode Résumé " + "a".repeat(100);
  const db = fakeDb({
    postRows: [
      { id: "9", title: longTitle, thumbnail: null, createdAt: "2026-01-01T00:00:00.000Z" },
    ],
  });

  const entries = collectSitemapEntries(db);
  const post = entries.find((entry) => entry.url.includes("-9"));

  assert.ok(post, "expected a post entry");
  assert.match(post.url, /^https:\/\/mirabellier\.com\/blog\/[a-z0-9-]+-9$/);
  const slug = post.url.replace("https://mirabellier.com/blog/", "").replace(/-9$/, "");
  assert.ok(slug.length <= 80, `slug should be capped at 80 chars, got ${slug.length}`);
  assert.ok(!/[^\x00-\x7F]/.test(slug), "slug should be ASCII");
});

test("built-in and database shrines are merged, database winning on a path", () => {
  const db = fakeDb({
    shrineRows: [
      {
        path: "/shrine/kanna",
        title: "Kanna (owner edit)",
        image: "https://cdn.example/edited.jpg",
        priority: "0.9",
        changefreq: "weekly",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
      {
        path: "/shrine/kana",
        title: "Arima Kana",
        image: null,
        priority: "0.7",
        changefreq: "monthly",
        updatedAt: "2026-04-10T00:00:00.000Z",
      },
    ],
  });

  const entries = collectSitemapEntries(db);
  const shrines = entries.filter((entry) => entry.url.includes("/shrine/"));
  const urls = shrines.map((entry) => entry.url);

  // Built-in rossina survives alongside the two database rooms...
  assert.ok(urls.includes("https://mirabellier.com/shrine/rossina"));
  assert.ok(urls.includes("https://mirabellier.com/shrine/kana"));
  // ...and the duplicate kanna path is deduped, with the DB row's values.
  assert.equal(urls.filter((url) => url.endsWith("/shrine/kanna")).length, 1);
  const kanna = shrines.find((entry) => entry.url.endsWith("/shrine/kanna"));
  assert.equal(kanna.priority, "0.9");
  assert.equal(kanna.changefreq, "weekly");
  assert.equal(kanna.lastmod, "2026-05-01");
  assert.deepEqual(kanna.images, [
    { url: "https://cdn.example/edited.jpg", title: "Kanna (owner edit)" },
  ]);
});

test("shrine art is added as a sitemap image when present", () => {
  const db = fakeDb({
    shrineRows: [
      {
        path: "/shrine/kana",
        title: "Arima Kana",
        image: "https://i.pinimg.com/kana.jpg",
        priority: "0.7",
        changefreq: "monthly",
        updatedAt: "2026-04-10T00:00:00.000Z",
      },
    ],
  });

  const entries = collectSitemapEntries(db);
  const kana = entries.find((entry) => entry.url.endsWith("/shrine/kana"));

  assert.deepEqual(kana.images, [
    { url: "https://i.pinimg.com/kana.jpg", title: "Arima Kana" },
  ]);
});

// ── lastmod accuracy ──────────────────────────────────────────────────────
//
// Reported audit finding: every archived question day carried the same
// bulk-import date (2026-04-04, four months before most of the days existed)
// and all 19 static routes carried the build date. A `lastmod` that is not a
// real per-page change date is the signal Google uses to ignore the field.

test("archived days report their own recordedDate as lastmod", () => {
  const db = fakeDb({
    activeRecordedDate: "2026-06-12",
    archiveRows: [
      {
        recordedDate: "2026-06-11",
        createdAt: "2026-04-04T11:27:07.671Z",
        updatedAt: "2026-04-04T11:27:07.671Z",
      },
      {
        recordedDate: "2026-05-20",
        createdAt: "2026-04-04T11:27:07.671Z",
        updatedAt: "2026-04-04T11:27:07.671Z",
      },
    ],
  });

  const entries = collectSitemapEntries(db);
  const day1 = entries.find((e) => e.url.endsWith("/archive/2026-06-11"));
  const day2 = entries.find((e) => e.url.endsWith("/archive/2026-05-20"));

  assert.equal(day1.lastmod, "2026-06-11");
  assert.equal(day2.lastmod, "2026-05-20");
  // The bulk-import timestamp must never leak through.
  assert.notEqual(day1.lastmod, "2026-04-04");
});

test("an owner edit after the recorded day wins for that archive page", () => {
  const db = fakeDb({
    activeRecordedDate: "2026-06-12",
    archiveRows: [
      {
        recordedDate: "2026-06-11",
        createdAt: "2026-04-04T11:27:07.671Z",
        updatedAt: "2026-06-20T09:00:00.000Z",
      },
    ],
  });

  const entries = collectSitemapEntries(db);
  const day = entries.find((e) => e.url.endsWith("/archive/2026-06-11"));
  assert.equal(day.lastmod, "2026-06-20");
});

test("static routes carry no lastmod rather than the build date", () => {
  const entries = collectSitemapEntries(fakeDb());
  const today = new Date().toISOString().slice(0, 10);

  for (const path of ["/", "/about", "/uses", "/projects", "/fanart", "/twitch", "/privacy", "/terms", "/arena/skill-tree", "/shrine"]) {
    const entry = entries.find((e) => e.url === `https://mirabellier.com${path}`);
    assert.ok(entry, `expected ${path} to be listed`);
    assert.equal(entry.lastmod, undefined, `${path} must not claim a lastmod`);
    assert.notEqual(entry.lastmod, today);
  }
});

test("owner-editable pages take their lastmod from the matching row", () => {
  const db = fakeDb({
    lastmodRows: {
      site_now: "2026-08-01T00:00:00.000Z",
      site_links: "2026-08-02T00:00:00.000Z",
      site_changelog: "2026-08-03T00:00:00.000Z",
      quote_snapshots: "2026-08-04T00:00:00.000Z",
      myanimelist_anime_snapshots: "2026-08-05T00:00:00.000Z",
      user_videos: "2026-08-06T00:00:00.000Z",
      posts: "2026-08-07T00:00:00.000Z",
    },
  });

  const entries = collectSitemapEntries(db);
  const lastmodOf = (path) =>
    entries.find((e) => e.url === `https://mirabellier.com${path}`)?.lastmod;

  assert.equal(lastmodOf("/now"), "2026-08-01");
  assert.equal(lastmodOf("/links"), "2026-08-02");
  assert.equal(lastmodOf("/changelog"), "2026-08-03");
  assert.equal(lastmodOf("/quotes"), "2026-08-04");
  assert.equal(lastmodOf("/anime"), "2026-08-05");
  assert.equal(lastmodOf("/pixies"), "2026-08-06");
  assert.equal(lastmodOf("/blog"), "2026-08-07");
});

// better-sqlite3 throws when a statement is given more bind parameters than it
// has placeholders, so passing the archive cutoff to every query silently
// produced no lastmod at all for the eight queries that take none.
test("queries that take no bind parameters are not handed the cutoff", () => {
  const db = fakeDb({ lastmodRows: { site_now: "2026-08-01T00:00:00.000Z" } });
  collectSitemapEntries(db);

  const siteNowCall = db.calls.find((call) => /FROM site_now/.test(call.sql));
  assert.ok(siteNowCall, "expected the site_now lookup to run");
  assert.deepEqual(siteNowCall.args, []);

  const qotdCall = db.calls.find((call) => /MAX\(recordedDate\)/.test(call.sql));
  assert.ok(qotdCall, "expected the QOTD lookup to run");
  assert.equal(qotdCall.args.length, 1);
});

test("a missing table leaves the route without a lastmod instead of failing", () => {
  const db = {
    prepare(sql) {
      return {
        all() {
          if (/FROM posts/.test(sql)) return [];
          if (/FROM shrine_pages/.test(sql)) return [];
          if (/FROM daily_questions/.test(sql)) {
            throw new Error("no such table: daily_questions");
          }
          return [];
        },
        get() {
          if (/FROM daily_questions/.test(sql)) {
            throw new Error("no such table: daily_questions");
          }
          if (/site_now|site_links|site_changelog|quote_snapshots|myanimelist_anime_snapshots|user_videos|FROM posts/.test(sql)) {
            throw new Error("no such table");
          }
          return undefined;
        },
      };
    },
  };

  const entries = collectSitemapEntries(db);
  assert.ok(entries.length > 0, "static routes should still be listed");
  assert.equal(entries.every((entry) => entry.lastmod === undefined), true);
});

test("built-in shrine rooms omit lastmod; database rooms report their edit", () => {
  const db = fakeDb({
    shrineRows: [
      {
        path: "/shrine/kana",
        title: "Arima Kana",
        image: null,
        priority: "0.7",
        changefreq: "monthly",
        updatedAt: "2026-04-10T00:00:00.000Z",
      },
    ],
  });

  const entries = collectSitemapEntries(db);
  const kana = entries.find((e) => e.url.endsWith("/shrine/kana"));
  const kanna = entries.find((e) => e.url.endsWith("/shrine/kanna"));

  assert.equal(kana.lastmod, "2026-04-10");
  assert.equal(kanna.lastmod, undefined);
});

test("QOTD routes are dated by the newest public day, not the bulk import", () => {
  const db = fakeDb({
    activeRecordedDate: "2026-06-12",
    lastmodRows: { daily_questions: "2026-06-11" },
  });

  const entries = collectSitemapEntries(db);
  const qotd = entries.find(
    (e) => e.url === "https://mirabellier.com/question-of-the-day",
  );
  const archiveIndex = entries.find(
    (e) => e.url === "https://mirabellier.com/question-of-the-day/archive",
  );

  assert.equal(qotd.lastmod, "2026-06-11");
  assert.equal(archiveIndex.lastmod, "2026-06-11");
});

test("generateSitemap omits the lastmod element when there is no date", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sitemap-lastmod-"));

  try {
    const db = fakeDb({
      archiveRows: [
        {
          recordedDate: "2026-06-11",
          createdAt: "2026-04-04T11:27:07.671Z",
          updatedAt: "2026-04-04T11:27:07.671Z",
        },
      ],
    });
    assert.equal(generateSitemap(db, dir), true);

    const xml = fs.readFileSync(path.join(dir, "sitemap.xml"), "utf8");
    // The archived day has one; the homepage must not.
    assert.match(xml, /<loc>https:\/\/mirabellier\.com\/question-of-the-day\/archive\/2026-06-11<\/loc>\s*<lastmod>2026-06-11<\/lastmod>/);
    const home = xml.match(/<url>\s*<loc>https:\/\/mirabellier\.com\/<\/loc>([\s\S]*?)<\/url>/);
    assert.ok(home, "expected the homepage entry");
    assert.doesNotMatch(home[1], /<lastmod>/);
    // No build-date stamp anywhere in the file.
    const today = new Date().toISOString().slice(0, 10);
    const buildDates = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)]
      .map((m) => m[1])
      .filter((value) => value === today);
    assert.deepEqual(buildDates, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── archive cutoff ────────────────────────────────────────────────────────

test("resolveArchiveCutoffRecordedDate returns the carried question or null", () => {
  assert.equal(
    resolveArchiveCutoffRecordedDate(fakeDb({ activeRecordedDate: "2026-06-12" }), "2026-06-20"),
    "2026-06-12",
  );
  assert.equal(
    resolveArchiveCutoffRecordedDate(fakeDb({ activeRecordedDate: null }), "2026-06-20"),
    null,
  );
});

test("toLastmodDate normalises timestamps and rejects junk", () => {
  assert.equal(toLastmodDate("2026-06-11T11:27:07.671Z"), "2026-06-11");
  assert.equal(toLastmodDate("2026-06-11"), "2026-06-11");
  assert.equal(toLastmodDate(""), null);
  assert.equal(toLastmodDate(null), null);
  assert.equal(toLastmodDate(undefined), null);
  assert.equal(toLastmodDate("not a date"), null);
});
