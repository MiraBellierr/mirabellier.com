const test = require("node:test");
const assert = require("node:assert/strict");

const { buildChannelStats } = require("../lib/twitch-stats");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function atUtc(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min || 0);
}

test("stats aggregate streams by day of week and hour", () => {
  const events = [];
  for (let week = 1; week <= 4; week += 1) {
    events.push({
      startedAt: new Date(atUtc(2026, 7, 6, 18, 0) + week * 7 * DAY_MS).toISOString(),
      endedAt: new Date(atUtc(2026, 7, 6, 18, 0) + week * 7 * DAY_MS + 2 * HOUR_MS).toISOString(),
      durationMinutes: 120,
    });
  }

  const nowMs = atUtc(2026, 9, 1, 12, 0);
  const stats = buildChannelStats(events, nowMs);

  assert.equal(stats.totalStreams, 4);
  assert.equal(stats.byDayOfWeek[1], 4); // Mondays
  assert.equal(stats.byHourOfDay[18], 4);
  assert.equal(stats.totalHours, 8);
  assert.equal(stats.avgDurationMin, 120);
  assert.equal(stats.longestDurationMin, 120);
});

test("stats bucket stream durations", () => {
  const nowMs = atUtc(2026, 9, 1, 12, 0);
  const events = [
    { startedAtMs: nowMs - DAY_MS, endedAtMs: nowMs - DAY_MS + 30 * 60 * 1000 },
    { startedAtMs: nowMs - 2 * DAY_MS, endedAtMs: nowMs - 2 * DAY_MS + 3 * HOUR_MS },
    { startedAtMs: nowMs - 3 * DAY_MS, endedAtMs: nowMs - 3 * DAY_MS + 10 * HOUR_MS },
  ];

  const stats = buildChannelStats(events, nowMs);
  const histogram = stats.durationHistogram;

  assert.equal(histogram[0].count, 1); // <1h
  assert.equal(histogram[1].count, 0); // 1-2h
  assert.equal(histogram[2].count, 1); // 2-4h
  assert.equal(histogram[5].count, 1); // 8h+
});

test("stats count only recent streams in the last 30 days", () => {
  const nowMs = atUtc(2026, 9, 1, 12, 0);
  const events = [
    { startedAtMs: nowMs - 5 * DAY_MS, endedAtMs: nowMs - 5 * DAY_MS + HOUR_MS },
    { startedAtMs: nowMs - 40 * DAY_MS, endedAtMs: nowMs - 40 * DAY_MS + HOUR_MS },
  ];

  const stats = buildChannelStats(events, nowMs);

  assert.equal(stats.totalStreams, 2);
  assert.equal(stats.streamsLast30Days, 1);
});

test("stats build a twelve month history", () => {
  const nowMs = atUtc(2026, 9, 1, 12, 0);
  const events = [
    { startedAtMs: atUtc(2026, 8, 10, 18, 0), endedAtMs: atUtc(2026, 8, 10, 20, 0) },
    { startedAtMs: atUtc(2026, 8, 20, 18, 0), endedAtMs: atUtc(2026, 8, 20, 20, 0) },
    { startedAtMs: atUtc(2026, 2, 5, 18, 0), endedAtMs: atUtc(2026, 2, 5, 20, 0) },
  ];

  const stats = buildChannelStats(events, nowMs);

  assert.equal(stats.byMonth.length, 12);
  assert.equal(stats.byMonth[stats.byMonth.length - 1].month, "2026-09");
  assert.equal(stats.byMonth[stats.byMonth.length - 2].count, 2); // August
});
