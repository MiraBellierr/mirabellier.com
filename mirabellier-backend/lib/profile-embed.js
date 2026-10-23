const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");

const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 630;
const AVATAR_SIZE = 176;

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

function buildEmbeddedFontsCss() {
  const blocks = [];
  const fredoka = getFredokaFontBase64();
  const quicksand = getQuicksandFontBase64();

  if (fredoka) {
    blocks.push(`@font-face {
      font-family: 'FredokaPreview';
      src: url(data:font/woff2;base64,${fredoka}) format('woff2');
    }`);
  }

  if (quicksand) {
    blocks.push(`@font-face {
      font-family: 'QuicksandPreview';
      src: url(data:font/woff2;base64,${quicksand}) format('woff2');
    }`);
  }

  return blocks.join("\n");
}

function escapeSvg(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(value, maxCharsPerLine, maxLines) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return [];

  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      lines.push(word.slice(0, maxCharsPerLine));
      currentLine = "";
    }

    if (lines.length === maxLines) {
      break;
    }
  }

  if (lines.length < maxLines && currentLine) {
    lines.push(currentLine);
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  if (words.length && lines.length === maxLines) {
    const allText = lines.join(" ");
    if (allText.length < text.length) {
      lines[lines.length - 1] = `${lines[lines.length - 1].slice(
        0,
        Math.max(maxCharsPerLine - 3, 1),
      )}...`;
    }
  }

  return lines;
}

function buildProfileImageVersion(user) {
  const input = [
    user?.username || "",
    user?.avatar || "",
    user?.banner || "",
    user?.bio || "",
    user?.location || "",
    user?.website || "",
  ].join("|");

  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function buildProfileEmbedPath(username, version) {
  const encodedUsername = encodeURIComponent(String(username || ""));
  const encodedVersion = encodeURIComponent(String(version || "default"));
  return `/api/profile-embed/${encodedUsername}.png?v=${encodedVersion}`;
}

function resolveAssetSource(asset, imagesDir) {
  if (!asset) return null;

  if (/^https?:\/\//i.test(asset)) {
    return { type: "remote", url: asset };
  }

  if (asset.startsWith("/images/")) {
    return {
      type: "local",
      path: path.join(imagesDir, decodeURIComponent(asset.slice("/images/".length))),
    };
  }

  if (asset.startsWith("/")) {
    return {
      type: "local",
      path: resolveRepoPath("public", decodeURIComponent(asset.slice(1))),
    };
  }

  return {
    type: "local",
    path: path.join(imagesDir, decodeURIComponent(asset)),
  };
}

async function readSourceBuffer(source) {
  if (!source) return null;

  try {
    if (source.type === "remote") {
      const response = await axios.get(source.url, {
        responseType: "arraybuffer",
        timeout: 10000,
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "User-Agent": "Mirabellier/1.0 (+https://mirabellier.com)",
        },
      });

      return Buffer.from(response.data);
    }

    if (source.type === "local" && fs.existsSync(source.path)) {
      return fs.readFileSync(source.path);
    }
  } catch {
    return null;
  }

  return null;
}

async function buildImageDataUri(asset, options) {
  const source = resolveAssetSource(asset, options.imagesDir);
  const inputBuffer = await readSourceBuffer(source);
  if (!inputBuffer) {
    return null;
  }

  try {
    const resized = await sharp(inputBuffer)
      .resize(options.width, options.height, {
        fit: options.fit || "cover",
        position: options.position || "centre",
      })
      .png()
      .toBuffer();

    return `data:image/png;base64,${resized.toString("base64")}`;
  } catch {
    return null;
  }
}

async function buildBackgroundDataUri(user, imagesDir) {
  const banner = await buildImageDataUri(user.banner, {
    imagesDir,
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    fit: "cover",
  });
  if (banner) {
    return banner;
  }

  const fallbackBackground = await buildImageDataUri("/background.jpg", {
    imagesDir,
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    fit: "cover",
  });

  return fallbackBackground;
}

async function buildAvatarDataUri(user, imagesDir) {
  return buildImageDataUri(user.avatar, {
    imagesDir,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    fit: "cover",
  });
}

