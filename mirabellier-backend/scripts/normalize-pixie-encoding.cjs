#!/usr/bin/env node

// Normalizes every stored pixie (user_videos) to the short-form delivery
// encode the upload pipeline produces (see lib/social.js -> transcodeToH264
// / planDeliveryEncode / buildDeliveryEncodeArgs):
//
//   container : MP4, with the moov atom before mdat (-movflags +faststart)
//   video     : H.264 High, 8-bit yuv420p, SDR (BT.709), capped at 1080 on
//               the short edge / 1920 on the long edge and 60 fps, 2s
//               keyframe cadence, per-tier bitrate ceiling
//               (1080p ≤6M · 720p ≤3M · 480p ≤1.5M · ≤360p ≤0.8M)
//   audio     : AAC 160k, loudness-normalized to -14 LUFS (kept only when
//               --keep-mp3-audio and already MP3); silent clips stay silent
//
// Files already inside the profile are left untouched. Files that only sit
// in the wrong container or lack faststart are stream-copied (lossless).
// Anything else (HEVC/AV1/VP9, High10 / 4:2:2 / 4:4:4, 10-bit, HDR PQ/HLG,
// Opus, over-size, over-60fps, over-bitrate) is re-encoded, then the
// user_videos row(s) pointing at the file are repointed and their
// width/height recorded. Pass --no-downscale to keep the source resolution
// and frame rate (bitrate cap + keyframes + loudnorm + faststart still
// applied).
//
// It also backfills the first-frame poster (<base>.poster.jpg next to the
// clip, stored in user_videos.posterFilename) for any row that is missing
// one or whose poster file has gone away — matching lib/social.js
// extractPosterFrame, which the upload/import paths run on new clips.
//
// Dry-run by default (reports the plan only). Add --apply to convert + write.
//
//   node scripts/normalize-pixie-encoding.cjs [flags]
//
//   --apply              Convert files and update the database
//   --dry-run            Report the plan only (default)
//   --verify             In dry-run, actually run each conversion to a temp
//                        file to prove it works and measure the new size,
//                        then delete it (slow)
//   --keep-mp3-audio     Treat an existing MP3 track as acceptable
//   --force-reencode     Re-encode every clip that has a video stream, even
//                        ones already matching the target
//   --no-downscale       Keep source resolution + frame rate (skip the
//                        1080p / 60fps ceiling); still cap bitrate + loudnorm
//   --posters-only       Skip the encode pass; only backfill missing posters
//   --no-posters         Skip poster backfill; only normalize encodes
//   --preset <name>      x264 preset for re-encodes (default: slow; use
//                        veryfast / faster on a low-power VPS)
//   --crf <n>            Override the per-tier x264 CRF, 0-51 (default: the
//                        ladder value for the output size, 20-23)
//   --threads <n>        cap ffmpeg worker threads (default: all cores)
//   --only <videoId>     Restrict to the file backing this user_videos.id
//   --limit <n>          Process at most n files needing work
//   --backup <path>      DB backup path for --apply (default: timestamped
//                        next to the database file)
//   --help, -h           Show this help
//
// Runs anywhere Node + ffmpeg do. ffmpeg / ffprobe are found on PATH, from
// FFMPEG_PATH / FFPROBE_PATH in .env, or in the usual VPS locations
// (/usr/bin, /usr/local/bin, /snap/bin, …); if none work it says so and
// exits before touching anything. DB_FILE / VIDEOS_DIR from .env are honored
// (absolute or relative to the backend root). Safe to run against the live
// server — writes use a busy timeout and per-file commits, so an interrupted
// run just resumes on the next invocation. For a big first pass on a VPS:
//   tmux new -s normalize
//   nice -n 19 npm run normalize:pixies:dry
//   nice -n 19 node scripts/normalize-pixie-encoding.cjs --apply --preset veryfast

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const Database = require("better-sqlite3");

const BACKEND_ROOT = path.resolve(__dirname, "..");
try {
  require("dotenv").config({
    path: path.join(BACKEND_ROOT, ".env"),
    quiet: true,
  });
} catch {
  // dotenv is optional here — env vars can also come from the shell / systemd.
}

// Resolved for real in preflight(); these are the starting guesses.
let FFMPEG_PATH =
  String(process.env.FFMPEG_PATH || "ffmpeg").trim() || "ffmpeg";
let FFPROBE_PATH =
  String(process.env.FFPROBE_PATH || "ffprobe").trim() || "ffprobe";
const FFMPEG_TIMEOUT_MS = 1800000;

const IS_WINDOWS = process.platform === "win32";
// Where ffmpeg tends to live when it is not on a stripped cron / systemd PATH.
const TOOL_SEARCH_DIRS = IS_WINDOWS
  ? []
  : [
      "/usr/bin",
      "/usr/local/bin",
      "/bin",
      "/snap/bin",
      "/opt/homebrew/bin",
      "/home/linuxbrew/.linuxbrew/bin",
      "/opt/ffmpeg/bin",
    ];

// x264 presets, slowest→fastest, for validating --preset.
const X264_PRESETS = new Set([
  "ultrafast", "superfast", "veryfast", "faster", "fast",
  "medium", "slow", "slower", "veryslow", "placebo",
]);

