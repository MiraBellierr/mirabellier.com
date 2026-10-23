const fs = require("fs");
const path = require("path");

const { cookieHeaderForHost, cookieFilePathIfExists } = require("./netscape-cookies");

const TIKTOK_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const TIKTOK_PAGE_TIMEOUT_MS = 15000;
const TIKTOK_OEMBED_TIMEOUT_MS = 5000;

const TIKTOK_LIST_PATH = path.join(__dirname, "..", "data", "tiktok-videos.json");

const TIKTOK_COOKIES_FILE =
  process.env.TIKTOK_COOKIES_FILE ||
  path.join(__dirname, "..", "data", "tiktok-cookies.txt");

function tikTokCookieFilePath() {
  return cookieFilePathIfExists(TIKTOK_COOKIES_FILE);
}

function readTikTokCookieFile() {
  const fileCookies = cookieHeaderForHost(TIKTOK_COOKIES_FILE, "tiktok.com");
  const envCookie = String(process.env.TIKTOK_TTWID || "").trim();
  if (!fileCookies && !envCookie) return "";
  const parts = [];
  if (fileCookies) parts.push(fileCookies);
  if (envCookie && !fileCookies.includes(`ttwid=${envCookie}`)) {
    parts.push(`ttwid=${envCookie}`);
  }
  return parts.join("; ");
}

function buildTikTokHeaders(extra = {}) {
  const headers = {
    "user-agent": TIKTOK_USER_AGENT,
    "accept-language": "en-US,en;q=0.9",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...extra,
  };

  const merged = readTikTokCookieFile();
  if (merged) headers.cookie = merged;

  return headers;
}

function normalizeTikTokUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  let parsed = null;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "tiktok.com" && !hostname.endsWith(".tiktok.com")) {
    return null;
  }

  return parsed;
}

function extractTikTokVideoId(url) {
  const match = String(url.pathname || "").match(/\/video\/(\d+)/i);
  return match ? match[1] : null;
}

function unescapeTikTokUrl(raw) {
  if (typeof raw !== "string") return raw;
  return raw
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u0025/gi, "%");
}

