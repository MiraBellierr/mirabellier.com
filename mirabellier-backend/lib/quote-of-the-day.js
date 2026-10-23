const axios = require("axios");
const https = require("https");

const { db } = require("./db");
const { S2C } = require("./websocket-events");

const BRAINYQUOTE_URL = "https://www.brainyquote.com/quote_of_the_day";
const HTTP_CACHE_TTL_MS = 60 * 60 * 1000;
const DAILY_FETCH_HOUR_UTC = readIntegerEnv(
  process.env.QUOTE_FETCH_HOUR_UTC,
  0,
  23,
  0,
);
const DAILY_FETCH_MINUTE_UTC = readIntegerEnv(
  process.env.QUOTE_FETCH_MINUTE_UTC,
  0,
  59,
  0,
);
const EXPECTED_CATEGORIES = [
  "Quote of the Day",
  "Love Quote of the Day",
  "Art Quote of the Day",
  "Nature Quote of the Day",
  "Funny Quote Of the Day",
];
const RSS_FEEDS = [
  {
    category: "Quote of the Day",
    url: "https://www.brainyquote.com/link/quotebr.rss",
  },
  {
    category: "Love Quote of the Day",
    url: "https://www.brainyquote.com/link/quotelo.rss",
  },
  {
    category: "Art Quote of the Day",
    url: "https://www.brainyquote.com/link/quotear.rss",
  },
  {
    category: "Nature Quote of the Day",
    url: "https://www.brainyquote.com/link/quotena.rss",
  },
  {
    category: "Funny Quote Of the Day",
    url: "https://www.brainyquote.com/link/quotefu.rss",
  },
];
const HTML_REQUEST_HEADER_VARIANTS = [
  { "User-Agent": "Mozilla/5.0 Codex/1.0" },
  {
    "User-Agent": "Mozilla/5.0 Codex/1.0",
    "Accept-Language": "en-US,en;q=0.9",
  },
  {
    "User-Agent": "Mozilla/5.0 Codex/1.0",
    Referer: "https://www.brainyquote.com/",
  },
];
const NAMED_HTML_ENTITIES = {
  amp: "&",
  apos: "'",
  copy: "(c)",
  gt: ">",
  hellip: "...",
  laquo: '"',
  ldquo: '"',
  lsquo: "'",
  lt: "<",
  mdash: "-",
  nbsp: " ",
  ndash: "-",
  quot: '"',
  raquo: '"',
  rdquo: '"',
  rsquo: "'",
  trade: "TM",
};

const selectQuoteSnapshotByDate = db.prepare(
  `SELECT *
   FROM quote_snapshots
   WHERE recordedDate = ?`,
);
const selectLatestQuoteSnapshots = db.prepare(
  `SELECT *
   FROM quote_snapshots
   ORDER BY recordedDate DESC`,
);
const upsertQuoteSnapshot = db.prepare(
  `INSERT INTO quote_snapshots (
    recordedDate,
    provider,
    sourceType,
    displayDate,
    publishedAt,
    fetchedAt,
    fallbackReason,
    quotesJson,
    createdAt,
    updatedAt
  ) VALUES (
    @recordedDate,
    @provider,
    @sourceType,
    @displayDate,
    @publishedAt,
    @fetchedAt,
    @fallbackReason,
    @quotesJson,
    @createdAt,
    @updatedAt
  )
  ON CONFLICT(recordedDate) DO UPDATE SET
    provider = excluded.provider,
    sourceType = excluded.sourceType,
    displayDate = excluded.displayDate,
    publishedAt = excluded.publishedAt,
    fetchedAt = excluded.fetchedAt,
    fallbackReason = excluded.fallbackReason,
    quotesJson = excluded.quotesJson,
    updatedAt = excluded.updatedAt`,
);

const inFlightRefreshByDate = new Map();
let schedulerStarted = false;
const QUOTE_REFRESH_RETRY_MS = 60 * 1000;
const MONTH_NAME_TO_NUMBER = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};
let scheduledDailyRefreshTimer = null;
let scheduledRetryRefreshTimer = null;