// ── The intended encode ────────────────────────────────────────────────────
const TARGET_VIDEO_CODEC = "h264";
const TARGET_PIXEL_FORMAT = "yuv420p";
const TARGET_AUDIO_CODEC = "aac";
const TARGET_CONTAINER_RE = /\.(mp4|m4v)$/i;
// 10-bit + PQ/HLG carries HDR brightness data (iPhone HEVC recordings). It is
// tone-mapped to SDR BT.709 rather than truncated, or the picture goes flat.
const HDR_TRANSFER_CODES = new Set(["smpte2084", "arib-std-b67"]);
const HDR_TO_SDR_FILTER =
  "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709," +
  "tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";

// Short-form delivery ceiling — kept in step with lib/social.js
// (DELIVERY_* constants + planDeliveryEncode + buildDeliveryEncodeArgs).
const MAX_SHORT_EDGE = 1080;
const MAX_LONG_EDGE = 1920;
const MAX_FPS = 60;
const KEYFRAME_SECONDS = 2;
const AUDIO_BITRATE = "160k";
const LOUDNORM_FILTER = "loudnorm=I=-14:TP=-1.5:LRA=11";
// Re-encode for bitrate only when the source clearly overshoots its tier.
const BITRATE_SLACK = 1.35;
// Tightest tier whose short edge is >= the output's short edge wins.
const LADDER = [
  { shortEdge: 360, crf: 23, maxrateK: 800, bufsizeK: 1600 },
  { shortEdge: 480, crf: 22, maxrateK: 1500, bufsizeK: 3000 },
  { shortEdge: 720, crf: 21, maxrateK: 3000, bufsizeK: 6000 },
  { shortEdge: 1080, crf: 20, maxrateK: 6000, bufsizeK: 12000 },
];
function tierForShortEdge(px) {
  return LADDER.find((t) => px <= t.shortEdge) || LADDER[LADDER.length - 1];
}
function evenDown(value) {
  const n = Math.max(2, Math.floor(Number(value) || 0));
  return n % 2 === 0 ? n : n - 1;
}
// "30000/1001" → 29.97; "" / "0/0" → null
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

const NORMALIZED_SUFFIX = ".normalized.mp4";

// ── CLI ────────────────────────────────────────────────────────────────────
function resolveDbFile() {
  const envVal = process.env.DB_FILE;
  if (!envVal) return path.join(BACKEND_ROOT, "database.sqlite3");
  return path.isAbsolute(envVal) ? envVal : path.resolve(BACKEND_ROOT, envVal);
}

function resolveVideosDir() {
  const envVal = process.env.VIDEOS_DIR;
  if (!envVal) return path.join(BACKEND_ROOT, "videos");
  return path.isAbsolute(envVal) ? envVal : path.resolve(BACKEND_ROOT, envVal);
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv) {
  const options = {
    apply: false,
    verify: false,
    keepMp3Audio: false,
    forceReencode: false,
    postersOnly: false,
    posters: true,
    downscale: true,
    preset: "slow",
    // null → each re-encode uses its ladder tier's CRF (20-23). A number
    // from --crf overrides every tier.
    crf: null,
    threads: 0,
    only: "",
    limit: Infinity,
    dbFile: resolveDbFile(),
    videosDir: resolveVideosDir(),
    backupFile: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const takeValue = (name) => {
      const inline = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : null;
      if (inline !== null) return inline;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`${name} requires a value.`);
      }
      i += 1;
      return next;
    };

    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--verify") options.verify = true;
    else if (arg === "--keep-mp3-audio") options.keepMp3Audio = true;
    else if (arg === "--force-reencode") options.forceReencode = true;
    else if (arg === "--no-downscale") options.downscale = false;
    else if (arg === "--posters-only") options.postersOnly = true;
    else if (arg === "--no-posters") options.posters = false;
    else if (arg === "--preset" || arg.startsWith("--preset=")) {
      const value = takeValue("--preset").trim().toLowerCase();
      if (!X264_PRESETS.has(value)) {
        throw new Error(
          `--preset must be one of: ${Array.from(X264_PRESETS).join(", ")}.`,
        );
      }
      options.preset = value;
    } else if (arg === "--crf" || arg.startsWith("--crf=")) {
      const n = Number.parseInt(takeValue("--crf"), 10);
      if (!Number.isFinite(n) || n < 0 || n > 51) {
        throw new Error("--crf must be between 0 and 51.");
      }
      options.crf = n;
    } else if (arg === "--threads" || arg.startsWith("--threads=")) {
      const n = Number.parseInt(takeValue("--threads"), 10);
      if (!Number.isFinite(n) || n < 0) throw new Error("--threads must be >= 0.");
      options.threads = n;
    } else if (arg === "--only" || arg.startsWith("--only="))
      options.only = takeValue("--only").trim();
    else if (arg === "--limit" || arg.startsWith("--limit=")) {
      const n = Number.parseInt(takeValue("--limit"), 10);
      if (!Number.isFinite(n) || n <= 0) throw new Error("--limit must be > 0.");
      options.limit = n;
    } else if (arg === "--backup" || arg.startsWith("--backup="))
      options.backupFile = takeValue("--backup");
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (options.postersOnly && !options.posters) {
    throw new Error("--posters-only and --no-posters are mutually exclusive.");
  }

  return options;
}

