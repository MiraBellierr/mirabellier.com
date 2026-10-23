const fs = require("fs");
const path = require("path");

/**
 * Resolves the directory the frontend serves static discovery files from:
 * `sitemap.xml`, the four feed files, and the IndexNow key file.
 *
 * Resolution order:
 *   1. An explicit `publicDir` argument (scripts/tests override).
 *   2. `FRONTEND_DEPLOY_PATH` — the live frontend release tree. The frontend
 *      deploy moves `current` to `/var/www/mirabellier.com/current`, and the
 *      backend release is a sibling at `/srv/mirabellier.com/api/current`, so
 *      production sets this to the absolute frontend path (see
 *      `ecosystem.config.cjs`).
 *   3. `WEBSITE_DIST_DIR` — explicit escape hatch for unusual layouts.
 *   4. Legacy paths, still honored because older deployments wrote there:
 *      `/var/www/mirabellier.com/current`, then `/var/www/mirabellier/dist`.
 *   5. The frontend repo's `public/` directory (development).
 *
 * Returns the first existing directory, or null when none exist (callers
 * treat that as "cannot write discovery files" rather than crashing).
 */
const LEGACY_PRODUCTION_DIRS = [
  "/var/www/mirabellier.com/current",
  "/var/www/mirabellier/dist",
];

// On Windows an absolute POSIX path resolves inside the current drive
// (`/var/www/...` -> `C:\var\www\...`), so a stray `C:\var\www` tree left over
// from a local run would silently capture development writes. The legacy
// paths are only meaningful on the Linux hosts that actually used them.
function legacyProductionDir() {
  if (process.platform === "win32") return null;
  for (const candidate of LEGACY_PRODUCTION_DIRS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// /var/www/mirabellier.com/current (this repo when checked out next to the
// frontend source, e.g. local dev against the real tree).
function frontendPublicDir() {
  return path.join(__dirname, "..", "..", "public");
}

function resolveDiscoveryOutputDir(publicDir = null) {
  if (publicDir) return publicDir;

  const configuredDeployPath = String(
    process.env.FRONTEND_DEPLOY_PATH || "",
  ).trim();
  if (configuredDeployPath) return configuredDeployPath;

  const configuredDistDir = String(process.env.WEBSITE_DIST_DIR || "").trim();
  if (configuredDistDir) return configuredDistDir;

  return legacyProductionDir() || frontendPublicDir();
}

module.exports = { resolveDiscoveryOutputDir };
