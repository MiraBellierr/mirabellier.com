const sharp = require("sharp");

const {
  buildEmbeddedFontsCss,
  buildRepoImageDataUri,
  escapeHtml,
  escapeJsonForHtml,
  escapeSvg,
  wrapText,
} = require("./share-preview-utils");

const PREVIEW_WIDTH = 1200;
const CARD_X = 78;
const CARD_Y = 84;
const CARD_WIDTH = 1044;
const CARD_PADDING_X = 34;
const HEADER_HEIGHT = 118;
const BANNER_HEIGHT = 84;
const SECTION_GAP = 18;
const EMPTY_HEIGHT = 700;
const FALLBACK_HEIGHT = 700;
const MIN_LIST_HEIGHT = 760;
const DEFAULT_DESCRIPTION =
  "Daily quotes across love, art, nature, humor, and more.";

let cachedAssetsPromise = null;

function formatFetchedAt(value) {
  if (!value) {
    return "unknown time";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "unknown time";
  }

  return parsed.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeQuoteEntry(entry) {
  return {
    key: String(entry?.key || ""),
    category: String(entry?.category || "Quote"),
    quote: String(entry?.quote || ""),
    author: String(entry?.author || "Unknown"),
  };
}

function buildQuotePreviewState(input) {
  const normalizedQuotes = Array.isArray(input?.quotes)
    ? input.quotes.map(normalizeQuoteEntry).filter((entry) => entry.quote)
    : [];
  let variant = "list";

  if (!normalizedQuotes.length) {
    variant = input?.message ? "fallback" : "empty";
  }

  return {
    variant,
    stale: Boolean(input?.stale),
    quotes: normalizedQuotes,
    fetchedAt: input?.fetchedAt || null,
    recordedDate: input?.recordedDate || null,
    displayDate: input?.displayDate || null,
    message: input?.message || "",
    title: "Quotes of the Day",
    description:
      variant === "fallback"
        ? "The daily quote preview is temporarily unavailable."
        : variant === "empty"
          ? "No daily quotes are available right now."
          : DEFAULT_DESCRIPTION,
    imageAlt: "A preview image of the daily quotes on Mirabellier.",
    version:
      input?.fetchedAt ||
      (input?.recordedDate ? `date-${input.recordedDate}` : "quotes-fallback"),
  };
}

function buildQuoteImagePath(version) {
  const encodedVersion = encodeURIComponent(String(version || "quotes-fallback"));
  return `/quotes/embed-image.png?v=${encodedVersion}`;
}

function buildQuoteLayouts(quotes) {
  return quotes.map((entry, index) => {
    const isFeatured = index === 0;
    const quoteFontSize = isFeatured ? 21 : 18;
    const lines = wrapText(
      `"${entry.quote}"`,
      isFeatured ? 74 : 82,
      Number.POSITIVE_INFINITY,
    );
    const lineHeight = isFeatured ? 28 : 22;
    const quoteTop = 68;
    const lastQuoteBaseline =
      quoteTop + Math.max(lines.length - 1, 0) * lineHeight;
    const authorY = lastQuoteBaseline + (isFeatured ? 38 : 34);
    const quoteBlockHeight = authorY + 18;

    return {
      ...entry,
      isFeatured,
      quoteFontSize,
      quoteTop,
      authorY,
      lines,
      lineHeight,
      height: quoteBlockHeight,
    };
  });
}

function computePreviewHeight(state) {
  if (state.variant === "fallback") {
    return FALLBACK_HEIGHT;
  }

  if (state.variant === "empty") {
    return EMPTY_HEIGHT;
  }

  const layouts = buildQuoteLayouts(state.quotes);
  const contentHeight =
    layouts.reduce((total, layout) => total + layout.height, 0) +
    Math.max(layouts.length - 1, 0) * SECTION_GAP;

  const cardHeight =
    HEADER_HEIGHT +
    (state.stale ? BANNER_HEIGHT : 0) +
    contentHeight +
    40;

  return Math.max(MIN_LIST_HEIGHT, CARD_Y + cardHeight + 60);
}

function getQuotePreviewDimensions(state) {
  return {
    width: PREVIEW_WIDTH,
    height: computePreviewHeight(state),
  };
}

function buildQuoteShareHtml({
  state,
  protocol,
  host,
  spaPath = "/quotes",
}) {
  const canonicalUrl = `${protocol}://${host}${spaPath}`;
  const imageUrl = `${protocol}://${host}${buildQuoteImagePath(state.version)}`;
  const dimensions = getQuotePreviewDimensions(state);
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
      <p><a href="${escapeHtml(canonicalUrl)}">Open the quotes page</a></p>
    </main>
  </body>
</html>`;
}

async function loadQuoteAssets() {
  if (!cachedAssetsPromise) {
    cachedAssetsPromise = Promise.all([
      buildRepoImageDataUri("public/light.webp", {
        width: PREVIEW_WIDTH,
        height: MIN_LIST_HEIGHT,
      }),
      buildRepoImageDataUri("public/flower.png", {
        width: 64,
        height: 64,
        fit: "contain",
      }),
    ]).then(([background, flower]) => ({
      background,
      flower,
    }));
  }

  return cachedAssetsPromise;
}

function buildStaleBanner(state) {
  return `
    <rect x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + HEADER_HEIGHT - 8}" width="${CARD_WIDTH - CARD_PADDING_X * 2}" height="62" rx="18" fill="#fffbeb" stroke="#f59e0b" stroke-width="2" />
    <text x="${CARD_X + CARD_PADDING_X + 20}" y="${CARD_Y + HEADER_HEIGHT + 28}" font-family="QuicksandPreview, sans-serif" font-size="17" font-weight="700" fill="#b45309">Showing the last successful snapshot from ${escapeSvg(formatFetchedAt(state.fetchedAt))}.</text>
  `;
}

function renderQuoteSections(state) {
  const layouts = buildQuoteLayouts(state.quotes);
  let currentY = CARD_Y + HEADER_HEIGHT + (state.stale ? BANNER_HEIGHT : 0);

  return layouts
    .map((layout, index) => {
      const quoteLines = layout.lines
        .map(
          (line, lineIndex) =>
            `<tspan x="${CARD_X + CARD_PADDING_X + 18}" dy="${lineIndex === 0 ? 0 : layout.lineHeight}">${escapeSvg(line)}</tspan>`,
        )
        .join("");
      const sectionY = currentY;
      currentY += layout.height + (index < layouts.length - 1 ? SECTION_GAP : 0);

      return `
        <g>
          <text x="${CARD_X + CARD_PADDING_X}" y="${sectionY + 28}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="${layout.isFeatured ? 24 : 20}" font-weight="700" fill="#1d4ed8">${escapeSvg(layout.isFeatured ? "Featured quote" : layout.category)}</text>
          <text x="${CARD_X + CARD_PADDING_X + 18}" y="${sectionY + layout.quoteTop}" font-family="QuicksandPreview, sans-serif" font-size="${layout.quoteFontSize}" font-style="italic" font-weight="700" fill="#334155">
            ${quoteLines}
          </text>
          <text x="${CARD_X + CARD_PADDING_X + 18}" y="${sectionY + layout.authorY}" font-family="QuicksandPreview, sans-serif" font-size="20" font-weight="700" fill="#2563eb">-- ${escapeSvg(layout.author)}</text>
        </g>
      `;
    })
    .join("");
}

function renderListSvg(state, dimensions, assets) {
  const cardHeight = dimensions.height - CARD_Y - 50;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">
      <defs>
        <style>
          ${buildEmbeddedFontsCss()}
        </style>
      </defs>
      ${assets.background ? `<image href="${assets.background}" x="0" y="0" width="${dimensions.width}" height="${dimensions.height}" preserveAspectRatio="xMidYMid slice" />` : `<rect width="100%" height="100%" fill="#eaf4ff" />`}
      <rect width="100%" height="100%" fill="rgba(255,255,255,0.18)" />
      <g>
        <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_WIDTH}" height="${cardHeight}" rx="26" fill="rgba(255,255,255,0.6)" />
        <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_WIDTH}" height="${cardHeight}" rx="26" fill="none" stroke="#93c5fd" stroke-width="2.5" />
        ${assets.flower ? `<image href="${assets.flower}" x="${CARD_X + CARD_WIDTH - 64}" y="${CARD_Y - 18}" width="56" height="56" preserveAspectRatio="xMidYMid contain" />` : ""}
        <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 42}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="34" font-weight="700" fill="#1d4ed8">Quote of the day</text>
        <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 74}" font-family="QuicksandPreview, sans-serif" font-size="18" font-weight="700" fill="#60a5fa">(${escapeSvg(formatFetchedAt(state.fetchedAt))})</text>
        ${state.stale ? buildStaleBanner(state) : ""}
        ${renderQuoteSections(state)}
      </g>
    </svg>
  `;
}