function printHelp() {
  const lines = fs.readFileSync(__filename, "utf8").split("\n");
  const doc = [];
  for (const line of lines) {
    if (line.startsWith("#!")) continue; // shebang
    if (line.trim() === "" && doc.length === 0) continue; // leading blank
    if (!line.startsWith("//")) break; // end of the header block
    doc.push(line.replace(/^\/\/ ?/, ""));
  }
  console.log(doc.join("\n"));
}

// ── ffprobe / ffmpeg ───────────────────────────────────────────────────────
function toolMissing(binary) {
  return new Error(
    `"${binary}" is not on PATH — install ffmpeg (it ships both ffmpeg and ` +
      `ffprobe) or point FFMPEG_PATH / FFPROBE_PATH at the binaries.`,
  );
}

// Can this path/name actually be executed here?
function canExecute(bin) {
  return new Promise((resolve) => {
    execFile(
      bin,
      ["-version"],
      { timeout: 10000, windowsHide: true, maxBuffer: 1 << 20 },
      (error) => resolve(!error),
    );
  });
}

// Turn a tool name into something runnable: an explicit env path, then PATH,
// then the common VPS install dirs. Also checks next to a custom YTDLP_PATH,
// since the setup script often lands ffmpeg beside yt-dlp.
async function resolveTool(name, explicit) {
  const exe = IS_WINDOWS ? `${name}.exe` : name;
  const candidates = [];
  if (explicit && explicit !== name) candidates.push(explicit);
  candidates.push(name); // PATH lookup
  if (process.env.YTDLP_PATH) {
    try {
      candidates.push(path.join(path.dirname(process.env.YTDLP_PATH), exe));
    } catch {
      // Ignore an unparseable YTDLP_PATH.
    }
  }
  for (const dir of TOOL_SEARCH_DIRS) candidates.push(path.join(dir, exe));

  const tried = [];
  for (const candidate of candidates) {
    if (tried.includes(candidate)) continue;
    tried.push(candidate);
    if (await canExecute(candidate)) return candidate;
  }
  const envName = name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH";
  throw new Error(
    `Could not run "${name}". Tried: ${tried.join(", ")}.\n` +
      `  • VPS: sudo ./scripts/setup-downloaders.sh   (installs ffmpeg)\n` +
      `  • or set ${envName}=/full/path/to/${name} in mirabellier-backend/.env`,
  );
}

// Resolve both binaries before anything is read or written.
async function preflight() {
  FFMPEG_PATH = await resolveTool("ffmpeg", FFMPEG_PATH);
  FFPROBE_PATH = await resolveTool("ffprobe", FFPROBE_PATH);
}

// Free bytes on the filesystem holding `dir`, or null if it can't be read.
function freeBytesFor(dir) {
  try {
    if (typeof fs.statfsSync !== "function") return null;
    const stat = fs.statfsSync(dir);
    return stat.bavail * stat.bsize;
  } catch {
    return null;
  }
}

function runFfprobe(args) {
  return new Promise((resolve, reject) => {
    execFile(
      FFPROBE_PATH,
      args,
      { timeout: 30000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          if (error.code === "ENOENT") return reject(toolMissing("ffprobe"));
          return reject(
            new Error(String(error.stderr || error.message || "ffprobe failed")),
          );
        }
        resolve(String(stdout || ""));
      },
    );
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(
      FFMPEG_PATH,
      args,
      {
        timeout: FFMPEG_TIMEOUT_MS,
        killSignal: "SIGKILL",
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error) => {
        if (error) {
          if (error.code === "ENOENT") return reject(toolMissing("ffmpeg"));
          if (error.killed) return reject(new Error("ffmpeg timed out"));
          const detail = String(error.stderr || error.message || "").trim();
          const lastLine = detail.split("\n").filter(Boolean).pop() || "";
          return reject(new Error(lastLine || "ffmpeg failed"));
        }
        resolve();
      },
    );
  });
}

let zscaleSupport = null;
function ffmpegHasZscale() {
  if (!zscaleSupport) {
    zscaleSupport = new Promise((resolve) => {
      execFile(
        FFMPEG_PATH,
        ["-hide_banner", "-filters"],
        { timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout) => {
          resolve(!error && /(?:^|\s)zscale\s/.test(String(stdout || "")));
        },
      );
    });
  }
  return zscaleSupport;
}

