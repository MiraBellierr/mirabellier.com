const axios = require("axios");

const SAFEBOORU_API_BASE = "https://safebooru.org/index.php";
const GELBOORU_API_BASE = "https://gelbooru.com/index.php";
const DANBOORU_API_BASE = "https://danbooru.donmai.us/posts.json";
const PIXIV_TOKEN_URL = "https://oauth.secure.pixiv.net/auth/token";
const PIXIV_API_BASE = "https://app-api.pixiv.net/v1";
const PIXIV_CLIENT_ID = "MOBrBDS8blbauoSck0ZfDbtuzpyT";
const PIXIV_CLIENT_SECRET = process.env.PIXIV_CLIENT_SECRET || "";

const DEFAULT_CACHE_TTL_SECONDS = 300;
const MAX_CACHE_ENTRIES = 300;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;
const DEFAULT_PAGE = 1;
const MAX_PAGE = 40;
const USER_AGENT = "Mirabellier/1.0 (+https://mirabellier.com)";

const SITES = ["safebooru", "gelbooru", "danbooru", "pixiv"];
const SAFE_RATING_VALUES = ["safe", "all"];

const cache = new Map();
let pixivToken = null;

function createValidationError(message) {
  const error = new Error(message);
  error.code = "FANART_BAD_REQUEST";
  return error;
}

function readCacheTtlSeconds() {
  const parsed = Number(process.env.FANART_CACHE_TTL_SECONDS);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_CACHE_TTL_SECONDS;
}

function rememberCacheValue(key, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  cache.set(key, {
    expiresAt: Date.now() + readCacheTtlSeconds() * 1000,
    value,
  });
}

