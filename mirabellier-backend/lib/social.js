const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const AVATAR_CACHE_FILE =
  process.env.AVATAR_CACHE_FILE ||
  path.join(__dirname, "..", "data", "avatar-cache.json");
const AVATAR_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function readAvatarCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(AVATAR_CACHE_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAvatarCache(cache) {
  try {
    fs.writeFileSync(AVATAR_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Cache is best-effort — never block resolution on it.
  }
}

function cachedAvatarUrl(platform, username) {
  const clean = String(username || "").trim();
  if (!clean) return null;
  const cache = readAvatarCache();
  const entry = cache[`${platform}:${clean.toLowerCase()}`];
  if (!entry?.url) return null;
  if (Date.now() - Number(entry.updatedAt || 0) > AVATAR_CACHE_MAX_AGE_MS) {
    return null;
  }
  return entry.url;
}

function rememberAvatarUrl(platform, username, avatarUrl) {
  const clean = String(username || "").trim();
  const url = String(avatarUrl || "").trim();
  if (!clean || !/^https?:\/\//i.test(url)) return;
  const key = `${platform}:${clean.toLowerCase()}`;
  const cache = readAvatarCache();
  cache[key] = { url, updatedAt: Date.now() };
  writeAvatarCache(cache);
}

const {
  buildTikTokHeaders,
  fetchTikTokMetadata,
  fetchTikTokUserInfo,
  tikTokCookieFilePath,
} = require("./tiktok");
const {
  cookieHeaderForHost,
  cookieFilePathIfExists,
} = require("./netscape-cookies");

const INSTAGRAM_COOKIES_FILE =
  process.env.INSTAGRAM_COOKIES_FILE ||
  path.join(__dirname, "..", "data", "instagram-cookies.txt");

const YOUTUBE_COOKIES_FILE =
  process.env.YOUTUBE_COOKIES_FILE ||
  path.join(__dirname, "..", "data", "youtube-cookies.txt");

const SOCIAL_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const YTDLP_BINARY =
  String(process.env.YTDLP_PATH || "yt-dlp").trim() || "yt-dlp";

// When the bgutil POT provider plugin is installed next to yt-dlp it talks to
// the provider's default address (http://127.0.0.1:4416). Set this only if you
// run the provider elsewhere (see scripts/setup-youtube-pot-provider.sh).
const YOUTUBE_POT_BASE_URL = String(
  process.env.YOUTUBE_POT_BASE_URL || "",
).trim();

const YOUTUBE_WALL_PATTERNS = [
  /confirm you(?:'|\u2019)re not a bot/i,
  /the page needs to be reloaded/i,
];

const YOUTUBE_WALL_HINT =
  "YouTube refused the request from the server's IP (bot check). " +
  "Run scripts/setup-youtube-pot-provider.sh on the server, make sure " +
  "data/youtube-cookies.txt is a fresh export from a LOGGED-IN YouTube " +
  "account (a logged-out session is still rejected), and keep yt-dlp up to " +
  "date — or download the video manually and upload the file instead.";

function isYouTubeWallMessage(message) {
  return YOUTUBE_WALL_PATTERNS.some((pattern) => pattern.test(String(message || "")));
}

function annotateYouTubeWallError(err) {
  if (!err || err.code !== "YTDLP_FAILED") return err;
  if (!isYouTubeWallMessage(err.message)) return err;
  const annotated = new Error(YOUTUBE_WALL_HINT);
  annotated.code = "YOUTUBE_WALL";
  return annotated;
}

// yt-dlp >= 2025.05.22 auto-uses an installed POT provider plugin; only a
// non-default provider address needs an explicit extractor argument.
function youTubePotExtractorArgs() {
  if (!YOUTUBE_POT_BASE_URL) return [];
  return [
    "--extractor-args",
    `youtubepot-bgutilhttp:base_url=${YOUTUBE_POT_BASE_URL}`,
  ];
}

function instagramCookiesFilePath() {
  return cookieFilePathIfExists(INSTAGRAM_COOKIES_FILE);
}

function youtubeCookiesFilePath() {
  return cookieFilePathIfExists(YOUTUBE_COOKIES_FILE);
}

function instagramCookieHeader() {
  return cookieHeaderForHost(INSTAGRAM_COOKIES_FILE, "instagram.com");
}

function parseMaxImportBytes() {
  const rawMb = Number.parseInt(
    String(process.env.VIDEO_IMPORT_MAX_MB || "200"),
    10,
  );
  const mb = Number.isFinite(rawMb) ? rawMb : 200;
  return mb * 1024 * 1024;
}

const MAX_IMPORT_BYTES = parseMaxImportBytes();
const DOWNLOAD_TIMEOUT_MS = 600000;
const STREAM_TIMEOUT_MS = 180000;
const METADATA_TIMEOUT_MS = 8000;
const PROFILE_TIMEOUT_MS = 6000;

function classifyPlatform(rawUrl) {
  let parsed = null;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    return null;
  }
  // Only ever hand real web URLs to yt-dlp — reject file:, data:, etc. before
  // the hostname allowlist even gets a look.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (
    hostname === "tiktok.com" ||
    hostname.endsWith(".tiktok.com")
  ) {
    return "tiktok";
  }
  if (
    hostname === "instagram.com" ||
    hostname === "instagr.am" ||
    hostname.endsWith(".instagram.com")
  ) {
    return "instagram";
  }
  if (
    hostname === "youtube.com" ||
    hostname === "youtu.be" ||
    hostname === "youtube-nocookie.com" ||
    hostname.endsWith(".youtube.com")
  ) {
    return "youtube";
  }
  return null;
}

function canonicalizeYouTubeUrl(rawUrl) {
  let parsed = null;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  if (parsed.hostname.toLowerCase() === "youtu.be") {
    const shortId = parsed.pathname.split("/").filter(Boolean)[0];
    if (shortId) {
      return `https://www.youtube.com/watch?v=${encodeURIComponent(shortId)}`;
    }
  }

  if (parsed.hostname.toLowerCase().endsWith("youtube.com")) {
    if (parsed.pathname === "/watch") {
      const watchId = parsed.searchParams.get("v");
      if (watchId) return parsed.toString();
    }
    const match = String(parsed.pathname || "").match(
      /^\/(?:shorts|embed|live|v)\/([\w-]+)/,
    );
    if (match) {
      return `https://www.youtube.com/watch?v=${encodeURIComponent(match[1])}`;
    }
  }

  return parsed.toString();
}

function canonicalizeInstagramUrl(rawUrl) {
  let parsed = null;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (parsed.hostname.toLowerCase() === "instagr.am") {
    parsed.hostname = "instagram.com";
  }
  return parsed.toString();
}

function stripAt(raw) {
  return String(raw || "").trim().replace(/^@+/, "");
}

function extractHashtags(raw) {
  const text = String(raw || "");
  const tags = [];
  const matches = text.matchAll(/#([\p{L}\p{N}_]+)/gu);
  for (const match of matches) {
    const tag = match[1];
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function stripHashtags(raw) {
  return String(raw || "")
    .replace(/(?:^|\s)#[\p{L}\p{N}_]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mimeTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4" || ext === ".m4v" || ext === ".mov") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".ogv") return "video/ogg";
  if (ext === ".mkv") return "video/x-matroska";
  return "application/octet-stream";
}

function parseOembedUrl(platform, json) {
  const authorUrl = String(json?.author_url || "");
  if (platform === "youtube") {
    const match = authorUrl.match(/youtube\.com\/(@[^/?#]+)/i);
    return match ? stripAt(match[1]) : "";
  }
  if (platform === "instagram") {
    const match = authorUrl.match(/instagram\.com\/([^/?#]+)/i);
    return match ? match[1] : "";
  }
  return "";
}

async function fetchOembed(platform, url) {
  let target = null;
  if (platform === "youtube") {
    target = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  } else if (platform === "instagram") {
    target = `https://www.instagram.com/api/v1/oembed?url=${encodeURIComponent(url)}`;
  }
  if (!target) return null;

  const headers = {
    "user-agent": SOCIAL_USER_AGENT,
    accept: "application/json",
  };
  const igCookie = platform === "instagram" ? instagramCookieHeader() : "";
  if (igCookie) headers.cookie = igCookie;

  let res = null;
  try {
    res = await fetch(target, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function runYtDlp(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      YTDLP_BINARY,
      args,
      {
        maxBuffer: 4 * 1024 * 1024,
        timeout: options.timeout,
        killSignal: "SIGKILL",
        windowsHide: true,
        cwd: options.cwd,
      },
      (error, stdout) => {
        if (error) {
          const detail = String(error.stderr || error.message || "").trim();
          const lastLine =
            detail.split("\n").filter(Boolean).pop() || "";
          if (error.code === "ENOENT") {
            const err = new Error(
              "yt-dlp is not installed on the server — install it to import Instagram or YouTube videos, or upload the file manually",
            );
            err.code = "YTDLP_MISSING";
            reject(err);
            return;
          }
          if (error.killed) {
            const err = new Error("Timed out downloading the video");
            err.code = "YTDLP_TIMEOUT";
            reject(err);
            return;
          }
          const err = new Error(
            String(lastLine)
              .replace(/^ERROR:\s*/i, "")
              .replace(/^yt-dlp:\s*/i, "")
              .trim() || "The video downloader failed",
          );
          err.code = "YTDLP_FAILED";
          reject(err);
          return;
        }
        resolve(String(stdout || ""));
      },
    );
  });
}

const FFMPEG_PATH =
  String(process.env.FFMPEG_PATH || "ffmpeg").trim() || "ffmpeg";
const FFPROBE_PATH =
  String(process.env.FFPROBE_PATH || "ffprobe").trim() || "ffprobe";
const TRANSCODE_TIMEOUT_MS = 1800000;

// Safari on iOS (and iPads) can only decode a narrow set of MP4 codecs when
// streamed over HTTP. Uploads and Instagram/YouTube exports often land as
// HEVC (hvc1), AV1 or VP9, which desktop Chrome plays but iPhones cannot.
// These helpers probe the file and normalize it to the delivery profile
// defined below (H.264/AAC MP4, faststart, 1080p/60/capped).
function toolMissingError(binary, envName) {
  const err = new Error(
    `"${binary}" is not available on the server — install ffmpeg (which ships ${binary}) or point ${envName} at the binary, then retry the import`,
  );
  err.code = "FFMPEG_MISSING";
  return err;
}

async function runFfprobe(args) {
  let stdout = "";
  try {
    stdout = await new Promise((resolve, reject) => {
      execFile(
        FFPROBE_PATH,
        args,
        { timeout: 30000, windowsHide: true },
        (error, out) => {
          if (error) {
            if (error.code === "ENOENT") {
              reject(toolMissingError("ffprobe", "FFPROBE_PATH"));
              return;
            }
            reject(
              new Error(
                String(error.stderr || error.message || "").trim() ||
                  "ffprobe failed",
              ),
            );
            return;
          }
          resolve(String(out || ""));
        },
      );
    });
  } catch (err) {
    if (err && err.code === "FFMPEG_MISSING") throw err;
    throw new Error("Could not inspect the downloaded video");
  }
  return stdout;
}

async function runFfmpeg(args) {
  await new Promise((resolve, reject) => {
    execFile(
      FFMPEG_PATH,
      args,
      {
        maxBuffer: 4 * 1024 * 1024,
        timeout: TRANSCODE_TIMEOUT_MS,
        killSignal: "SIGKILL",
        windowsHide: true,
      },
      (error) => {
        if (error) {
          if (error.code === "ENOENT") {
            reject(toolMissingError("ffmpeg", "FFMPEG_PATH"));
            return;
          }
          if (error.killed) {
            const err = new Error("Timed out converting the video");
            err.code = "TRANSCODE_TIMEOUT";
            reject(err);
            return;
          }
          const detail = String(error.stderr || error.message || "").trim();
          const lastLine = detail.split("\n").filter(Boolean).pop() || "";
          reject(
            new Error(
              String(lastLine)
                .replace(/^ERROR:\s*/i, "")
                .replace(/^ffmpeg:\s*/i, "")
                .trim() || "The video conversion failed",
            ),
          );
          return;
        }
        resolve();
      },
    );
  });
}

// "30000/1001" → 29.97, "30" → 30, "" / "0/0" → null
function parseFrameRate(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const [num, den] = text.split("/");
  const n = Number.parseFloat(num);
  const d = den === undefined ? 1 : Number.parseFloat(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  const fps = n / d;
  return Number.isFinite(fps) && fps > 0 ? fps : null;
}

async function probeVideoFile(filePath) {
  const stdout = await runFfprobe([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    filePath,
  ]);
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = null;
  }
  const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
  const format = parsed?.format && typeof parsed.format === "object"
    ? parsed.format
    : {};
  const video = streams.find(
    (stream) => String(stream.codec_type) === "video",
  );
  const audio = streams.find(
    (stream) => String(stream.codec_type) === "audio",
  );

  const width = video ? Number.parseInt(video.width, 10) || 0 : 0;
  const height = video ? Number.parseInt(video.height, 10) || 0 : 0;
  const fps = video
    ? parseFrameRate(video.avg_frame_rate) ||
      parseFrameRate(video.r_frame_rate)
    : null;
  const durationRaw =
    Number.parseFloat(video?.duration) ||
    Number.parseFloat(format.duration) ||
    0;
  const bitsPerSecond =
    Number.parseInt(video?.bit_rate, 10) ||
    Number.parseInt(format.bit_rate, 10) ||
    0;

  return {
    videoCodec: video ? String(video.codec_name || "").toLowerCase() : "",
    audioCodec: audio ? String(audio.codec_name || "").toLowerCase() : "",
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    pixelFormat: video ? String(video.pix_fmt || "").toLowerCase() : "",
    colorTransfer: video
      ? String(video.color_transfer || "").toLowerCase()
      : "",
    width,
    height,
    fps,
    durationSeconds: durationRaw > 0 ? durationRaw : null,
    bitRateKbps: bitsPerSecond > 0 ? Math.round(bitsPerSecond / 1000) : null,
  };
}

// 10-bit + PQ/HLG means the video carries HDR brightness data (typical of
// iPhone HEVC recordings). Truncating it straight to 8-bit H.264 leaves the
// picture washed out, so it needs a tone map down to SDR BT.709 first.
const HDR_TRANSFER_CODES = new Set(["smpte2084", "arib-std-b67"]);
const HDR_TO_SDR_FILTER =
  "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709," +
  "tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";

function pixelFormatBitDepth(pixelFormat) {
  const match = String(pixelFormat || "").match(/(\d+)le$/);
  if (!match) return null;
  const depth = Number.parseInt(match[1], 10);
  return Number.isFinite(depth) ? depth : null;
}

let zscaleSupportPromise = null;
function ffmpegHasZscale() {
  // The tone map above relies on the zscale filter (built from libzimg).
  // Distro/static ffmpeg builds usually ship it, but check once instead of
  // assuming — without it we fall back to a plain conversion.
  if (!zscaleSupportPromise) {
    zscaleSupportPromise = new Promise((resolve) => {
      execFile(
        FFMPEG_PATH,
        ["-hide_banner", "-filters"],
        { timeout: 15000, windowsHide: true },
        (error, stdout) => {
          resolve(
            !error && /(?:^|\s)zscale\s/.test(String(stdout || "")),
          );
        },
      );
    });
  }
  return zscaleSupportPromise;
}

// ── Delivery encode profile ────────────────────────────────────────────────
// The stored pixie is a single short-form delivery rendition (no adaptive
// ladder): H.264 High / 8-bit yuv420p / AAC in a faststart MP4, capped at
// 1080p on the short edge, 1920 on the long edge and 60 fps, with a 2s
// keyframe interval and a per-tier bitrate ceiling so the feed stays light.
// Sources already inside these limits are kept untouched (or just remuxed
// for container/faststart); 10-bit HDR (PQ/HLG) is tone-mapped to SDR BT.709.
const DELIVERY_MAX_SHORT_EDGE = 1080;
const DELIVERY_MAX_LONG_EDGE = 1920;
const DELIVERY_MAX_FPS = 60;
const DELIVERY_KEYFRAME_SECONDS = 2;
const DELIVERY_AUDIO_BITRATE = "160k";
// EBU R128 loudness target — same as podcasts / most social feeds, so clips
// from different sources don't jump in volume.
const DELIVERY_LOUDNORM_FILTER = "loudnorm=I=-14:TP=-1.5:LRA=11";
// Re-encode only when the source bitrate clearly overshoots the tier ceiling
// (a modest overshoot isn't worth a generation loss).
const DELIVERY_BITRATE_SLACK = 1.35;

// Tightest tier whose short edge is >= the output's short edge wins, so a
// 720-tall clip keeps a 720p ceiling instead of being handed a 1080p budget.
const DELIVERY_LADDER = [
  { shortEdge: 360, crf: 23, maxrateK: 800, bufsizeK: 1600 },
  { shortEdge: 480, crf: 22, maxrateK: 1500, bufsizeK: 3000 },
  { shortEdge: 720, crf: 21, maxrateK: 3000, bufsizeK: 6000 },
  { shortEdge: 1080, crf: 20, maxrateK: 6000, bufsizeK: 12000 },
];

function deliveryTierForShortEdge(shortEdge) {
  return (
    DELIVERY_LADDER.find((tier) => shortEdge <= tier.shortEdge) ||
    DELIVERY_LADDER[DELIVERY_LADDER.length - 1]
  );
}

function evenDown(value) {
  const n = Math.max(2, Math.floor(Number(value) || 0));
  return n % 2 === 0 ? n : n - 1;
}

// Decide what a source needs to become the delivery rendition. `action` is
// "keep" (already compliant), "remux" (compliant stream, wrong container or
// no faststart — lossless stream copy) or "reencode".
function planDeliveryEncode(probe, filePath, { forceReencode = false } = {}) {
  const reasons = [];
  const bitDepth = pixelFormatBitDepth(probe.pixelFormat) ?? 8;
  const isHdr = bitDepth > 8 && HDR_TRANSFER_CODES.has(probe.colorTransfer);

  const srcW = probe.width || 0;
  const srcH = probe.height || 0;
  const haveDims = probe.hasVideo && srcW > 0 && srcH > 0;
  const srcShort = haveDims ? Math.min(srcW, srcH) : 0;
  const srcLong = haveDims ? Math.max(srcW, srcH) : 0;

  // Only ever shrink: fit inside the (short×long) box, keep the aspect ratio.
  let scaleFactor = 1;
  if (haveDims && (srcShort > DELIVERY_MAX_SHORT_EDGE || srcLong > DELIVERY_MAX_LONG_EDGE)) {
    scaleFactor = Math.min(
      DELIVERY_MAX_SHORT_EDGE / srcShort,
      DELIVERY_MAX_LONG_EDGE / srcLong,
      1,
    );
  }
  const needsScale = scaleFactor < 1;
  const targetWidth = haveDims
    ? needsScale ? evenDown(srcW * scaleFactor) : srcW
    : 0;
  const targetHeight = haveDims
    ? needsScale ? evenDown(srcH * scaleFactor) : srcH
    : 0;
  if (needsScale) {
    reasons.push(`${srcW}x${srcH} → ${targetWidth}x${targetHeight}`);
  }

  const srcFps = probe.fps || null;
  const needsFpsCap = Boolean(srcFps && srcFps > DELIVERY_MAX_FPS + 0.5);
  const targetFps = needsFpsCap ? DELIVERY_MAX_FPS : srcFps;
  if (needsFpsCap) {
    reasons.push(`${srcFps.toFixed(2)}fps → ${DELIVERY_MAX_FPS}fps`);
  }

  const outShort = targetHeight && targetWidth
    ? Math.min(targetWidth, targetHeight)
    : DELIVERY_MAX_SHORT_EDGE;
  const tier = deliveryTierForShortEdge(outShort);

  if (!probe.hasVideo) {
    return {
      action: "keep",
      reasons: ["no video stream"],
      tier,
      isHdr: false,
      needsScale: false,
      targetWidth: 0,
      targetHeight: 0,
      targetFps: null,
    };
  }

  if (probe.videoCodec !== "h264") {
    reasons.push(`video codec ${probe.videoCodec || "?"} → h264`);
  }
  if (bitDepth > 8) reasons.push(`${bitDepth}-bit → 8-bit`);
  else if (probe.pixelFormat && probe.pixelFormat !== "yuv420p") {
    reasons.push(`pixel format ${probe.pixelFormat} → yuv420p`);
  }
  if (isHdr) reasons.push(`HDR (${probe.colorTransfer}) → SDR bt709`);

  const overBitrate =
    probe.bitRateKbps != null &&
    probe.bitRateKbps > tier.maxrateK * DELIVERY_BITRATE_SLACK;
  if (overBitrate) {
    reasons.push(`${probe.bitRateKbps}kbps → ≤${tier.maxrateK}kbps`);
  }

  const audioBad = probe.hasAudio && probe.audioCodec !== "aac";
  if (audioBad) reasons.push(`audio codec ${probe.audioCodec || "?"} → aac`);

  const videoNeedsReencode =
    forceReencode ||
    probe.videoCodec !== "h264" ||
    bitDepth > 8 ||
    isHdr ||
    (probe.pixelFormat && probe.pixelFormat !== "yuv420p") ||
    needsScale ||
    needsFpsCap ||
    overBitrate;

  let action = "keep";
  if (videoNeedsReencode || audioBad) action = "reencode";
  else if (!/\.(mp4|m4v)$/i.test(filePath)) {
    action = "remux";
    reasons.push(`container ${path.extname(filePath) || "?"} → mp4`);
  }
  if (forceReencode && reasons.length === 0) reasons.push("forced re-encode");

  return {
    action,
    reasons,
    tier,
    isHdr,
    needsScale,
    targetWidth,
    targetHeight,
    targetFps,
  };
}

async function remuxToFaststartMp4(filePath, probe) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const outPath = path.join(dir, `${base}.mp4`);
  const args = [
    "-nostdin",
    "-y",
    "-v",
    "error",
    "-i",
    filePath,
    "-map",
    "0:v:0",
    "-c:v",
    "copy",
  ];
  if (probe.hasAudio) {
    args.push("-map", "0:a:0", "-c:a", "copy");
  }
  args.push("-movflags", "+faststart", outPath);

  try {
    await runFfmpeg(args);
  } catch (err) {
    await fs.promises.unlink(outPath).catch(() => {});
    throw err;
  }

  const sizeBytes = fs.statSync(outPath).size;
  const dims = await probeVideoFile(outPath).catch(() => probe);
  return {
    filePath: outPath,
    sizeBytes,
    mimeType: "video/mp4",
    converted: true,
    width: dims.width || probe.width || null,
    height: dims.height || probe.height || null,
    fps: dims.fps || probe.fps || null,
    durationSeconds: dims.durationSeconds || probe.durationSeconds || null,
  };
}

// Build the ffmpeg argv for a delivery re-encode from a `planDeliveryEncode`
// plan (see the profile block above).
function buildDeliveryEncodeArgs(filePath, outPath, probe, plan, {
  preset = "slow",
  threads = 0,
} = {}) {
  const { tier, isHdr, needsScale, targetWidth, targetHeight, targetFps } = plan;
  const args = ["-nostdin", "-y", "-v", "error"];
  if (threads > 0) args.push("-threads", String(threads));
  args.push("-i", filePath, "-map", "0:v:0");
  if (probe.hasAudio) args.push("-map", "0:a:0");

  const filters = [];
  if (isHdr && plan.usesToneMap) filters.push(HDR_TO_SDR_FILTER);
  if (needsScale) {
    filters.push(`scale=${targetWidth}:${targetHeight}:flags=lanczos`);
  }
  if (filters.length) args.push("-vf", filters.join(","));

  args.push(
    "-c:v", "libx264",
    "-preset", preset,
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-crf", String(tier.crf),
    "-maxrate", `${tier.maxrateK}k`,
    "-bufsize", `${tier.bufsizeK}k`,
  );

  // ~2s closed GOP with keyframes on a fixed cadence so the file seeks and
  // (later) segments cleanly. Falls back to 30fps math when the source rate
  // is unknown.
  const gopFps = Math.round(targetFps || probe.fps || 30);
  const gop = Math.max(2, gopFps * DELIVERY_KEYFRAME_SECONDS);
  args.push("-g", String(gop), "-keyint_min", String(gop), "-sc_threshold", "0");
  if (targetFps && probe.fps && probe.fps > targetFps + 0.5) {
    args.push("-r", String(targetFps));
  }

  if (isHdr) {
    args.push(
      "-color_primaries", "bt709",
      "-color_trc", "bt709",
      "-colorspace", "bt709",
    );
  }

  if (probe.hasAudio) {
    args.push(
      "-c:a", "aac",
      "-b:a", DELIVERY_AUDIO_BITRATE,
      "-ar", "48000",
      "-af", DELIVERY_LOUDNORM_FILTER,
    );
  } else {
    args.push("-an");
  }

  args.push(
    "-movflags", "+faststart",
    // Drop container-level metadata (creation location, device, …).
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    outPath,
  );
  return args;
}

// Normalize an uploaded/imported source into the stored delivery rendition
// (see the "Delivery encode profile" block above). Returns the file to store:
//   - already inside the profile in an MP4 → kept untouched (`converted:false`)
//   - compliant stream, wrong container → stream-copied to a faststart MP4
//   - anything else → re-encoded to the profile (1080p/60/capped H.264/AAC)
// The result always carries the final width/height/fps/durationSeconds so the
// caller can persist them.
async function transcodeToH264(filePath, opts = {}) {
  const probe = await probeVideoFile(filePath);
  const plan = planDeliveryEncode(probe, filePath, opts);

  if (plan.action === "keep") {
    if (/\.(mp4|m4v)$/i.test(filePath)) {
      return {
        filePath,
        sizeBytes: fs.statSync(filePath).size,
        mimeType: "video/mp4",
        converted: false,
        width: probe.width || null,
        height: probe.height || null,
        fps: probe.fps || null,
        durationSeconds: probe.durationSeconds || null,
      };
    }
    plan.action = "remux";
  }

  if (plan.action === "remux") {
    const remuxed = await remuxToFaststartMp4(filePath, probe);
    return {
      ...remuxed,
      width: probe.width || null,
      height: probe.height || null,
      fps: probe.fps || null,
      durationSeconds: probe.durationSeconds || null,
    };
  }

  plan.usesToneMap = plan.isHdr && (await ffmpegHasZscale());

  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const outPath = path.join(dir, `${base}.playable.mp4`);
  const args = buildDeliveryEncodeArgs(filePath, outPath, probe, plan, opts);

  try {
    await runFfmpeg(args);
  } catch (err) {
    await fs.promises.unlink(outPath).catch(() => {});
    throw err;
  }

  const out = await probeVideoFile(outPath).catch(() => null);
  return {
    filePath: outPath,
    sizeBytes: fs.statSync(outPath).size,
    mimeType: "video/mp4",
    converted: true,
    width: out?.width || plan.targetWidth || probe.width || null,
    height: out?.height || plan.targetHeight || probe.height || null,
    fps: out?.fps || plan.targetFps || probe.fps || null,
    durationSeconds: out?.durationSeconds || probe.durationSeconds || null,
  };
}

// Longest edge of the generated poster; vertical clips end up ~1080 wide.
const POSTER_MAX_DIMENSION = 1080;

// Grab one frame as a JPEG next to the video (`<base>.poster.jpg`) for use as
// the <video poster>. `atSeconds` defaults to the very first frame; callers
// can nudge it in for sources that open on black. Scales down (never up) and
// keeps the aspect ratio with even dimensions. Returns { filePath, filename,
// sizeBytes }; throws on failure (callers treat the poster as best-effort).
async function extractPosterFrame(videoPath, { atSeconds = 0 } = {}) {
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  const outPath = path.join(dir, `${base}.poster.jpg`);
  const seek = Math.max(0, Number(atSeconds) || 0);

  const args = ["-nostdin", "-y", "-v", "error"];
  if (seek > 0) args.push("-ss", String(seek));
  args.push(
    "-i", videoPath,
    "-frames:v", "1",
    "-vf",
    `scale='min(${POSTER_MAX_DIMENSION},iw)':-2:flags=lanczos`,
    "-q:v", "3",
    "-f", "image2",
    outPath,
  );

  try {
    await runFfmpeg(args);
  } catch (err) {
    await fs.promises.unlink(outPath).catch(() => {});
    throw err;
  }

  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    await fs.promises.unlink(outPath).catch(() => {});
    throw new Error("ffmpeg produced an empty poster");
  }

  return {
    filePath: outPath,
    filename: path.basename(outPath),
    sizeBytes: fs.statSync(outPath).size,
  };
}

function buildPlatformYtDlpCookieArgs(platform) {
  if (platform === "tiktok") {
    const cookiesFilePath = tikTokCookieFilePath();
    if (cookiesFilePath) return ["--cookies", cookiesFilePath];
    const ttwid = String(process.env.TIKTOK_TTWID || "").trim();
    if (ttwid) return ["--add-header", `Cookie: ttwid=${ttwid}`];
    return [];
  }
  if (platform === "instagram") {
    const cookiesFilePath = instagramCookiesFilePath();
    if (cookiesFilePath) return ["--cookies", cookiesFilePath];
    return [];
  }
  if (platform === "youtube") {
    const cookiesFilePath = youtubeCookiesFilePath();
    if (cookiesFilePath) return ["--cookies", cookiesFilePath];
    return [];
  }
  return [];
}

function extractOwnerAvatarFromPages(dir) {
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(
      (name) => name.endsWith(".dump") || name.endsWith(".json"),
    );
  } catch {
    return null;
  }
  for (const name of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      const candidates = [];
      const collectUser = (user) => {
        if (!user || typeof user !== "object") return;
        if (user.profile_pic_url || user.profile_pic_url_hd) {
          candidates.push(user.profile_pic_url_hd || user.profile_pic_url);
        }
      };
      if (Array.isArray(parsed.items)) {
        for (const item of parsed.items) {
          collectUser(item?.user);
        }
      }
      collectUser(parsed.user);
      for (const candidate of candidates) {
        const url = unescapeJsonUrl(candidate).trim();
        if (url.startsWith("https://")) return url;
      }
    } catch {
      // Keep scanning other page files.
    }
  }
  return null;
}

// TikTok video page dumps (yt-dlp --write-pages) embed the item's detail
// JSON including the author block with avatarLarger/Medium/Thumb — the only
// avatar source that still works while TikTok bot-walls profile scrapes.
function extractTikTokAvatarFromText(text, hints = []) {
  const pattern = /"(?:avatarLarger|avatarMedium|avatarThumb)"\s*:\s*"([^"]+)"/g;
  const candidates = [];
  let match = null;
  while ((match = pattern.exec(String(text || ""))) !== null) {
    const url = unescapeJsonUrl(match[1]).trim();
    if (url.startsWith("https://")) {
      candidates.push({ url, index: match.index });
    }
  }
  if (candidates.length === 0) return null;
  // The page also lists OTHER creators (related videos, sounds…) — prefer
  // the avatar whose author block (uid/handle) sits right before it.
  const wanted = hints
    .map((hint) => String(hint || "").trim().toLowerCase())
    .filter(Boolean);
  if (wanted.length > 0) {
    for (const candidate of candidates) {
      const windowText = String(
        text.slice(Math.max(0, candidate.index - 800), candidate.index),
      ).toLowerCase();
      if (wanted.some((hint) => windowText.includes(hint))) {
        return candidate.url;
      }
    }
  }
  return candidates[0].url;
}

function extractTikTokAvatarFromPages(dir, hints) {
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(
      (name) => name.endsWith(".dump") || name.endsWith(".json"),
    );
  } catch {
    return null;
  }
  for (const name of files) {
    try {
      const url = extractTikTokAvatarFromText(
        fs.readFileSync(path.join(dir, name), "utf8"),
        hints,
      );
      if (url) return url;
    } catch {
      // Keep scanning other page files.
    }
  }
  return null;
}

// The TikTok / Instagram page dumps carry the author's "verified" (TikTok) /
// "is_verified" (Instagram) flag. Best-effort: only a positive match counts —
// when the wall serves a stub with no author block we simply report `false`.
function textHasVerifiedFlag(text, hints = []) {
  const wanted = hints
    .map((hint) => String(hint || "").trim().toLowerCase())
    .filter(Boolean);
  const pattern = /"(?:verified|is_verified)"\s*:\s*true/g;
  let match = null;
  while ((match = pattern.exec(String(text || ""))) !== null) {
    if (wanted.length === 0) return true;
    const windowText = String(
      text.slice(Math.max(0, match.index - 1200), match.index),
    ).toLowerCase();
    if (wanted.some((hint) => windowText.includes(hint))) return true;
  }
  return false;
}

function extractVerifiedFromPages(dir, hints) {
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(
      (name) => name.endsWith(".dump") || name.endsWith(".json"),
    );
  } catch {
    return false;
  }
  for (const name of files) {
    try {
      if (
        textHasVerifiedFlag(fs.readFileSync(path.join(dir, name), "utf8"), hints)
      ) {
        return true;
      }
    } catch {
      // Keep scanning other page files.
    }
  }
  return false;
}

async function fetchYtDlpInfo(url, options = {}) {
  const platform = options.platform;
  let pagesDir = null;
  let lastError = null;
  // TikTok bot walls rarely clear within a single fetch, so its metadata
  // lookup gets exactly one attempt — retrying just doubles the wait.
  // YouTube/Instagram keep one retry because their blocks lift quickly.
  const MAX_ATTEMPTS = platform === "tiktok" ? 1 : 2;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const args = ["--no-playlist", "--no-warn", "--socket-timeout", "15"];
    if (platform) {
      args.push(...buildPlatformYtDlpCookieArgs(platform));
    }
    if (platform === "youtube") {
      args.push(...youTubePotExtractorArgs());
    }
    let runOptions = {};
    // IG and TikTok: also dump the raw pages the extractor fetched, so the
    // author's avatar can be read out of the item detail JSON afterwards.
    if (platform === "instagram" || platform === "tiktok") {
      pagesDir = fs.mkdtempSync(path.join(os.tmpdir(), `${platform}-pages-`));
      args.push("--write-pages");
      runOptions = { cwd: pagesDir };
    }
    args.push("--skip-download", "--dump-single-json", url);
    try {
      const stdout = await runYtDlp(args, runOptions);
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch {
        json = null;
      }
      const ownerHints = [json?.uploader_id, json?.uploader, json?.channel];
      const ownerAvatarUrl = pagesDir
        ? platform === "tiktok"
          ? extractTikTokAvatarFromPages(pagesDir, ownerHints)
          : extractOwnerAvatarFromPages(pagesDir)
        : null;
      const ownerVerified = pagesDir
        ? extractVerifiedFromPages(pagesDir, ownerHints)
        : false;
      return { json, ownerAvatarUrl, ownerVerified };
    } catch (err) {
      let caught = err;
      if (platform === "youtube") {
        caught = annotateYouTubeWallError(err);
      }
      lastError = caught;
      // Social platforms rate limit in bursts — one retry usually clears it
      // (except TikTok, which is single-attempt by design, see above).
      if (
        attempt === 0 &&
        MAX_ATTEMPTS > 1 &&
        (caught.code === "YTDLP_FAILED" || caught.code === "YTDLP_TIMEOUT")
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      return {
        json: null,
        ownerAvatarUrl: null,
        ownerVerified: false,
        error: caught,
      };
    } finally {
      if (pagesDir) {
        fs.rmSync(pagesDir, { recursive: true, force: true });
      }
    }
  }
  return {
    json: null,
    ownerAvatarUrl: null,
    ownerVerified: false,
    error: lastError,
  };
}

// ── TikTok home-feed discovery via yt-dlp ────────────────────────────────
// TikTok's /api/recommend/item_list/ endpoint needs a client-generated
// signature (msToken + X-Bogus) and its pages are behind a SlardarWAF JS
// challenge, so a plain `fetch` gets either an empty body or the
// "Please wait..." shell. yt-dlp negotiates both, so it is the only
// dependable way to answer "what is the first video on the home page".
const TIKTOK_FEED_META_TIMEOUT_MS = 90000;

function parseYtDlpPrintLine(line) {
  // "<id>\t<handle>\t<nickname>\t<caption>\t<duration>"
  // For TikTok, yt-dlp reports the numeric account id as `uploader_id`, the
  // @handle as `uploader`, and the display name as `channel`.
  const parts = String(line || "").split("\t");
  if (parts.length < 2) return null;
  const videoId = String(parts[0] || "").trim();
  if (!/^\d{10,25}$/.test(videoId)) return null;

  const handle = String(parts[1] || "").trim();
  const nickname = String(parts[2] || "").trim();
  const caption = String(parts[3] || "").trim();
  const duration = Number(parts[4]);

  return {
    videoId,
    handle,
    username: nickname || handle,
    caption,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
    url: `https://www.tiktok.com/@${handle || "unknown"}/video/${videoId}`,
    tags: extractHashtags(caption),
  };
}

function tikTokPrintTemplate() {
  return "%(id)s\t%(uploader)s\t%(channel)s\t%(title)s\t%(duration)s";
}

// Resolve one TikTok video URL into feed-item shape (metadata only; the
// download happens later through the normal import pipeline).
async function resolveTikTokFeedItemViaYtDlp(url) {
  const args = [
    "--no-playlist",
    "--no-warn",
    "--socket-timeout",
    "15",
    ...buildPlatformYtDlpCookieArgs("tiktok"),
    "--skip-download",
    "--print",
    tikTokPrintTemplate(),
    url,
  ];
  let stdout = "";
  try {
    stdout = await runYtDlp(args, { timeout: TIKTOK_FEED_META_TIMEOUT_MS });
  } catch (err) {
    return { error: err?.message || "yt-dlp could not read the video" };
  }
  const line = String(stdout || "").split("\n").find((entry) => entry.trim());
  const item = parseYtDlpPrintLine(line);
  if (!item) return { error: "yt-dlp returned no usable video data" };
  return { item };
}

/**
 * Return the newest TikTok video for a profile handle — the closest thing to
 * "the first video" that is stable across polls and does not depend on
 * TikTok's signed feed endpoint. Requires TIKTOK_FEED_AUTHOR to be set,
 * because the anonymous home feed is session-randomized and cannot be
 * enumerated without a signature.
 */
async function fetchFirstTikTokProfileVideo(authorHandle) {
  const clean = String(authorHandle || "").trim().replace(/^@/, "");
  if (!clean) return { error: "no-author-configured" };

  const args = [
    "--flat-playlist",
    "--playlist-end",
    "1",
    "--no-warn",
    "--socket-timeout",
    "15",
    ...buildPlatformYtDlpCookieArgs("tiktok"),
    "--skip-download",
    "--print",
    tikTokPrintTemplate(),
    `https://www.tiktok.com/@${clean}`,
  ];

  let stdout = "";
  try {
    stdout = await runYtDlp(args, { timeout: TIKTOK_FEED_META_TIMEOUT_MS });
  } catch (err) {
    return { error: err?.message || "yt-dlp could not read the profile" };
  }

  const line = String(stdout || "").split("\n").find((entry) => entry.trim());
  const listed = parseYtDlpPrintLine(line);
  if (!listed) return { error: "yt-dlp returned no videos for the profile" };

  // The flat listing omits the caption, so hydrate the one item. Its
  // uploader_id is the numeric account id (not the @handle), so the handle
  // from the listing is authoritative — keep it.
  const detailed = await resolveTikTokFeedItemViaYtDlp(listed.url);
  const item = detailed.item || listed;
  const resolvedHandle = listed.handle || item.handle || clean;
  return {
    item: {
      ...item,
      handle: resolvedHandle,
      url: `https://www.tiktok.com/@${resolvedHandle}/video/${item.videoId || listed.videoId}`,
    },
  };
}

function mapYtDlpInfo(info, platform) {
  if (!info || typeof info !== "object") return null;

  let username = "";
  if (platform === "instagram") {
    // yt-dlp puts the numeric user id in uploader_id, the handle in
    // channel, and the display name in uploader — prefer a clean handle.
    const candidates = [info.channel, info.uploader, info.uploader_id];
    username =
      candidates.map((value) => stripAt(value)).find((value) =>
        /^[A-Za-z0-9._]{1,30}$/.test(value),
      ) || "";
  } else if (platform === "youtube") {
    username = stripAt(info.uploader || info.channel || info.uploader_id);
  }

  const caption =
    platform === "youtube"
      ? String(info.title || info.description || "").trim()
      : String(info.description || info.title || "").trim();

  const tags = extractHashtags(caption);
  const explicitTags = Array.isArray(info.tags) ? info.tags : [];
  for (const tag of explicitTags) {
    const clean = stripAt(tag).trim();
    if (clean && !tags.includes(clean)) tags.push(clean);
  }

  const duration = Number(info.duration);
  const durationSeconds =
    Number.isFinite(duration) && duration > 0 ? duration : null;

  return {
    username,
    avatarUrl: null,
    caption,
    hashtags: tags,
    durationSeconds,
    coverUrl: String(info.thumbnail || "").trim() || null,
    channelUrl: String(info.channel_url || "").trim() || "",
  };
}

function unescapeJsonUrl(raw) {
  return String(raw || "")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u0025/gi, "%")
    .replace(/\\\//g, "/");
}

async function validateImageUrl(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": SOCIAL_USER_AGENT,
        accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        range: "bytes=0-1023",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    await res.arrayBuffer();
    return true;
  } catch {
    return false;
  }
}

async function fetchOgImageUrl(pageUrl, headers = {}, options = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(pageUrl, {
        headers: {
          "user-agent": SOCIAL_USER_AGENT,
          "accept-language": "en-US,en;q=0.9",
          accept: "text/html,application/xhtml+xml",
          ...headers,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
      });
      if (!res.ok) {
        // Transient per-session rate limits: retry once after a pause.
        if (res.status === 429 || res.status === 401) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          continue;
        }
        return null;
      }
      const html = await res.text();
      const url = extractProfileImageUrl(html);
      if (url) {
        // YouTube rotates/expires its yt3 avatar URLs quickly — only return
        // links that actually serve bytes right now.
        if (!options.validate || (await validateImageUrl(url))) {
          return url;
        }
      }
      // A short body with no image data usually means a login/error shell.
      if (html.length < 100000) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      return null;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  return null;
}

function extractProfileImageUrl(html) {
  const candidates = [];
  const ogMatch = String(html).match(
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i,
  );
  if (ogMatch) candidates.push(ogMatch[1]);
  for (const pattern of [
    /"profile_pic_url_hd"\s*:\s*"([^"]+)"/i,
    /"profile_pic_url"\s*:\s*"([^"]+)"/i,
    /"hd_profile_pic_url_info"\s*:\s*\{[^}]*?"url"\s*:\s*"([^"]+)"/i,
    /"profilePicUrl"\s*:\s*"([^"]+)"/i,
  ]) {
    const match = String(html).match(pattern);
    if (match) candidates.push(match[1]);
  }
  for (const candidate of candidates) {
    const url = unescapeJsonUrl(candidate)
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .trim();
    if (url.startsWith("https://")) return url;
  }
  return null;
}

