const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const DURATION_BUCKETS = [
  { label: "<1h", min: 0, max: 60 },
  { label: "1-2h", min: 60, max: 120 },
  { label: "2-4h", min: 120, max: 240 },
  { label: "4-6h", min: 240, max: 360 },
  { label: "6-8h", min: 360, max: 480 },
  { label: "8h+", min: 480, max: Infinity },
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function readStartedAtMs(event) {
  const numeric = Number(event?.startedAtMs);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  const parsed = Date.parse(event?.startedAt || "");
  return Number.isFinite(parsed) ? parsed : NaN;
}

function readEndedAtMs(event) {
  const numeric = Number(event?.endedAtMs);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  const parsed = Date.parse(event?.endedAt || "");
  return Number.isFinite(parsed) ? parsed : NaN;
}

function readEventMinutes(event, nowMs) {
  if (event.durationMinutes != null) {
    const durationMinutes = Number(event.durationMinutes);
    if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
      return durationMinutes;
    }
  }

  const startedAtMs = readStartedAtMs(event);
  const endedAtMs = readEndedAtMs(event);
  if (Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs)) {
    return (endedAtMs - startedAtMs) / (60 * 1000);
  }

  if (Number.isFinite(startedAtMs) && nowMs > startedAtMs) {
    return (nowMs - startedAtMs) / (60 * 1000);
  }

  return null;
}

function monthKeyOf(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function buildMonthLabels(nowMs, count = 12) {
  const labels = [];
  const anchor = new Date(nowMs);
  anchor.setUTCDate(1);
  anchor.setUTCHours(0, 0, 0, 0);

  for (let index = count - 1; index >= 0; index -= 1) {
    const month = new Date(anchor);
    month.setUTCMonth(anchor.getUTCMonth() - index);
    labels.push(monthKeyOf(month));
  }

  return labels;
}

function buildChannelStats(events, nowMs = Date.now()) {
  const rows = Array.isArray(events) ? events : [];

  const startedRows = rows
    .map((event) => ({
      startedAtMs: readStartedAtMs(event || {}),
      minutes: readEventMinutes(event || {}, nowMs),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.startedAtMs) && row.startedAtMs > 0 && row.startedAtMs <= nowMs,
    );

  const durations = startedRows
    .map((row) => row.minutes)
    .filter((minutes) => Number.isFinite(minutes) && minutes > 0);

  const totalHours = durations.reduce((sum, minutes) => sum + minutes, 0) / 60;
  const avgDurationMin =
    durations.length > 0
      ? Math.round(durations.reduce((sum, minutes) => sum + minutes, 0) / durations.length)
      : null;
  const longestDurationMin =
    durations.length > 0 ? Math.round(Math.max(...durations)) : null;

  const cutoff30d = nowMs - 30 * DAY_MS;
  const last30 = startedRows.filter((row) => row.startedAtMs >= cutoff30d);
  const hoursLast30 =
    last30
      .map((row) => row.minutes)
      .filter((minutes) => Number.isFinite(minutes) && minutes > 0)
      .reduce((sum, minutes) => sum + minutes, 0) / 60;

  const byDayOfWeek = new Array(7).fill(0);
  const byHourOfDay = new Array(24).fill(0);
  const byMonthMap = new Map();

  for (const row of startedRows) {
    const date = new Date(row.startedAtMs);
    byDayOfWeek[date.getUTCDay()] += 1;
    byHourOfDay[date.getUTCHours()] += 1;
    const key = monthKeyOf(date);
    byMonthMap.set(key, (byMonthMap.get(key) || 0) + 1);
  }

  const monthLabels = buildMonthLabels(nowMs, 12);
  const byMonth = monthLabels.map((month) => ({
    month,
    count: byMonthMap.get(month) || 0,
  }));

  const durationHistogram = DURATION_BUCKETS.map((bucket) => ({
    label: bucket.label,
    min: bucket.min,
    max: bucket.max,
    count: durations.filter(
      (minutes) => minutes >= bucket.min && minutes < bucket.max,
    ).length,
  }));

  return {
    totalStreams: startedRows.length,
    totalHours: Math.round(totalHours * 10) / 10,
    avgDurationMin,
    longestDurationMin,
    streamsLast30Days: last30.length,
    hoursLast30Days: Math.round(hoursLast30 * 10) / 10,
    byDayOfWeek,
    byHourOfDay,
    byMonth,
    durationHistogram,
  };
}

module.exports = {
  DURATION_BUCKETS,
  buildChannelStats,
};