async function probeVideo(filePath) {
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
  const video = streams.find((s) => String(s.codec_type) === "video");
  const audio = streams.find((s) => String(s.codec_type) === "audio");

  const pixelFormat = video
    ? String(video.pix_fmt || "").toLowerCase()
    : "";
  const depthMatch = pixelFormat.match(/(\d+)(?:le|be)$/);
  const bitDepth = video
    ? Number.parseInt(video.bits_per_raw_sample, 10) ||
      (depthMatch ? Number.parseInt(depthMatch[1], 10) : 8)
    : null;

  const width = video ? Number.parseInt(video.width, 10) || 0 : 0;
  const height = video ? Number.parseInt(video.height, 10) || 0 : 0;
  const fps = video
    ? parseFrameRate(video.avg_frame_rate) ||
      parseFrameRate(video.r_frame_rate)
    : null;
  const bitsPerSecond =
    Number.parseInt(video?.bit_rate, 10) ||
    Number.parseInt(format.bit_rate, 10) ||
    0;
  const durationRaw =
    Number.parseFloat(video?.duration) ||
    Number.parseFloat(format.duration) ||
    0;

  return {
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    videoCodec: video ? String(video.codec_name || "").toLowerCase() : "",
    videoProfile: video ? String(video.profile || "") : "",
    audioCodec: audio ? String(audio.codec_name || "").toLowerCase() : "",
    pixelFormat,
    bitDepth: bitDepth ?? 8,
    colorTransfer: video
      ? String(video.color_transfer || "").toLowerCase()
      : "",
    width,
    height,
    fps,
    bitRateKbps: bitsPerSecond > 0 ? Math.round(bitsPerSecond / 1000) : null,
    durationSeconds: durationRaw > 0 ? durationRaw : null,
  };
}

// Walk the top-level MP4 boxes to learn whether `moov` precedes `mdat`
// (i.e. the file is already progressive-download / faststart friendly).
function inspectMp4Layout(filePath) {
  const result = { looksLikeMp4: false, moovBeforeMdat: null };
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return result;
  }
  try {
    const fileSize = fs.fstatSync(fd).size;
    const head = Buffer.alloc(16);
    let offset = 0;
    let sawMdat = false;

    while (offset + 8 <= fileSize) {
      const read = fs.readSync(fd, head, 0, 16, offset);
      if (read < 8) break;

      let size = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      let headerSize = 8;

      if (size === 1) {
        if (read < 16) break;
        size =
          head.readUInt32BE(8) * 2 ** 32 + head.readUInt32BE(12);
        headerSize = 16;
      } else if (size === 0) {
        size = fileSize - offset; // extends to end of file
      }

      if (!/^[\x20-\x7e]{4}$/.test(type)) break; // not a sane box header
      if (type === "ftyp") result.looksLikeMp4 = true;
      if (type === "mdat") sawMdat = true;
      if (type === "moov") {
        result.looksLikeMp4 = true;
        if (result.moovBeforeMdat === null) result.moovBeforeMdat = !sawMdat;
        break;
      }
      if (size < headerSize) break;
      offset += size;
    }

    // Saw the media data but never a moov ahead of it → not faststart.
    if (result.moovBeforeMdat === null && sawMdat) result.moovBeforeMdat = false;
    return result;
  } catch {
    return result;
  } finally {
    fs.closeSync(fd);
  }
}

