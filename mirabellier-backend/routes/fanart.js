const express = require("express");
const axios = require("axios");
const {
  SITES,
  MAX_LIMIT,
  searchFanArt,
} = require("../lib/fanart");
const {
  handleHumanSpaRequest,
  sendFrontendRedirectConfigError,
} = require("../lib/spa-entry");

function setNoStoreHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

function setSpaNegotiationHeaders(res) {
  const existingVary = String(res.getHeader("Vary") || "");
  if (!/\bUser-Agent\b/i.test(existingVary)) {
    const nextVary = existingVary ? `${existingVary}, User-Agent` : "User-Agent";
    res.setHeader("Vary", nextVary);
  }
}

function buildFanartShareHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Fan Art Search | Mirabellier</title>
<meta name="description" content="Search anime fan art across Safebooru, Gelbooru, and Pixiv from one page.">
</head>
<body>
<h1>Fan Art Search</h1>
<p>Search anime fan art across multiple sites, with links back to each artist's original post.</p>
</body>
</html>`;
}

function validateSitesParam(req, res) {
  const raw = String(req.query.sites || "").trim();
  if (!raw) {
    return null;
  }

  const requested = raw.split(",").map((site) => site.trim().toLowerCase()).filter(Boolean);
  const unknown = requested.filter((site) => !SITES.includes(site));

  if (unknown.length > 0) {
    setNoStoreHeaders(res);
    res.status(400).json({
      code: "FANART_BAD_REQUEST",
      error: `Unknown fan art source(s): ${unknown.join(", ")}. Supported: ${SITES.join(", ")}.`,
    });
    return true;
  }

  return null;
}

function validateRatingParam(req, res) {
  const raw = String(req.query.rating || "").trim().toLowerCase();
  if (!raw) {
    return null;
  }

  if (raw !== "safe" && raw !== "all") {
    setNoStoreHeaders(res);
    res.status(400).json({
      code: "FANART_BAD_REQUEST",
      error: "Rating must be either 'safe' or 'all'.",
    });
    return true;
  }

  return null;
}

function validateLimitParam(req, res) {
  const raw = String(req.query.limit || "").trim();
  if (!raw) {
    return null;
  }

  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit < 1 || limit > MAX_LIMIT) {
    setNoStoreHeaders(res);
    res.status(400).json({
      code: "FANART_BAD_REQUEST",
      error: `Limit must be a number between 1 and ${MAX_LIMIT}.`,
    });
    return true;
  }

  return null;
}

module.exports = function registerFanartRoutes(app) {
  const apiRouter = express.Router();

  app.get("/fanart", (req, res) => {
    const isCrawler = /bot|crawler|spider|slurp|facebookexternalhit|twitterbot|linkedinbot|discordbot|telegrambot|google-site-verification/i.test(
      String(req.get("user-agent") || ""),
    );

    if (!isCrawler) {
      if (handleHumanSpaRequest(req, res, "/fanart")) return;
      sendFrontendRedirectConfigError(req, res, "/fanart");
      return;
    }

    setSpaNegotiationHeaders(res);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    setNoStoreHeaders(res);
    res.send(buildFanartShareHtml());
  });

  apiRouter.get("/search", async (req, res) => {
    const query = String(req.query.query || "").trim();
    if (!query) {
      setNoStoreHeaders(res);
      res.status(400).json({
        code: "FANART_BAD_REQUEST",
        error: "A search query is required.",
      });
      return;
    }

    if (validateSitesParam(req, res)) return;
    if (validateRatingParam(req, res)) return;
    if (validateLimitParam(req, res)) return;

    try {
      const payload = await searchFanArt({
        query,
        page: req.query.page,
        limit: req.query.limit,
        sites: req.query.sites,
        rating: req.query.rating,
      });
      setNoStoreHeaders(res);
      res.json(payload);
    } catch (error) {
      const isBadRequest = error?.code === "FANART_BAD_REQUEST";
      setNoStoreHeaders(res);
      res.status(isBadRequest ? 400 : 502).json({
        code: isBadRequest ? "FANART_BAD_REQUEST" : "FANART_UNAVAILABLE",
        error: isBadRequest
          ? error.message
          : "Failed to search fan art sources.",
      });
    }
  });

  apiRouter.get("/image", async (req, res) => {
    const rawUrl = String(req.query.url || "").trim();

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      setNoStoreHeaders(res);
      res.status(400).json({ code: "FANART_BAD_REQUEST", error: "Invalid image URL." });
      return;
    }

    const isPixiv = /^([a-z0-9-]+\.)?i\.pximg\.net$/i.test(parsed.hostname);
    const isDanbooru = /^([a-z0-9-]+\.)?cdn\.donmai\.us$/i.test(parsed.hostname);
    const isGelbooru =
      /^img\d+\.gelbooru\.com$/i.test(parsed.hostname) ||
      /^video-cdn\d*\.gelbooru\.com$/i.test(parsed.hostname);

    if (parsed.protocol !== "https:" || (!isPixiv && !isDanbooru && !isGelbooru)) {
      setNoStoreHeaders(res);
      res.status(400).json({
        code: "FANART_BAD_REQUEST",
        error: "Only Pixiv, Danbooru, and Gelbooru image URLs can be proxied.",
      });
      return;
    }

    try {
      const upstreamHeaders = isPixiv
        ? {
            Referer: "https://www.pixiv.net/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          }
        : isGelbooru
          ? {
              Referer: "https://gelbooru.com/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }
          : {
              "User-Agent": "Mirabellier/1.0 (+https://mirabellier.com)",
            };

      const upstream = await axios.get(parsed.href, {
        responseType: "stream",
        headers: upstreamHeaders,
        timeout: 30000,
      });

      res.setHeader(
        "Content-Type",
        String(upstream.headers["content-type"] || "image/jpeg"),
      );
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      if (upstream.headers["content-length"]) {
        res.setHeader("Content-Length", String(upstream.headers["content-length"]));
      }

      upstream.data.pipe(res);
    } catch {
      setNoStoreHeaders(res);
      res.status(502).json({
        code: "FANART_UNAVAILABLE",
        error: "Failed to load the Pixiv image.",
      });
    }
  });

  app.use("/fanart", apiRouter);
};
