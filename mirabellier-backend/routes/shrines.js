const express = require("express");
const {
  getShrinePageByPath,
  getShrinePageBySlug,
} = require("../lib/shrines");
const {
  handleHumanSpaRequest,
  sendFrontendRedirectConfigError,
} = require("../lib/spa-entry");
const { isLikelyCrawler } = require("../lib/share-preview-utils");
const { isOwner } = require("../lib/authz");
const { buildBreadcrumbList } = require("../lib/breadcrumbs");

function setNoStoreHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function sanitizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function parseStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function mapShrineRow(row) {
  let payload = null;
  try {
    payload = row.payloadJson ? JSON.parse(row.payloadJson) : null;
  } catch {
    payload = null;
  }

  let about = [];
  let keywords = [];
  try {
    about = row.aboutJson ? JSON.parse(row.aboutJson) : [];
  } catch {
    about = [];
  }
  try {
    keywords = row.keywordsJson ? JSON.parse(row.keywordsJson) : [];
  } catch {
    keywords = [];
  }

  return {
    slug: row.slug,
    path: row.path,
    title: row.title || "",
    description: row.description || "",
    excerpt: row.excerpt || "",
    image: row.image || "",
    imageAlt: row.imageAlt || "",
    schemaType: row.schemaType || "CollectionPage",
    about: parseStringArray(about),
    keywords: parseStringArray(keywords),
    priority: row.priority || "0.7",
    changefreq: row.changefreq || "monthly",
    ctaLabel: row.ctaLabel || "Open shrine page",
    payload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function shouldRedirectToSpa(req) {
  return !isLikelyCrawler(req.get("user-agent"));
}

function resolveAssetUrl(asset, protocol, host) {
  if (!asset) return `${protocol}://${host}/background.jpg`;
  if (/^https?:\/\//i.test(asset)) return asset;
  if (asset.startsWith("/")) return `${protocol}://${host}${asset}`;
  return `${protocol}://${host}/${asset}`;
}

function resolveProtocol(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];

  if (typeof forwardedProto === "string" && forwardedProto.trim()) {
    return forwardedProto.split(",")[0].trim();
  }

  return req.protocol || "http";
}

function buildShrineSeoPage({
  title,
  excerpt,
  imageUrl,
  imageAlt,
  schemaType,
  about,
  keywords,
  protocol,
  host,
  spaPath,
  ctaLabel,
}) {
  const canonicalUrl = `${protocol}://${host}${spaPath}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": schemaType || "WebPage",
    name: title,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    isPartOf: {
      "@type": "WebSite",
      name: "Mirabellier",
      url: "https://mirabellier.com/",
    },
    ...(imageUrl ? { image: [imageUrl] } : {}),
    ...(about && about.length
      ? {
          about: about.map((entry) => ({
            "@type": "Thing",
            name: entry,
          })),
        }
      : {}),
    ...(keywords && keywords.length ? { keywords: keywords.join(", ") } : {}),
    // The shrine hub is the only parent; individual rooms sit directly under
    // it, so the trail is Home -> Shrines -> this room. The hub itself is its
    // own last crumb.
    breadcrumb: buildBreadcrumbList(
      spaPath === "/shrine"
        ? [{ name: "Home", url: "https://mirabellier.com/" }, { name: title, url: canonicalUrl }]
        : [
            { name: "Home", url: "https://mirabellier.com/" },
            { name: "Shrines", url: "https://mirabellier.com/shrine" },
            { name: title, url: canonicalUrl },
          ],
    ),
  };

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    ${keywords && keywords.length ? `<meta name="keywords" content="${escapeHtml(keywords.join(", "))}" />` : ""}
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:site_name" content="Mirabellier" />
    <meta property="og:url" content="${canonicalUrl}" />
    ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />` : ""}
    ${imageAlt ? `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />` : ""}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : ""}
    ${imageAlt ? `<meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />` : ""}
    <link rel="canonical" href="${canonicalUrl}" />
    <script type="application/ld+json">${escapeJsonForHtml(jsonLd)}</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      ${excerpt ? `<p>${escapeHtml(excerpt)}</p>` : ""}
      <p><a href="${escapeHtml(canonicalUrl)}">${escapeHtml(ctaLabel || "Open shrine page")}</a></p>
    </main>
  </body>
</html>`;
}

function renderShrinePage(req, res, shrinePage) {
  if (!shrinePage) {
    return res.status(404).send("Not found");
  }

  try {
    if (shouldRedirectToSpa(req)) {
      if (handleHumanSpaRequest(req, res, shrinePage.path)) return;
      return sendFrontendRedirectConfigError(req, res, shrinePage.path);
    }

    const host = req.get("host") || "mirabellier.com";
    const protocol = resolveProtocol(req);
    const imageUrl = resolveAssetUrl(shrinePage.image, protocol, host);

    const html = buildShrineSeoPage({
      title: shrinePage.title,
      description: shrinePage.description,
      excerpt: shrinePage.excerpt,
      imageUrl,
      imageAlt: shrinePage.imageAlt,
      schemaType: shrinePage.schemaType,
      about: shrinePage.about,
      keywords: shrinePage.keywords,
      protocol,
      host,
      spaPath: shrinePage.path,
      ctaLabel: shrinePage.ctaLabel,
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    setNoStoreHeaders(res);
    return res.send(html);
  } catch {
    return res.status(500).send("Server error");
  }
}

module.exports = function registerShrineRoutes(app, deps) {
  const { db, authFromReq } = deps;
  const router = express.Router();
  const selectAllShrines = db.prepare(
    `SELECT slug, path, title, description, excerpt, image, imageAlt, schemaType, aboutJson, keywordsJson, ctaLabel, priority, changefreq, payloadJson, createdAt, updatedAt
     FROM shrine_pages
     ORDER BY slug ASC`,
  );
  const selectShrineBySlug = db.prepare(
    `SELECT slug, path, title, description, excerpt, image, imageAlt, schemaType, aboutJson, keywordsJson, ctaLabel, priority, changefreq, payloadJson, createdAt, updatedAt
     FROM shrine_pages
     WHERE slug = ?`,
  );
  const insertShrine = db.prepare(
    `INSERT INTO shrine_pages (
      slug, path, title, description, excerpt, image, imageAlt, schemaType, aboutJson, keywordsJson, ctaLabel, priority, changefreq, payloadJson, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateShrine = db.prepare(
    `UPDATE shrine_pages
     SET path = ?, title = ?, description = ?, excerpt = ?, image = ?, imageAlt = ?, schemaType = ?, aboutJson = ?, keywordsJson = ?, ctaLabel = ?, priority = ?, changefreq = ?, payloadJson = ?, updatedAt = ?
     WHERE slug = ?`,
  );

  function buildPayload(body, slugFromPath) {
    const slug = sanitizeSlug(body?.slug || slugFromPath);
    if (!slug) {
      return { error: "A valid slug is required" };
    }

    const path = `/shrine/${slug}`;
    const payload =
      body && typeof body.payload === "object" && body.payload
        ? body.payload
        : null;

    if (!payload || typeof payload !== "object") {
      return { error: "payload must be a valid shrine object" };
    }

    return {
      slug,
      path,
      title: String(body?.title || payload.hero?.name || slug).trim(),
      description: String(body?.description || "").trim(),
      excerpt: String(body?.excerpt || "").trim(),
      image: String(body?.image || payload.railImage?.src || "").trim(),
      imageAlt: String(body?.imageAlt || payload.railImage?.alt || "").trim(),
      schemaType: String(body?.schemaType || "CollectionPage").trim(),
      about: parseStringArray(body?.about),
      keywords: parseStringArray(body?.keywords),
      ctaLabel: String(body?.ctaLabel || "Open shrine page").trim(),
      priority: String(body?.priority || "0.7").trim(),
      changefreq: String(body?.changefreq || "monthly").trim(),
      payloadJson: JSON.stringify(payload),
    };
  }

  router.get("/pages", (_req, res) => {
    try {
      const rows = selectAllShrines.all();
      const entries = rows.map((row) => mapShrineRow(row));
      setNoStoreHeaders(res);
      res.json(entries);
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Failed to load shrine pages",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/pages/:slug", (req, res) => {
    try {
      const row = selectShrineBySlug.get(sanitizeSlug(req.params.slug));
      if (!row) {
        setNoStoreHeaders(res);
        return res.status(404).json({ error: "Shrine not found" });
      }
      setNoStoreHeaders(res);
      res.json(mapShrineRow(row));
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Failed to load shrine page",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/pages", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const payload = buildPayload(req.body);
      if (payload.error) {
        return res.status(400).json({ error: payload.error });
      }

      const existing = selectShrineBySlug.get(payload.slug);
      if (existing) {
        return res.status(409).json({ error: "A shrine with this slug already exists" });
      }

      const now = new Date().toISOString();
      insertShrine.run(
        payload.slug,
        payload.path,
        payload.title,
        payload.description,
        payload.excerpt,
        payload.image,
        payload.imageAlt,
        payload.schemaType,
        JSON.stringify(payload.about),
        JSON.stringify(payload.keywords),
        payload.ctaLabel,
        payload.priority,
        payload.changefreq,
        payload.payloadJson,
        now,
        now,
      );

      setNoStoreHeaders(res);
      res.status(201).json(mapShrineRow(selectShrineBySlug.get(payload.slug)));
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Failed to create shrine page",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.put("/pages/:slug", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const slug = sanitizeSlug(req.params.slug);
      const existing = selectShrineBySlug.get(slug);
      if (!existing) {
        return res.status(404).json({ error: "Shrine not found" });
      }

      const payload = buildPayload(req.body, slug);
      if (payload.error) {
        return res.status(400).json({ error: payload.error });
      }

      const now = new Date().toISOString();
      updateShrine.run(
        payload.path,
        payload.title,
        payload.description,
        payload.excerpt,
        payload.image,
        payload.imageAlt,
        payload.schemaType,
        JSON.stringify(payload.about),
        JSON.stringify(payload.keywords),
        payload.ctaLabel,
        payload.priority,
        payload.changefreq,
        payload.payloadJson,
        now,
        slug,
      );

      setNoStoreHeaders(res);
      res.json(mapShrineRow(selectShrineBySlug.get(slug)));
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Failed to update shrine page",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.use("/shrines", router);

  app.get("/shrine", (req, res) => {
    renderShrinePage(req, res, getShrinePageByPath("/shrine"));
  });

  app.get("/shrine/:slug", (req, res) => {
    const slug = sanitizeSlug(req.params.slug);
    const fromDb = selectShrineBySlug.get(slug);
    if (fromDb) {
      const record = mapShrineRow(fromDb);
      return renderShrinePage(req, res, {
        slug: record.slug,
        path: record.path,
        title: record.title,
        description: record.description,
        excerpt: record.excerpt,
        image: record.image,
        imageAlt: record.imageAlt,
        schemaType: record.schemaType,
        about: record.about,
        keywords: record.keywords,
        priority: record.priority,
        changefreq: record.changefreq,
        ctaLabel: record.ctaLabel,
      });
    }
    return renderShrinePage(req, res, getShrinePageBySlug(slug));
  });
};