// ── Decide what a file needs ───────────────────────────────────────────────
function planForFile(filePath, probe, layout, opts) {
  const reasons = [];

  const isHdr =
    probe.bitDepth > 8 && HDR_TRANSFER_CODES.has(probe.colorTransfer);

  // ── Delivery ceiling (skipped with --no-downscale) ──────────────────────
  const srcW = probe.width || 0;
  const srcH = probe.height || 0;
  const haveDims = probe.hasVideo && srcW > 0 && srcH > 0;
  const srcShort = haveDims ? Math.min(srcW, srcH) : 0;
  const srcLong = haveDims ? Math.max(srcW, srcH) : 0;

  let scaleFactor = 1;
  if (
    opts.downscale &&
    haveDims &&
    (srcShort > MAX_SHORT_EDGE || srcLong > MAX_LONG_EDGE)
  ) {
    scaleFactor = Math.min(
      MAX_SHORT_EDGE / srcShort,
      MAX_LONG_EDGE / srcLong,
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
  const needsFpsCap =
    opts.downscale && Boolean(srcFps && srcFps > MAX_FPS + 0.5);
  const targetFps = needsFpsCap ? MAX_FPS : srcFps;
  if (needsFpsCap) reasons.push(`${srcFps.toFixed(2)}fps → ${MAX_FPS}fps`);

  const outShort =
    targetWidth && targetHeight
      ? Math.min(targetWidth, targetHeight)
      : MAX_SHORT_EDGE;
  const tier = tierForShortEdge(outShort);

  const overBitrate =
    probe.bitRateKbps != null &&
    probe.bitRateKbps > tier.maxrateK * BITRATE_SLACK;
  if (overBitrate) {
    reasons.push(`${probe.bitRateKbps}kbps → ≤${tier.maxrateK}kbps`);
  }

  const videoBad =
    !probe.hasVideo ||
    probe.videoCodec !== TARGET_VIDEO_CODEC ||
    probe.pixelFormat !== TARGET_PIXEL_FORMAT ||
    probe.bitDepth > 8 ||
    isHdr ||
    needsScale ||
    needsFpsCap ||
    overBitrate;

  if (!probe.hasVideo) reasons.push("no video stream");
  else {
    if (probe.videoCodec !== TARGET_VIDEO_CODEC)
      reasons.push(`video codec ${probe.videoCodec || "?"} → h264`);
    if (probe.bitDepth > 8) reasons.push(`${probe.bitDepth}-bit → 8-bit`);
    if (
      probe.pixelFormat &&
      probe.pixelFormat !== TARGET_PIXEL_FORMAT &&
      probe.bitDepth <= 8
    )
      reasons.push(`pixel format ${probe.pixelFormat} → yuv420p`);
    if (isHdr) reasons.push(`HDR (${probe.colorTransfer}) → SDR bt709`);
  }

  const audioIsMp3Kept = opts.keepMp3Audio && probe.audioCodec === "mp3";
  const audioBad =
    probe.hasAudio &&
    probe.audioCodec !== TARGET_AUDIO_CODEC &&
    !audioIsMp3Kept;
  if (audioBad) reasons.push(`audio codec ${probe.audioCodec || "?"} → aac`);

  const containerBad = !TARGET_CONTAINER_RE.test(filePath);
  if (containerBad)
    reasons.push(`container ${path.extname(filePath) || "?"} → mp4`);

  const faststartBad =
    !containerBad && layout.looksLikeMp4 && layout.moovBeforeMdat === false;
  if (faststartBad) reasons.push("moov after mdat → +faststart");

  let action = "none";
  if (opts.forceReencode && probe.hasVideo) action = "reencode";
  else if (videoBad && probe.hasVideo) action = "reencode";
  else if (videoBad && !probe.hasVideo) action = "skip"; // audio-only file
  else if (audioBad) action = "audio";
  else if (containerBad || faststartBad) action = "remux";

  if (opts.forceReencode && action === "none" && probe.hasVideo) {
    action = "reencode";
    reasons.push("forced re-encode");
  }

  return {
    action,
    reasons,
    isHdr,
    tier,
    needsScale,
    targetWidth,
    targetHeight,
    targetFps,
  };
}

// ── Conversions ────────────────────────────────────────────────────────────
function outPathFor(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath).replace(/\.[^.]+$/, "");
  return path.join(dir, base + NORMALIZED_SUFFIX);
}

// A partly-written temp file to delete if the process is killed mid-run.
let inFlightTemp = null;
function dropInFlightTemp() {
  if (!inFlightTemp) return;
  try {
    fs.unlinkSync(inFlightTemp);
  } catch {
    // Already gone / never created.
  }
  inFlightTemp = null;
}

function threadArgs(opts) {
  return opts.threads > 0 ? ["-threads", String(opts.threads)] : [];
}

async function remux(filePath, probe, opts) {
  const outPath = outPathFor(filePath);
  const args = [
    "-nostdin", "-y", "-v", "error",
    ...threadArgs(opts),
    "-i", filePath,
    "-map", "0:v:0", "-c:v", "copy",
  ];
  if (probe.hasAudio) args.push("-map", "0:a:0", "-c:a", "copy");
  args.push("-movflags", "+faststart", outPath);
  await ffmpegOrCleanup(args, outPath);
  return outPath;
}

async function transcodeAudioOnly(filePath, probe, opts) {
  const outPath = outPathFor(filePath);
  const args = [
    "-nostdin", "-y", "-v", "error",
    ...threadArgs(opts),
    "-i", filePath,
    "-map", "0:v:0", "-c:v", "copy",
    "-map", "0:a:0",
  ];
  if (opts.keepMp3Audio && probe.audioCodec === "mp3") args.push("-c:a", "copy");
  else args.push("-c:a", "aac", "-b:a", "192k");
  args.push("-movflags", "+faststart", outPath);
  await ffmpegOrCleanup(args, outPath);
  return outPath;
}

async function reencode(filePath, probe, plan, opts) {
  const outPath = outPathFor(filePath);
  const { isHdr, needsScale, targetWidth, targetHeight, targetFps, tier } = plan;
  const usesToneMap = isHdr && (await ffmpegHasZscale());

  const args = [
    "-nostdin", "-y", "-v", "error",
    ...threadArgs(opts),
    "-i", filePath,
    "-map", "0:v:0",
  ];
  if (probe.hasAudio) args.push("-map", "0:a:0");

  const filters = [];
  if (usesToneMap) filters.push(HDR_TO_SDR_FILTER);
  if (needsScale) filters.push(`scale=${targetWidth}:${targetHeight}:flags=lanczos`);
  if (filters.length) args.push("-vf", filters.join(","));

  const crf = opts.crf != null ? opts.crf : tier.crf;
  args.push(
    "-c:v", "libx264",
    "-preset", opts.preset,
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-crf", String(crf),
    "-maxrate", `${tier.maxrateK}k`,
    "-bufsize", `${tier.bufsizeK}k`,
  );

  const gopFps = Math.round(targetFps || probe.fps || 30);
  const gop = Math.max(2, gopFps * KEYFRAME_SECONDS);
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
    if (opts.keepMp3Audio && probe.audioCodec === "mp3") {
      args.push("-c:a", "copy");
    } else {
      args.push(
        "-c:a", "aac",
        "-b:a", AUDIO_BITRATE,
        "-ar", "48000",
        "-af", LOUDNORM_FILTER,
      );
    }
  } else {
    args.push("-an");
  }
  args.push(
    "-movflags", "+faststart",
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    outPath,
  );
  await ffmpegOrCleanup(args, outPath);
  return outPath;
}