function buildInitials(value) {
  const text = String(value || "").trim();
  if (!text) return "?";

  const parts = text.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("")
    .slice(0, 2);
}

function buildProfileSvg({ user, backgroundDataUri, avatarDataUri }) {
  const title = `${user.username}'s Profile`;
  const bioLines = wrapText(
    user.bio || "Personal profile on Mirabellier.",
    42,
    3,
  );
  const subtitleParts = [user.location, user.website]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const subtitle = subtitleParts.join("  |  ");
  const bioCardY = subtitle ? 302 : 280;
  const bioTextY = subtitle ? 356 : 334;

  const bioMarkup = bioLines
    .map(
      (line, index) =>
        `<tspan x="320" dy="${index === 0 ? 0 : 38}">${escapeSvg(line)}</tspan>`,
    )
    .join("");

  const avatarMarkup = avatarDataUri
    ? `
      <clipPath id="profile-avatar-clip">
        <circle cx="180" cy="315" r="88" />
      </clipPath>
      <image href="${avatarDataUri}" x="92" y="227" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" clip-path="url(#profile-avatar-clip)" preserveAspectRatio="xMidYMid slice" />
    `
    : `
      <text x="180" y="332" text-anchor="middle" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="58" font-weight="700" fill="#eff6ff">
        ${escapeSvg(buildInitials(user.username))}
      </text>
    `;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">
      <defs>
        <linearGradient id="profileOverlay" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(15, 23, 42, 0.22)" />
          <stop offset="55%" stop-color="rgba(15, 23, 42, 0.55)" />
          <stop offset="100%" stop-color="rgba(15, 23, 42, 0.78)" />
        </linearGradient>
        <linearGradient id="cardOverlay" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.16)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0.08)" />
        </linearGradient>
        <style>
          ${buildEmbeddedFontsCss()}
        </style>
      </defs>
      ${
        backgroundDataUri
          ? `<image href="${backgroundDataUri}" x="0" y="0" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" preserveAspectRatio="xMidYMid slice" />`
          : `<rect width="100%" height="100%" fill="#1e3a8a" />`
      }
      <rect width="100%" height="100%" fill="url(#profileOverlay)" />
      <circle cx="1080" cy="96" r="126" fill="rgba(191,219,254,0.18)" />
      <circle cx="1030" cy="566" r="160" fill="rgba(96,165,250,0.16)" />
      <rect x="60" y="72" width="1080" height="486" rx="34" fill="url(#cardOverlay)" stroke="rgba(255,255,255,0.26)" stroke-width="2" />
      <text x="320" y="156" font-family="QuicksandPreview, sans-serif" font-size="18" font-weight="700" fill="#bfdbfe" letter-spacing="2">mirabellier.com / profile</text>
      <text x="320" y="226" font-family="FredokaPreview, QuicksandPreview, sans-serif" font-size="54" font-weight="700" fill="#ffffff">${escapeSvg(title)}</text>
      ${
        subtitle
          ? `<text x="320" y="266" font-family="QuicksandPreview, sans-serif" font-size="23" font-weight="700" fill="#dbeafe">${escapeSvg(subtitle)}</text>`
          : ""
      }
      <rect x="92" y="227" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" rx="88" fill="rgba(255,255,255,0.18)" stroke="#ffffff" stroke-width="5" />
      ${avatarMarkup}
      <rect x="296" y="${bioCardY}" width="762" height="156" rx="28" fill="rgba(15,23,42,0.2)" stroke="rgba(255,255,255,0.16)" stroke-width="2" />
      <text x="320" y="${bioTextY}" font-family="QuicksandPreview, sans-serif" font-size="30" font-weight="700" fill="#eff6ff">
        ${bioMarkup}
      </text>
    </svg>
  `;
}

async function renderProfileEmbedBuffer({ user, imagesDir }) {
  const [backgroundDataUri, avatarDataUri] = await Promise.all([
    buildBackgroundDataUri(user, imagesDir),
    buildAvatarDataUri(user, imagesDir),
  ]);

  const svg = buildProfileSvg({ user, backgroundDataUri, avatarDataUri });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = {
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  buildProfileEmbedPath,
  buildProfileImageVersion,
  renderProfileEmbedBuffer,
};
