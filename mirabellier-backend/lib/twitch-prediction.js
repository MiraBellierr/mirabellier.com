const WEEK_MINUTES = 7 * 24 * 60;
const DAY_MINUTES = 24 * 60;
const SLOT_MINUTES = 15;
const SLOTS_PER_DAY = DAY_MINUTES / SLOT_MINUTES; // 96
const TOTAL_SLOTS = 7 * SLOTS_PER_DAY; // 672

const DEFAULT_BANDWIDTH_MINUTES = 45;
const DEFAULT_DECAY_HALF_LIFE_DAYS = 60;
const DEFAULT_WINDOW_MINUTES = 45;
const MIN_SAMPLES_FOR_PREDICTION = 2;
const MIN_GAPS_FOR_MEDIAN = 3;
const DEFAULT_MEDIAN_GAP_HOURS = 72;

const SUPPRESSION_HALF_LIFE_MS = 6 * 60 * 60 * 1000;
const SUPPRESSION_FLOOR = 0.25;
const PEAK_THRESHOLD_RATIO = 0.15;

function readOptions(options = {}) {
  const bandwidth = Number(options.bandwidthMinutes);
  const decayHalfLifeDays = Number(options.decayHalfLifeDays);
  const windowMinutes = Number(options.windowMinutes);

  return {
    bandwidthMinutes:
      Number.isFinite(bandwidth) && bandwidth > 0
        ? bandwidth
        : DEFAULT_BANDWIDTH_MINUTES,
    decayHalfLifeDays:
      Number.isFinite(decayHalfLifeDays) && decayHalfLifeDays > 0
        ? decayHalfLifeDays
        : DEFAULT_DECAY_HALF_LIFE_DAYS,
    windowMinutes:
      Number.isFinite(windowMinutes) && windowMinutes > 0
        ? windowMinutes
        : DEFAULT_WINDOW_MINUTES,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function weekMinuteOf(timestampMs) {
  const date = new Date(timestampMs);
  return (
    date.getUTCDay() * DAY_MINUTES +
    date.getUTCHours() * 60 +
    date.getUTCMinutes()
  );
}

function circularMinuteDistance(a, b) {
  const diff = Math.abs(a - b) % WEEK_MINUTES;
  return Math.min(diff, WEEK_MINUTES - diff);
}

function gaussian(x, sigma) {
  const exponent = -(x * x) / (2 * sigma * sigma);
  return Math.exp(exponent);
}

function normalizeStartTimes(events) {
  return events
    .map((event) => Number(event.startedAtMs))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
}

function computeDecayWeight(ageMs, halfLifeDays, nowMs) {
  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
  const ageDays = clamp((nowMs - ageMs) / (24 * 60 * 60 * 1000), 0, Infinity);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function computeWeekMinuteKernel(startTimes, options, nowMs) {
  const weights = startTimes.map((timestampMs) =>
    computeDecayWeight(timestampMs, options.decayHalfLifeDays, nowMs),
  );
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;

  const sigma = options.bandwidthMinutes;
  const radiusMinutes = sigma * 3;
  const radiusSlots = Math.ceil(radiusMinutes / SLOT_MINUTES);

  const density = new Array(TOTAL_SLOTS).fill(0);

  startTimes.forEach((timestampMs, index) => {
    const center = weekMinuteOf(timestampMs);
    const weight = weights[index] / weightTotal;

    for (let offset = -radiusSlots; offset <= radiusSlots; offset += 1) {
      const slotIndex =
        ((Math.floor(center / SLOT_MINUTES) + offset) % TOTAL_SLOTS + TOTAL_SLOTS) %
        TOTAL_SLOTS;
      const sampleMinute = slotIndex * SLOT_MINUTES;
      const distance = circularMinuteDistance(sampleMinute, center);
      if (distance > radiusMinutes) continue;
      density[slotIndex] += weight * gaussian(distance, sigma);
    }
  });

  return density;
}

function computeMedianGapHours(startTimes, nowMs) {
  if (startTimes.length < MIN_GAPS_FOR_MEDIAN) {
    return DEFAULT_MEDIAN_GAP_HOURS;
  }

  const gaps = [];
  for (let index = 1; index < startTimes.length; index += 1) {
    const gapMs = startTimes[index] - startTimes[index - 1];
    if (gapMs > 0) {
      gaps.push(gapMs);
    }
  }
  gaps.sort((left, right) => left - right);

  if (gaps.length === 0) {
    return DEFAULT_MEDIAN_GAP_HOURS;
  }

  const mid = Math.floor(gaps.length / 2);
  const medianGapMs =
    gaps.length % 2 === 0
      ? (gaps[mid - 1] + gaps[mid]) / 2
      : gaps[mid];
  return medianGapMs / (60 * 60 * 1000);
}

function computeRecencySuppression(deltaMs) {
  const clampedDelta = clamp(deltaMs, 0, Infinity);
  const scaled = clampedDelta / SUPPRESSION_HALF_LIFE_MS;
  const recovery = Math.tanh(scaled);
  return SUPPRESSION_FLOOR + (1 - SUPPRESSION_FLOOR) * recovery;
}

function lastStreamEndMs(events, startTimes) {
  const ends = events
    .map((event) => Number(event.endedAtMs))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (ends.length > 0) {
    return ends[ends.length - 1];
  }

  return startTimes.length > 0 ? startTimes[startTimes.length - 1] : null;
}

function medianDurationMinutes(events) {
  const durations = events
    .map((event) => {
      if (Number.isFinite(Number(event.durationMinutes))) {
        return Number(event.durationMinutes);
      }
      const startedAtMs = Number(event.startedAtMs);
      const endedAtMs = Number(event.endedAtMs);
      if (
        Number.isFinite(startedAtMs) &&
        Number.isFinite(endedAtMs) &&
        endedAtMs > startedAtMs
      ) {
        return (endedAtMs - startedAtMs) / (60 * 1000);
      }
      return null;
    })
    .filter((duration) => Number.isFinite(duration) && duration > 0)
    .sort((left, right) => left - right);

  if (durations.length === 0) {
    return null;
  }

  const mid = Math.floor(durations.length / 2);
  return durations.length % 2 === 0
    ? Math.round((durations[mid - 1] + durations[mid]) / 2)
    : Math.round(durations[mid]);
}

function averageStreamsPerWeek(startTimes) {
  if (startTimes.length < 2) {
    return startTimes.length;
  }

  const spanMs = startTimes[startTimes.length - 1] - startTimes[0];
  const spanWeeks = spanMs / (WEEK_MINUTES * 60 * 1000);
  if (spanWeeks <= 0) {
    return startTimes.length;
  }

  return startTimes.length / spanWeeks;
}

function buildHeatmap(density) {
  const maxDensity = density.reduce(
    (max, value) => Math.max(max, value),
    0,
  );

  if (maxDensity <= 0) {
    return density.map(() => 0);
  }

  return density.map((value) => value / maxDensity);
}
function interpolateDensity(density, weekMinute) {
  const position = weekMinute / SLOT_MINUTES;
  const lowerIndex = Math.floor(position);
  const upperIndex = (lowerIndex + 1) % TOTAL_SLOTS;
  const fraction = position - lowerIndex;
  return (
    density[lowerIndex % TOTAL_SLOTS] * (1 - fraction) +
    density[upperIndex] * fraction
  );
}

function buildWeeklyCurve(density, lastEndMs, nowMs, windowSlots) {
  const slotNow = Math.floor(
    nowMs / (SLOT_MINUTES * 60 * 1000),
  );
  const firstSlotMs = slotNow * SLOT_MINUTES * 60 * 1000;

  const scores = new Array(TOTAL_SLOTS);
  for (let index = 0; index < TOTAL_SLOTS; index += 1) {
    const slotMs = firstSlotMs + index * SLOT_MINUTES * 60 * 1000;
    const weekMinute = weekMinuteOf(slotMs);
    const densitySlot = Math.floor(weekMinute / SLOT_MINUTES);
    const suppression = lastEndMs
      ? computeRecencySuppression(slotMs - lastEndMs)
      : 1;
    scores[index] = density[densitySlot] * suppression;
  }

  const total = scores.reduce((sum, score) => sum + score, 0);

  if (total <= 0) {
    return { curve: [], peak: null };
  }

  const curve = scores.map((score, index) => ({
    atMs: firstSlotMs + index * SLOT_MINUTES * 60 * 1000,
    p: score / total,
  }));

  const stepMs = 5 * 60 * 1000;
  const fineCount = Math.round((WEEK_MINUTES * 60 * 1000) / stepMs);
  const windowSteps = Math.max(
    1,
    Math.round((windowSlots * SLOT_MINUTES * 60 * 1000) / stepMs),
  );

  const extendedScores = new Array(fineCount + 2 * windowSteps);
  const extendedTimes = new Array(fineCount + 2 * windowSteps);
  for (let k = -windowSteps; k < fineCount + windowSteps; k += 1) {
    const tMs = nowMs + k * stepMs;
    const weekMinute = weekMinuteOf(tMs);
    const suppression = lastEndMs
      ? computeRecencySuppression(tMs - lastEndMs)
      : 1;
    const index = k + windowSteps;
    extendedTimes[index] = tMs;
    extendedScores[index] = interpolateDensity(density, weekMinute) * suppression;
  }

  const windowMasses = new Array(fineCount);
  let fineTotal = 0;
  let maxMass = 0;
  for (let k = 0; k < fineCount; k += 1) {
    fineTotal += extendedScores[k + windowSteps];
    let mass = 0;
    for (let offset = -windowSteps; offset <= windowSteps; offset += 1) {
      mass += extendedScores[k + windowSteps + offset];
    }
    windowMasses[k] = mass;
    if (mass > maxMass) {
      maxMass = mass;
    }
  }

  if (fineTotal <= 0) {
    return { curve, peak: null };
  }

  let peak = null;
  for (let k = 0; k < fineCount; k += 1) {
    const previous = k > 0 ? windowMasses[k - 1] : windowMasses[k];
    const next = k + 1 < fineCount ? windowMasses[k + 1] : windowMasses[k];
    if (windowMasses[k] < previous || windowMasses[k] < next) continue;
    if (windowMasses[k] < maxMass * PEAK_THRESHOLD_RATIO) continue;

    let weightedSum = 0;
    let massSum = 0;
    for (let offset = -windowSteps; offset <= windowSteps; offset += 1) {
      const index = k + windowSteps + offset;
      weightedSum += extendedScores[index] * extendedTimes[index];
      massSum += extendedScores[index];
    }

    const atMs = massSum > 0 ? weightedSum / massSum : nowMs + k * stepMs;
    if (atMs <= nowMs) continue;

    peak = {
      atMs,
      mass: windowMasses[k] / fineTotal,
    };
    break;
  }

  return { curve, peak };
}

function buildPrediction(events, options = {}) {
  const resolvedOptions = readOptions(options);
  const nowMs = Number(options.nowMs) || Date.now();

  const startTimes = normalizeStartTimes(events);
  const lastStartMs = startTimes.length > 0 ? startTimes[startTimes.length - 1] : null;
  const lastEndMs = lastStreamEndMs(events, startTimes);

  const medianGapHours = computeMedianGapHours(startTimes, nowMs);
  const medianDuration = medianDurationMinutes(events);
  const streamsPerWeek = averageStreamsPerWeek(startTimes);

  if (startTimes.length < MIN_SAMPLES_FOR_PREDICTION) {
    return {
      nextStartAt: null,
      windowMinutes: resolvedOptions.windowMinutes,
      confidence: null,
      curve: [],
      heatmap: new Array(TOTAL_SLOTS).fill(0),
      avgStreamsPerWeek: streamsPerWeek,
      medianGapHours,
      medianDurationMinutes: medianDuration,
      sampleCount: startTimes.length,
      lastStreamAt: lastStartMs,
      reason: "insufficient-data",
    };
  }

  const density = computeWeekMinuteKernel(startTimes, resolvedOptions, nowMs);
  const windowSlots = Math.max(1, Math.round(resolvedOptions.windowMinutes / SLOT_MINUTES));
  const { curve, peak } = buildWeeklyCurve(density, lastEndMs, nowMs, windowSlots);

  const prediction = {
    nextStartAt: peak ? Math.round(peak.atMs / (60 * 1000)) * 60 * 1000 : null,
    windowMinutes: resolvedOptions.windowMinutes,
    confidence: peak ? peak.mass : null,
    curve,
    heatmap: buildHeatmap(density),
    avgStreamsPerWeek: streamsPerWeek,
    medianGapHours,
    medianDurationMinutes: medianDuration,
    sampleCount: startTimes.length,
    lastStreamAt: lastStartMs,
    reason: peak ? null : "no-peak",
  };

  return prediction;
}

module.exports = {
  DEFAULT_BANDWIDTH_MINUTES,
  DEFAULT_DECAY_HALF_LIFE_DAYS,
  SLOT_MINUTES,
  TOTAL_SLOTS,
  buildPrediction,
  circularMinuteDistance,
  computeMedianGapHours,
  computeRecencySuppression,
  medianDurationMinutes,
  weekMinuteOf,
};