function readCachedValue(key) {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function normalizeTagsQuery(query, rating, site) {
  const tags = [
    String(query || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_"),
  ];

  if (rating === "safe") {
    if (site === "danbooru") {
      tags.push("rating:g");
    } else {
      tags.push("-rating:explicit", "-rating:questionable");
    }
  }

  return tags.filter(Boolean).join(" ");
}

function buildPostUrl(site, id) {
  if (site === "safebooru") {
    return `https://safebooru.org/index.php?page=post&s=view&id=${encodeURIComponent(id)}`;
  }

  if (site === "gelbooru") {
    return `https://gelbooru.com/index.php?page=post&s=view&id=${encodeURIComponent(id)}`;
  }

  if (site === "danbooru") {
    return `https://danbooru.donmai.us/posts/${encodeURIComponent(id)}`;
  }

  return `https://www.pixiv.net/en/artworks/${encodeURIComponent(id)}`;
}

function readNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitTags(value) {
  return typeof value === "string"
    ? value
        .split(/\s+/)
        .map(decodeHtmlEntities)
        .filter(Boolean)
    : [];
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeBooruPost(post, site) {
  const id = readNumber(post.id);
  const directory = typeof post.directory === "string" ? post.directory : "";
  const image = typeof post.image === "string" ? post.image : "";
  const fileUrl =
    typeof post.file_url === "string" && post.file_url
      ? post.file_url
      : site === "safebooru" && directory && image
        ? `https://safebooru.org/images/${directory}/${image}`
        : null;
  const sampleUrl =
    typeof post.sample_url === "string" && post.sample_url
      ? post.sample_url
      : null;
  const previewUrl =
    typeof post.preview_url === "string" && post.preview_url
      ? post.preview_url
      : null;

  return {
    id: id !== null ? String(id) : `${site}-${String(post.hash || "")}`,
    site,
    title: typeof post.title === "string" && post.title ? post.title : "",
    artist:
      typeof post.owner === "string" && post.owner ? post.owner : "unknown",
    artistUrl: null,
    thumbnailUrl: previewUrl || sampleUrl || fileUrl || "",
    sampleUrl,
    imageUrl: fileUrl || sampleUrl || previewUrl || "",
    postUrl: id !== null ? buildPostUrl(site, id) : "",
    width: readNumber(post.width),
    height: readNumber(post.height),
    rating: typeof post.rating === "string" ? post.rating : "unknown",
    score: readNumber(post.score),
    tags: splitTags(post.tags),
  };
}

function normalizeDanbooruPost(post) {
  const id = readNumber(post.id);
  const fileUrl =
    typeof post.file_url === "string" && post.file_url
      ? post.file_url
      : typeof post.large_file_url === "string"
        ? post.large_file_url
        : null;
  const sampleUrl =
    typeof post.large_file_url === "string" && post.large_file_url
      ? post.large_file_url
      : null;
  const previewUrl =
    typeof post.preview_file_url === "string" ? post.preview_file_url : null;
  const artistTag =
    typeof post.tag_string_artist === "string"
      ? post.tag_string_artist.trim()
      : "";

  return {
    id: id !== null ? String(id) : `danbooru-${String(post.hash || "")}`,
    site: "danbooru",
    title: "",
    artist: artistTag || "unknown",
    artistUrl: null,
    thumbnailUrl: previewUrl || sampleUrl || fileUrl || "",
    sampleUrl,
    imageUrl: fileUrl || sampleUrl || previewUrl || "",
    postUrl: id !== null ? buildPostUrl("danbooru", id) : "",
    width: readNumber(post.image_width),
    height: readNumber(post.image_height),
    rating: typeof post.rating === "string" ? post.rating : "unknown",
    score: readNumber(post.score),
    tags: splitTags(post.tag_string),
  };
}

function normalizePixivIllust(illust) {
  const id = readNumber(illust.id);
  const imageUrls =
    illust?.image_urls && typeof illust.image_urls === "object"
      ? illust.image_urls
      : {};
  const user = illust?.user && typeof illust.user === "object" ? illust.user : {};
  const tags = Array.isArray(illust.tags)
    ? illust.tags
        .map((tag) =>
          tag && typeof tag.name === "string" ? tag.name : "",
        )
        .filter(Boolean)
    : [];
  const userId = readNumber(user.id);
  const title = typeof illust.title === "string" ? illust.title : "";

  return {
    id: id !== null ? String(id) : `pixiv-${String(illust.hash || "")}`,
    site: "pixiv",
    title,
    artist: typeof user.name === "string" && user.name ? user.name : "unknown",
    artistUrl:
      userId !== null ? `https://www.pixiv.net/en/users/${userId}` : null,
    thumbnailUrl:
      typeof imageUrls.square_medium === "string"
        ? imageUrls.square_medium
        : "",
    sampleUrl:
      typeof imageUrls.medium === "string" ? imageUrls.medium : null,
    imageUrl:
      typeof illust.meta_single_original_image_url === "string" &&
      illust.meta_single_original_image_url
        ? illust.meta_single_original_image_url
        : typeof imageUrls.large === "string"
          ? imageUrls.large
          : typeof imageUrls.medium === "string"
            ? imageUrls.medium
            : "",
    postUrl: id !== null ? buildPostUrl("pixiv", id) : "",
    width: readNumber(illust.width),
    height: readNumber(illust.height),
    rating: "unknown",
    score: readNumber(illust.total_bookmarks),
    tags,
  };
}

function sortItemsByScore(items) {
  return [...items].sort((left, right) => (right.score || 0) - (left.score || 0));
}

async function fetchSafebooruPage(query, rating, page, limit) {
  const tags = normalizeTagsQuery(query, rating, "safebooru");
  const pid = Math.max(page - 1, 0);

  const response = await axios.get(SAFEBOORU_API_BASE, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    params: {
      page: "dapi",
      s: "post",
      q: "index",
      json: 1,
      tags,
      limit,
      pid,
    },
    timeout: 15000,
  });

  const posts = Array.isArray(response?.data) ? response.data : [];
  return posts
    .map((post) => normalizeBooruPost(post, "safebooru"))
    .filter((item) => item.thumbnailUrl || item.imageUrl);
}

async function fetchGelbooruPage(query, rating, page, limit) {
  const tags = normalizeTagsQuery(query, rating, "gelbooru");
  const pid = Math.max(page - 1, 0);
  const params = {
    page: "dapi",
    s: "post",
    q: "index",
    json: 1,
    tags,
    limit,
    pid,
  };
  const apiKey = String(process.env.GELBOORU_API_KEY || "").trim();
  const userId = String(process.env.GELBOORU_USER_ID || "").trim();

  if (apiKey && userId) {
    params.api_key = apiKey;
    params.user_id = userId;
  }

  try {
    const response = await axios.get(GELBOORU_API_BASE, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      params,
      timeout: 20000,
    });

    const data = response?.data;
    const posts = Array.isArray(data)
      ? data
      : Array.isArray(data?.post)
        ? data.post
        : [];
    return posts
      .map((post) => normalizeBooruPost(post, "gelbooru"))
      .filter((item) => item.thumbnailUrl || item.imageUrl);
  } catch (error) {
    if (error?.response?.status === 401 || error?.response?.status === 403) {
      const configError = new Error(
        "Gelbooru requires an API key. Set GELBOORU_API_KEY and GELBOORU_USER_ID in mirabellier-backend/.env.",
      );
      configError.code = "GELBOORU_CONFIG_MISSING";
      throw configError;
    }

    throw error;
  }
}

async function fetchDanbooruPage(query, rating, page, limit) {
  const tags = normalizeTagsQuery(query, rating, "danbooru");
  const params = {
    tags,
    limit,
    page: Math.max(page, 1),
  };
  const apiKey = String(process.env.DANBOORU_API_KEY || "").trim();
  const userId =
    String(process.env.DANBOORU_LOGIN || process.env.DANBOORU_USER_ID || "").trim();
  const hasCredentials = Boolean(apiKey && userId);
  const userAgent = userId
    ? `Mirabellier/1.0 (user #${userId}; +https://mirabellier.com)`
    : USER_AGENT;

  if (hasCredentials) {
    params.login = userId;
    params.api_key = apiKey;
  }

  const requestPage = async (withCredentials) => {
    const requestParams = withCredentials
      ? params
      : { tags, limit, page: Math.max(page, 1) };

    const response = await axios.get(DANBOORU_API_BASE, {
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
      },
      params: requestParams,
      timeout: 20000,
    });

    const posts = Array.isArray(response?.data) ? response.data : [];
    return posts
      .map(normalizeDanbooruPost)
      .filter((item) => item.thumbnailUrl || item.imageUrl);
  };

  try {
    return await requestPage(true);
  } catch (error) {
    const isAuthFailure =
      error?.response?.status === 401 || error?.response?.status === 403;

    if (isAuthFailure && hasCredentials) {
      return await requestPage(false);
    }

    if (isAuthFailure) {
      const configError = new Error(
        "Danbooru rejected the API key and anonymous access also failed. Check DANBOORU_API_KEY and DANBOORU_LOGIN in mirabellier-backend/.env.",
      );
      configError.code = "DANBOORU_CONFIG_MISSING";
      throw configError;
    }

    throw error;
  }
}