function extractUniversalData(html) {
  const match = String(html || "").match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractSigiState(html) {
  const htmlString = String(html || "");
  const keyIndex = htmlString.indexOf("SIGI_STATE");
  if (keyIndex === -1) return null;

  const eqIndex = htmlString.indexOf("=", keyIndex);
  if (eqIndex === -1) return null;

  const start = htmlString.indexOf("{", eqIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < htmlString.length; i += 1) {
    const char = htmlString[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(htmlString.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function findItemStruct(universal, sigi, videoId) {
  if (universal) {
    const item =
      universal?.["__DEFAULT_SCOPE__"]?.["webapp.video-detail"]?.itemInfo
        ?.itemStruct;
    if (item) return item;
  }

  if (sigi && videoId) {
    const item = sigi?.ItemModule?.[videoId];
    if (item) return item;
  }

  return null;
}

function pickPlayAddr(video) {
  if (!video || typeof video !== "object") return null;

  const candidates = [];
  if (typeof video.playAddr === "string" && video.playAddr) {
    candidates.push(video.playAddr);
  }
  if (typeof video.downloadAddr === "string" && video.downloadAddr) {
    candidates.push(video.downloadAddr);
  }

  const bitrates = Array.isArray(video.bitrateInfo) ? video.bitrateInfo : [];
  const sorted = [...bitrates].sort(
    (a, b) =>
      (Number(b.Bitrate) || Number(b.bitrate) || 0) -
      (Number(a.Bitrate) || Number(a.bitrate) || 0),
  );

  for (const entry of sorted) {
    const direct =
      entry.PlayAddr?.UrlList?.[0] ||
      entry.PlayAddr?.url_list?.[0] ||
      entry.play_addr?.UrlList?.[0] ||
      entry.play_addr?.url_list?.[0] ||
      (typeof entry.playAddr === "string" ? entry.playAddr : null);
    if (typeof direct === "string" && direct) candidates.push(direct);
  }

  for (const candidate of candidates) {
    const cleaned = unescapeTikTokUrl(candidate);
    if (cleaned) return cleaned;
  }

  return null;
}

function normalizeUsername(raw) {
  return String(raw || "").trim().replace(/^@/, "");
}

function extractMetaFromItem(item) {
  if (!item || typeof item !== "object") return null;

  const author = item.author && typeof item.author === "object" ? item.author : {};
  const username = normalizeUsername(author.uniqueId || author.username || "");
  const nickname = String(author.nickname || "").trim();
  const verified = author.verified === true;
  const avatarUrl = unescapeTikTokUrl(
    author.avatarLarger || author.avatarMedium || author.avatarThumb || "",
  );
  const caption = String(item.desc || "").trim();

  const tags = [];
  const textExtra = Array.isArray(item.textExtra) ? item.textExtra : [];
  for (const entry of textExtra) {
    const tag = String(entry?.hashtagName || "").trim().replace(/^#/, "");
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  const challenges = Array.isArray(item.challenges) ? item.challenges : [];
  for (const entry of challenges) {
    const tag = String(entry?.title || "").trim().replace(/^#/, "");
    if (tag && !tags.includes(tag)) tags.push(tag);
  }

  const video = item.video && typeof item.video === "object" ? item.video : {};
  const playAddr = pickPlayAddr(video);
  const duration = Number(video.duration);
  const durationSeconds =
    Number.isFinite(duration) && duration > 0 ? duration : null;
  const thumbnailUrl =
    unescapeTikTokUrl(String(video.cover || video.originCover || "").trim()) ||
    null;

  return {
    username,
    nickname,
    verified,
    avatarUrl: avatarUrl || null,
    caption,
    tags,
    playAddr,
    durationSeconds,
    thumbnailUrl,
  };
}

function parseTikTokPage(html, videoId) {
  const universal = extractUniversalData(html);
  const sigi = extractSigiState(html);
  const item = findItemStruct(universal, sigi, videoId);
  if (!item) return null;
  return extractMetaFromItem(item);
}

async function fetchTikTokPage(url) {
  const res = await fetch(url, {
    headers: buildTikTokHeaders(),
    redirect: "follow",
    signal: AbortSignal.timeout(TIKTOK_PAGE_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return res.text();
}

async function fetchTikTokOembed(url) {
  const res = await fetch(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    {
      headers: buildTikTokHeaders({ accept: "application/json" }),
      signal: AbortSignal.timeout(TIKTOK_OEMBED_TIMEOUT_MS),
    },
  );
  if (!res.ok) return null;
  try {
    const json = await res.json();
    const authorUrlMatch = String(json.author_url || "").match(
      /tiktok\.com\/@([^/?#]+)/i,
    );
    return {
      username: normalizeUsername(json.author_name || ""),
      handle: authorUrlMatch ? authorUrlMatch[1] : "",
      caption: String(json.title || "").trim(),
      thumbnailUrl: String(json.thumbnail_url || "").trim() || null,
    };
  } catch {
    return null;
  }
}

function extractHashtagsFromText(raw) {
  const text = String(raw || "");
  const tags = [];
  const matches = text.matchAll(/#([\p{L}\p{N}_]+)/gu);
  for (const match of matches) {
    const tag = match[1];
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

// The web home page ("For You") renders from TikTok's item_list JSON, not the
// server HTML — the HTML shell carries no video items at all. This mirrors the
// web client's own query string closely enough to get real items back.
const TIKTOK_FEED_TIMEOUT_MS = 15000;
const TIKTOK_FEED_DEFAULT_COUNT = 12;

function buildTikTokFeedUrl(count) {
  const params = new URLSearchParams({
    aid: "1988",
    app_language: "en",
    app_name: "tiktok_web",
    browser_language: "en-US",
    browser_name: "Mozilla",
    browser_online: "true",
    browser_platform: "Win32",
    channel: "tiktok_web",
    cookie_enabled: "true",
    count: String(Math.max(1, Math.min(30, Number(count) || TIKTOK_FEED_DEFAULT_COUNT))),
    cursor: "0",
    device_platform: "web_pc",
    focus_state: "true",
    from_page: "fyp",
    history_len: "1",
    is_fullscreen: "false",
    is_page_visible: "true",
    language: "en",
    os: "windows",
    region: "US",
    screen_height: "1080",
    screen_width: "1920",
    tz_name: "UTC",
  });
  return `https://www.tiktok.com/api/recommend/item_list/?${params.toString()}`;
}

// Normalizes one item_list entry into the same shape `fetchTikTokMetadata`
// returns, so the importer treats feed items exactly like pasted links.
function normalizeFeedItem(item) {
  const meta = extractMetaFromItem(item);
  if (!meta || !meta.username) return null;

  const videoId = String(item?.id || "").trim();
  const handle = String(item?.author?.uniqueId || "").trim();
  if (!videoId) return null;

  return {
    url: `https://www.tiktok.com/@${handle || "unknown"}/video/${videoId}`,
    videoId,
    username: meta.nickname || meta.username,
    nickname: meta.nickname,
    verified: meta.verified,
    handle,
    avatarUrl: meta.avatarUrl,
    caption: meta.caption,
    tags: meta.tags.length > 0 ? meta.tags : extractHashtagsFromText(meta.caption),
    durationSeconds: meta.durationSeconds,
    playAddr: meta.playAddr,
    thumbnailUrl: meta.thumbnailUrl,
    scrapeError: null,
  };
}

/**
 * Fetch the TikTok web home feed ("For You") and return its items normalized
 * like `fetchTikTokMetadata` results. Optionally restrict to a single author
 * (the home feed only ever shows *some* creator's clips for a given session,
 * so this is how the scheduler tracks "the first video" for one person).
 * Returns `{ error }` instead of throwing when TikTok refuses the request.
 */
async function fetchTikTokHomeFeed(options = {}) {
  const count = options.count || TIKTOK_FEED_DEFAULT_COUNT;
  const author = normalizeUsername(options.author || "");
  let json = null;

  try {
    const res = await fetch(buildTikTokFeedUrl(count), {
      headers: buildTikTokHeaders({
        accept: "application/json, text/plain, */*",
        referer: "https://www.tiktok.com/",
      }),
      redirect: "follow",
      signal: AbortSignal.timeout(TIKTOK_FEED_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        error: `TikTok feed refused the request (${res.status})`,
        items: [],
      };
    }
    // TikTok answers a signature-less request with an empty body, and serves a
    // "Please wait..." WAF challenge page once the IP is flagged. Both parse as
    // JSON failures, so report what actually happened rather than a network
    // error. yt-dlp (see social.js) is the dependable path for this data.
    const text = await res.text();
    if (/slardar|_wafchallengeid|Please wait/i.test(text)) {
      return {
        error:
          "TikTok served its WAF challenge page to this server — poll a specific profile with TIKTOK_FEED_AUTHOR instead",
        items: [],
      };
    }
    try {
      json = JSON.parse(text);
    } catch {
      return {
        error:
          "TikTok returned an empty feed response (the recommend endpoint needs a signed request) — set TIKTOK_FEED_AUTHOR to use yt-dlp instead",
        items: [],
      };
    }
  } catch (err) {
    return {
      error:
        err?.name === "TimeoutError"
          ? "Timed out loading the TikTok home feed"
          : "Could not reach the TikTok home feed",
      items: [],
    };
  }

  const rawItems = Array.isArray(json?.itemList) ? json.itemList : [];
  const items = rawItems
    .map(normalizeFeedItem)
    .filter(Boolean)
    .filter((item) => !author || item.handle.toLowerCase() === author.toLowerCase());

  if (items.length === 0 && !author && rawItems.length === 0) {
    return {
      error:
        "TikTok returned an empty home feed (the recommend endpoint needs a signed request) — set TIKTOK_FEED_AUTHOR to use yt-dlp instead",
      items: [],
    };
  }

  return { items, hasMore: json?.hasMore === true };
}

// "The first video on the TikTok home page" = the top item of the live For You
// feed. Returns null when TikTok serves an empty feed.
async function fetchFirstTikTokHomeVideo(options = {}) {
  const feed = await fetchTikTokHomeFeed(options);
  if (feed.error) return { error: feed.error, item: null };
  return { item: feed.items[0] || null };
}

async function fetchTikTokUserInfo(username) {
  const clean = normalizeUsername(username);
  if (!clean) return null;

  // Try the share JSON endpoint first (returns avatarLarger directly).
  try {
    const res = await fetch(
      `https://www.tiktok.com/node/share/user/@${encodeURIComponent(clean)}`,
      {
        headers: buildTikTokHeaders({ accept: "application/json" }),
        redirect: "follow",
        signal: AbortSignal.timeout(TIKTOK_PAGE_TIMEOUT_MS),
      },
    );
    if (res.ok) {
      const data = await res.json();
      const user = data?.userInfo?.user;
      const avatarUrl = user
        ? unescapeTikTokUrl(
            String(
              user.avatarLarger || user.avatarMedium || user.avatarThumb || "",
            ),
          ) || null
        : null;
      if (avatarUrl) return { avatarUrl };
    }
  } catch {
    // fall through to the profile page scrape
  }

  // Fall back to the profile page's og:image meta tag.
  try {
    const res = await fetch(
      `https://www.tiktok.com/@${encodeURIComponent(clean)}`,
      {
        headers: buildTikTokHeaders(),
        redirect: "follow",
        signal: AbortSignal.timeout(TIKTOK_PAGE_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const html = await res.text();
    const match = String(html).match(
      /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i,
    );
    const avatarUrl = match
      ? unescapeTikTokUrl(match[1]) || null
      : null;
    return avatarUrl ? { avatarUrl } : null;
  } catch {
    return null;
  }
}

async function fetchTikTokMetadata(rawUrl) {
  const url = normalizeTikTokUrl(rawUrl);
  if (!url) return { error: "Invalid TikTok URL" };

  const videoId = extractTikTokVideoId(url);

  let scraped = null;
  let scrapeError = null;
  try {
    const html = await fetchTikTokPage(url);
    if (html) {
      scraped = parseTikTokPage(html, videoId);
      if (!scraped) scrapeError = "TikTok page did not contain video data";
    } else {
      scrapeError = "TikTok refused the page request";
    }
  } catch (err) {
    scrapeError =
      err?.name === "TimeoutError"
        ? "Timed out contacting TikTok"
        : "Could not reach TikTok";
  }

  let oembed = null;
  try {
    oembed = await fetchTikTokOembed(url);
  } catch {
    oembed = null;
  }

  if (!scraped && !oembed) {
    return { error: scrapeError || "Could not load TikTok video data" };
  }

  const handle = scraped?.username || oembed?.handle || "";
  const username =
    scraped?.nickname ||
    scraped?.username ||
    oembed?.username ||
    handle ||
    "";
  const caption = scraped?.caption || oembed?.caption || "";
  let avatarUrl = scraped?.avatarUrl || null;
  let tags = scraped?.tags || [];

  if (!avatarUrl || tags.length === 0) {
    const userInfo = await fetchTikTokUserInfo(handle || username);
    if (userInfo?.avatarUrl && !avatarUrl) avatarUrl = userInfo.avatarUrl;
  }
  if (tags.length === 0) {
    tags = extractHashtagsFromText(caption);
  }

  return {
    url: url.toString(),
    videoId,
    username,
    nickname: scraped?.nickname || "",
    verified: scraped?.verified === true,
    // The real profile handle (@mrbeast, not the display name "MrBeast") —
    // avatar/profile lookups need it to build a working profile URL.
    handle,
    avatarUrl,
    caption,
    tags,
    durationSeconds: scraped?.durationSeconds ?? null,
    playAddr: scraped?.playAddr || null,
    thumbnailUrl: scraped?.thumbnailUrl || oembed?.thumbnailUrl || null,
    scrapeError: scraped ? null : scrapeError,
  };
}

function readTikTokList() {
  try {
    const parsed = JSON.parse(fs.readFileSync(TIKTOK_LIST_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTikTokQueueEntry(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    const url = raw.trim();
    if (!url) return null;
    const normalized = normalizeTikTokUrl(url);
    return {
      url,
      videoId: normalized ? extractTikTokVideoId(normalized) || undefined : undefined,
      tags: [],
    };
  }
  if (typeof raw !== "object") return null;

  const url = String(raw.url || "").trim();
  if (!url) return null;

  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .map((tag) => String(tag || "").trim().replace(/^#/, ""))
        .filter(Boolean)
    : [];

  // `videoId` is the normalized shape; a raw TikTok item_list entry calls the
  // same field `id`, so accept either and fall back to parsing the URL.
  let videoId = String(raw.videoId || raw.id || "").trim();
  if (!videoId) {
    const parsed = normalizeTikTokUrl(url);
    videoId = (parsed && extractTikTokVideoId(parsed)) || "";
  }

  return {
    url,
    videoId: videoId || undefined,
    username: normalizeUsername(raw.username) || undefined,
    avatarUrl: String(raw.avatarUrl || "").trim() || undefined,
    caption: String(raw.caption || "").trim() || undefined,
    tags,
    thumbnailUrl: String(raw.thumbnailUrl || "").trim() || undefined,
    videoUrl: String(raw.videoUrl || "").trim() || undefined,
  };
}

module.exports = {
  TIKTOK_LIST_PATH,
  TIKTOK_COOKIES_FILE,
  buildTikTokHeaders,
  tikTokCookieFilePath,
  normalizeTikTokUrl,
  extractTikTokVideoId,
  parseTikTokPage,
  fetchTikTokMetadata,
  fetchTikTokOembed,
  fetchTikTokUserInfo,
  fetchTikTokHomeFeed,
  fetchFirstTikTokHomeVideo,
  readTikTokList,
  normalizeTikTokQueueEntry,
};