async function enrichAvatarUrl({ platform, username, channelUrl, headers, validate }) {
  const cleanUsername = String(username || "").trim();
  const candidates = [];
  if (channelUrl && /^https:\/\//i.test(channelUrl)) {
    candidates.push(channelUrl);
  }
  if (cleanUsername) {
    if (platform === "tiktok") {
      candidates.push(
        `https://www.tiktok.com/@${encodeURIComponent(cleanUsername)}`,
      );
    } else if (platform === "youtube") {
      candidates.push(
        `https://www.youtube.com/@${encodeURIComponent(cleanUsername)}`,
      );
    } else if (platform === "instagram") {
      candidates.push(
        `https://www.instagram.com/${encodeURIComponent(cleanUsername)}/`,
      );
    }
  }
  for (const candidate of candidates) {
    const avatarUrl = await fetchOgImageUrl(candidate, headers, { validate });
    if (avatarUrl) return avatarUrl;
  }
  return null;
}

async function resolveIndirectPlatform(platform, rawUrl) {
  const label = platform === "youtube" ? "YouTube" : "Instagram";
  const canonicalUrl =
    platform === "youtube"
      ? canonicalizeYouTubeUrl(rawUrl)
      : canonicalizeInstagramUrl(rawUrl);

  const oembed = await fetchOembed(platform, canonicalUrl);
  const oembedAuthorUrl = String(oembed?.author_url || "");
  const oembedUsername = parseOembedUrl(platform, oembed);
  const oembedName =
    typeof oembed?.author_name === "string"
      ? stripAt(oembed.author_name)
      : "";
  const igProfileHeaders =
    platform === "instagram" && instagramCookieHeader()
      ? { cookie: instagramCookieHeader() }
      : undefined;

  const ytDlpResult = await fetchYtDlpInfo(canonicalUrl, { platform });
  const downloaderError = ytDlpResult.error;
  const info = mapYtDlpInfo(ytDlpResult.json, platform);

  if (!info && !oembed) {
    if (downloaderError?.code === "YTDLP_MISSING") {
      throw new Error(
        `${label} blocked the metadata lookup, and yt-dlp is not installed on the server — install it or upload the file manually`,
      );
    }
    const noCookiesHint =
      platform === "instagram" && !instagramCookiesFilePath()
        ? " Instagram login-walls anonymous requests — log in at instagram.com in a browser, export cookies to data/instagram-cookies.txt, and try again."
        : platform === "youtube" && !youtubeCookiesFilePath()
          ? " YouTube login-walls some requests from server IPs — log in at youtube.com in a browser, export cookies to data/youtube-cookies.txt, and try again."
          : "";
    throw new Error(
      `${label} did not share video details for that link.${noCookiesHint}`,
    );
  }

  const ytDlpUsername = stripAt(info?.username || "");

  const username =
    platform === "instagram"
      ? ytDlpUsername || oembedUsername || oembedName
      : oembedUsername || ytDlpUsername || oembedName;

  const caption = String(
    (info?.caption || oembed?.title || "").trim(),
  );

  const hashtags = Array.isArray(info?.hashtags)
    ? info.hashtags
    : extractHashtags(caption);

  // Instagram's web profile pages return the logged-in session user's own
  // home for ANY handle, so the author avatar must come from the media
  // owner block that yt-dlp captures (authoritative). YouTube avatars come
  // from the channel page og:image (validated — yt3 URLs rotate quickly).
  let avatarUrl =
    platform === "instagram"
      ? ytDlpResult.ownerAvatarUrl
      : await enrichAvatarUrl({
          platform,
          username: username || oembedName,
          channelUrl: info?.channelUrl || oembedAuthorUrl,
          validate: true,
        });

  if (!avatarUrl && platform === "instagram") {
    // Last resort: the profile page — but only trust it when the page
    // actually belongs to the expected author, never the session home.
    avatarUrl = await fetchInstagramAuthorProfileImage(
      username || oembedName,
      igProfileHeaders,
    );
  }

  return {
    platform,
    username,
    avatarUrl,
    // Instagram exposes `is_verified` on the media owner in yt-dlp's page dump;
    // YouTube has no such flag here, so it stays false.
    verified: platform === "instagram" && ytDlpResult.ownerVerified === true,
    caption,
    hashtags,
    durationSeconds: info?.durationSeconds ?? null,
    coverUrl:
      String(info?.coverUrl || oembed?.thumbnail_url || "").trim() || null,
  };
}

