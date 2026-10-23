const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const AVATAR_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const AVATAR_DOWNLOAD_TIMEOUT_MS = 12000;
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

function isRemoteHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchRemoteBuffer(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": AVATAR_USER_AGENT,
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(AVATAR_DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_AVATAR_BYTES) {
    throw new Error("unexpected avatar size");
  }
  return buffer;
}

async function mirrorAvatarToPng(avatarUrl, imagesDir) {
  const url = String(avatarUrl || "").trim();
  if (!isRemoteHttpUrl(url)) return url;

  const hash = crypto.createHash("md5").update(url).digest("hex");
  const relativePath = path.posix.join("avatars", `${hash}.png`);
  const absoluteDir = path.join(imagesDir, "avatars");
  const absolutePath = path.join(absoluteDir, `${hash}.png`);

  try {
    if (!fs.existsSync(absolutePath)) {
      await fs.promises.mkdir(absoluteDir, { recursive: true });
      const buffer = await fetchRemoteBuffer(url);
      await sharp(buffer).png().toFile(absolutePath);
    }
    return `/images/${relativePath}`;
  } catch {
    return url;
  }
}

// An avatar value is only safe to hand to a browser or a social crawler when
// it is a locally-hosted, root-relative path. A remote http(s) value here means
// mirrorAvatarToPng could not download it (expired/IP-bound social-CDN token),
// so it would 403/404 wherever it is loaded — surface it as "no avatar" and let
// the caller fall back to a placeholder.
function localAvatarOrNull(value) {
  const str = String(value || "").trim();
  return str.startsWith("/") ? str : null;
}

module.exports = {
  mirrorAvatarToPng,
  localAvatarOrNull,
};
