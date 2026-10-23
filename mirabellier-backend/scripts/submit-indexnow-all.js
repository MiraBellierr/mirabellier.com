const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { db } = require("../lib/db");
const {
  ensureIndexNowKeyFile,
  submitSitemapEntriesToIndexNow,
} = require("../lib/indexnow");

async function main() {
  const keyFileResult = ensureIndexNowKeyFile();
  if (keyFileResult.skipped) {
    console.log("IndexNow skipped: INDEXNOW_KEY is not configured.");
    return;
  }
  if (keyFileResult.ok === false) {
    throw new Error(`Failed to write IndexNow key file: ${keyFileResult.error}`);
  }

  const result = await submitSitemapEntriesToIndexNow(db);
  if (result.skipped) {
    console.log(`IndexNow skipped: ${result.reason}`);
    return;
  }

  console.log(`Submitted ${result.count} URLs to IndexNow (HTTP ${result.statusCode}).`);
}

main().catch((error) => {
  console.error(`IndexNow submission failed: ${error.message}`);
  process.exit(1);
});
