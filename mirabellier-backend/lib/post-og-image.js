const sharp = require("sharp");

const {
  buildEmbeddedFontsCss,
  buildRepoImageDataUri,
  escapeSvg,
  wrapText,
} = require("./share-preview-utils");

// A per-post Open Graph card: 1200x630 (the 1.91:1 slot Discord / Twitter /
// Slack / Facebook all crop to), rendered as an SVG and rasterised with sharp.
// Used only when a post has no hand-picked thumbnail, so every blog link still
// unfurls with something specific instead of the same site background.
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const CARD_X = 64;
const CARD_Y = 60;
const CARD_WIDTH = OG_WIDTH - CARD_X * 2;
const CARD_HEIGHT = OG_HEIGHT - CARD_Y * 2;
const CARD_PADDING = 56;
const TITLE_MAX_LINES = 4;

let cachedAssetsPromise = null;

function formatDate(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function normalizeTitle(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text || "Untitled";
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

// A stable, URL-safe token that changes whenever the post is edited, so a cached
// card at `?v=<old>` is never served for updated content.
function buildPostOgVersion(post) {
  const stamp = post?.updatedAt || post?.createdAt || "";
  const digest = String(stamp).replace(/[^0-9a-z]/gi, "").slice(0, 24);
  return digest || "static";
}

function buildPostOgImagePath(slug, version) {
  const safeSlug = encodeURIComponent(String(slug || "post"));
  const query = version ? `?v=${encodeURIComponent(String(version))}` : "";
  return `/og/post/${safeSlug}.png${query}`;
}

function buildPostOgState(post) {
  const title = normalizeTitle(post?.title);

  return {
    title,
    tags: normalizeTags(post?.tags),
    dateLabel: formatDate(post?.createdAt),
    author: String(post?.author || "").trim(),
    version: buildPostOgVersion(post),
    imageAlt: `Title card for the blog post "${title}" on Mirabellier.`,
  };
}

// Wrap the title at a width that scales with the type size, then step the size
// down until the whole title fits without `wrapText` having to truncate it.
function pickTitleLayout(title) {
  const steps = [
    { fontSize: 68, lineHeight: 82, maxChars: 22 },
    { fontSize: 58, lineHeight: 70, maxChars: 26 },
    { fontSize: 48, lineHeight: 60, maxChars: 32 },
    { fontSize: 40, lineHeight: 50, maxChars: 40 },
  ];

  for (const step of steps) {
    const lines = wrapText(title, step.maxChars, TITLE_MAX_LINES);
    // `wrapText` marks any line it had to clip — a mid-title word that outran
    // the budget, or words dropped past the last line — with a trailing "...".
    const fits = !lines.some((line) => line.endsWith("..."));
    if (fits || step === steps[steps.length - 1]) {
      return { ...step, lines };
    }
  }

  const last = steps[steps.length - 1];
  return { ...last, lines: wrapText(title, last.maxChars, TITLE_MAX_LINES) };
}

async function loadOgAssets() {
  if (!cachedAssetsPromise) {
    cachedAssetsPromise = Promise.all([
      buildRepoImageDataUri("public/light.webp", {
        width: OG_WIDTH,
        height: OG_HEIGHT,
      }),
      buildRepoImageDataUri("public/flower.webp", {
        width: 96,
        height: 96,
        // "inside" keeps the aspect ratio without letterboxing the transparent
        // PNG with a black background the way "contain" would.
        fit: "inside",
      }),
    ]).then(([background, flower]) => ({ background, flower }));
  }

  return cachedAssetsPromise;
}

function renderPostOgSvg(state, assets) {
  const layout = pickTitleLayout(state.title);
  const titleBlockHeight = layout.lines.length * layout.lineHeight;

  const bodyTop = CARD_Y + CARD_PADDING + 96;
  const bodyBottom = CARD_Y + CARD_HEIGHT - CARD_PADDING - 56;
  const available = bodyBottom - bodyTop;
  const titleBaseline =
    bodyTop + Math.max((available - titleBlockHeight) / 2, 0) + layout.fontSize;

  const titleTspans = layout.lines
    .map(
      (line, index) =>
        `<tspan x="${CARD_X + CARD_PADDING}" dy="${index === 0 ? 0 : layout.lineHeight}">${escapeSvg(line)}</tspan>`,
    )
    .join("");

  const metaParts = [];
  if (state.dateLabel) {
    metaParts.push(state.dateLabel);
  }
  if (state.tags.length) {
    metaParts.push(state.tags.map((tag) => `#${tag}`).join("  "));
  }
  const metaLine = metaParts.join("   ·   ");
  const metaY = CARD_Y + CARD_HEIGHT - CARD_PADDING - 4;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
      <defs>
        <style>
          ${buildEmbeddedFontsCss()}
        </style>
      </defs>
      ${
        assets.background
          ? `<image href="${assets.background}" x="0" y="0" width="${OG_WIDTH}" height="${OG_HEIGHT}" preserveAspectRatio="xMidYMid slice" />`
          : `<rect width="100%" height="100%" fill="#eaf4ff" />`
      }
      <rect width="100%" height="100%" fill="rgba(255,255,255,0.22)" />
      <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="34" fill="rgba(255,255,255,0.74)" />
      <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="34" fill="none" stroke="#93c5fd" stroke-width="3" />
      ${
        assets.flower
          ? `<image href="${assets.flower}" x="${CARD_X + CARD_WIDTH - CARD_PADDING - 72}" y="${CARD_Y + CARD_PADDING - 20}" width="72" height="72" preserveAspectRatio="xMidYMid meet" />`
          : ""
      }
      <text x="${CARD_X + CARD_PADDING}" y="${CARD_Y + CARD_PADDING + 24}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="30" font-weight="700" fill="#2563eb">mirabellier.com</text>
      <text x="${CARD_X + CARD_PADDING}" y="${CARD_Y + CARD_PADDING + 58}" font-family="QuicksandPreview, sans-serif" font-size="20" font-weight="700" fill="#60a5fa">blog</text>
      <text x="${CARD_X + CARD_PADDING}" y="${titleBaseline}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="${layout.fontSize}" font-weight="700" fill="#1e3a8a">
        ${titleTspans}
      </text>
      ${
        metaLine
          ? `<text x="${CARD_X + CARD_PADDING}" y="${metaY}" font-family="QuicksandPreview, sans-serif" font-size="22" font-weight="700" fill="#475569">${escapeSvg(metaLine)}</text>`
          : ""
      }
    </svg>
  `;
}

async function renderPostOgBuffer(state) {
  const assets = await loadOgAssets();
  const svg = renderPostOgSvg(state, assets);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = {
  OG_WIDTH,
  OG_HEIGHT,
  buildPostOgImagePath,
  buildPostOgState,
  buildPostOgVersion,
  formatDate,
  pickTitleLayout,
  renderPostOgBuffer,
};
