// Sync Honkai: Star Rail data from prydwen.gg into JSON files (and mirrored
// images) under data/hsr/.
//
// Layout produced:
//   data/hsr/characters.json   roster + source metadata (the file a frontend reads)
//   data/hsr/teams.json        per-character detail (teams, synergies, builds)
//   data/hsr/characters/<slug>.json   per-character detail copy (API-friendly)
//   data/hsr/.meta.json        sync bookkeeping (hashes, errors, timestamps)
//   images/hsr/characters/*    mirrored card/icon/full art
//   images/hsr/icons/*         mirrored element/path icons
//
// The detail pages are the expensive part (one Cloudflare-gated page load
// each), so a run fetches only what `planCharacterSync` reports as stale;
// everything else is copied forward from the existing files.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  CDN_CHARACTER_BASE,
  CDN_ICON_BASE,
  ELEMENT_ICON_FILES,
  PATH_ICON_FILES,
  SOURCE_BASE_URL,
  TEAM_CATEGORIES,
  buildRosterHash,
  buildTeamIndex,
  characterSourceUrl,
  isSafeSlug,
  parseCharacterPage,
  parseCharactersPage,
  planCharacterSync,
} = require("./hsr-prydwen");
const { HsrBrowser } = require("./hsr-browser");

const SCHEMA_VERSION = 2;
const DATA_DIR_NAME = "hsr";
const IMAGE_CHARACTER_DIR = ["hsr", "characters"];
const IMAGE_ICON_DIR = ["hsr", "icons"];
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_FULL_REFRESH_DAYS = 7;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function resolveImagesDir(imagesDir) {
  if (imagesDir) {
    return path.isAbsolute(imagesDir)
      ? imagesDir
      : path.resolve(__dirname, "..", imagesDir);
  }
  const envVal = process.env.IMAGES_DIR;
  if (envVal) {
    return path.isAbsolute(envVal)
      ? envVal
      : path.resolve(__dirname, "..", envVal);
  }
  return path.join(__dirname, "..", "images");
}

