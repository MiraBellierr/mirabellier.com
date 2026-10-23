const { getQuotesOfTheDay, isValidRecordedDate } = require("../lib/quote-of-the-day");
const {
  buildQuotePreviewState,
  buildQuoteShareHtml,
  getQuotePreviewDimensions,
  renderQuotePreviewBuffer,
} = require("../lib/quote-embed");
const {
  isLikelyCrawler,
  resolveProtocol,
} = require("../lib/share-preview-utils");
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

function setEmbedImageCacheHeaders(res, hasVersionQuery) {
  if (hasVersionQuery) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=300");
}

function shouldRedirectToSpa(req) {
  return !isLikelyCrawler(req.get("user-agent"));
}

async function loadQuotePreviewState() {
  try {
    const payload = await getQuotesOfTheDay();
    return buildQuotePreviewState(payload);
  } catch (error) {
    return buildQuotePreviewState({
      message:
        error instanceof Error
          ? error.message
          : "Failed to load quotes of the day.",
    });
  }
}

module.exports = function registerQuoteRoutes(app) {
  app.get("/quotes", async (req, res) => {
    try {
      if (shouldRedirectToSpa(req)) {
        if (handleHumanSpaRequest(req, res, "/quotes")) return;
        return sendFrontendRedirectConfigError(req, res, "/quotes");
      }

      const host = req.get("host") || "mirabellier.com";
      const protocol = resolveProtocol(req);
      const state = await loadQuotePreviewState();
      const html = buildQuoteShareHtml({
        state,
        protocol,
        host,
        spaPath: "/quotes",
      });

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      setNoStoreHeaders(res);
      res.send(html);
    } catch {
      res.status(500).send("Server error");
    }
  });

  app.get("/quotes/embed-image.png", async (req, res) => {
    try {
      const state = await loadQuotePreviewState();
      const dimensions = getQuotePreviewDimensions(state);
      const imageBuffer = await renderQuotePreviewBuffer(state);

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Length", String(imageBuffer.length));
      res.setHeader("X-Preview-Version", String(state.version || "quotes-fallback"));
      res.setHeader("X-Preview-Width", String(dimensions.width));
      res.setHeader("X-Preview-Height", String(dimensions.height));
      setEmbedImageCacheHeaders(
        res,
        typeof req.query.v === "string" && req.query.v.trim().length > 0,
      );
      res.send(imageBuffer);
    } catch {
      res.status(500).send("Failed to render quote preview image");
    }
  });

  app.get("/quote-of-the-day", async (req, res) => {
    const recordedDate = req.query.date ? String(req.query.date) : null;

    if (recordedDate && !isValidRecordedDate(recordedDate)) {
      return res.status(400).json({
        error: "Invalid date format",
        details: "Use YYYY-MM-DD for the date query parameter",
      });
    }

    try {
      const quotes = await getQuotesOfTheDay({ recordedDate });

      if (!quotes) {
        setNoStoreHeaders(res);
        return res.status(404).json({
          error: "Quotes not found for the requested date",
        });
      }

      setNoStoreHeaders(res);
      res.json(quotes);
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(502).json({
        error: "Failed to load quotes of the day",
        details:
          error instanceof Error ? error.message : "Unknown quote error",
      });
    }
  });
};
