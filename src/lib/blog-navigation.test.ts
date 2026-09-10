import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getPostNeighbors,
  getSeriesContext,
  sortByDateAsc,
} from "./blog-navigation.ts";

const post = (
  id: string,
  createdAt: string,
  series?: string | null,
) => ({ id, title: `Post ${id}`, createdAt, series });

const archive = [
  post("a", "2026-01-01T00:00:00.000Z", "Learning Rust"),
  post("b", "2026-02-01T00:00:00.000Z"),
  post("c", "2026-03-01T00:00:00.000Z", "learning rust"), // case-insensitive
  post("d", "2026-04-01T00:00:00.000Z", " Learning Rust "), // trims
];

test("sortByDateAsc orders oldest first and is stable-ish on ties", () => {
  const tied = [
    post("y", "2026-05-01T00:00:00.000Z"),
    post("x", "2026-05-01T00:00:00.000Z"),
  ];
  assert.deepEqual(
    sortByDateAsc([...archive].reverse()).map((p) => p.id),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(
    sortByDateAsc(tied).map((p) => p.id),
    ["x", "y"],
  );
});

test("getPostNeighbors returns chronological older/newer", () => {
  assert.deepEqual(
    (({ older, newer }) => ({ older: older?.id, newer: newer?.id }))(
      getPostNeighbors(archive, "b"),
    ),
    { older: "a", newer: "c" },
  );
});

test("getPostNeighbors clamps at the ends and handles a miss", () => {
  assert.equal(getPostNeighbors(archive, "a").older, null);
  assert.equal(getPostNeighbors(archive, "a").newer?.id, "b");
  assert.equal(getPostNeighbors(archive, "d").newer, null);
  assert.deepEqual(getPostNeighbors(archive, "nope"), {
    older: null,
    newer: null,
  });
});

test("getSeriesContext groups by trimmed, case-insensitive series name", () => {
  const ctx = getSeriesContext(archive, "c");
  assert.ok(ctx);
  assert.equal(ctx.name, "learning rust"); // verbatim (trimmed) from post c
  assert.deepEqual(
    ctx.parts.map((p) => p.id),
    ["a", "c", "d"],
  );
  assert.equal(ctx.index, 1);
  assert.equal(ctx.previous?.id, "a");
  assert.equal(ctx.next?.id, "d");
});

test("getSeriesContext is null without a series or with only one part", () => {
  assert.equal(getSeriesContext(archive, "b"), null); // no series
  assert.equal(
    getSeriesContext(
      [post("solo", "2026-01-01T00:00:00.000Z", "One-shot")],
      "solo",
    ),
    null,
  );
  assert.equal(getSeriesContext(archive, "missing"), null);
});

test("getSeriesContext marks the ends of the series", () => {
  assert.equal(getSeriesContext(archive, "a")?.previous, null);
  assert.equal(getSeriesContext(archive, "d")?.next, null);
});