async function ffmpegOrCleanup(args, outPath) {
  inFlightTemp = outPath;
  try {
    await runFfmpeg(args);
  } catch (err) {
    await fs.promises.unlink(outPath).catch(() => {});
    inFlightTemp = null;
    throw err;
  }
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    await fs.promises.unlink(outPath).catch(() => {});
    inFlightTemp = null;
    throw new Error("ffmpeg produced an empty file");
  }
  inFlightTemp = null;
}

async function convert(action, filePath, probe, plan, opts) {
  if (action === "remux") return remux(filePath, probe, opts);
  if (action === "audio") return transcodeAudioOnly(filePath, probe, opts);
  if (action === "reencode") return reencode(filePath, probe, plan, opts);
  throw new Error(`nothing to do for action "${action}"`);
}

const POSTER_MAX_DIMENSION = 1080;

function posterPathFor(videoPath) {
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  return path.join(dir, `${base}.poster.jpg`);
}

// First-frame JPEG next to the clip. Kept in step with
// lib/social.js -> extractPosterFrame (same scale / quality).
async function extractPoster(videoPath, opts) {
  const outPath = posterPathFor(videoPath);
  inFlightTemp = outPath;
  const args = [
    "-nostdin", "-y", "-v", "error",
    ...threadArgs(opts),
    "-i", videoPath,
    "-frames:v", "1",
    "-vf", `scale='min(${POSTER_MAX_DIMENSION},iw)':-2:flags=lanczos`,
    "-q:v", "3",
    "-f", "image2",
    outPath,
  ];
  try {
    await runFfmpeg(args);
  } catch (err) {
    await fs.promises.unlink(outPath).catch(() => {});
    inFlightTemp = null;
    throw err;
  }
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    await fs.promises.unlink(outPath).catch(() => {});
    inFlightTemp = null;
    throw new Error("ffmpeg produced an empty poster");
  }
  inFlightTemp = null;
  return { filePath: outPath, filename: path.basename(outPath) };
}

