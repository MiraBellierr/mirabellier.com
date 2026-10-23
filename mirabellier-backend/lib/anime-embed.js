const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");

const { CONFIG_ERROR_CODE, getCurrentlyWatchingAnimeFeed } = require("./mal-anime");
const { isLikelyCrawler } = require("./share-preview-utils");

const PREVIEW_WIDTH = 1200;
const CARD_X = 84;
const CARD_Y = 56;
const CARD_WIDTH = PREVIEW_WIDTH - CARD_X * 2;
const CARD_PADDING_X = 42;
const CARD_PADDING_TOP = 42;
const ROW_HEIGHT = 154;
const ROW_GAP = 22;
const COVER_WIDTH = 90;
const COVER_HEIGHT = 126;
const BANNER_HEIGHT = 88;
const FOOTER_HEIGHT = 64;
const LIST_TOP_OFFSET = 102;
const FALLBACK_HEIGHT = 720;
const EMPTY_HEIGHT = 560;
const MAX_TITLE_LINES = 2;
const MAX_TITLE_CHARS = 42;
const DEFAULT_ANIME_DESCRIPTION =
  "A live currently-watching anime page synced from MyAnimeList on a short backend refresh window.";

let cachedFredokaFont = null;
let cachedQuicksandFont = null;
let cachedFallbackPosterDataUri = null;

function resolveRepoPath(...segments) {
  return path.join(__dirname, "..", "..", ...segments);
}

function readFileAsBase64(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath).toString("base64");
}

function getFredokaFontBase64() {
  if (!cachedFredokaFont) {
    cachedFredokaFont = readFileAsBase64(
      resolveRepoPath("public", "fonts", "fredoka-latin-variable.woff2"),
    );
  }

  return cachedFredokaFont;
}

function getQuicksandFontBase64() {
  if (!cachedQuicksandFont) {
    cachedQuicksandFont = readFileAsBase64(
      resolveRepoPath("public", "fonts", "quicksand-latin-variable.woff2"),
    );
  }

  return cachedQuicksandFont;
}

async function getFallbackPosterDataUri() {
  if (cachedFallbackPosterDataUri === null) {
    const posterPath = resolveRepoPath("public", "kanna-kobayashi-poster.webp");
    if (!fs.existsSync(posterPath)) {
      cachedFallbackPosterDataUri = "";
      return cachedFallbackPosterDataUri;
    }

    const resized = await sharp(posterPath)
      .resize(320, 430, { fit: "cover" })
      .png()
      .toBuffer();
    cachedFallbackPosterDataUri = `data:image/png;base64,${resized.toString("base64")}`;
  }

  return cachedFallbackPosterDataUri;
}