async function fetchInstagramAuthorProfileImage(username, headers) {
  const clean = String(username || "").trim();
  if (!clean) return null;
  const pageUrl = `https://www.instagram.com/${encodeURIComponent(clean)}/`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(pageUrl, {
        headers: {
          "user-agent": SOCIAL_USER_AGENT,
          "accept-language": "en-US,en;q=0.9",
          accept: "text/html,application/xhtml+xml",
          ...(headers || {}),
        },
        redirect: "follow",
        signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status === 401) && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          continue;
        }
        return null;
      }
      const html = await res.text();
      // The page must belong to the expected author — Instagram serves the
      // session user's own home for any handle otherwise.
      const expectedKey = `"username":"${clean.toLowerCase()}"`;
      if (!String(html).toLowerCase().includes(expectedKey)) return null;
      const url = extractProfileImageUrl(html);
      return url || null;
    } catch {
      return null;
    }
  }
  return null;
}

function unsupportedUrlError() {
  const err = new Error(
    "Unsupported URL — paste a TikTok, Instagram reel, or YouTube Shorts link",
  );
  err.code = "UNSUPPORTED_URL";
  return err;
}

async function resolveTikTokViaYtDlp(rawUrl) {
  const result = await fetchYtDlpInfo(rawUrl, { platform: "tiktok" });
  const info = result.json;
  if (!info || typeof info !== "object") return null;

  const handle = stripAt(info.uploader || info.channel || "");
  const nickname = String(info.channel || info.uploader || "").trim();
  const caption = String(info.title || info.description || "").trim();
  const duration = Number(info.duration);
  const durationSeconds =
    Number.isFinite(duration) && duration > 0 ? duration : null;

  // The author avatar comes out of the raw page dump that fetchYtDlpInfo
  // captured — it is available even when TikTok bot-walls profile scrapes,
  // so the avatar no longer depends on a separate profile request.
  const avatarUrl = result.ownerAvatarUrl || null;

  return {
    username: nickname || handle,
    avatarUrl,
    verified: result.ownerVerified === true,
    avatarUsernames: Array.from(
      new Set([handle, nickname].map((v) => String(v || "").trim()).filter(Boolean)),
    ),
    caption,
    tags: extractHashtags(caption),
    durationSeconds,
    thumbnailUrl: String(info.thumbnail || "").trim() || null,
    playAddr: null,
  };
}