function resolveDataDir(dataDir) {
  if (dataDir) {
    return path.isAbsolute(dataDir) ? dataDir : path.resolve(__dirname, "..", dataDir);
  }
  const envVal = process.env.HSR_DATA_DIR;
  if (envVal) {
    return path.isAbsolute(envVal)
      ? envVal
      : path.resolve(__dirname, "..", envVal);
  }
  return path.join(__dirname, "..", "data", DATA_DIR_NAME);
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function hashText(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function emptyMeta() {
  return {
    schema: SCHEMA_VERSION,
    sourceLastUpdated: null,
    lastSyncAt: null,
    lastFullSyncAt: null,
    lastRosterSyncAt: null,
    characters: {},
  };
}

function loadMeta(dataDir) {
  const meta = readJsonFile(path.join(dataDir, ".meta.json"));
  if (!meta || typeof meta !== "object") return emptyMeta();
  return {
    ...emptyMeta(),
    ...meta,
    characters:
      meta.characters && typeof meta.characters === "object" ? meta.characters : {},
  };
}

function normalizeMetaCharacter(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    updatedAt: entry.updatedAt || null,
    rosterHash: entry.rosterHash || null,
    syncedAt: entry.syncedAt || null,
    error: entry.error || null,
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const runners = new Array(Math.max(1, Math.min(limit, items.length)))
    .fill(null)
    .map(async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    });

  await Promise.all(runners);
  return results;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Images ────────────────────────────────────────────────────────────────

function remoteImageKey(url) {
  if (!url) return null;
  const value = String(url);
  const characterMatch = value.match(
    /\/honkai-star-rail\/characters\/([^/?#]+)$/,
  );
  if (characterMatch) {
    return { dir: IMAGE_CHARACTER_DIR, filename: characterMatch[1] };
  }
  const iconMatch = value.match(/\/honkai-star-rail\/icons\/([^/?#]+)$/);
  if (iconMatch) {
    return { dir: IMAGE_ICON_DIR, filename: iconMatch[1] };
  }
  return null;
}

async function mirrorImage(url, imagesDir, { fetchImpl = fetch, force = false } = {}) {
  const key = remoteImageKey(url);
  if (!key || !isSafeFilename(key.filename)) return { ok: false, error: "unsupported-url" };

  const targetPath = path.join(imagesDir, ...key.dir, key.filename);

  if (!force && fs.existsSync(targetPath)) {
    return { ok: true, path: targetPath, skipped: true };
  }

  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": "mirabellier-hsr-sync/1.0" },
      redirect: "follow",
    });
    if (!response.ok) {
      return { ok: false, error: `status-${response.status}` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      return { ok: false, error: "bad-size" };
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const temporaryPath = `${targetPath}.tmp`;
    fs.writeFileSync(temporaryPath, buffer);
    fs.renameSync(temporaryPath, targetPath);
    return { ok: true, path: targetPath, bytes: buffer.length };
  } catch (error) {
    return { ok: false, error: error?.message || "fetch-failed" };
  }
}

function isSafeFilename(filename) {
  return Boolean(
    filename && !filename.includes("..") && !filename.includes("/") && !filename.includes("\\"),
  );
}

// Remote URLs that should exist locally for a character, by role.
// `full` art is optional: some units (e.g. recently added ones) have no
// `_full.webp` on the CDN at all, so a 404 there must not fail the sync.
function characterImagePlan(slug) {
  return [
    { kind: "card", url: `${CDN_CHARACTER_BASE}/${slug}_card.webp`, required: true },
    { kind: "icon", url: `${CDN_CHARACTER_BASE}/${slug}_icon.webp`, required: true },
    { kind: "full", url: `${CDN_CHARACTER_BASE}/${slug}_full.webp`, required: false },
  ];
}

function iconImagePlan() {
  const plan = [];
  for (const file of Object.values(ELEMENT_ICON_FILES)) {
    plan.push({ kind: "element", url: `${CDN_ICON_BASE}/${file}.webp`, required: true });
  }
  for (const file of Object.values(PATH_ICON_FILES)) {
    plan.push({ kind: "path", url: `${CDN_ICON_BASE}/${file}.webp`, required: true });
  }
  return plan;
}

async function mirrorImagesForCharacter(slug, imagesDir, options = {}) {
  const plan = characterImagePlan(slug);
  const settled = await Promise.all(
    plan.map((entry) => mirrorImage(entry.url, imagesDir, options)),
  );
  const failures = [];
  const optional = [];
  plan.forEach((entry, index) => {
    if (settled[index]?.ok) return;
    if (entry.required) failures.push(entry.kind);
    else optional.push(entry.kind);
  });
  return { ok: failures.length === 0, failures, optional };
}

// ── Fetching ──────────────────────────────────────────────────────────────

function buildFetcher(options = {}) {
  if (typeof options.fetchHtml === "function") return options.fetchHtml;
  const browser = new HsrBrowser(options.browserOptions || {});
  const fetcher = (url) => browser.fetchHtml(url);
  fetcher.close = () => browser.close();
  return fetcher;
}

async function syncCharacterDirectory(options) {
  const { slugs, fetcher, concurrency, logger, retryCount, imagesDir, dataDir } = options;
  const detailDir = path.join(dataDir, "characters");
  fs.mkdirSync(detailDir, { recursive: true });

  const previous = new Map();
  for (const slug of slugs) {
    const existing = readJsonFile(path.join(detailDir, `${slug}.json`));
    if (existing) previous.set(slug, existing);
  }

  let completed = 0;

  const results = await mapWithConcurrency(slugs, concurrency, async (slug) => {
    const url = characterSourceUrl(slug);
    let lastError = null;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const html = await fetcher(url);
        const parsed = parseCharacterPage(html, slug, { roster: options.roster });
        writeJsonFile(path.join(detailDir, `${slug}.json`), parsed);
        if (!options.skipImages) {
          await mirrorImagesForCharacter(slug, imagesDir, {
            fetchImpl: options.imageFetch || fetch,
            force: options.forceImages === true,
          });
        }
        completed += 1;
        logger.log?.(`[hsr] (${completed}/${slugs.length}) synced ${slug}`);
        return { slug, ok: true, data: parsed };
      } catch (error) {
        lastError = error?.message || "fetch-failed";
        if (attempt < retryCount) await sleep(1500 * (attempt + 1));
      }
    }

    completed += 1;
    const fallback = previous.get(slug) || null;
    logger.warn?.(`[hsr] ${slug}: ${lastError} (kept previous data: ${Boolean(fallback)})`);
    return { slug, ok: false, error: lastError, data: fallback };
  });

  return results;
}

async function syncRosterImages(characters, imagesDir, options = {}) {
  const failures = [];
  const slugs = characters.map((entry) => entry.slug).filter(isSafeSlug);
  const concurrency =
    Number.isFinite(Number(options.concurrency)) && Number(options.concurrency) > 0
      ? Math.floor(Number(options.concurrency))
      : 4;

  await mapWithConcurrency(slugs, concurrency, async (slug) => {
    const result = await mirrorImagesForCharacter(slug, imagesDir, options);
    if (!result.ok) failures.push({ slug, kinds: result.failures });
  });

  return failures;
}

// ── Orchestration ─────────────────────────────────────────────────────────

async function syncHsrData(options = {}) {
  const startedAt = new Date();
  const logger = options.logger || console;
  const dataDir = resolveDataDir(options.dataDir);
  const imagesDir = resolveImagesDir(options.imagesDir);
  const concurrency =
    Number.isFinite(Number(options.concurrency)) && Number(options.concurrency) > 0
      ? Math.floor(Number(options.concurrency))
      : DEFAULT_CONCURRENCY;
  const retryCount =
    Number.isFinite(Number(options.retries)) && Number(options.retries) >= 0
      ? Math.floor(Number(options.retries))
      : 1;
  const fullRefreshDays =
    Number.isFinite(Number(options.fullRefreshDays)) && Number(options.fullRefreshDays) > 0
      ? Number(options.fullRefreshDays)
      : DEFAULT_FULL_REFRESH_DAYS;

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });

  const skipImages = options.skipImages === true;
  const meta = loadMeta(dataDir);
  const fetcher = buildFetcher(options);

  try {
    logger.log?.("[hsr] fetching character roster from prydwen.gg...");
    const rosterHtml = await fetcher(SOURCE_BASE_URL);
    const parsedRoster = parseCharactersPage(rosterHtml);
    const characters = parsedRoster.characters.filter((entry) => isSafeSlug(entry.slug));

    if (characters.length === 0) {
      throw new Error("Roster listing returned no characters");
    }

    const rosterHashes = {};
    for (const character of characters) {
      rosterHashes[character.slug] = hashText(buildRosterHash(character) || character.slug);
    }

    const plan = planCharacterSync({
      characters,
      rosterHashes,
      meta,
      force: options.force === true,
      full: options.full === true,
      slugs: options.slugs,
      fullRefreshDays,
      now: startedAt,
    });

    logger.log?.(
      `[hsr] roster: ${characters.length} characters; plan: ${plan.slugs.length} page(s) [${plan.reason}]` +
        (plan.removed.length > 0 ? `; removed: ${plan.removed.join(", ")}` : ""),
    );

    // Icons are tiny and shared; keep the mirror current on every run. On a
    // full sweep, also pull every character's art so a fresh deploy does not
    // leave the roster listing pointing at half-mirrored images.
    if (!skipImages) {
      await Promise.all(
        iconImagePlan().map((entry) =>
          mirrorImage(entry.url, imagesDir, { fetchImpl: options.imageFetch || fetch }),
        ),
      );
      if (plan.fullRefresh) {
        const imageFailures = await syncRosterImages(characters, imagesDir, {
          fetchImpl: options.imageFetch || fetch,
          force: options.forceImages === true,
        });
        if (imageFailures.length > 0) {
          logger.warn?.(
            `[hsr] ${imageFailures.length} character image set(s) failed to mirror`,
          );
        }
      }
    }

    const details = await syncCharacterDirectory({
      slugs: plan.slugs,
      roster: characters,
      fetcher,
      concurrency,
      retryCount,
      logger,
      imagesDir,
      dataDir,
      forceImages: options.forceImages === true,
      imageFetch: options.imageFetch,
      skipImages,
    });

    const detailDir = path.join(dataDir, "characters");
    const bySlug = new Map();
    for (const character of characters) {
      const detail = readJsonFile(path.join(detailDir, `${character.slug}.json`));
      bySlug.set(character.slug, detail);
    }

    for (const result of details) {
      if (!result.ok) continue;
      const previous = normalizeMetaCharacter(meta.characters[result.slug]) || {};
      meta.characters[result.slug] = {
        ...previous,
        updatedAt: result.data?.updatedAt || previous.updatedAt || null,
        rosterHash: rosterHashes[result.slug] || previous.rosterHash || null,
        syncedAt: new Date().toISOString(),
        error: null,
      };
    }
    for (const result of details) {
      if (result.ok) continue;
      const previous = normalizeMetaCharacter(meta.characters[result.slug]) || {};
      meta.characters[result.slug] = {
        ...previous,
        rosterHash: rosterHashes[result.slug] || previous.rosterHash || null,
        error: result.error || "sync-failed",
      };
    }

    // Roster entries whose page was never (re)fetched this run still need a
    // meta row so the next run does not treat them as never-synced.
    for (const character of characters) {
      if (meta.characters[character.slug]) continue;
      const detail = bySlug.get(character.slug);
      meta.characters[character.slug] = {
        updatedAt: detail?.updatedAt || null,
        rosterHash: rosterHashes[character.slug] || null,
        syncedAt: detail ? meta.lastSyncAt : null,
        error: detail ? null : "not-synced",
      };
    }

    for (const slug of plan.removed) {
      delete meta.characters[slug];
      const staleFile = path.join(detailDir, `${slug}.json`);
      if (fs.existsSync(staleFile)) fs.rmSync(staleFile, { force: true });
    }

    const finishedAt = new Date();
    const charactersFile = {
      schema: SCHEMA_VERSION,
      source: parsedRoster.sourceUrl,
      sourceLastUpdated: parsedRoster.lastUpdated || null,
      generatedAt: finishedAt.toISOString(),
      total: characters.length,
      characters,
    };
    writeJsonFile(path.join(dataDir, "characters.json"), charactersFile);

    // `team-index.json` is the inverse view: every distinct team prydwen
    // tracks for each endgame mode, deduped across the pages it appears on and
    // sorted by prydwen's own rank. The planner reads this one file.
    //
    // The per-character detail files are an implementation detail of building
    // it (and of the incremental sync), so they are assembled from disk rather
    // than held in memory across the whole run.
    const characterDetails = [];
    for (const character of characters) {
      const detail = bySlug.get(character.slug);
      if (detail) characterDetails.push(detail);
    }

    const teamIndex = buildTeamIndex(characterDetails, {
      minAppRate: options.minAppRate,
    });

    const phases = {};
    for (const detail of characterDetails) {
      for (const mode of TEAM_CATEGORIES) {
        const phase = detail.phases?.[mode.key];
        // Every page reports the same phase string for a mode; first wins.
        if (phase && !phases[mode.key]) phases[mode.key] = phase;
      }
    }

    writeJsonFile(path.join(dataDir, "team-index.json"), {
      schema: SCHEMA_VERSION,
      source: parsedRoster.sourceUrl,
      generatedAt: finishedAt.toISOString(),
      total: teamIndex.total,
      phases,
      modes: teamIndex.modes,
      stats: teamIndex.stats,
    });

    // The previous revision wrote a per-character `teams.json` that nothing
    // reads anymore. Drop it rather than leave a stale multi-megabyte file
    // next to the index that replaced it.
    const supersededTeamsFile = path.join(dataDir, "teams.json");
    if (fs.existsSync(supersededTeamsFile)) {
      fs.rmSync(supersededTeamsFile, { force: true });
    }

    meta.schema = SCHEMA_VERSION;
    meta.sourceLastUpdated = parsedRoster.lastUpdated || meta.sourceLastUpdated || null;
    meta.lastSyncAt = finishedAt.toISOString();
    meta.lastRosterSyncAt = finishedAt.toISOString();
    if (plan.fullRefresh) meta.lastFullSyncAt = finishedAt.toISOString();
    writeJsonFile(path.join(dataDir, ".meta.json"), meta);

    const failures = details.filter((result) => !result.ok);
    const summary = {
      ok: failures.length === 0,
      total: characters.length,
      planned: plan.slugs.length,
      synced: details.filter((result) => result.ok).length,
      failed: failures.length,
      removed: plan.removed.length,
      reason: plan.reason,
      fullRefresh: plan.fullRefresh,
      teamCount: teamIndex.total,
      charactersFile: path.join(dataDir, "characters.json"),
      teamIndexFile: path.join(dataDir, "team-index.json"),
      imagesDir,
      errors: failures.map((result) => ({ slug: result.slug, error: result.error })),
    };
    logger.log?.(
      `[hsr] done in ${finishedAt.getTime() - startedAt.getTime()}ms: ` +
        `${summary.synced} synced, ${summary.failed} failed, ${summary.removed} removed, ` +
        `${summary.teamCount} teams indexed`,
    );
    return summary;
  } finally {
    if (typeof fetcher.close === "function") {
      await fetcher.close();
    }
  }
}

module.exports = {
  DEFAULT_CONCURRENCY,
  DEFAULT_FULL_REFRESH_DAYS,
  SCHEMA_VERSION,
  buildFetcher,
  buildTeamIndex,
  characterImagePlan,
  hashText,
  iconImagePlan,
  loadMeta,
  mapWithConcurrency,
  mirrorImage,
  resolveDataDir,
  resolveImagesDir,
  syncHsrData,
  syncRosterImages,
  writeJsonFile,
};