function renderEmptySvg(dimensions, assets) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">
      <defs>
        <style>
          ${buildEmbeddedFontsCss()}
        </style>
      </defs>
      ${assets.background ? `<image href="${assets.background}" x="0" y="0" width="${dimensions.width}" height="${dimensions.height}" preserveAspectRatio="xMidYMid slice" />` : `<rect width="100%" height="100%" fill="#eaf4ff" />`}
      <rect width="100%" height="100%" fill="rgba(255,255,255,0.18)" />
      <g>
        <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_WIDTH}" height="480" rx="26" fill="rgba(255,255,255,0.6)" />
        <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_WIDTH}" height="480" rx="26" fill="none" stroke="#93c5fd" stroke-width="2.5" />
        ${assets.flower ? `<image href="${assets.flower}" x="${CARD_X + CARD_WIDTH - 64}" y="${CARD_Y - 18}" width="56" height="56" preserveAspectRatio="xMidYMid contain" />` : ""}
        <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 42}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="34" font-weight="700" fill="#1d4ed8">Quote of the day</text>
        <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 184}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="36" font-weight="700" fill="#1d4ed8">No daily quotes are available right now.</text>
        <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 236}" font-family="QuicksandPreview, sans-serif" font-size="22" font-weight="700" fill="#475569">The next quote snapshot will appear here once it is ready.</text>
      </g>
    </svg>
  `;
}

function renderFallbackSvg(state, dimensions, assets) {
  const lines = wrapText(
    state.message || "The daily quote snapshot is temporarily unavailable.",
    62,
    4,
  );
  const messageMarkup = lines
    .map(
      (line, index) =>
        `<tspan x="${CARD_X + CARD_PADDING_X}" dy="${index === 0 ? 0 : 34}">${escapeSvg(line)}</tspan>`,
    )
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">
      <defs>
        <style>
          ${buildEmbeddedFontsCss()}
        </style>
      </defs>
      ${assets.background ? `<image href="${assets.background}" x="0" y="0" width="${dimensions.width}" height="${dimensions.height}" preserveAspectRatio="xMidYMid slice" />` : `<rect width="100%" height="100%" fill="#eaf4ff" />`}
      <rect width="100%" height="100%" fill="rgba(255,255,255,0.18)" />
      <g>
        <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_WIDTH}" height="480" rx="26" fill="rgba(255,255,255,0.6)" />
        <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_WIDTH}" height="480" rx="26" fill="none" stroke="#93c5fd" stroke-width="2.5" />
        ${assets.flower ? `<image href="${assets.flower}" x="${CARD_X + CARD_WIDTH - 64}" y="${CARD_Y - 18}" width="56" height="56" preserveAspectRatio="xMidYMid contain" />` : ""}
        <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 42}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="34" font-weight="700" fill="#1d4ed8">Quote of the day</text>
        <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 152}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="30" font-weight="700" fill="#1d4ed8">Quote preview status</text>
        <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 212}" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="28" font-weight="700" fill="#334155">
          ${messageMarkup}
        </text>
        <text x="${CARD_X + CARD_PADDING_X}" y="${CARD_Y + 344}" font-family="QuicksandPreview, sans-serif" font-size="22" font-weight="700" fill="#475569">The page will share cleanly again after the next successful quote snapshot.</text>
      </g>
    </svg>
  `;
}

async function renderQuotePreviewBuffer(state) {
  const dimensions = getQuotePreviewDimensions(state);
  const assets = await loadQuoteAssets();
  const svg =
    state.variant === "fallback"
      ? renderFallbackSvg(state, dimensions, assets)
      : state.variant === "empty"
        ? renderEmptySvg(dimensions, assets)
        : renderListSvg(state, dimensions, assets);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = {
  buildQuoteImagePath,
  buildQuotePreviewState,
  buildQuoteShareHtml,
  getQuotePreviewDimensions,
  renderQuotePreviewBuffer,
};