// TikTok answers profile scrapes with a JS bot challenge in waves that last
// minutes — a handful of extra attempts inside one fetch cannot outlast it,
// it only makes "Fetch info" hang. The default is a single quick attempt:
// when the wall is down the avatar comes back instantly, when it is up the
// fetch fails fast and the caller moves on (the wall may clear by the time
// the next video is fetched). Callers that really want a spaced chase pass
// an explicit avatarRetryMs budget.
const TIKTOK_AVATAR_RETRY_TOTAL_MS = 60000;
const TIKTOK_AVATAR_RETRY_QUICK_MS = 6000;
const TIKTOK_AVATAR_RETRY_GAPS_MS = [6000, 12000, 24000, 30000];

async function tryTikTokAvatarSources(usernames) {
  for (const username of usernames) {
    try {
      // fetchTikTokUserInfo already tries the share API and then the profile
      // page's og:image — no need to scrape the profile a second time.
      const userInfo = await fetchTikTokUserInfo(username);
      if (userInfo?.avatarUrl) return userInfo.avatarUrl;
    } catch {
      // try the next alias / source
    }
  }
  return null;
}

async function resolveTikTokAvatarPersistently(usernames, options = {}) {
  const unique = Array.from(
    new Set(
      (Array.isArray(usernames) ? usernames : [usernames])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
  if (unique.length === 0) return null;

  // Default is one immediate attempt (QUICK budget is shorter than the first
  // retry gap, so the loop stops after try #1). An explicit retryMs opts into
  // a spaced chase, capped at the hard ceiling.
  const budgetMs = Math.max(
    0,
    Math.min(
      options.retryMs == null
        ? TIKTOK_AVATAR_RETRY_QUICK_MS
        : Number(options.retryMs),
      TIKTOK_AVATAR_RETRY_TOTAL_MS,
    ),
  );
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    const cached = cachedAvatarUrl("tiktok", unique[0]);
    if (cached) return cached;

    const found = await tryTikTokAvatarSources(unique);
    if (found) return found;

    const gapMs =
      TIKTOK_AVATAR_RETRY_GAPS_MS[attempt] ??
      TIKTOK_AVATAR_RETRY_GAPS_MS[TIKTOK_AVATAR_RETRY_GAPS_MS.length - 1];
    attempt += 1;
    if (Date.now() - startedAt + gapMs >= budgetMs) break;
    await new Promise((resolve) => setTimeout(resolve, gapMs));
  }
  return cachedAvatarUrl("tiktok", unique[0]);
}

async function resolveSocialVideo(rawUrl, options = {}) {
  const platform = classifyPlatform(rawUrl);
  if (!platform) throw unsupportedUrlError();

  let resolved = null;
  if (platform === "tiktok") {
    let avatarUsernames = [];
    const metadata = await fetchTikTokMetadata(rawUrl);
    if (metadata.error) {
      const fallback = await resolveTikTokViaYtDlp(rawUrl);
      if (fallback) {
        resolved = {
          platform,
          username: fallback.username || "",
          avatarUrl: fallback.avatarUrl || null,
          verified: fallback.verified === true,
          caption: fallback.caption || "",
          hashtags: fallback.tags || [],
          durationSeconds: fallback.durationSeconds ?? null,
          coverUrl: fallback.thumbnailUrl || null,
          playAddr: fallback.playAddr || null,
        };
        avatarUsernames = fallback.avatarUsernames || [];
      } else {
        const err = new Error(metadata.error);
        err.code = "REMOTE_REFUSED";
        throw err;
      }
    } else {
      resolved = {
        platform,
        username: metadata.username || "",
        avatarUrl: metadata.avatarUrl || null,
        verified: metadata.verified === true,
        caption: metadata.caption || "",
        hashtags: metadata.tags || [],
        durationSeconds: metadata.durationSeconds ?? null,
        coverUrl: metadata.thumbnailUrl || null,
        playAddr: metadata.playAddr || null,
      };

      // A scrape that came back with any missing piece (playAddr, avatar or
      // duration — e.g. TikTok served the oEmbed-only fallback) means the
      // full page was blocked — enrich it via the yt-dlp fallback, which
      // negotiates the challenge and also yields the author avatar from its
      // raw page dump.
      if (
        !metadata.playAddr ||
        !metadata.avatarUrl ||
        !metadata.durationSeconds
      ) {
        const fallback = await resolveTikTokViaYtDlp(rawUrl);
        if (fallback) {
          resolved.username = fallback.username || resolved.username;
          resolved.avatarUrl = fallback.avatarUrl || resolved.avatarUrl;
          resolved.verified = resolved.verified || fallback.verified === true;
          resolved.caption = fallback.caption || resolved.caption;
          resolved.hashtags =
            fallback.tags.length > 0
              ? fallback.tags
              : resolved.hashtags;
          resolved.durationSeconds =
            fallback.durationSeconds ?? resolved.durationSeconds;
          resolved.coverUrl = fallback.thumbnailUrl || resolved.coverUrl;
          avatarUsernames = fallback.avatarUsernames || [];
        }
      }
    }

    resolved.caption = stripHashtags(resolved.caption);
    // Every alias we know (handle, nickname, display name): profile scrapes
    // 404 when the display name is used as the handle, and past avatars were
    // cached under whichever alias resolved at the time — check them all.
    const aliases = Array.from(
      new Set(
        [
          ...avatarUsernames,
          metadata.handle,
          metadata.nickname,
          resolved.username,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );
    const usableAliases = aliases.length > 0 ? aliases : [resolved.username];
    if (!resolved.avatarUrl) {
      // A previously cached avatar makes the lookup instant (and works even
      // while TikTok bot-walls everything).
      for (const alias of usableAliases) {
        const cached = cachedAvatarUrl("tiktok", alias);
        if (cached) {
          resolved.avatarUrl = cached;
          break;
        }
      }
    }
    if (!resolved.avatarUrl) {
      // One quick attempt (configurable via avatarRetryMs) — when TikTok
      // serves its bot wall the fetch fails fast instead of hanging.
      resolved.avatarUrl = await resolveTikTokAvatarPersistently(
        usableAliases,
        { retryMs: options.avatarRetryMs },
      );
    }
    if (resolved.avatarUrl) {
      for (const alias of usableAliases) {
        rememberAvatarUrl("tiktok", alias, resolved.avatarUrl);
      }
    }
  } else {
    resolved = await resolveIndirectPlatform(platform, rawUrl);
    resolved.caption = stripHashtags(resolved.caption);
  }

  if (resolved.avatarUrl) {
    rememberAvatarUrl(platform, resolved.username, resolved.avatarUrl);
  } else {
    // TikTok/Instagram block scrapes in waves — reuse a previously resolved
    // avatar for the same creator instead of leaving the field empty.
    resolved.avatarUrl = cachedAvatarUrl(platform, resolved.username);
  }
  resolved.verified = resolved.verified === true;
  return resolved;
}

async function streamUrlToFile(fileUrl, destPath) {
  let res = null;
  try {
    res = await fetch(fileUrl, {
      headers: buildTikTokHeaders({
        referer: "https://www.tiktok.com/",
        accept: "*/*",
      }),
      redirect: "follow",
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
    });
  } catch {
    throw new Error("TikTok refused the video download");
  }
  if (!res.ok || !res.body) {
    throw new Error(`TikTok refused the video download (HTTP ${res.status})`);
  }

  const output = fs.createWriteStream(destPath);
  let sizeBytes = 0;

  const settled = new Promise((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });

  try {
    for await (const chunk of res.body) {
      sizeBytes += chunk.length;
      if (sizeBytes > MAX_IMPORT_BYTES) {
        const err = new Error(
          `The downloaded video exceeds the ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB import limit`,
        );
        err.code = "TOO_LARGE";
        throw err;
      }
      if (!output.write(chunk)) {
        await new Promise((resolve) => output.once("drain", resolve));
      }
    }
    output.end();
    await settled;
  } catch (err) {
    output.destroy();
    await fs.promises.unlink(destPath).catch(() => {});
    throw err;
  }
  return sizeBytes;
}

// Pick the best-quality stream in the 1080p class (height <= 1920 so vertical
// shorts at 1080 wide are included too) instead of settling for a low-res
// MP4. YouTube no longer serves AVC (H.264) on most new uploads, so pinning
// [ext=mp4] used to silently end up with a ~360p progressive file; anything
// non-H.264 that gets picked is re-encoded to H.264 afterwards anyway, so
// container compatibility matters less than raw resolution here.
const FORMAT_FALLBACKS = [
  // Best separate streams when the platform still serves H.264 MP4 (older
  // YouTube uploads) — stored as-is, zero quality loss.
  "bv*[height<=1920][ext=mp4]+ba[ext=m4a]",
  // Best separate streams regardless of container (VP9/AV1 on YouTube…).
  // Merged locally and re-encoded to H.264 while keeping the resolution.
  "bv*[height<=1920]+ba",
  // Single-file fallback for platforms that only offer combined MP4s
  // (TikTok, Instagram) — already H.264, stored as-is.
  "b[height<=1920][ext=mp4]",
  "b[height<=1920]",
  "b",
  "best",
];

function isFormatSelectionError(err) {
  const message = String(err?.message || "");
  return /requested format is not available|no matching format|format.*not available|merg.*ffmpeg|ffmpeg.*not installed/i.test(
    message,
  );
}

// Failures that no amount of retrying fixes — the video itself is gone or
// locked. Everything else (challenge pages, rate limits, timeouts) may clear.
function isPermanentTikTokFailure(err) {
  const message = String(err?.message || "");
  return /unavailable|private|removed|deleted|doesn't exist|invalid|not found|must login|sign in|sign-in/i.test(
    message,
  );
}

async function downloadWithYtDlp(url, destBase, options = {}) {
  const outTemplate = `${destBase}.%(ext)s`;

  const baseArgs = [
    "--no-playlist",
    "--no-warn",
    "--no-progress",
    "--no-part",
  ];
  if (options.platform) {
    baseArgs.push(...buildPlatformYtDlpCookieArgs(options.platform));
  }
  if (options.platform === "youtube") {
    baseArgs.push(...youTubePotExtractorArgs());
  }

  // TikTok answers in bursts: one moment the bot wall is up (challenge
  // pages / "Unexpected response"), the next it is gone. Retry the whole
  // format pass a few times with growing pauses instead of giving up on the
  // first wave. YouTube bot-walls also clear — one retry after a pause.
  const isTikTokPlatform = options.platform === "tiktok";
  const MAX_DOWNLOAD_PASSES = isTikTokPlatform ? 4 : 2;
  const RETRY_PASS_WAITS_MS = isTikTokPlatform
    ? [4000, 9000, 15000]
    : [4000]; // one wait between the two YouTube passes
  let lastError = null;
  for (let pass = 0; pass < MAX_DOWNLOAD_PASSES; pass += 1) {
    for (let i = 0; i < FORMAT_FALLBACKS.length; i += 1) {
      const args = [
        ...baseArgs,
        "-f",
        FORMAT_FALLBACKS[i],
        "-o",
        outTemplate,
        url,
      ];
      try {
        await runYtDlp(args, { timeout: DOWNLOAD_TIMEOUT_MS });
        lastError = null;
        break;
      } catch (err) {
        let caught = err;
        if (options.platform === "youtube") {
          caught = annotateYouTubeWallError(err);
        }
        lastError = caught;
        const wallRetry =
          caught.code === "YOUTUBE_WALL" && pass < MAX_DOWNLOAD_PASSES - 1;
        const formatRetry =
          isFormatSelectionError(caught) && i < FORMAT_FALLBACKS.length - 1;
        if (!formatRetry) {
          if (wallRetry) break; // stop this pass; retry the whole pass below
          const waveRetry =
            isTikTokPlatform &&
            pass < MAX_DOWNLOAD_PASSES - 1 &&
            !isPermanentTikTokFailure(caught) &&
            (caught.code === "YTDLP_FAILED" ||
              caught.code === "YTDLP_TIMEOUT");
          if (waveRetry) break; // challenge/rate-limit wave — retry below
          throw caught;
        }
      }
    }
    if (!lastError) break;
    const waitMs = RETRY_PASS_WAITS_MS[pass];
    if (waitMs && pass < MAX_DOWNLOAD_PASSES - 1) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    throw lastError;
  }

  const dir = path.dirname(destBase);
  const base = path.basename(destBase);
  const entries = await fs.promises.readdir(dir);
  const matches = entries
    .filter(
      (name) =>
        name.startsWith(`${base}.`) &&
        !name.includes(".part") &&
        !name.endsWith(".ytdl"),
    )
    .sort((a, b) => {
      return (
        fs.statSync(path.join(dir, b)).mtimeMs -
        fs.statSync(path.join(dir, a)).mtimeMs
      );
    });

  if (matches.length === 0) {
    throw new Error("The video downloader produced no file");
  }

  const filePath = path.join(dir, matches[0]);
  const sizeBytes = fs.statSync(filePath).size;
  if (sizeBytes > MAX_IMPORT_BYTES) {
    await fs.promises.unlink(filePath).catch(() => {});
    const err = new Error(
      `The downloaded video exceeds the ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB import limit`,
    );
    err.code = "TOO_LARGE";
    throw err;
  }

  return {
    filePath,
    sizeBytes,
    mimeType: mimeTypeForFile(filePath),
  };
}

function cookiesFilePathHint() {
  if (tikTokCookieFilePath()) {
    return "Your TikTok cookies file may be stale — re-export it from a logged-in browser session (TIKTOK_COOKIES_FILE), or download the video manually.";
  }
  const ttwid = String(process.env.TIKTOK_TTWID || "").trim();
  return ttwid
    ? "A full logged-in cookie export usually fixes this: log in at tiktok.com in a browser, export cookies (e.g. with a cookies.txt extension) to data/tiktok-cookies.txt or set TIKTOK_COOKIES_FILE, then try again. You can also download the video manually."
    : "Log in at tiktok.com in a browser, export cookies (e.g. with a cookies.txt extension) to data/tiktok-cookies.txt or set TIKTOK_COOKIES_FILE, and try again. You can also download the video manually.";
}

async function downloadSocialVideo(rawUrl, destBase, options = {}) {
  const platform = classifyPlatform(rawUrl);
  if (!platform) throw unsupportedUrlError();

  const metadata =
    options.metadata && options.metadata.platform === platform
      ? options.metadata
      : null;

  if (platform === "tiktok") {
    let directError = null;
    if (metadata?.playAddr) {
      try {
        const sizeBytes = await streamUrlToFile(
          metadata.playAddr,
          `${destBase}.mp4`,
        );
        return {
          filePath: `${destBase}.mp4`,
          sizeBytes,
          mimeType: "video/mp4",
        };
      } catch (err) {
        directError = err instanceof Error ? err.message : String(err);
      }
    }
    try {
      return await downloadWithYtDlp(rawUrl, destBase, {
        platform: "tiktok",
      });
    } catch (err) {
      if (err.code === "YTDLP_MISSING") {
        throw new Error(
          "TikTok refused the direct video download and yt-dlp is not installed on the server — install it or download the video manually",
        );
      }
      const detail = err instanceof Error ? err.message : String(err);
      const hint = cookiesFilePathHint();
      const wrapped = new Error(
        `TikTok blocked the automatic download (direct: ${
          directError || "no video URL found"
        }; yt-dlp: ${detail}). ${hint}`,
      );
      wrapped.code = err.code || "TIKTOK_BLOCKED";
      throw wrapped;
    }
  }

  return downloadWithYtDlp(rawUrl, destBase, { platform });
}

// One-shot avatar lookup used by maintenance tooling (avatar repair script)
// when a stored avatar URL has expired: re-scrape just the profile picture.
async function resolveCreatorAvatar(platform, username) {
  const clean = String(username || "").trim();
  if (!clean) return null;
  try {
    if (platform === "tiktok") {
      const info = await fetchTikTokUserInfo(clean);
      return info?.avatarUrl || null;
    }
    if (platform === "instagram") {
      const igCookie = instagramCookieHeader();
      const headers = igCookie ? { cookie: igCookie } : undefined;
      return fetchInstagramAuthorProfileImage(clean, headers);
    }
  } catch {
    return null;
  }
  return null;
}

module.exports = {
  MAX_IMPORT_BYTES,
  classifyPlatform,
  canonicalizeYouTubeUrl,
  canonicalizeInstagramUrl,
  extractHashtags,
  stripHashtags,
  mimeTypeForFile,
  mapYtDlpInfo,
  resolveSocialVideo,
  resolveCreatorAvatar,
  downloadSocialVideo,
  probeVideoFile,
  planDeliveryEncode,
  buildDeliveryEncodeArgs,
  transcodeToH264,
  extractPosterFrame,
  parseYtDlpPrintLine,
  resolveTikTokFeedItemViaYtDlp,
  fetchFirstTikTokProfileVideo,
  DELIVERY_LADDER,
  DELIVERY_MAX_SHORT_EDGE,
  DELIVERY_MAX_LONG_EDGE,
  DELIVERY_MAX_FPS,
};
