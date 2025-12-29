const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'src', 'assets');

const images = [
  { input: 'light.jpg', output: 'light.webp' },
  { input: 'dark.jpg', output: 'dark.webp' },
];

async function convertImages() {
  for (const img of images) {
    const inputPath = path.join(assetsDir, img.input);
    const outputPath = path.join(assetsDir, img.output);

    try {
      // Get original file size
      const originalStats = fs.statSync(inputPath);
      console.log(`Converting ${img.input} (${(originalStats.size / 1024).toFixed(2)} KB)...`);

      // Convert to WebP with aggressive compression for LCP optimization
      await sharp(inputPath)
        .webp({ quality: 75, effort: 6 }) // quality 75 for good balance, effort 6 for better compression
        .toFile(outputPath);

      const webpStats = fs.statSync(outputPath);
      const savings = ((1 - webpStats.size / originalStats.size) * 100).toFixed(1);
      console.log(`✓ Created ${img.output} (${(webpStats.size / 1024).toFixed(2)} KB, ${savings}% smaller)`);
    } catch (err) {
      console.error(`✗ Error converting ${img.input}:`, err.message);
    }
  }
}

convertImages().catch(console.error);
