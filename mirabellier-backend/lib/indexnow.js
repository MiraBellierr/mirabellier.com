const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const { collectSitemapEntries } = require("./sitemap");
const { resolveDiscoveryOutputDir } = require("./discovery-output");

const DEFAULT_WEBSITE_BASE = "https://mirabellier.com";
const DEFAULT_INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_MAX_URLS = 10000;

function getWebsiteBase() {
  return String(process.env.WEBSITE_BASE || DEFAULT_WEBSITE_BASE)
    .trim()
    .replace(/\/+$/, "");
}

function getIndexNowEndpoint() {
  return String(process.env.INDEXNOW_ENDPOINT || DEFAULT_INDEXNOW_ENDPOINT).trim();
}

function getIndexNowKey() {
  return String(process.env.INDEXNOW_KEY || "").trim();
}

function isIndexNowEnabled() {
  const explicitSetting = String(process.env.INDEXNOW_ENABLED || "")
    .trim()
    .toLowerCase();

  if (explicitSetting === "0" || explicitSetting === "false") {
    return false;
  }

  return Boolean(getIndexNowKey());
}

function resolvePublicDir(publicDir = null) {
  return resolveDiscoveryOutputDir(publicDir);
}

function buildIndexNowKeyLocation() {
  const key = getIndexNowKey();
  if (!key) return "";
  return `${getWebsiteBase()}/${key}.txt`;
}

function ensureIndexNowKeyFile(publicDir = null) {
  if (!isIndexNowEnabled()) {
    return { skipped: true, reason: "disabled" };
  }

  try {
    const key = getIndexNowKey();
    const outputDir = resolvePublicDir(publicDir);
    const filePath = path.join(outputDir, `${key}.txt`);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(filePath, key, "utf-8");

    return { ok: true, filePath };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "failed to write key file",
    };
  }
}

function normalizeUrlList(rawUrls) {
  const websiteBase = new URL(getWebsiteBase());
  const uniqueUrls = new Set();

  for (const rawUrl of rawUrls || []) {
    if (!rawUrl) continue;

    try {
      const url = new URL(String(rawUrl), `${websiteBase.protocol}//${websiteBase.host}`);

      if (url.host !== websiteBase.host) {
        continue;
      }

      url.hash = "";
      uniqueUrls.add(url.toString());
    } catch {
      // Ignore malformed URLs so a single bad value does not block submission.
    }
  }

  return Array.from(uniqueUrls).slice(0, INDEXNOW_MAX_URLS);
}

function postJson(urlString, payload) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlString);
    const body = JSON.stringify(payload);
    const transport = target.protocol === "http:" ? http : https;

    const req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        method: "POST",
        path: `${target.pathname}${target.search}`,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          const statusCode = res.statusCode || 0;
          if (statusCode >= 200 && statusCode < 300) {
            resolve({ statusCode, body: responseBody });
            return;
          }

          reject(
            new Error(
              `IndexNow request failed (${statusCode}): ${responseBody.slice(0, 200)}`,
            ),
          );
        });
      },
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function submitUrlsToIndexNow(rawUrls) {
  if (!isIndexNowEnabled()) {
    return { skipped: true, reason: "INDEXNOW_KEY is not configured" };
  }

  const urlList = normalizeUrlList(rawUrls);
  if (!urlList.length) {
    return { skipped: true, reason: "no URLs to submit" };
  }

  const keyFileResult = ensureIndexNowKeyFile();
  if (keyFileResult.ok === false) {
    throw new Error(`Failed to write IndexNow key file: ${keyFileResult.error}`);
  }

  const websiteBase = new URL(getWebsiteBase());
  const payload = {
    host: websiteBase.host,
    key: getIndexNowKey(),
    keyLocation: buildIndexNowKeyLocation(),
    urlList,
  };

  const response = await postJson(getIndexNowEndpoint(), payload);
  return {
    ok: true,
    count: urlList.length,
    statusCode: response.statusCode,
  };
}

function queueIndexNowSubmission(rawUrls) {
  return Promise.resolve()
    .then(() => submitUrlsToIndexNow(rawUrls))
    .catch((error) => {
      console.warn(`[indexnow] ${error.message}`);
      return { ok: false, error: error.message };
    });
}

function submitSitemapEntriesToIndexNow(db) {
  const entries = collectSitemapEntries(db);
  return submitUrlsToIndexNow(entries.map((entry) => entry.url));
}

module.exports = {
  buildIndexNowKeyLocation,
  ensureIndexNowKeyFile,
  getWebsiteBase,
  isIndexNowEnabled,
  queueIndexNowSubmission,
  submitSitemapEntriesToIndexNow,
  submitUrlsToIndexNow,
};
