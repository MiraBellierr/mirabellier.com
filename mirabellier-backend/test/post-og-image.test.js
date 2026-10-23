const test = require("node:test");
const assert = require("node:assert/strict");

const {
  OG_WIDTH,
  OG_HEIGHT,
  buildPostOgImagePath,
  buildPostOgState,
  buildPostOgVersion,
  formatDate,
  pickTitleLayout,
  renderPostOgBuffer,
} = require("../lib/post-og-image");

test("buildPostOgVersion digests updatedAt, then createdAt, then falls back", () => {
  assert.equal(
    buildPostOgVersion({
      updatedAt: "2026-09-10T08:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    "20260910T080000000Z",
  );
  assert.equal(
    buildPostOgVersion({ createdAt: "2026-01-02T03:04:05.000Z" }),
    "20260102T030405000Z",
  );
  assert.equal(buildPostOgVersion({}), "static");
  assert.equal(buildPostOgVersion(null), "static");
});

test("buildPostOgImagePath builds a versioned, url-safe path", () => {
  assert.equal(
    buildPostOgImagePath("hello-world-123", "20260910T080000000Z"),
    "/og/post/hello-world-123.png?v=20260910T080000000Z",
  );
  assert.equal(buildPostOgImagePath("hello-world-123"), "/og/post/hello-world-123.png");
  assert.equal(buildPostOgImagePath("a b/c", "v1"), "/og/post/a%20b%2Fc.png?v=v1");
  assert.equal(buildPostOgImagePath(""), "/og/post/post.png");
});

test("formatDate renders a UTC long date and tolerates junk", () => {
  assert.equal(formatDate("2026-09-10T23:30:00.000Z"), "September 10, 2026");
  assert.equal(formatDate("2026-01-05T00:00:00.000Z"), "January 5, 2026");
  assert.equal(formatDate(""), "");
  assert.equal(formatDate("not a date"), "");
});

test("buildPostOgState normalises the title, caps tags, and dates the card", () => {
  const state = buildPostOgState({
    title: "  A   spaced   out   title  ",
    tags: ["life", " ", "notes", "cozy", "extra"],
    createdAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-11T12:00:00.000Z",
    author: "  mira  ",
  });

  assert.equal(state.title, "A spaced out title");
  assert.deepEqual(state.tags, ["life", "notes", "cozy"]);
  assert.equal(state.dateLabel, "September 10, 2026");
  assert.equal(state.author, "mira");
  assert.equal(state.version, "20260911T120000000Z");
  assert.match(state.imageAlt, /A spaced out title/);
});

test("buildPostOgState falls back to Untitled for an empty title", () => {
  assert.equal(buildPostOgState({ title: "   " }).title, "Untitled");
  assert.equal(buildPostOgState({}).title, "Untitled");
});

test("pickTitleLayout shrinks the type for a long title and keeps the line cap", () => {
  const short = pickTitleLayout("Hi there");
  const long = pickTitleLayout(
    "An unusually long blog post title that keeps going and going past every wrap budget",
  );

  assert.ok(short.fontSize >= long.fontSize);
  assert.ok(long.lines.length <= 4);
  assert.ok(short.lines.length >= 1);
});

test("renderPostOgBuffer produces a PNG of the OG dimensions", async () => {
  const buffer = await renderPostOgBuffer(
    buildPostOgState({
      title: "Rendering smoke test",
      tags: ["meta"],
      createdAt: "2026-09-10T00:00:00.000Z",
    }),
  );

  assert.ok(Buffer.isBuffer(buffer));
  // PNG magic number.
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  // IHDR width/height are big-endian uint32 at byte offsets 16 and 20.
  assert.equal(buffer.readUInt32BE(16), OG_WIDTH);
  assert.equal(buffer.readUInt32BE(20), OG_HEIGHT);
});
