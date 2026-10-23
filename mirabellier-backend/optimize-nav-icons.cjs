// Optimize navigation icons to 24x24 WebP with maximum compression
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const iconSizes = [
  { name: "img1", size: 500 },
  { name: "img2", size: 500 },
  { name: "img3", size: 360 },
  { name: "img4", size: 360 },
  { name: "cats", size: 631 },
  { name: "twitch", size: 256 },
  { name: "discord-login", size: 256 },
];

const assetsDir = path.join(__dirname, "..", "src", "assets");

async function optimizeIcon(name, originalSize) {
  try {
    const inputPath = path.join(assetsDir, `${name}.webp`);
    const outputPath = path.join(assetsDir, "icons", `${name}-24.webp`);

    if (!fs.existsSync(inputPath)) {
      console.log(`Skipping ${name}: source file not found`);
      return;
    }

    // Resize to 24x24 with extreme compression (quality 40, effort 6)
    const webp = await sharp(inputPath, { animated: false })
      .resize(24, 24, { fit: "cover", position: "center" })
      .webp({ quality: 40, effort: 6, smartSubsample: true })
      .toBuffer();

    fs.writeFileSync(outputPath, webp);
    const originalStats = fs.statSync(inputPath);
    console.log(
      `✓ ${outputPath} (${(webp.length / 1024).toFixed(2)} KB, from ${(originalStats.size / 1024).toFixed(1)} KB)`,
    );
  } catch (err) {
    console.error(`Failed to optimize ${name}:`, err.message);
  }
}

async function main() {
  // Ensure icons dir exists
  const iconsDir = path.join(assetsDir, "icons");
  fs.mkdirSync(iconsDir, { recursive: true });

  console.log("Optimizing navigation icons to 24x24...");
  for (const { name, size } of iconSizes) {
    await optimizeIcon(name, size);
  }
  console.log("Done!");
}

main();