class QuoteSourceDateMismatchError extends Error {
  constructor(expectedRecordedDate, sourceRecordedDate = null) {
    super(
      sourceRecordedDate
        ? `Quote provider is still on ${sourceRecordedDate}; waiting for ${expectedRecordedDate}`
        : `Quote provider did not return a quote dated ${expectedRecordedDate}`,
    );
    this.name = "QuoteSourceDateMismatchError";
    this.expectedRecordedDate = expectedRecordedDate;
    this.sourceRecordedDate = sourceRecordedDate;
  }
}

function readIntegerEnv(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function getRecordedDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isValidRecordedDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function padDateNumber(value) {
  return String(value).padStart(2, "0");
}

function buildRecordedDateFromParts(year, month, day) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `${year}-${padDateNumber(month)}-${padDateNumber(day)}`;
}

function parseDisplayDateToRecordedDate(displayDate, fallbackRecordedDate) {
  const fallbackYear = Number.parseInt(
    String(fallbackRecordedDate || "").slice(0, 4),
    10,
  );
  const normalized = String(displayDate || "")
    .trim()
    .replace(/,/g, " ")
    .replace(/(\d)(st|nd|rd|th)\b/gi, "$1")
    .replace(/\s+/g, " ");
  const match = normalized.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/);

  if (!match) {
    return null;
  }

  const month = MONTH_NAME_TO_NUMBER[match[1].toLowerCase()];
  const day = Number.parseInt(match[2], 10);
  const year = match[3] ? Number.parseInt(match[3], 10) : fallbackYear;

  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) {
    return null;
  }

  return buildRecordedDateFromParts(year, month, day);
}

function parsePublishedAtToRecordedDate(value) {
  const parsed = new Date(String(value || ""));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return getRecordedDate(parsed);
}

function getPayloadSourceRecordedDate(payload, fallbackRecordedDate) {
  if (!payload) {
    return null;
  }

  if (payload.displayDate) {
    const parsedDisplayDate = parseDisplayDateToRecordedDate(
      payload.displayDate,
      fallbackRecordedDate,
    );
    if (parsedDisplayDate) {
      return parsedDisplayDate;
    }
  }

  const payloadPublishedDate = parsePublishedAtToRecordedDate(payload.publishedAt);
  if (payloadPublishedDate) {
    return payloadPublishedDate;
  }

  if (Array.isArray(payload.quotes)) {
    for (const entry of payload.quotes) {
      const entryPublishedDate = parsePublishedAtToRecordedDate(entry?.publishedAt);
      if (entryPublishedDate) {
        return entryPublishedDate;
      }
    }
  }

  return null;
}

function isPayloadFreshForRecordedDate(payload, recordedDate) {
  const sourceRecordedDate = getPayloadSourceRecordedDate(payload, recordedDate);
  return !sourceRecordedDate || sourceRecordedDate === recordedDate;
}

function assertPayloadFreshForRecordedDate(payload, recordedDate) {
  const sourceRecordedDate = getPayloadSourceRecordedDate(payload, recordedDate);

  if (sourceRecordedDate && sourceRecordedDate !== recordedDate) {
    throw new QuoteSourceDateMismatchError(recordedDate, sourceRecordedDate);
  }
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&([a-z]+);/gi, (match, entity) => {
      const normalized = entity.toLowerCase();
      return Object.prototype.hasOwnProperty.call(
        NAMED_HTML_ENTITIES,
        normalized,
      )
        ? NAMED_HTML_ENTITIES[normalized]
        : match;
    });
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function toAbsoluteUrl(value) {
  return new URL(String(value || ""), BRAINYQUOTE_URL).toString();
}

function normalizeQuoteText(value) {
  const normalized = stripTags(value).replace(/\s+/g, " ").trim();
  return normalized.replace(/^"(.*)"$/, "$1");
}