function isPixivTokenFresh() {
  return Boolean(pixivToken && pixivToken.expiresAt > Date.now());
}

async function refreshPixivAccessToken() {
  if (isPixivTokenFresh()) {
    return pixivToken.accessToken;
  }

  const refreshToken = String(process.env.PIXIV_REFRESH_TOKEN || "").trim();
  if (!refreshToken) {
    const error = new Error("Pixiv search is not configured.");
    error.code = "PIXIV_CONFIG_MISSING";
    throw error;
  }

  const response = await axios.post(
    PIXIV_TOKEN_URL,
    new URLSearchParams({
      client_id: PIXIV_CLIENT_ID,
      client_secret: PIXIV_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      include_policy: "true",
    }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      timeout: 15000,
    },
  );

  const accessToken =
    response?.data?.access_token && typeof response.data.access_token === "string"
      ? response.data.access_token
      : "";
  const expiresIn = readNumber(response?.data?.expires_in);

  if (!accessToken) {
    const error = new Error("Pixiv token refresh returned no access token.");
    error.code = "PIXIV_UNAVAILABLE";
    throw error;
  }

  pixivToken = {
    accessToken,
    expiresAt: Date.now() + ((expiresIn || 3600) - 120) * 1000,
  };

  return accessToken;
}

async function fetchPixivPage(query, rating, page, limit) {
  const accessToken = await refreshPixivAccessToken();

  const response = await axios.get(`${PIXIV_API_BASE}/search/illust`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)",
      "App-OS": "ios",
      "App-OS-Version": "14.6",
      "App-Version": "7.13.3",
    },
    params: {
      word: String(query || "").trim(),
      search_target: "partial_match_for_tags",
      sort: "date_desc",
      offset: Math.max(page - 1, 0) * limit,
    },
    timeout: 15000,
  });

  const illusts = Array.isArray(response?.data?.illusts)
    ? response.data.illusts
    : [];
  const normalized = illusts
    .filter((illust) => rating === "all" || Number(illust.x_restrict) === 0)
    .map(normalizePixivIllust)
    .filter((item) => item.thumbnailUrl || item.imageUrl);

  return normalized.slice(0, limit);
}

