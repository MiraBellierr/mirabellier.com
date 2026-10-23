const fs = require("fs");
const path = require("path");
const multer = require("multer");
const sharp = require("sharp");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

// Stored extension is derived from the detected MIME type, never from the
// client-supplied originalname. Anything not in this map is rejected outright.
const IMAGE_MIME_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

function resolveDir(envVar, defaultName) {
  const envVal = process.env[envVar];
  if (envVal) {
    const resolved = path.isAbsolute(envVal)
      ? envVal
      : path.resolve(__dirname, "..", envVal);
    return resolved;
  }
  return path.join(__dirname, "..", defaultName);
}

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function buildUniqueFilename(
  prefix,
  originalName,
  allowEmptyExtension = false,
) {
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = path.extname(originalName);
  const safeExt = ext || (allowEmptyExtension ? "" : ".bin");
  return `${prefix}${uniqueSuffix}${safeExt}`;
}

function createDiskStorage(
  destinationDir,
  filenamePrefix,
  allowEmptyExtension,
) {
  return multer.diskStorage({
    destination: (_, __, cb) => cb(null, destinationDir),
    filename: (_, file, cb) => {
      cb(
        null,
        buildUniqueFilename(
          filenamePrefix,
          file.originalname,
          allowEmptyExtension,
        ),
      );
    },
  });
}

const IMAGES_DIR = resolveDir("IMAGES_DIR", "images");
ensureDirExists(IMAGES_DIR);

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
  filename: (_req, file, cb) => {
    const ext = IMAGE_MIME_EXTENSIONS.get(file.mimetype) || ".bin";
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `mirabellier-image-${uniqueSuffix}${ext}`);
  },
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME_EXTENSIONS.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Unsupported image format"));
  },
});

const VIDEOS_DIR = resolveDir("VIDEOS_DIR", "videos");
ensureDirExists(VIDEOS_DIR);

const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/ogg",
  "video/mov",
]);

const MAX_VIDEO_SIZE_BYTES = 250 * 1024 * 1024;

const videoStorage = createDiskStorage(VIDEOS_DIR, "mirabellier-video-", true);

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: MAX_VIDEO_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (VIDEO_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Unsupported video format"));
  },
});

const AUDIO_DIR = resolveDir("AUDIO_DIR", "audio");
ensureDirExists(AUDIO_DIR);

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/vnd.wave",
]);

const MAX_AUDIO_SIZE_BYTES = 100 * 1024 * 1024;

const audioStorage = createDiskStorage(AUDIO_DIR, "mirabellier-audio-", false);

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: MAX_AUDIO_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (AUDIO_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Unsupported audio format — mp3 or wav only"));
  },
});

async function writeOptimizedOriginal(filePath, optimizedPath) {
  await sharp(filePath)
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, progressive: true })
    .png({ quality: 85, compressionLevel: 9 })
    .toFile(`${optimizedPath}.tmp`);

  fs.renameSync(`${optimizedPath}.tmp`, optimizedPath);
}

async function writeWebpVersion(filePath, webpPath) {
  await sharp(filePath)
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(webpPath);
}

// Optimize uploaded images - compress and create WebP version
async function optimizeImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return;

  const baseName = path.basename(filePath, ext);
  const dir = path.dirname(filePath);
  const optimizedPath = path.join(dir, `${baseName}${ext}`);
  const webpPath = path.join(dir, `${baseName}.webp`);

  try {
    await writeOptimizedOriginal(filePath, optimizedPath);
    await writeWebpVersion(filePath, webpPath);
  } catch {
    // Preserve existing behavior: optimization failures do not block uploads.
  }
}

module.exports = {
  IMAGES_DIR,
  VIDEOS_DIR,
  AUDIO_DIR,
  imageUpload,
  videoUpload,
  audioUpload,
  optimizeImage,
};
