const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  getOnThisDayKey,
  normalizeOnThisDayLimit,
  queryOnThisDayRows,
} = require("../lib/guestbook-on-this-day");

test("getOnThisDayKey returns the UTC month-day and year", () => {
  assert.deepEqual(getOnThisDayKey(new Date("2026-09-10T02:30:00.000Z")), {
    monthDay: "09-10",
    year: "2026",
  });
});

test("getOnThisDayKey zero-pads and reads UTC, not local time", () => {
  assert.deepEqual(getOnThisDayKey(new Date("2024-01-05T23:59:59.000Z")), {
    monthDay: "01-05",
    year: "2024",
  });
});

test("getOnThisDayKey falls back to now for invalid input", () => {
  const key = getOnThisDayKey(new Date("not a date"));
  assert.match(key.monthDay, /^\d{2}-\d{2}$/);
  assert.match(key.year, /^\d{4}$/);
});

test("normalizeOnThisDayLimit clamps to sane bounds", () => {
  assert.equal(normalizeOnThisDayLimit(undefined), DEFAULT_LIMIT);
  assert.equal(normalizeOnThisDayLimit("0"), DEFAULT_LIMIT);
  assert.equal(normalizeOnThisDayLimit("-4"), DEFAULT_LIMIT);
  assert.equal(normalizeOnThisDayLimit("abc"), DEFAULT_LIMIT);
  assert.equal(normalizeOnThisDayLimit("5"), 5);
  assert.equal(normalizeOnThisDayLimit("999"), MAX_LIMIT);
});

test("queryOnThisDayRows keeps same month+day from earlier years only", () => {
  const rows = [
    { id: "a", createdAt: "2023-09-10T08:00:00.000Z" },
    { id: "b", createdAt: "2022-09-10T09:00:00.000Z" },
    { id: "this-year", createdAt: "2026-09-10T09:00:00.000Z" },
    { id: "wrong-day", createdAt: "2023-09-11T09:00:00.000Z" },
  ];

  const db = {
    prepare(sql) {
      assert.match(sql, /substr\(createdAt, 6, 5\) = \?/);
      assert.match(sql, /substr\(createdAt, 1, 4\) < \?/);
      return {
        all(monthDay, year, limit) {
          return rows
            .filter(
              (row) =>
                row.createdAt.slice(5, 10) === monthDay &&
                row.createdAt.slice(0, 4) < year,
            )
            .slice(0, limit);
        },
      };
    },
  };

  const result = queryOnThisDayRows(db, {
    monthDay: "09-10",
    year: "2026",
    limit: 8,
  });
  assert.deepEqual(
    result.map((row) => row.id),
    ["a", "b"],
  );
});

test("queryOnThisDayRows honours the limit", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({
    id: `n${i}`,
    createdAt: `20${10 + (i % 5)}-09-10T00:00:00.000Z`,
  }));

  const db = {
    prepare() {
      return {
        all(_monthDay, _year, limit) {
          return rows.slice(0, limit);
        },
      };
    },
  };

  assert.equal(
    queryOnThisDayRows(db, { monthDay: "09-10", year: "2026", limit: 3 }).length,
    3,
  );
});