function buildEmbeddedFontsCss() {
  const fontBlocks = [];
  const fredoka = getFredokaFontBase64();
  const quicksand = getQuicksandFontBase64();

  if (fredoka) {
    fontBlocks.push(`@font-face {
            font-family: 'FredokaPreview';
            src: url(data:font/woff2;base64,${fredoka}) format('woff2');
          }`);
  }

  if (quicksand) {
    fontBlocks.push(`@font-face {
            font-family: 'QuicksandPreview';
            src: url(data:font/woff2;base64,${quicksand}) format('woff2');
          }`);
  }

  return fontBlocks.join("\n");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeSvg(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function limitLength(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(maxLength - 3, 1)).trimEnd()}...`;
}

function capitalize(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;
}

function formatDateTime(value) {
  if (!value) {
    return "Unknown";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(parsed));
}

function formatProgress(item) {
  if (item.totalEpisodes) {
    return `${item.watchedEpisodes} / ${item.totalEpisodes} episodes`;
  }

  return `${item.watchedEpisodes} watched`;
}

function formatSeason(season) {
  if (!season) {
    return "Season unknown";
  }

  const label = season.season ? capitalize(season.season) : "Unknown";
  return `${label} ${season.year}`;
}

function formatMediaType(value) {
  if (!value) {
    return "Anime";
  }

  return value
    .split("_")
    .map((part) => capitalize(part))
    .join(" ");
}

function formatAnimeSummary(item) {
  const parts = [formatMediaType(item.mediaType), formatProgress(item)];

  if (item.score !== null && item.score !== undefined) {
    parts.push(`Score ${item.score}/10`);
  }

  return parts.join(" - ");
}

function formatAnimeDetails(item) {
  return `Last update ${formatDateTime(item.updatedAt)} - ${formatSeason(
    item.startSeason,
  )}`;
}

function buildMetaDescription(state) {
  if (state.variant === "list" && state.items.length) {
    return DEFAULT_ANIME_DESCRIPTION;
  }

  if (state.variant === "empty") {
    return "No anime are marked as currently watching on this public MyAnimeList profile right now.";
  }

  if (state.errorCode === CONFIG_ERROR_CODE) {
    return "The live anime sync is not configured yet.";
  }

  return "The MyAnimeList feed is unavailable right now.";
}

function buildPreviewState(input) {
  const fetchedAt = input.fetchedAt || null;
  const items = Array.isArray(input.items) ? input.items : [];
  const variant = input.variant || (items.length ? "list" : "empty");

  return {
    variant,
    username: input.username || "mirabellier",
    fetchedAt,
    stale: Boolean(input.stale),
    items,
    errorCode: input.errorCode || null,
    message: input.message || "",
    title: "Mirabellier Currently Watching Anime",
    imageAlt: 'A preview image of the "my currently watching anime !!!" section on Mirabellier.',
    description: buildMetaDescription({
      variant,
      items,
      errorCode: input.errorCode || null,
    }),
    version: fetchedAt || "fallback",
  };
}

async function loadAnimePreviewState(db) {
  try {
    const payload = await getCurrentlyWatchingAnimeFeed(db);
    return buildPreviewState({
      variant: payload.items.length ? "list" : "empty",
      username: payload.username,
      fetchedAt: payload.fetchedAt,
      stale: payload.stale,
      items: payload.items,
    });
  } catch (error) {
    const isConfigError = error?.code === CONFIG_ERROR_CODE;

    return buildPreviewState({
      variant: "fallback",
      errorCode: isConfigError ? CONFIG_ERROR_CODE : "MAL_UNAVAILABLE",
      message: isConfigError
        ? "The live anime sync is not configured yet."
        : "The MyAnimeList feed is unavailable right now.",
    });
  }
}

function computePreviewHeight(state) {
  if (state.variant === "fallback") {
    return FALLBACK_HEIGHT;
  }

  if (state.variant === "empty") {
    return EMPTY_HEIGHT + (state.stale ? BANNER_HEIGHT : 0);
  }

  const contentHeight =
    state.items.length * ROW_HEIGHT + Math.max(state.items.length - 1, 0) * ROW_GAP;

  return (
    CARD_Y * 2 +
    CARD_PADDING_TOP +
    86 +
    (state.stale ? BANNER_HEIGHT : 0) +
    contentHeight +
    FOOTER_HEIGHT
  );
}

function getPreviewDimensions(state) {
  return {
    width: PREVIEW_WIDTH,
    height: computePreviewHeight(state),
  };
}

function buildAnimeImagePath(version) {
  const encodedVersion = encodeURIComponent(String(version || "fallback"));
  return `/anime/currently-watching/embed-image.png?v=${encodedVersion}`;
}

function wrapText(value, maxCharsPerLine, maxLines) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return [""];

  const words = text.split(" ");
  const lines = [];
  let currentLine = "";
  let consumedAllWords = true;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      lines.push(limitLength(word, maxCharsPerLine));
      currentLine = "";
    }

    if (lines.length === maxLines) {
      consumedAllWords = index >= words.length - 1 && !currentLine;
      break;
    }
  }

  if (lines.length < maxLines && currentLine) {
    lines.push(currentLine);
  } else if (currentLine) {
    consumedAllWords = false;
  }

  if (!consumedAllWords && lines.length) {
    lines[lines.length - 1] = limitLength(lines[lines.length - 1], maxCharsPerLine);
  }

  return lines.slice(0, maxLines);
}

function buildCoverPlaceholderSvg(x, y, width, height) {
  const cx = x + width / 2;
  const cy = y + height / 2;

  return [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="#eff6ff" stroke="#bfdbfe" stroke-width="2" stroke-dasharray="7 6" />`,
    `<text x="${cx}" y="${cy - 8}" text-anchor="middle" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="13" font-weight="700" fill="#60a5fa">NO</text>`,
    `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="13" font-weight="700" fill="#60a5fa">ART</text>`,
  ].join("");
}

