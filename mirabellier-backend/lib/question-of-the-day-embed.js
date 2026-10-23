const crypto = require("crypto");
const sharp = require("sharp");

const {
  buildEmbeddedFontsCss,
  escapeHtml,
  escapeJsonForHtml,
  escapeSvg,
  wrapText,
} = require("./share-preview-utils");

const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 630;
const QUESTION_CENTER_X = PREVIEW_WIDTH / 2;
const QUESTION_CENTER_Y = PREVIEW_HEIGHT / 2;
const RENDERER_VERSION = "qotd-render-v5";
const DEFAULT_DESCRIPTION = "Today's public question on Mirabellier.";

function buildVersion(currentRecordedDate, question) {
  const input = [
    RENDERER_VERSION,
    currentRecordedDate || "",
    question?.recordedDate || "",
    question?.updatedAt || "",
    question?.prompt || "",
  ].join("|");

  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function buildQuestionPreviewState({ currentRecordedDate, question }) {
  const normalizedQuestion =
    question && typeof question.prompt === "string"
      ? {
          recordedDate: question.recordedDate || "",
          prompt: question.prompt || "",
          updatedAt: question.updatedAt || "",
          carriedFromRecordedDate: question.carriedFromRecordedDate || "",
        }
      : null;
  const carriedOver = Boolean(
    normalizedQuestion && normalizedQuestion.carriedFromRecordedDate,
  );

  return {
    variant: normalizedQuestion ? "question" : "empty",
    currentRecordedDate: currentRecordedDate || "",
    question: normalizedQuestion,
    carriedOver,
    title: "Question of the Day",
    description: normalizedQuestion
      ? DEFAULT_DESCRIPTION
      : "There is no live question on Mirabellier right now.",
    imageAlt: "A preview image of Mirabellier's question of the day page.",
    version: buildVersion(currentRecordedDate, normalizedQuestion),
  };
}

function getQuestionPreviewDimensions() {
  return {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
  };
}

function buildQuestionImagePath(version) {
  const encodedVersion = encodeURIComponent(String(version || "fallback"));
  return `/question-of-the-day/embed-image.png?v=${encodedVersion}`;
}

function buildQuestionShareHtml({
  state,
  protocol,
  host,
  spaPath = "/question-of-the-day",
}) {
  const canonicalUrl = `${protocol}://${host}${spaPath}`;
  const imageUrl = `${protocol}://${host}${buildQuestionImagePath(state.version)}`;
  const dimensions = getQuestionPreviewDimensions();
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
      <p><a href="${escapeHtml(canonicalUrl)}">Open the question of the day page</a></p>
    </main>
  </body>
</html>`;
}

function buildQuestionLayout(prompt) {
  const candidates = [
    { maxChars: 28, maxLines: 3, fontSize: 62, lineHeight: 66 },
    { maxChars: 32, maxLines: 4, fontSize: 56, lineHeight: 60 },
    { maxChars: 36, maxLines: 4, fontSize: 50, lineHeight: 54 },
    { maxChars: 40, maxLines: 5, fontSize: 44, lineHeight: 48 },
    { maxChars: 46, maxLines: 6, fontSize: 38, lineHeight: 42 },
    { maxChars: 52, maxLines: 7, fontSize: 33, lineHeight: 37 },
    { maxChars: 58, maxLines: 8, fontSize: 29, lineHeight: 33 },
    { maxChars: 64, maxLines: 9, fontSize: 25, lineHeight: 29 },
  ];
  const availableHeight = 360;

  for (const candidate of candidates) {
    const lines = wrapText(prompt, candidate.maxChars, Number.POSITIVE_INFINITY);
    const textHeight =
      candidate.fontSize + Math.max(lines.length - 1, 0) * candidate.lineHeight;

    if (lines.length <= candidate.maxLines && textHeight <= availableHeight) {
      return {
        ...candidate,
        lines,
      };
    }
  }

  const fallback = candidates[candidates.length - 1];
  return {
    ...fallback,
    lines: wrapText(prompt, fallback.maxChars, fallback.maxLines),
  };
}

function buildBackground() {
  return `
    <defs>
      <linearGradient id="pageBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f8fbff" />
        <stop offset="100%" stop-color="#e8f3ff" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#pageBg)" />
    <circle cx="154" cy="122" r="106" fill="rgba(252, 207, 232, 0.22)" />
    <circle cx="1058" cy="92" r="112" fill="rgba(147, 197, 253, 0.26)" />
    <circle cx="1084" cy="548" r="172" fill="rgba(147, 197, 253, 0.18)" />
  `;
}

function renderQuestionSvg(state) {
  const questionLayout = state.question
    ? buildQuestionLayout(state.question.prompt)
    : { lines: [], fontSize: 28, lineHeight: 32 };
  const questionMarkup = questionLayout.lines
    .map(
      (line, index) =>
        `<tspan x="${QUESTION_CENTER_X}" dy="${index === 0 ? 0 : questionLayout.lineHeight}">${escapeSvg(line)}</tspan>`,
    )
    .join("");
  const textHeight =
    questionLayout.fontSize +
    Math.max(questionLayout.lines.length - 1, 0) * questionLayout.lineHeight;
  const textStartY =
    QUESTION_CENTER_Y - textHeight / 2 + questionLayout.fontSize / 2;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">
      <defs>
        <style>
          ${buildEmbeddedFontsCss()}
        </style>
        <filter id="questionShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="18" flood-color="#ffffff" flood-opacity="0.72" />
        </filter>
      </defs>
      ${buildBackground()}
      <text x="${QUESTION_CENTER_X}" y="${textStartY}" text-anchor="middle" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="${questionLayout.fontSize}" font-weight="700" fill="#1e3a8a" filter="url(#questionShadow)">
        ${questionMarkup}
      </text>
    </svg>
  `;
}

function renderEmptySvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">
      <defs>
        <style>
          ${buildEmbeddedFontsCss()}
        </style>
        <filter id="questionShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="18" flood-color="#ffffff" flood-opacity="0.72" />
        </filter>
      </defs>
      ${buildBackground()}
      <text x="${QUESTION_CENTER_X}" y="${QUESTION_CENTER_Y}" text-anchor="middle" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="42" font-weight="700" fill="#1e3a8a" filter="url(#questionShadow)">No active question yet.</text>
    </svg>
  `;
}

async function renderQuestionPreviewBuffer(state) {
  const svg =
    state.variant === "empty"
      ? renderEmptySvg(state)
      : renderQuestionSvg(state);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = {
  buildQuestionImagePath,
  buildQuestionPreviewState,
  buildQuestionShareHtml,
  getQuestionPreviewDimensions,
  renderQuestionPreviewBuffer,
};
