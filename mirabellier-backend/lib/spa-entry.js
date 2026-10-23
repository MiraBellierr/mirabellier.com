const fs = require("fs");
const path = require("path");

let cachedSpaEntry = null;

function pushCandidate(candidates, candidatePath) {
  const raw = String(candidatePath || "").trim();
  if (!raw) return;
  const resolved = path.resolve(raw);
  if (!candidates.includes(resolved)) {
    candidates.push(resolved);
  }
}

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

function normalizeOrigin(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.origin;
  } catch {
    return "";
  }
}

function resolveProtocol(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (typeof forwardedProto === "string" && forwardedProto.trim()) {
    return forwardedProto.split(",")[0].trim();
  }
  return req.protocol || "http";
}

function resolveSpaEntryCandidates() {
  const candidates = [];
  const customSpaEntry = String(process.env.SPA_ENTRY_FILE || "").trim();
  const configuredFrontendDeployPath = String(
    process.env.FRONTEND_DEPLOY_PATH || "",
  ).trim();

  if (customSpaEntry) {
    pushCandidate(candidates, customSpaEntry);
  }

  if (configuredFrontendDeployPath) {
    pushCandidate(
      candidates,
      path.join(configuredFrontendDeployPath, "index.html"),
    );
    pushCandidate(
      candidates,
      path.join(configuredFrontendDeployPath, "dist", "index.html"),
    );
  }

  pushCandidate(candidates, "/var/www/mirabellier.com/current/index.html");
  pushCandidate(candidates, "/var/www/mirabellier.com/current/dist/index.html");
  pushCandidate(candidates, path.resolve(__dirname, "..", "..", "dist", "index.html"));
  pushCandidate(candidates, path.resolve(process.cwd(), "dist", "index.html"));
  pushCandidate(candidates, "/var/www/mirabellier/dist/index.html");
  return candidates;
}

function looksLikeViteSourceHtml(html) {
  const value = String(html || "");
  return /<script[^>]+src=["']\/src\/main\.[jt]sx?["']/i.test(value);
}

function statSpaEntry(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function realPathSpaEntry(filePath) {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return null;
  }
}

function readSpaEntryFile(candidate) {
  const stats = statSpaEntry(candidate);
  if (!stats) {
    return null;
  }

  let html;
  try {
    html = fs.readFileSync(candidate, "utf8");
  } catch {
    // The release symlink can flip between the stat and the read.
    return null;
  }

  if (looksLikeViteSourceHtml(html)) {
    return null;
  }

  return {
    path: candidate,
    // The deploy resolves `current/index.html` through a symlink that is
    // renamed over in place; realpath is what actually changes on activation.
    realPath: realPathSpaEntry(candidate),
    html,
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  };
}

function isCachedSpaEntryCurrent(entry) {
  const stats = statSpaEntry(entry.path);
  if (!stats) {
    return false;
  }

  return (
    realPathSpaEntry(entry.path) === entry.realPath &&
    stats.mtimeMs === entry.mtimeMs &&
    stats.size === entry.size
  );
}

function loadSpaEntry() {
  if (cachedSpaEntry) {
    if (isCachedSpaEntryCurrent(cachedSpaEntry)) {
      return cachedSpaEntry;
    }

    // Frontend deploys flip the `current` symlink in place without reloading
    // this process, so a cached entry can outlive the release it came from and
    // reference hashed route chunks that no longer exist. Revalidate against
    // disk (and re-resolve if the file vanished) before serving it again.
    cachedSpaEntry = null;
  }

  const candidates = resolveSpaEntryCandidates();
  for (const candidate of candidates) {
    const entry = readSpaEntryFile(candidate);
    if (entry) {
      cachedSpaEntry = entry;
      return cachedSpaEntry;
    }
  }

  return null;
}

function sendSpaEntry(res) {
  const entry = loadSpaEntry();
  if (!entry) {
    return false;
  }

  setSpaNegotiationHeaders(res);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  setNoStoreHeaders(res);
  res.send(entry.html);
  return true;
}

function resolveFrontendOrigin(req) {
  const configuredFrontend = normalizeOrigin(process.env.FRONTEND_URL);
  if (configuredFrontend) return configuredFrontend;

  const configuredWebsiteBase = normalizeOrigin(process.env.WEBSITE_BASE);
  if (configuredWebsiteBase) return configuredWebsiteBase;

  const protocol = resolveProtocol(req);
  const host = req.get("host") || "localhost";
  return `${protocol}://${host}`;
}

function normalizePathname(pathname) {
  const value = String(pathname || "");
  return value.startsWith("/") ? value : `/${value}`;
}

function buildCurrentRequestUrl(req) {
  const protocol = resolveProtocol(req);
  const host = req.get("host") || "localhost";
  const pathname = normalizePathname(req.path || "/");
  const search = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  return `${protocol}://${host}${pathname}${search}`;
}

function buildFrontendTargetUrl(req, spaPath) {
  const origin = resolveFrontendOrigin(req);
  const pathname = normalizePathname(spaPath || req.path || "/");
  const search = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  return `${origin}${pathname}${search}`;
}

function handleHumanSpaRequest(req, res, spaPath) {
  const currentUrl = buildCurrentRequestUrl(req);
  const targetUrl = buildFrontendTargetUrl(req, spaPath);
  setSpaNegotiationHeaders(res);

  if (currentUrl !== targetUrl) {
    setNoStoreHeaders(res);
    res.redirect(307, targetUrl);
    return true;
  }

  if (sendSpaEntry(res)) {
    return true;
  }

  return false;
}

function sendFrontendRedirectConfigError(req, res, spaPath) {
  const currentUrl = buildCurrentRequestUrl(req);
  const targetUrl = buildFrontendTargetUrl(req, spaPath);
  const candidates = resolveSpaEntryCandidates().join(", ");
  setSpaNegotiationHeaders(res);
  setNoStoreHeaders(res);
  res
    .status(503)
    .type("text/plain")
    .send(
      `Direct-link frontend route handoff failed.\nCurrent URL: ${currentUrl}\nTarget URL: ${targetUrl}\nFRONTEND_URL: ${String(process.env.FRONTEND_URL || "")}\nWEBSITE_BASE: ${String(process.env.WEBSITE_BASE || "")}\nChecked SPA entry files: ${candidates}`,
    );
  return true;
}

module.exports = {
  handleHumanSpaRequest,
  sendFrontendRedirectConfigError,
  sendSpaEntry,
};