async function fetchRemoteImageDataUri(url, width, height) {
  if (!url) {
    return null;
  }

  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "Mirabellier/1.0 (+https://mirabellier.com)",
      },
    });

    const resized = await sharp(Buffer.from(response.data))
      .resize(width, height, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();

    return `data:image/png;base64,${resized.toString("base64")}`;
  } catch {
    return null;
  }
}

async function buildListCoverData(items) {
  return Promise.all(
    items.map(async (item) => fetchRemoteImageDataUri(item.coverImage, COVER_WIDTH, COVER_HEIGHT)),
  );
}

function buildBannerSvg(y, width, fetchedAt) {
  return `
    <g>
      <rect x="${CARD_X + CARD_PADDING_X}" y="${y}" width="${width}" height="66" rx="20" fill="#fffbeb" stroke="#f59e0b" stroke-width="2" />
      <text x="${CARD_X + CARD_PADDING_X + 24}" y="${y + 29}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="20" font-weight="700" fill="#b45309">
        MyAnimeList did not answer on the latest refresh.
      </text>
      <text x="${CARD_X + CARD_PADDING_X + 24}" y="${y + 53}" font-family="QuicksandPreview, sans-serif" font-size="18" font-weight="600" fill="#92400e">
        Showing the last successful snapshot from ${escapeSvg(formatDateTime(fetchedAt))}.
      </text>
    </g>
  `;
}

function buildListRowSvg(item, index, dataUri, y) {
  const coverX = CARD_X + CARD_PADDING_X;
  const coverY = y + 12;
  const textX = coverX + COVER_WIDTH + 26;
  const titleLines = wrapText(item.title, MAX_TITLE_CHARS, MAX_TITLE_LINES);
  const clipId = `anime-cover-${index}`;
  const contentWidth = CARD_WIDTH - CARD_PADDING_X * 2;
  const dividerY = y + ROW_HEIGHT - 6;

  let titleMarkup = "";
  titleLines.forEach((line, lineIndex) => {
    titleMarkup += `<tspan x="${textX}" dy="${lineIndex === 0 ? 0 : 32}">${escapeSvg(line)}</tspan>`;
  });

  const coverMarkup = dataUri
    ? `
      <clipPath id="${clipId}">
        <rect x="${coverX}" y="${coverY}" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" rx="18" />
      </clipPath>
      <image href="${dataUri}" x="${coverX}" y="${coverY}" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" />
      <rect x="${coverX}" y="${coverY}" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" rx="18" fill="none" stroke="#bfdbfe" stroke-width="2" />
    `
    : buildCoverPlaceholderSvg(coverX, coverY, COVER_WIDTH, COVER_HEIGHT);

  return `
    <g>
      <rect x="${CARD_X + CARD_PADDING_X - 10}" y="${y}" width="${contentWidth + 20}" height="${ROW_HEIGHT - 8}" rx="26" fill="rgba(255,255,255,0.92)" />
      ${coverMarkup}
      <circle cx="${textX - 22}" cy="${y + 32}" r="15" fill="#dbeafe" />
      <text x="${textX - 22}" y="${y + 39}" text-anchor="middle" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="18" font-weight="700" fill="#1d4ed8">${index + 1}</text>
      <text x="${textX}" y="${y + 36}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="28" font-weight="700" fill="#1d4ed8">
        ${titleMarkup}
      </text>
      <text x="${textX}" y="${y + 92}" font-family="QuicksandPreview, sans-serif" font-size="22" font-weight="700" fill="#334155">${escapeSvg(limitLength(formatAnimeSummary(item), 74))}</text>
      <text x="${textX}" y="${y + 122}" font-family="QuicksandPreview, sans-serif" font-size="20" font-weight="600" fill="#3b82f6">${escapeSvg(limitLength(formatAnimeDetails(item), 82))}</text>
      <line x1="${CARD_X + CARD_PADDING_X}" y1="${dividerY}" x2="${CARD_X + CARD_WIDTH - CARD_PADDING_X}" y2="${dividerY}" stroke="#dbeafe" stroke-width="2" />
    </g>
  `;
}

