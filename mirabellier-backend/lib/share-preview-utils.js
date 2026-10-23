const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

let cachedFredokaFont = null;
let cachedQuicksandFont = null;

function resolveRepoPath(...segments) {
  return path.join(__dirname, "..", "..", ...segments);
}

function readFileAsBase64(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath).toString("base64");
}

function buildEmbeddedFontsCss() {
  if (!cachedFredokaFont) {
    cachedFredokaFont = readFileAsBase64(
      resolveRepoPath("public", "fonts", "fredoka-latin-variable.woff2"),
    );
  }

  if (!cachedQuicksandFont) {
    cachedQuicksandFont = readFileAsBase64(
      resolveRepoPath("public", "fonts", "quicksand-latin-variable.woff2"),
    );
  }

  const blocks = [];

  if (cachedFredokaFont) {
    blocks.push(`@font-face {
      font-family: 'FredokaPreview';
      src: url(data:font/woff2;base64,${cachedFredokaFont}) format('woff2');
    }`);
  }

  if (cachedQuicksandFont) {
    blocks.push(`@font-face {
      font-family: 'QuicksandPreview';
      src: url(data:font/woff2;base64,${cachedQuicksandFont}) format('woff2');
    }`);
  }

  return blocks.join("\n");
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

function wrapText(value, maxCharsPerLine, maxLines = Number.POSITIVE_INFINITY) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return [""];
  }

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

function isLikelyCrawler(userAgent) {
  const value = String(userAgent || "").toLowerCase();
  if (/whatsapp/.test(value) && !value.includes("mozilla")) {
    return true;
  }
  return /bot|crawler|spider|preview|pinterest|redditbot|embedly|viber|kakaotalk|facebookexternalhit|twitterbot|discordbot|slackbot|linkedinbot|google-inspectiontool|googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex/.test(
    value,
  );
}

/**
 * True only for Discord's unfurler (`Discordbot/2.0`). Discord folds the whole
 * `<head>` into its card — `<title>` + `<meta name="description">` become the
 * text block and a JSON-LD `VideoObject` supplies the thumbnail — so pages that
 * want a bare inline video player have to answer Discord with a stripped shell.
 * Every other unfurler and search engine keeps the full metadata.
 */
function isDiscordCrawler(userAgent) {
  return /discordbot/i.test(String(userAgent || ""));
}

function resolveProtocol(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];

  if (typeof forwardedProto === "string" && forwardedProto.trim()) {
    return forwardedProto.split(",")[0].trim();
  }

  return req.protocol || "http";
}

async function buildImageDataUriFromPath(filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    let pipeline = sharp(filePath, { animated: false });

    if (options.width || options.height) {
      pipeline = pipeline.resize(options.width, options.height, {
        fit: options.fit || "cover",
        position: options.position || "centre",
        withoutEnlargement: Boolean(options.withoutEnlargement),
      });
    }

    const format = options.format === "webp" ? "webp" : "png";
    const output =
      format === "webp"
        ? await pipeline.webp().toBuffer()
        : await pipeline.png().toBuffer();

    return `data:image/${format};base64,${output.toString("base64")}`;
  } catch {
    return null;
  }
}

async function buildRepoImageDataUri(relativePath, options = {}) {
  const normalizedPath = Array.isArray(relativePath)
    ? resolveRepoPath(...relativePath)
    : resolveRepoPath(
        ...String(relativePath || "")
          .split("/")
          .filter(Boolean),
      );

  return buildImageDataUriFromPath(normalizedPath, options);
}

module.exports = {
  buildImageDataUriFromPath,
  buildEmbeddedFontsCss,
  buildRepoImageDataUri,
  escapeHtml,
  escapeJsonForHtml,
  escapeSvg,
  isDiscordCrawler,
  isLikelyCrawler,
  limitLength,
  resolveProtocol,
  resolveRepoPath,
  wrapText,
};