// ── Main ───────────────────────────────────────────────────────────────────
const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }

  // Drop a half-written temp file if the run is killed (SSH drop, Ctrl-C,
  // systemd stop). Already-converted files are committed per-file, so the
  // next invocation just resumes.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      dropInFlightTemp();
      console.error(
        `\n${signal} — stopping. In-progress temp cleaned up; ` +
          `finished files are saved. Re-run to continue.`,
      );
      process.exit(130);
    });
  }

  if (!fs.existsSync(opts.dbFile)) {
    console.error(`Database not found: ${opts.dbFile}`);
    process.exit(1);
  }
  if (!fs.existsSync(opts.videosDir)) {
    console.error(`Videos directory not found: ${opts.videosDir}`);
    process.exit(1);
  }

  try {
    await preflight();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  console.log(`ffmpeg:  ${FFMPEG_PATH}`);
  console.log(`ffprobe: ${FFPROBE_PATH}`);
  console.log(`db:      ${opts.dbFile}`);
  console.log(`videos:  ${opts.videosDir}\n`);

  if (opts.apply) {
    if (!opts.backupFile) {
      opts.backupFile = path.join(
        path.dirname(opts.dbFile),
        `database-backup-${timestampForFile()}.sqlite3`,
      );
    }
    fs.copyFileSync(opts.dbFile, opts.backupFile);
    console.log(`Backed up database → ${opts.backupFile}\n`);
  }

  const db = new Database(opts.dbFile);
  db.pragma("busy_timeout = 30000");
  db.pragma("journal_mode = WAL");

  // The backend adds these on startup; do it here too so the script works
  // against a database whose backend hasn't been redeployed yet.
  for (const ddl of [
    "ALTER TABLE user_videos ADD COLUMN posterFilename TEXT",
    "ALTER TABLE user_videos ADD COLUMN width INTEGER",
    "ALTER TABLE user_videos ADD COLUMN height INTEGER",
  ]) {
    try {
      db.prepare(ddl).run();
    } catch {
      // Column already exists.
    }
  }

  const rows = db
    .prepare(
      "SELECT id, filename, posterFilename, mimeType, sizeBytes, width, height FROM user_videos ORDER BY createdAt DESC",
    )
    .all();

  // Sweep leftover *.normalized.mp4 temp files from an interrupted run — but
  // never one a row actually points at (a committed conversion keeps that
  // name).
  const liveFilenames = new Set(rows.map((row) => row.filename));
  try {
    for (const entry of fs.readdirSync(opts.videosDir)) {
      if (entry.endsWith(NORMALIZED_SUFFIX) && !liveFilenames.has(entry)) {
        try {
          fs.unlinkSync(path.join(opts.videosDir, entry));
          console.log(`Removed stale temp from a previous run: ${entry}`);
        } catch {
          // Non-fatal — a permission or race issue, skip it.
        }
      }
    }
  } catch {
    // Can't list the dir — the per-file checks below still guard correctness.
  }

  // One physical file can back several rows (re-imports / admin copies).
  const rowsByFilename = new Map();
  for (const row of rows) {
    if (opts.only && row.id !== opts.only) continue;
    if (!rowsByFilename.has(row.filename)) rowsByFilename.set(row.filename, []);
    rowsByFilename.get(row.filename).push(row);
  }

  if (opts.only && rowsByFilename.size === 0) {
    console.error(`No user_videos row with id "${opts.only}".`);
    db.close();
    process.exit(1);
  }

  const updateRow = db.prepare(
    "UPDATE user_videos SET filename = ?, mimeType = ?, sizeBytes = ? WHERE id = ?",
  );
  const updatePoster = db.prepare(
    "UPDATE user_videos SET posterFilename = ? WHERE id = ?",
  );
  const updateDims = db.prepare(
    "UPDATE user_videos SET width = ?, height = ? WHERE id = ?",
  );

  const files = Array.from(rowsByFilename.entries());
  const summary = {
    scanned: 0,
    alreadyOk: 0,
    downscaled: 0,
    remuxed: [],
    audio: [],
    reencoded: [],
    failed: [],
    missing: [],
    skipped: [],
    postersOk: 0,
    posters: [],
    postersPlanned: [],
    posterFailed: [],
  };

  let worked = 0;
  for (let index = 0; index < files.length; index++) {
    const [filename, rowGroup] = files[index];
    if (worked >= opts.limit) break;
    summary.scanned += 1;

    const sourcePath = path.join(opts.videosDir, filename);
    if (!fs.existsSync(sourcePath)) {
      summary.missing.push(`${filename} (${rowGroup.length} row(s))`);
      continue;
    }

    let probe;
    try {
      probe = await probeVideo(sourcePath);
    } catch (err) {
      summary.failed.push(`${filename}: probe failed — ${err.message}`);
      continue;
    }

    // The file the row ends up pointing at — the source, unless this run
    // normalizes it under --apply.
    let finalVideoPath = sourcePath;
    let finalFilename = filename;
    let renamed = false;
    let didWork = false;

    // ── Encode pass ─────────────────────────────────────────────────────
    if (!opts.postersOnly) {
      const layout = TARGET_CONTAINER_RE.test(sourcePath)
        ? inspectMp4Layout(sourcePath)
        : { looksLikeMp4: false, moovBeforeMdat: null };

      const plan = planForFile(sourcePath, probe, layout, opts);
      const { action, reasons } = plan;

      if (action === "skip") {
        // No video stream — nothing to normalize, and no poster to make.
        summary.skipped.push(`${filename}: ${reasons.join(", ")}`);
        continue;
      }

      if (plan.needsScale) summary.downscaled += 1;

      if (action === "none") {
        summary.alreadyOk += 1;
        // Backfill a frame size for an already-compliant clip that never had
        // one recorded (cheap; keeps the SEO card + ladder logic honest).
        if (
          opts.apply &&
          probe.width &&
          probe.height &&
          rowGroup.some((row) => !row.width || !row.height)
        ) {
          for (const row of rowGroup) {
            updateDims.run(probe.width, probe.height, row.id);
          }
        }
      } else {
        const tag =
          action === "remux"
            ? "remux (stream copy)"
            : action === "audio"
              ? "audio → aac"
              : "re-encode → h264/aac";
        console.log(
          `[${index + 1}/${files.length}] ${filename}\n` +
            `    ${formatMb(fs.statSync(sourcePath).size)} · ${tag}\n` +
            `    reasons: ${reasons.join("; ")}`,
        );

        const bucket =
          action === "remux"
            ? summary.remuxed
            : action === "audio"
              ? summary.audio
              : summary.reencoded;

        if (!(opts.apply || opts.verify)) {
          bucket.push({ filename, rowCount: rowGroup.length, reasons });
          worked += 1;
          didWork = true;
        } else {
          // The conversion writes a second copy next to the original before
          // the old file is removed. Bail on this file (not the whole run)
          // if the disk clearly can't hold it.
          const sourceBytes = fs.statSync(sourcePath).size;
          const freeBytes = freeBytesFor(opts.videosDir);
          if (
            freeBytes !== null &&
            freeBytes < sourceBytes * 1.5 + 50 * 1024 * 1024
          ) {
            summary.failed.push(
              `${filename}: skipped — only ${formatMb(freeBytes)} free on the ` +
                `videos disk, need ~${formatMb(sourceBytes * 1.5)}`,
            );
            continue;
          }

          const startedAt = Date.now();
          let outPath;
          try {
            outPath = await convert(action, sourcePath, probe, plan, opts);
          } catch (err) {
            summary.failed.push(
              `${filename}: ${action} failed — ${err.message}`,
            );
            continue;
          }

          const newSize = fs.statSync(outPath).size;
          const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
          console.log(
            `    → ${path.basename(outPath)} (${formatMb(newSize)}) in ${secs}s`,
          );

          const record = {
            filename,
            newFilename: path.basename(outPath),
            rowCount: rowGroup.length,
            oldSize: rowGroup[0].sizeBytes || fs.statSync(sourcePath).size,
            newSize,
            reasons,
          };
          bucket.push(record);
          worked += 1;
          didWork = true;

          if (opts.apply) {
            const outW = plan.needsScale ? plan.targetWidth : probe.width || 0;
            const outH = plan.needsScale ? plan.targetHeight : probe.height || 0;
            for (const row of rowGroup) {
              updateRow.run(record.newFilename, "video/mp4", newSize, row.id);
              if (outW && outH) updateDims.run(outW, outH, row.id);
            }
            if (outPath !== sourcePath) {
              fs.promises.unlink(sourcePath).catch(() => {});
            }
            finalVideoPath = outPath;
            finalFilename = record.newFilename;
            renamed = record.newFilename !== filename;
          } else {
            // --verify dry run: throw the proof-of-work file away.
            fs.promises.unlink(outPath).catch(() => {});
          }
        }
      }
    }

    // ── Poster pass ─────────────────────────────────────────────────────
    // Backfill user_videos.posterFilename for any row missing a poster (or
    // whose poster file is gone, or was invalidated by a rename above).
    if (opts.posters && probe.hasVideo && (didWork || worked < opts.limit)) {
      const posterGone = (name) =>
        !name || !fs.existsSync(path.join(opts.videosDir, name));
      const needsPoster =
        renamed || rowGroup.some((row) => posterGone(row.posterFilename));

      if (!needsPoster) {
        summary.postersOk += 1;
      } else if (!opts.apply) {
        summary.postersPlanned.push({
          filename: finalFilename,
          rowCount: rowGroup.length,
        });
        if (!didWork) {
          worked += 1;
          didWork = true;
        }
      } else {
        try {
          const started = Date.now();
          const poster = await extractPoster(finalVideoPath, opts);
          const secs = ((Date.now() - started) / 1000).toFixed(1);
          console.log(
            `[${index + 1}/${files.length}] ${finalFilename}\n` +
              `    → ${poster.filename} in ${secs}s (poster)`,
          );
          for (const row of rowGroup) {
            if (row.posterFilename && row.posterFilename !== poster.filename) {
              fs.promises
                .unlink(path.join(opts.videosDir, row.posterFilename))
                .catch(() => {});
            }
            updatePoster.run(poster.filename, row.id);
          }
          summary.posters.push({
            filename: finalFilename,
            posterName: poster.filename,
            rowCount: rowGroup.length,
          });
          if (!didWork) {
            worked += 1;
            didWork = true;
          }
        } catch (err) {
          summary.posterFailed.push(`${finalFilename}: ${err.message}`);
        }
      }
    }
  }

  db.close();

  const changed =
    summary.remuxed.length + summary.audio.length + summary.reencoded.length;
  const postersNeeded =
    summary.posters.length + summary.postersPlanned.length;

  if (!opts.postersOnly) {
    console.log(
      `\nScanned ${summary.scanned} file(s): ${summary.alreadyOk} already ` +
        `match the target, ${changed} need work ` +
        `(${summary.remuxed.length} remux, ${summary.audio.length} audio, ` +
        `${summary.reencoded.length} re-encode` +
        `${summary.downscaled ? `, ${summary.downscaled} downscaled` : ""}).`,
    );
  } else {
    console.log(`\nScanned ${summary.scanned} file(s) for posters.`);
  }

  if (opts.posters) {
    console.log(
      `Posters: ${summary.postersOk} present, ${postersNeeded} ` +
        `${opts.apply ? "generated" : "missing"}` +
        (summary.posterFailed.length
          ? `, ${summary.posterFailed.length} failed`
          : "") +
        ".",
    );
  }

  if (summary.skipped.length) {
    console.log("\nSkipped (no video stream):");
    summary.skipped.forEach((s) => console.log("  " + s));
  }
  if (summary.missing.length) {
    console.log("\nMissing files:");
    summary.missing.forEach((s) => console.log("  " + s));
  }
  if (summary.failed.length) {
    console.log("\nFailures (originals left untouched):");
    summary.failed.forEach((s) => console.log("  " + s));
  }
  if (summary.posterFailed.length) {
    console.log("\nPoster failures (clip left without a poster):");
    summary.posterFailed.forEach((s) => console.log("  " + s));
  }

  if (!opts.apply) {
    console.log(
      `\nDry run — no files or database rows changed.${
        opts.verify ? " (--verify: conversions were run and discarded)" : ""
      }\nRe-run with --apply to convert, repoint, and attach posters.`,
    );
  } else {
    const rowsRepointed =
      summary.remuxed.reduce((n, r) => n + r.rowCount, 0) +
      summary.audio.reduce((n, r) => n + r.rowCount, 0) +
      summary.reencoded.reduce((n, r) => n + r.rowCount, 0);
    const posterRows = summary.posters.reduce((n, r) => n + r.rowCount, 0);
    console.log(
      `\nApplied: ${changed} file(s) normalized (${rowsRepointed} row(s) ` +
        `repointed); ${summary.posters.length} poster(s) attached ` +
        `(${posterRows} row(s)).`,
    );
  }

  if (summary.failed.length || summary.posterFailed.length) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = { planForFile, inspectMp4Layout, probeVideo };