async function renderListSvg(state, dimensions) {
  const covers = await buildListCoverData(state.items);
  const contentWidth = CARD_WIDTH - CARD_PADDING_X * 2;

  let currentY = CARD_Y + CARD_PADDING_TOP + LIST_TOP_OFFSET;

  let bannerMarkup = "";
  if (state.stale) {
    bannerMarkup = buildBannerSvg(currentY, contentWidth, state.fetchedAt);
    currentY += BANNER_HEIGHT;
  }

  const rowsMarkup = state.items
    .map((item, index) => {
      const rowY = currentY + index * (ROW_HEIGHT + ROW_GAP);
      return buildListRowSvg(item, index, covers[index], rowY);
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">
      <defs>
        <linearGradient id="pageGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f8fbff" />
          <stop offset="52%" stop-color="#eff6ff" />
          <stop offset="100%" stop-color="#dbeafe" />
        </linearGradient>
        <linearGradient id="cardGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.96)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0.9)" />
        </linearGradient>
        <style>
          ${buildEmbeddedFontsCss()}
        </style>
      </defs>
      <rect width="100%" height="100%" fill="url(#pageGradient)" />
      <circle cx="170" cy="150" r="140" fill="rgba(191,219,254,0.45)" />
      <circle cx="${dimensions.width - 130}" cy="${dimensions.height - 110}" r="170" fill="rgba(147,197,253,0.28)" />
      <circle cx="${dimensions.width - 230}" cy="130" r="88" fill="rgba(219,234,254,0.7)" />
      <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_WIDTH}" height="${dimensions.height - CARD_Y * 2}" rx="34" fill="url(#cardGradient)" stroke="#60a5fa" stroke-width="7" />
      <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 34}" font-family="QuicksandPreview, sans-serif" font-size="18" font-weight="700" fill="#60a5fa" letter-spacing="2">mirabellier.com / anime</text>
      <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 90}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="40" font-weight="700" fill="#1d4ed8">my currently watching anime !!!</text>
      ${bannerMarkup}
      ${rowsMarkup}
    </svg>
  `;
}

async function renderEmptySvg(state, dimensions) {
  const contentY = CARD_Y + 190;
  const subtitle = state.stale
    ? `Snapshot last updated ${formatDateTime(state.fetchedAt)} UTC`
    : `Live MyAnimeList snapshot for @${state.username}`;
  const bannerMarkup = state.stale
    ? buildBannerSvg(CARD_Y + 144, CARD_WIDTH - CARD_PADDING_X * 2, state.fetchedAt)
    : "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">
      <defs>
        <linearGradient id="pageGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f8fbff" />
          <stop offset="52%" stop-color="#eff6ff" />
          <stop offset="100%" stop-color="#dbeafe" />
        </linearGradient>
        <style>
          ${buildEmbeddedFontsCss()}
        </style>
      </defs>
      <rect width="100%" height="100%" fill="url(#pageGradient)" />
      <circle cx="200" cy="170" r="150" fill="rgba(191,219,254,0.45)" />
      <circle cx="${dimensions.width - 130}" cy="${dimensions.height - 95}" r="175" fill="rgba(147,197,253,0.28)" />
      <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_WIDTH}" height="${dimensions.height - CARD_Y * 2}" rx="34" fill="rgba(255,255,255,0.94)" stroke="#60a5fa" stroke-width="7" />
      <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 34}" font-family="QuicksandPreview, sans-serif" font-size="18" font-weight="700" fill="#60a5fa" letter-spacing="2">mirabellier.com / anime</text>
      <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 90}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="40" font-weight="700" fill="#1d4ed8">my currently watching anime !!!</text>
      <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 122}" font-family="QuicksandPreview, sans-serif" font-size="22" font-weight="700" fill="#3b82f6">${escapeSvg(limitLength(subtitle, 52))}</text>
      ${bannerMarkup}
      <rect x="${CARD_X + 144}" y="${contentY}" width="${CARD_WIDTH - 288}" height="160" rx="30" fill="rgba(255,255,255,0.92)" stroke="#bfdbfe" stroke-width="3" />
      <text x="${dimensions.width / 2}" y="${contentY + 72}" text-anchor="middle" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="30" font-weight="700" fill="#1d4ed8">Nothing is marked as currently watching right now.</text>
      <text x="${dimensions.width / 2}" y="${contentY + 112}" text-anchor="middle" font-family="QuicksandPreview, sans-serif" font-size="22" font-weight="700" fill="#475569">The page is live and ready whenever the next anime gets added.</text>
      <text x="${CARD_X + CARD_PADDING_X}" y="${dimensions.height - CARD_Y - 24}" font-family="QuicksandPreview, sans-serif" font-size="18" font-weight="700" fill="#64748b">Share this page on Discord to preview the currently watching section.</text>
    </svg>
  `;
}