function buildCategoryKey(category) {
  return String(category || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getXmlTagValue(xml, tagName) {
  const match = String(xml || "").match(
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"),
  );
  return match ? decodeHtmlEntities(match[1]).trim() : "";
}

function buildPayload({
  sourceType,
  displayDate = null,
  quotes,
  publishedAt = null,
  recordedDate = null,
  fetchedAt = null,
  fallbackReason = null,
  stale = false,
  staleReason = null,
}) {
  const payload = {
    provider: "BrainyQuote",
    sourceType,
    displayDate,
    publishedAt,
    recordedDate,
    quotesCount: quotes.length,
    primaryQuote: quotes[0] || null,
    quotes,
    fetchedAt,
  };

  if (fallbackReason) {
    payload.fallbackReason = fallbackReason;
  }
  if (stale) {
    payload.stale = true;
  }
  if (staleReason) {
    payload.staleReason = staleReason;
  }

  return payload;
}

function parseQuotesJson(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapSnapshotRow(row) {
  if (!row) {
    return null;
  }

  return buildPayload({
    sourceType: row.sourceType,
    displayDate: row.displayDate || null,
    publishedAt: row.publishedAt || null,
    recordedDate: row.recordedDate,
    fetchedAt: row.fetchedAt,
    fallbackReason: row.fallbackReason || null,
    quotes: parseQuotesJson(row.quotesJson),
  });
}

function getQuoteSnapshotByDate(recordedDate) {
  return mapSnapshotRow(selectQuoteSnapshotByDate.get(recordedDate));
}

function getLatestQuoteSnapshot() {
  const rows = selectLatestQuoteSnapshots.all();

  for (const row of rows) {
    const snapshot = mapSnapshotRow(row);
    if (snapshot && isPayloadFreshForRecordedDate(snapshot, row.recordedDate)) {
      return snapshot;
    }
  }

  return null;
}

function saveQuoteSnapshot(payload, recordedDate = getRecordedDate()) {
  const now = new Date().toISOString();

  upsertQuoteSnapshot.run({
    recordedDate,
    provider: payload.provider || "BrainyQuote",
    sourceType: payload.sourceType,
    displayDate: payload.displayDate || null,
    publishedAt: payload.publishedAt || null,
    fetchedAt: payload.fetchedAt || now,
    fallbackReason: payload.fallbackReason || null,
    quotesJson: JSON.stringify(payload.quotes || []),
    createdAt: now,
    updatedAt: now,
  });

  return getQuoteSnapshotByDate(recordedDate);
}

function fetchHtmlViaHttps(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 Codex/1.0",
        },
      },
      (res) => {
        let body = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300) {
            resolve(body);
            return;
          }

          reject(
            new Error(
              `HTTPS fallback request failed with status ${res.statusCode || 0}`,
            ),
          );
        });
      },
    );

    req.setTimeout(15000, () => {
      req.destroy(new Error("HTTPS fallback request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

async function fetchQuotePageHtml() {
  let lastError = null;

  for (const headers of HTML_REQUEST_HEADER_VARIANTS) {
    try {
      const response = await axios.get(BRAINYQUOTE_URL, {
        timeout: 15000,
        headers,
      });
      return String(response.data || "");
    } catch (error) {
      lastError = error;
    }
  }

  try {
    return await fetchHtmlViaHttps(BRAINYQUOTE_URL);
  } catch (error) {
    lastError = error;
  }

  throw lastError || new Error("Failed to fetch BrainyQuote HTML");
}

function parseQuotesOfTheDayHtml(html) {
  const displayDateMatch = html.match(
    /<div class="qotdSubtInf">\s*([^<]+?)\s*<\/div>/i,
  );
  const sectionPattern =
    /<h2 class="qotd-h2">\s*([^<]+?)\s*<\/h2>\s*<a[^>]+href="([^"]+)"[^>]*title="view quote"[^>]*>([\s\S]*?)<\/a>\s*<a[^>]+href="([^"]+)"[^>]*title="view author"[^>]*>([\s\S]*?)<\/a>/gi;

  const quotesByCategory = new Map();
  let sectionMatch;

  while ((sectionMatch = sectionPattern.exec(String(html || "")))) {
    const category = stripTags(sectionMatch[1]);
    if (!EXPECTED_CATEGORIES.includes(category)) {
      continue;
    }

    const quote = normalizeQuoteText(sectionMatch[3]);
    const author = stripTags(sectionMatch[5]);

    if (!quote || !author) {
      continue;
    }

    quotesByCategory.set(category, {
      key: buildCategoryKey(category),
      category,
      quote,
      author,
      quoteUrl: toAbsoluteUrl(sectionMatch[2]),
      authorUrl: toAbsoluteUrl(sectionMatch[4]),
      sourceUrl: BRAINYQUOTE_URL,
    });
  }

  const quotes = EXPECTED_CATEGORIES.map((category) =>
    quotesByCategory.get(category),
  ).filter(Boolean);

  if (quotes.length !== EXPECTED_CATEGORIES.length) {
    const missingCategories = EXPECTED_CATEGORIES.filter(
      (category) => !quotesByCategory.has(category),
    );
    throw new Error(
      `Missing quote sections in BrainyQuote HTML: ${missingCategories.join(", ")}`,
    );
  }

  return buildPayload({
    sourceType: "html",
    displayDate: displayDateMatch ? stripTags(displayDateMatch[1]) : null,
    quotes,
  });
}

async function fetchQuotesOfTheDayFromRss() {
  const quotes = [];

  for (const feed of RSS_FEEDS) {
    const response = await axios.get(feed.url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 Codex/1.0",
        Accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
    });

    const firstItemMatch = String(response.data || "").match(
      /<item>([\s\S]*?)<\/item>/i,
    );
    if (!firstItemMatch) {
      throw new Error(`RSS feed for ${feed.category} did not include any items`);
    }

    const itemXml = firstItemMatch[1];
    const quote = normalizeQuoteText(getXmlTagValue(itemXml, "description"));
    const author = stripTags(getXmlTagValue(itemXml, "title"));
    const authorUrl = getXmlTagValue(itemXml, "link");
    const publishedAt = getXmlTagValue(itemXml, "pubDate");

    if (!quote || !author) {
      throw new Error(`RSS feed for ${feed.category} was missing quote content`);
    }

    quotes.push({
      key: buildCategoryKey(feed.category),
      category: feed.category,
      quote,
      author,
      quoteUrl: null,
      authorUrl: authorUrl || null,
      sourceUrl: feed.url,
      publishedAt: publishedAt || null,
    });
  }

  return buildPayload({
    sourceType: "rss",
    publishedAt: quotes[0] ? quotes[0].publishedAt : null,
    quotes,
  });
}

async function fetchQuotesOfTheDay() {
  const fetchedAt = new Date().toISOString();

  try {
    const html = await fetchQuotePageHtml();
    return {
      ...parseQuotesOfTheDayHtml(html),
      fetchedAt,
    };
  } catch (htmlError) {
    return {
      ...(await fetchQuotesOfTheDayFromRss()),
      fetchedAt,
      fallbackReason:
        htmlError instanceof Error ? htmlError.message : "HTML scrape failed",
    };
  }
}

async function refreshQuoteSnapshot(
  recordedDate = getRecordedDate(),
  options = {},
) {
  if (!options.force) {
    const stored = getQuoteSnapshotByDate(recordedDate);
    if (stored && isPayloadFreshForRecordedDate(stored, recordedDate)) {
      return stored;
    }
  }

  const existingRefresh = inFlightRefreshByDate.get(recordedDate);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshPromise = (async () => {
    try {
      const freshQuotes = await fetchQuotesOfTheDay();
      assertPayloadFreshForRecordedDate(freshQuotes, recordedDate);
      return saveQuoteSnapshot(freshQuotes, recordedDate);
    } catch (error) {
      const stored = getQuoteSnapshotByDate(recordedDate);
      if (stored && isPayloadFreshForRecordedDate(stored, recordedDate)) {
        return stored;
      }
      throw error;
    }
  })();
  inFlightRefreshByDate.set(recordedDate, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    if (inFlightRefreshByDate.get(recordedDate) === refreshPromise) {
      inFlightRefreshByDate.delete(recordedDate);
    }
  }
}

async function ensureQuoteSnapshotForDate(
  recordedDate = getRecordedDate(),
  options = {},
) {
  const stored = getQuoteSnapshotByDate(recordedDate);
  if (!options.force && stored && isPayloadFreshForRecordedDate(stored, recordedDate)) {
    return stored;
  }

  return refreshQuoteSnapshot(recordedDate, options);
}

async function getQuotesOfTheDay(options = {}) {
  const requestedDate = options.recordedDate;

  if (requestedDate) {
    const stored = getQuoteSnapshotByDate(requestedDate);
    if (stored && isPayloadFreshForRecordedDate(stored, requestedDate)) {
      return stored;
    }

    if (requestedDate !== getRecordedDate()) {
      return null;
    }
  }

  try {
    return await ensureQuoteSnapshotForDate(requestedDate || getRecordedDate());
  } catch (error) {
    const latest = getLatestQuoteSnapshot();
    if (latest) {
      return {
        ...latest,
        stale: true,
        staleReason:
          error instanceof Error ? error.message : "refresh failed",
      };
    }
    throw error;
  }
}

function getDelayUntilNextDailyFetch(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(DAILY_FETCH_HOUR_UTC, DAILY_FETCH_MINUTE_UTC, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return Math.max(next.getTime() - now.getTime(), 60 * 1000);
}

function clearRetryRefreshTimer() {
  if (scheduledRetryRefreshTimer) {
    clearTimeout(scheduledRetryRefreshTimer);
    scheduledRetryRefreshTimer = null;
  }
}

function scheduleRetryFetch() {
  if (scheduledRetryRefreshTimer) {
    return;
  }

  scheduledRetryRefreshTimer = setTimeout(async () => {
    scheduledRetryRefreshTimer = null;
    await runScheduledQuoteRefresh("retry");
  }, QUOTE_REFRESH_RETRY_MS);

  if (typeof scheduledRetryRefreshTimer.unref === "function") {
    scheduledRetryRefreshTimer.unref();
  }
}

async function runScheduledQuoteRefresh(trigger) {
  const recordedDate = getRecordedDate();

  try {
    await ensureQuoteSnapshotForDate(recordedDate, { force: true });
    clearRetryRefreshTimer();
    console.log(
      `[quotes] ${
        trigger === "startup"
          ? "Refreshed"
          : trigger === "retry"
            ? "Retried and refreshed"
            : "Stored"
      } latest quote snapshot for ${recordedDate}`,
    );
    const ws = require("./websocket-server").getWebSocketManager();
    if (ws) ws.broadcast({ type: S2C.QUOTES_NEW_DAY, data: { recordedDate } });
  } catch (error) {
    console.warn(
      `[quotes] ${
        trigger === "startup"
          ? "Startup"
          : trigger === "retry"
            ? "Retry"
            : "Daily"
      } quote fetch failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    scheduleRetryFetch();
  }
}

function scheduleNextDailyFetch() {
  if (scheduledDailyRefreshTimer) {
    clearTimeout(scheduledDailyRefreshTimer);
  }

  scheduledDailyRefreshTimer = setTimeout(async () => {
    scheduledDailyRefreshTimer = null;
    scheduleNextDailyFetch();
    await runScheduledQuoteRefresh("daily");
  }, getDelayUntilNextDailyFetch());

  if (typeof scheduledDailyRefreshTimer.unref === "function") {
    scheduledDailyRefreshTimer.unref();
  }
}

function startQuoteOfTheDayScheduler() {
  if (schedulerStarted) {
    return;
  }
  schedulerStarted = true;
  // Arm the timer first so a startup fetch cannot skip the UTC day rollover.
  scheduleNextDailyFetch();

  void runScheduledQuoteRefresh("startup");
}

module.exports = {
  BRAINYQUOTE_URL,
  DAILY_FETCH_HOUR_UTC,
  DAILY_FETCH_MINUTE_UTC,
  EXPECTED_CATEGORIES,
  HTTP_CACHE_TTL_MS,
  RSS_FEEDS,
  ensureQuoteSnapshotForDate,
  fetchQuotesOfTheDay,
  fetchQuotesOfTheDayFromRss,
  getLatestQuoteSnapshot,
  getQuoteSnapshotByDate,
  getQuotesOfTheDay,
  getRecordedDate,
  isValidRecordedDate,
  parseQuotesOfTheDayHtml,
  saveQuoteSnapshot,
  startQuoteOfTheDayScheduler,
};
