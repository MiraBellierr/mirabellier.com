#!/usr/bin/env node

const path = require("path");
const sharp = require("sharp");

const ELEMENTS_DIR = path.resolve(__dirname, "..", "..", "src", "assets", "elements");

const SHEET_FILE = path.join(ELEMENTS_DIR, "AllIcons16x16TickOutlineResized.png");

const IMG_W = 480;
const IMG_H = 480;

// Flood-fill bounding boxes for each single icon
const ICONS = {
  fire:  { x: 15, y: 10, w: 50, h: 60 },
  water: { x: 95, y: 15, w: 55, h: 55 },
  earth: { x: 170, y: 10, w: 60, h: 60 },
  wind:  { x: 85, y: 90, w: 75, h: 65 },
  light: { x: 325, y: 0, w: 75, h: 75 },
  dark:  { x: 90, y: 165, w: 60, h: 70 },
};

const PAD = 5;
const OUT_SIZE = 32;

function clampExtract(x, y, w, h) {
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const width = Math.min(w, IMG_W - left);
  const height = Math.min(h, IMG_H - top);
  return { left, top, width, height };
}

async function main() {
  const sheet = sharp(SHEET_FILE);

  for (const [name, { x, y, w, h }] of Object.entries(ICONS)) {
    const outFile = path.join(ELEMENTS_DIR, `${name}.png`);
    const { left, top, width, height } = clampExtract(x - PAD, y - PAD, w + PAD * 2, h + PAD * 2);
    await sheet
      .clone()
      .extract({ left, top, width, height })
      .resize(OUT_SIZE, OUT_SIZE, { kernel: "nearest", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(outFile);
    console.log(`Extracted: ${outFile} (${width}x${height} -> ${OUT_SIZE}x${OUT_SIZE})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