async function renderFallbackSvg(state, dimensions) {
  const posterDataUri = await getFallbackPosterDataUri();
  const infoLines = wrapText(
    state.message || "The live MyAnimeList preview is unavailable right now.",
    36,
    2,
  );
  const helperText =
    state.errorCode === CONFIG_ERROR_CODE
      ? "Open the page again after the sync is configured to see the live list preview."
      : "Open the page again later to see the refreshed live list preview.";
  const lineMarkup = infoLines
    .map(
      (line, index) =>
        `<tspan x="${CARD_X + CARD_PADDING_X}" dy="${index === 0 ? 0 : 38}">${escapeSvg(line)}</tspan>`,
    )
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">
      <defs>
        <linearGradient id="pageGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f8fbff" />
          <stop offset="52%" stop-color="#eff6ff" />
          <stop offset="100%" stop-color="#dbeafe" />
        </linearGradient>
        <style>
          ${buildEmbeddedFontsCss()}
        </style>
      </defs>
      <rect width="100%" height="100%" fill="url(#pageGradient)" />
      <circle cx="170" cy="170" r="150" fill="rgba(191,219,254,0.45)" />
      <circle cx="${dimensions.width - 150}" cy="${dimensions.height - 110}" r="165" fill="rgba(147,197,253,0.28)" />
      <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_WIDTH}" height="${dimensions.height - CARD_Y * 2}" rx="34" fill="rgba(255,255,255,0.94)" stroke="#60a5fa" stroke-width="7" />
      <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 34}" font-family="QuicksandPreview, sans-serif" font-size="18" font-weight="700" fill="#60a5fa" letter-spacing="2">mirabellier.com / anime</text>
      <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 90}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="40" font-weight="700" fill="#1d4ed8">my currently watching anime !!!</text>
      <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 132}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="34" font-weight="700" fill="#1e40af">
        ${lineMarkup}
      </text>
      <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 230}" font-family="QuicksandPreview, sans-serif" font-size="24" font-weight="700" fill="#475569">${escapeSvg(helperText)}</text>
      <rect x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 282}" width="418" height="150" rx="28" fill="rgba(239,246,255,0.96)" stroke="#bfdbfe" stroke-width="3" />
      <text x="${CARD_X + CARD_PADDING_X + 28}" y="${CARD_Y + 332}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="26" font-weight="700" fill="#1d4ed8">Discord preview status</text>
      <text x="${CARD_X + CARD_PADDING_X + 28}" y="${CARD_Y + 372}" font-family="QuicksandPreview, sans-serif" font-size="22" font-weight="700" fill="#334155">The page still shares cleanly.</text>
      <text x="${CARD_X + CARD_PADDING_X + 28}" y="${CARD_Y + 404}" font-family="QuicksandPreview, sans-serif" font-size="22" font-weight="700" fill="#334155">The live anime list will appear here once the feed is ready.</text>
      <rect x="${CARD_X + CARD_WIDTH - 382}" y="${CARD_Y + 116}" width="320" height="430" rx="28" fill="#dbeafe" />
      ${
        posterDataUri
          ? `<image href="${posterDataUri}" x="${CARD_X + CARD_WIDTH - 382}" y="${CARD_Y + 116}" width="320" height="430" preserveAspectRatio="xMidYMid slice" />`
          : `<text x="${CARD_X + CARD_WIDTH - 222}" y="${CARD_Y + 334}" text-anchor="middle" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="28" font-weight="700" fill="#1d4ed8">anime preview</text>
      <text x="${CARD_X + CARD_WIDTH - 222}" y="${CARD_Y + 372}" text-anchor="middle" font-family="QuicksandPreview, sans-serif" font-size="22" font-weight="700" fill="#475569">will appear here</text>`
      }
      <rect x="${CARD_X + CARD_WIDTH - 382}" y="${CARD_Y + 116}" width="320" height="430" rx="28" fill="none" stroke="#93c5fd" stroke-width="3" />
      <text x="${CARD_X + CARD_PADDING_X}" y="${dimensions.height - CARD_Y - 24}" font-family="QuicksandPreview, sans-serif" font-size="18" font-weight="700" fill="#64748b">Share this page on Discord to preview the anime section once the live feed is ready.</text>
    </svg>
  `;
}

async function renderAnimePreviewBuffer(state) {
  const dimensions = getPreviewDimensions(state);
  const svg =
    state.variant === "fallback"
      ? await renderFallbackSvg(state, dimensions)
      : state.variant === "empty"
        ? await renderEmptySvg(state, dimensions)
        : await renderListSvg(state, dimensions);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

function resolveProtocol(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];

  if (typeof forwardedProto === "string" && forwardedProto.trim()) {
    return forwardedProto.split(",")[0].trim();
  }

  return req.protocol || "http";
}

function buildAnimeShareHtml({
  state,
  protocol,
  host,
  spaPath = "/anime",
}) {
  const canonicalUrl = `${protocol}://${host}${spaPath}`;
  const imageUrl = `${protocol}://${host}${buildAnimeImagePath(state.version)}`;
  const dimensions = getPreviewDimensions(state);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: state.title,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    image: [imageUrl],
    isPartOf: {
      "@type": "WebSite",
      name: "Mirabellier",
      url: `${protocol}://${host}/`,
    },
  };

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(state.title)}</title>
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(state.title)}" />
    <meta property="og:site_name" content="Mirabellier" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:width" content="${dimensions.width}" />
    <meta property="og:image:height" content="${dimensions.height}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:alt" content="${escapeHtml(state.imageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(state.title)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(state.imageAlt)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <script type="application/ld+json">${escapeJsonForHtml(jsonLd)}</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(state.title)}</h1>
      <p><a href="${escapeHtml(canonicalUrl)}">Open the anime page</a></p>
    </main>
  </body>
</html>`;
}

module.exports = {
  buildAnimeImagePath,
  buildAnimeShareHtml,
  getPreviewDimensions,
  isLikelyCrawler,
  loadAnimePreviewState,
  renderAnimePreviewBuffer,
  resolveProtocol,
};
