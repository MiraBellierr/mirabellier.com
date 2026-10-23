const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPrediction,
  circularMinuteDistance,
  computeMedianGapHours,
  computeRecencySuppression,
  medianDurationMinutes,
  weekMinuteOf,
} = require("../lib/twitch-prediction");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MINUTES = 7 * 24 * 60;

function atUtc(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min || 0);
}

test("weekMinuteOf maps UTC timestamps into weekly minutes", () => {
  const mondayMidnight = atUtc(2026, 8, 31, 0, 0);
  const saturday2359 = atUtc(2026, 9, 5, 23, 59);

  assert.equal(weekMinuteOf(mondayMidnight), 1 * 24 * 60);
  assert.equal(weekMinuteOf(saturday2359), 6 * 24 * 60 + 23 * 60 + 59);
});

test("circularMinuteDistance wraps across the week boundary", () => {
  assert.equal(circularMinuteDistance(0, 30), 30);
  assert.equal(circularMinuteDistance(WEEK_MINUTES - 15, 0), 15);
  assert.equal(circularMinuteDistance(0, WEEK_MINUTES - 15), 15);
});

test("insufficient history yields no prediction", () => {
  const nowMs = atUtc(2026, 9, 1, 12, 0);
  const prediction = buildPrediction(
    [{ startedAtMs: nowMs - DAY_MS, endedAtMs: null }],
    { nowMs },
  );

  assert.equal(prediction.reason, "insufficient-data");
  assert.equal(prediction.nextStartAt, null);
  assert.equal(prediction.sampleCount, 1);
});

test("predicts the habitual stream slot for a consistent schedule", () => {
  const nowMs = atUtc(2026, 9, 7, 12, 0); // Monday noon
  const events = [];

  for (let week = 1; week <= 8; week += 1) {
    const start = atUtc(2026, 7, 6, 18, 0) + week * 7 * DAY_MS;
    events.push({
      startedAtMs: start,
      endedAtMs: start + 3 * HOUR_MS,
    });
  }

  const prediction = buildPrediction(events, { nowMs });

  assert.equal(prediction.reason, null);
  assert.equal(prediction.sampleCount, 8);
  assert.ok(prediction.nextStartAt > nowMs);

  const predictedDate = new Date(prediction.nextStartAt);
  assert.equal(predictedDate.getUTCDay(), 1);
  assert.equal(predictedDate.getUTCHours(), 18);
  assert.ok(prediction.confidence > 0.5);
});

test("skips the just-passed slot and waits for the next weekly occurrence", () => {
  const nowMs = atUtc(2026, 9, 7, 18, 30); // Monday, half an hour after habit slot
  const events = [];

  for (let week = 1; week <= 8; week += 1) {
    const start = atUtc(2026, 7, 6, 18, 0) + week * 7 * DAY_MS;
    events.push({
      startedAtMs: start,
      endedAtMs: start + 3 * HOUR_MS,
    });
  }

  const prediction = buildPrediction(events, { nowMs });

  assert.ok(prediction.nextStartAt > nowMs);
  const predictedDate = new Date(prediction.nextStartAt);
  assert.equal(predictedDate.getUTCDay(), 1);
  assert.ok(predictedDate.getTime() > nowMs + 6 * DAY_MS);
});

test("confidence stays lower for an irregular schedule", () => {
  const nowMs = atUtc(2026, 9, 7, 12, 0);
  const events = [];

  const starts = [
    atUtc(2026, 8, 3, 9, 0),
    atUtc(2026, 8, 5, 20, 30),
    atUtc(2026, 8, 8, 3, 15),
    atUtc(2026, 8, 11, 15, 45),
    atUtc(2026, 8, 14, 22, 0),
    atUtc(2026, 8, 17, 6, 30),
  ];

  for (const start of starts) {
    events.push({ startedAtMs: start, endedAtMs: start + 2 * HOUR_MS });
  }

  const prediction = buildPrediction(events, { nowMs });
  assert.ok(prediction.nextStartAt > nowMs);
  assert.ok(prediction.confidence < 0.5);
});

test("recency suppression recovers as time since the last stream grows", () => {
  const rightAfter = computeRecencySuppression(0);
  const sixHours = computeRecencySuppression(6 * HOUR_MS);
  const twoDays = computeRecencySuppression(48 * HOUR_MS);

  assert.ok(twoDays > sixHours);
  assert.ok(sixHours > rightAfter);
  assert.ok(rightAfter < 0.4);
  assert.ok(twoDays > 0.9);
});

test("median gap falls back to a default when history is thin", () => {
  assert.equal(computeMedianGapHours([1, 2], 0), 72);
  assert.ok(computeMedianGapHours([0, DAY_MS, 2 * DAY_MS, 3 * DAY_MS], 0) > 20);
});

test("median duration comes from completed streams", () => {
  const duration = medianDurationMinutes([
    { startedAtMs: 0, endedAtMs: 2 * HOUR_MS },
    { startedAtMs: DAY_MS, endedAtMs: DAY_MS + 3 * HOUR_MS },
    { startedAtMs: 2 * DAY_MS, endedAtMs: 2 * DAY_MS + 4 * HOUR_MS },
  ]);

  assert.equal(duration, 180);
});

test("prediction curve covers a full week and sums to one", () => {
  const nowMs = atUtc(2026, 9, 7, 12, 0);
  const events = [];

  for (let week = 1; week <= 6; week += 1) {
    const start = atUtc(2026, 7, 6, 18, 0) + week * 7 * DAY_MS;
    events.push({ startedAtMs: start, endedAtMs: start + 3 * HOUR_MS });
  }

  const prediction = buildPrediction(events, { nowMs });

  assert.equal(prediction.curve.length, (7 * 24 * 60) / 15);
  const total = prediction.curve.reduce((sum, entry) => sum + entry.p, 0);
  assert.ok(Math.abs(total - 1) < 0.0001);
});