function resolveSitesParam(value) {
  if (!value) {
    return SITES;
  }

  const requested = String(value)
    .split(",")
    .map((site) => site.trim().toLowerCase())
    .filter(Boolean);

  return SITES.filter((site) => requested.includes(site));
}

function resolveRatingParam(value) {
  if (!value) {
    return "safe";
  }

  const rating = String(value).trim().toLowerCase();
  return SAFE_RATING_VALUES.includes(rating) ? rating : "safe";
}

async function fetchSiteResults(site, query, rating, page, limit) {
  const cacheKey = `fanart:${site}:${query.trim().toLowerCase()}:${rating}:${page}:${limit}`;
  const cached = readCachedValue(cacheKey);
  if (cached) {
    return cached;
  }

  let items = [];
  if (site === "safebooru") {
    items = await fetchSafebooruPage(query, rating, page, limit);
  } else if (site === "gelbooru") {
    items = await fetchGelbooruPage(query, rating, page, limit);
  } else if (site === "danbooru") {
    items = await fetchDanbooruPage(query, rating, page, limit);
  } else if (site === "pixiv") {
    items = await fetchPixivPage(query, rating, page, limit);
  }

  const result = { site, available: true, items, error: null };
  rememberCacheValue(cacheKey, result);
  return result;
}

async function searchFanArt(input) {
  const query = String(input?.query || "").trim();
  if (!query) {
    throw createValidationError("A search query is required.");
  }

  if (query.length > 120) {
    throw createValidationError("Search queries must be 120 characters or fewer.");
  }

  const rating = resolveRatingParam(input?.rating);
  const page = Math.min(
    Math.max(Math.trunc(readNumber(input?.page) || DEFAULT_PAGE), 1),
    MAX_PAGE,
  );
  const limit = Math.min(
    Math.max(Math.trunc(readNumber(input?.limit) || DEFAULT_LIMIT), 1),
    MAX_LIMIT,
  );
  const sites = resolveSitesParam(input?.sites);

  const settled = await Promise.allSettled(
    sites.map((site) => fetchSiteResults(site, query, rating, page, limit)),
  );

  const siteResults = settled.map((result, index) => {
    const site = sites[index];

    if (result.status === "fulfilled") {
      return result.value;
    }

    const error = result.reason;
    return {
      site,
      available: false,
      items: [],
      error:
        error?.code === "PIXIV_CONFIG_MISSING"
          ? "Pixiv search is not configured on the server."
          : error?.code === "GELBOORU_CONFIG_MISSING"
            ? "Gelbooru search is not configured on the server."
            : error?.code === "DANBOORU_CONFIG_MISSING"
              ? "Danbooru search is not configured on the server."
              : error instanceof Error
                ? error.message
                : "This source is unavailable right now.",
    };
  });

  const allFailed = siteResults.every((result) => !result.available);

  return {
    query,
    rating,
    page,
    limit,
    fetchedAt: new Date().toISOString(),
    sites: siteResults,
    allFailed,
  };
}

function mergeAllItems(payload) {
  return payload.sites.flatMap((site) => site.items);
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  SITES,
  mergeAllItems,
  searchFanArt,
  sortItemsByScore,
};
