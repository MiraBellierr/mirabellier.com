/**
 * Image Optimization Script
 * Converts large PNG images to optimized WebP format
 * Run with: node scripts/optimize-images.js
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const assetsDir = path.join(__dirname, "../src/assets");
const imagesToOptimize = [
  { input: "divider.png", output: "divider.webp" },
  { input: "img1.png", output: "img1.webp" },
  { input: "img2.png", output: "img2.webp" },
  { input: "img3.png", output: "img3.webp" },
  { input: "img4.png", output: "img4.webp" },
];

async function optimizeImages() {
  console.log("🖼️  Starting image optimization...\n");

  for (const { input, output } of imagesToOptimize) {
    const inputPath = path.join(assetsDir, input);
    const outputPath = path.join(assetsDir, output);

    if (!fs.existsSync(inputPath)) {
      console.log(`⚠️  Skipping ${input} - file not found`);
      continue;
    }

    try {
      const inputStats = fs.statSync(inputPath);
      const inputSizeKB = (inputStats.size / 1024).toFixed(2);

      await sharp(inputPath)
        .webp({ quality: 85, effort: 6 })
        .toFile(outputPath);

      const outputStats = fs.statSync(outputPath);
      const outputSizeKB = (outputStats.size / 1024).toFixed(2);
      const savings = ((1 - outputStats.size / inputStats.size) * 100).toFixed(
        1,
      );

      console.log(`✅ ${input} → ${output}`);
      console.log(
        `   Size: ${inputSizeKB} KB → ${outputSizeKB} KB (${savings}% smaller)\n`,
      );
    } catch (error) {
      console.error(`❌ Error optimizing ${input}:`, error.message);
    }
  }

  // Create 20x20 navigation icons
  console.log("🔍 Creating 20x20 navigation icons...\n");

  const iconsDir = path.join(assetsDir, "icons");
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const navIcons = [
    { input: "img1.webp", output: "icons/home-20.webp", name: "home" },
    { input: "img2.webp", output: "icons/about-20.webp", name: "about" },
    { input: "img3.webp", output: "icons/blog-20.webp", name: "blog" },
    { input: "img4.webp", output: "icons/art-20.webp", name: "art" },
    { input: "cats.webp", output: "icons/cats-20.webp", name: "cats" },
  ];

  for (const { input, output, name } of navIcons) {
    const inputPath = path.join(assetsDir, input);
    const outputPath = path.join(assetsDir, output);

    try {
      await sharp(inputPath)
        .resize(20, 20, { fit: "cover", position: "center" })
        .webp({ quality: 90, effort: 6 })
        .toFile(outputPath);

      const stats = fs.statSync(outputPath);
      console.log(`✅ ${name} icon: ${(stats.size / 1024).toFixed(2)} KB`);
    } catch (error) {
      console.error(`❌ Error creating ${name} icon:`, error.message);
    }
  }

  // Create 20x20 cursor icon
  try {
    const cursorPath = path.join(__dirname, "../public/cursors/Normal.gif");
    const cursorOutput = path.join(assetsDir, "icons/cursor-20.webp");

    if (fs.existsSync(cursorPath)) {
      await sharp(cursorPath, { animated: false })
        .resize(20, 20)
        .webp({ quality: 90 })
        .toFile(cursorOutput);

      const stats = fs.statSync(cursorOutput);
      console.log(`✅ cursor icon: ${(stats.size / 1024).toFixed(2)} KB`);
    }
  } catch (error) {
    console.error("❌ Error creating cursor icon:", error.message);
  }

  console.log("\n✨ Image optimization complete!");
  console.log("\n📝 Next steps:");
  console.log("1. Update import statements in src/parts/Navigation.tsx");
  console.log("2. Test the application to ensure images load correctly");
}

optimizeImages().catch(console.error);
