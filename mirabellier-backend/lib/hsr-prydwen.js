const SOURCE_BASE_URL = "https://www.prydwen.gg/star-rail/characters";
const CDN_CHARACTER_BASE =
  "https://cdn.prydwen.gg/images/honkai-star-rail/characters";
const CDN_ICON_BASE = "https://cdn.prydwen.gg/images/honkai-star-rail/icons";
const LOCAL_CHARACTER_BASE = "/images/hsr/characters";
const LOCAL_ICON_BASE = "/images/hsr/icons";

const TEAM_CATEGORIES = [
  {
    key: "moc",
    analyticsKey: "mocTeams",
    label: "Memory of Chaos",
    scoreLabel: "Avg. cycles",
  },
  {
    key: "pf",
    analyticsKey: "pfTeams",
    label: "Pure Fiction",
    scoreLabel: "Avg. score",
  },
  {
    key: "as",
    analyticsKey: "asTeams",
    label: "Apocalyptic Shadow",
    scoreLabel: "Avg. score",
  },
  {
    key: "aa",
    analyticsKey: "aaTeams",
    label: "Anomaly Arbitration",
    scoreLabel: "Avg. score",
  },
];

const ELEMENT_ICON_FILES = {
  Physical: "ele_physical",
  Fire: "ele_fire",
  Ice: "ele_ice",
  Lightning: "ele_lightning",
  Wind: "ele_wind",
  Quantum: "ele_quantum",
  Imaginary: "ele_imaginary",
};

const PATH_ICON_FILES = {
  Abundance: "path_abundance",
  Destruction: "path_destruction",
  Elation: "path_elation",
  Erudition: "path_erudition",
  Harmony: "path_harmony",
  Hunt: "path_hunt",
  Nihility: "path_nihility",
  Preservation: "path_preservation",
  Remembrance: "path_remem",
};

const NO_SCORE_VALUES = new Set([99.99, 0]);

const PUSH_PATTERN =
  /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

const HTML_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function extractFlightPayload(html) {
  const source = String(html || "");
  let flight = "";
  let match;
  PUSH_PATTERN.lastIndex = 0;
  while ((match = PUSH_PATTERN.exec(source)) !== null) {
    try {
      flight += JSON.parse(match[1]);
    } catch {
      continue;
    }
  }
  return flight;
}

function scanBalanced(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function readJsonValues(flight, key) {
  const source = String(flight || "");
  const marker = `"${key}":`;
  const values = [];
  let from = 0;

  while (from < source.length) {
    const index = source.indexOf(marker, from);
    if (index < 0) break;

    let cursor = index + marker.length;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;

    const opener = source[cursor];
    if (opener !== "{" && opener !== "[") {
      from = index + marker.length;
      continue;
    }

    const end = scanBalanced(source, cursor);
    if (end < 0) break;

    try {
      values.push(JSON.parse(source.slice(cursor, end + 1)));
    } catch {
      from = end + 1;
      continue;
    }

    from = end + 1;
  }

  return values;
}

function readJsonValue(flight, key) {
  const values = readJsonValues(flight, key);
  return values.length > 0 ? values[0] : null;
}

function readStringValue(flight, key) {
  const pattern = new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`);
  const match = String(flight || "").match(pattern);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return null;
  }
}

function normalizeSentinels(value) {
  if (typeof value === "string") {
    if (value === "$undefined") return null;
    const dateRef = /^\$D(.+)$/.exec(value);
    if (dateRef) return dateRef[1];
    if (value.startsWith("$") && !value.includes("://")) return null;
    return value;
  }

  if (Array.isArray(value)) return value.map(normalizeSentinels);

  if (value && typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value)) {
      output[key] = normalizeSentinels(value[key]);
    }
    return output;
  }

  return value;
}

function decodeHtmlEntities(value) {
  return String(value || "").replace(
    /&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi,
    (entity, code) => {
      if (code[0] !== "#") return HTML_ENTITIES[code.toLowerCase()] ?? entity;
      const hexadecimal = code[1]?.toLowerCase() === "x";
      const parsed = Number.parseInt(
        code.slice(hexadecimal ? 2 : 1),
        hexadecimal ? 16 : 10,
      );
      if (!Number.isFinite(parsed)) return entity;
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return entity;
      }
    },
  );
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function slugToDisplayName(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isSafeSlug(slug) {
  return typeof slug === "string" && /^[a-z0-9][a-z0-9-]{0,80}$/.test(slug);
}

function characterSourceUrl(slug) {
  return `${SOURCE_BASE_URL}/${slug}`;
}

function characterImageUrls(slug) {
  return {
    icon: `${CDN_CHARACTER_BASE}/${slug}_icon.webp`,
    card: `${CDN_CHARACTER_BASE}/${slug}_card.webp`,
    full: `${CDN_CHARACTER_BASE}/${slug}_full.webp`,
  };
}

function characterImageLocals(slug) {
  return {
    icon: `${LOCAL_CHARACTER_BASE}/${slug}_icon.webp`,
    card: `${LOCAL_CHARACTER_BASE}/${slug}_card.webp`,
    full: `${LOCAL_CHARACTER_BASE}/${slug}_full.webp`,
  };
}

function elementIconUrl(element) {
  const file = ELEMENT_ICON_FILES[element];
  return file ? `${CDN_ICON_BASE}/${file}.webp` : null;
}

function elementIconLocal(element) {
  const file = ELEMENT_ICON_FILES[element];
  return file ? `${LOCAL_ICON_BASE}/${file}.webp` : null;
}

function pathIconUrl(path) {
  const file = PATH_ICON_FILES[path];
  return file ? `${CDN_ICON_BASE}/${file}.webp` : null;
}

function pathIconLocal(path) {
  const file = PATH_ICON_FILES[path];
  return file ? `${LOCAL_ICON_BASE}/${file}.webp` : null;
}

function numericOrNull(value) {
  // `Number(null)`, `Number("")`, and `Number([])` are all 0. Coercing those
  // would turn a missing field into a real-looking zero (e.g. a rank-0 team),
  // so only actual numbers and non-empty numeric strings qualify.
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildImageField(remote, local) {
  return { remote: remote || null, local: local || null };
}

function normalizeCharacterRecord(raw) {
  const record = raw && typeof raw === "object" ? normalizeSentinels(raw) : {};
  const slug = String(record.slug || "").trim();
  const element = record.element || null;
  const path = record.path || null;
  const remotes = characterImageUrls(slug);
  const locals = characterImageLocals(slug);

  return {
    id: record.id || null,
    unitId: record.unitId != null ? String(record.unitId) : null,
    slug,
    name: record.name ? stripHtml(record.name) : slugToDisplayName(slug),
    rarity: numericOrNull(record.rarity),
    element,
    path,
    role: record.defaultRole || null,
    isReleased: record.isReleased === true,
    isNew: record.isNew === true,
    upcoming: record.upcoming === true,
    releasePatch: record.releasePatch ?? null,
    energyUltimate: numericOrNull(record.energyUltimate),
    speedBase: numericOrNull(record.speedBase),
    isSpecialRating: record.isSpecialRating === true,
    images: {
      icon: buildImageField(remotes.icon, locals.icon),
      card: buildImageField(remotes.card, locals.card),
      full: buildImageField(remotes.full, locals.full),
      elementIcon: buildImageField(elementIconUrl(element), elementIconLocal(element)),
      pathIcon: buildImageField(pathIconUrl(path), pathIconLocal(path)),
    },
    tierRatings: Array.isArray(record.tierRatings)
      ? record.tierRatings.map(normalizeSentinels)
      : [],
  };
}

function pickLongestArray(values) {
  let longest = null;
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    if (!longest || value.length > longest.length) longest = value;
  }
  return longest;
}

function parseCharactersPage(html) {
  const flight = extractFlightPayload(html);
  const roster = pickLongestArray(readJsonValues(flight, "characters")) || [];
  const characters = roster
    .filter((entry) => entry && typeof entry === "object" && entry.slug)
    .map(normalizeCharacterRecord);

  return {
    sourceUrl: SOURCE_BASE_URL,
    lastUpdated: readStringValue(flight, "lastUpdated"),
    characters,
  };
}

// Stable fingerprint of the listing entry. Only fields the listing actually
// carries — everything else can only be seen on the detail page, which the
// periodic full refresh exists to cover.
function buildRosterHash(entry) {
  const character = entry && entry.slug ? entry : null;
  if (!character) return null;
  const ratings = Array.isArray(character.tierRatings) ? character.tierRatings : [];
  return JSON.stringify({
    rarity: character.rarity ?? null,
    element: character.element ?? null,
    path: character.path ?? null,
    role: character.role ?? null,
    isReleased: character.isReleased === true,
    isNew: character.isNew === true,
    upcoming: character.upcoming === true,
    releasePatch: character.releasePatch ?? null,
    tierRatings: ratings.map((rating) => ({
      category: rating.category ?? null,
      moc: rating.moc_rating ?? null,
      mocSpecial: rating.moc_special_rating ?? null,
      pure: rating.pure_rating ?? null,
      pureSpecial: rating.pure_special_rating ?? null,
      apo: rating.apo_rating ?? null,
      apoSpecial: rating.apo_special_rating ?? null,
    })),
  });
}

function normalizeTeamEntry(row) {
  // Members are stored as bare slugs: every consumer (the team index, the
  // planner) resolves names, elements, and icons from the roster once, so
  // repeating that object inside all ~30k rows would triple the file for no
  // gain. Slot order is preserved as prydwen lists it.
  const members = [];
  const seen = new Set();
  for (const key of ["char_one", "char_two", "char_three", "char_four"]) {
    const slug = row[key];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    members.push(slug);
  }

  const rawScore = numericOrNull(row.avg_round);
  const rawScoreE1 = numericOrNull(row.avg_round_c1);

  return {
    rank: numericOrNull(row.rank),
    appRate: numericOrNull(row.app_rate),
    avgRound: rawScore != null && !NO_SCORE_VALUES.has(rawScore) ? rawScore : null,
    avgRoundE1: rawScoreE1 != null && !NO_SCORE_VALUES.has(rawScoreE1) ? rawScoreE1 : null,
    members,
  };
}

function normalizeTeamCategory(rows, category) {
  const entries = Array.isArray(rows)
    ? rows.map((row) => normalizeTeamEntry(row))
    : [];

  return {
    key: category.key,
    label: category.label,
    scoreLabel: category.scoreLabel,
    count: entries.length,
    entries,
  };
}

function parseCharacterPage(html, slug, options = {}) {
  const flight = extractFlightPayload(html);

  const characterValues = readJsonValues(flight, "character").filter(
    (value) => value && typeof value === "object",
  );
  const rawCharacter =
    characterValues.find((value) => value.slug === slug) ||
    characterValues[0] ||
    null;

  const resolvedSlug = rawCharacter?.slug || slug;
  const remotes = characterImageUrls(resolvedSlug);
  const locals = characterImageLocals(resolvedSlug);
  const character = rawCharacter
    ? {
        name: rawCharacter.name
          ? stripHtml(rawCharacter.name)
          : slugToDisplayName(resolvedSlug),
        rarity: numericOrNull(rawCharacter.rarity),
        element: rawCharacter.element || null,
        path: rawCharacter.path || null,
        updatedAt: rawCharacter.updatedAt || null,
        images: {
          icon: buildImageField(remotes.icon, locals.icon),
          elementIcon: buildImageField(
            elementIconUrl(rawCharacter.element),
            elementIconLocal(rawCharacter.element),
          ),
          pathIcon: buildImageField(
            pathIconUrl(rawCharacter.path),
            pathIconLocal(rawCharacter.path),
          ),
        },
      }
    : null;

  const analytics = normalizeSentinels(readJsonValue(flight, "analytics")) || {};
  const teams = {};
  for (const category of TEAM_CATEGORIES) {
    teams[category.key] = normalizeTeamCategory(
      analytics[category.analyticsKey],
      category,
    );
  }

  const phases = {};
  for (const key of ["moc", "pf", "as", "aa"]) {
    phases[key] = analytics[`${key}Phase`] || null;
  }

  return {
    schema: 2,
    slug: resolvedSlug,
    sourceUrl: characterSourceUrl(resolvedSlug),
    updatedAt: character?.updatedAt || null,
    character,
    phases,
    teams,
  };
}

function parseTime(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ── Global team index ─────────────────────────────────────────────────────
//
// Every character page carries the same endgame usage table, sliced so that
// the character is always one of the four slots. Reading page N therefore
// yields only the teams that include N — the union across every page is the
// full set of teams prydwen tracks. Teams appear on 1-4 pages (once per
// member), with identical rank/app_rate on each, so deduping by member set is
// safe and the first occurrence can be kept.

function teamKey(members) {
  return [...members].sort().join("|");
}

function buildTeamIndex(details, options = {}) {
  const minAppRate =
    Number.isFinite(Number(options.minAppRate)) && Number(options.minAppRate) >= 0
      ? Number(options.minAppRate)
      : 0;

  const byMode = {};
  for (const category of TEAM_CATEGORIES) {
    byMode[category.key] = new Map();
  }

  let considered = 0;
  let skippedThin = 0;
  let skippedLowRate = 0;

  for (const detail of Array.isArray(details) ? details : []) {
    if (!detail || !detail.teams) continue;

    for (const category of TEAM_CATEGORIES) {
      const categoryData = detail.teams[category.key];
      if (!categoryData || !Array.isArray(categoryData.entries)) continue;

      for (const entry of categoryData.entries) {
        considered += 1;
        const members = Array.isArray(entry.members) ? entry.members : [];
        // A team without a full lineup is a data artefact, not a team the
        // planner can offer.
        if (members.length !== 4) {
          skippedThin += 1;
          continue;
        }
        if (entry.appRate != null && entry.appRate < minAppRate) {
          skippedLowRate += 1;
          continue;
        }

        const key = teamKey(members);
        if (byMode[category.key].has(key)) continue;

        byMode[category.key].set(key, {
          id: key,
          members,
          rank: entry.rank,
          appRate: entry.appRate,
          avgRound: entry.avgRound,
          avgRoundE1: entry.avgRoundE1,
        });
      }
    }
  }

  const modes = {};
  let total = 0;
  for (const category of TEAM_CATEGORIES) {
    const teams = [...byMode[category.key].values()].sort((left, right) => {
      const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER;
      const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return (right.appRate ?? 0) - (left.appRate ?? 0);
    });

    total += teams.length;
    modes[category.key] = {
      key: category.key,
      label: category.label,
      scoreLabel: category.scoreLabel,
      count: teams.length,
      teams,
    };
  }

  return {
    total,
    modes,
    stats: { considered, skippedThin, skippedLowRate },
  };
}

// Decide which character detail pages a sync run should (re)fetch.
//
// The cheap check is the roster listing: its per-entry JSON (tier ratings, new
// flags, role, elements) is hashed into `rosterHashes`. A day-to-day run only
// fetches the entries whose hash moved plus anything that previously failed —
// usually zero pages. A full sweep runs on a schedule (or on request) because
// prydwen can edit a character page without changing the listing entry.
function planCharacterSync(options = {}) {
  const characters = Array.isArray(options.characters) ? options.characters : [];
  const rosterSlugs = characters.map((entry) => entry.slug).filter(isSafeSlug);
  const rosterHashes =
    options.rosterHashes && typeof options.rosterHashes === "object"
      ? options.rosterHashes
      : {};
  const meta = options.meta && typeof options.meta === "object" ? options.meta : {};
  const metaCharacters =
    meta.characters && typeof meta.characters === "object" ? meta.characters : {};
  const now = options.now instanceof Date ? options.now : new Date();
  const fullRefreshDays =
    Number.isFinite(Number(options.fullRefreshDays)) && Number(options.fullRefreshDays) > 0
      ? Number(options.fullRefreshDays)
      : 7;

  const requested = Array.isArray(options.slugs)
    ? options.slugs.map((slug) => String(slug || "").trim()).filter(Boolean)
    : [];
  if (requested.length > 0) {
    return {
      slugs: rosterSlugs.filter((slug) => requested.includes(slug)),
      fullRefresh: false,
      reason: "explicit",
      removed: [],
      unknown: requested.filter((slug) => !rosterSlugs.includes(slug)),
    };
  }

  const removed = Object.keys(metaCharacters).filter(
    (slug) => !rosterSlugs.includes(slug),
  );

  if (options.force === true || options.full === true) {
    return {
      slugs: rosterSlugs,
      fullRefresh: true,
      reason: options.force === true ? "forced" : "full",
      removed,
      unknown: [],
    };
  }

  const changed = rosterSlugs.filter(
    (slug) =>
      !metaCharacters[slug] || metaCharacters[slug].rosterHash !== rosterHashes[slug],
  );
  const failed = rosterSlugs.filter(
    (slug) => metaCharacters[slug] && metaCharacters[slug].error,
  );
  const pending = [...new Set([...changed, ...failed])].sort();

  const lastFullSyncAt = parseTime(meta.lastFullSyncAt);
  const fullRefreshDue =
    !lastFullSyncAt ||
    now.getTime() - lastFullSyncAt > fullRefreshDays * 86400000;

  if (fullRefreshDue) {
    return {
      slugs: rosterSlugs,
      fullRefresh: true,
      reason: lastFullSyncAt ? "full-refresh-due" : "initial",
      removed,
      unknown: [],
    };
  }

  return {
    slugs: pending,
    fullRefresh: false,
    reason: pending.length > 0 ? "roster-changed" : "up-to-date",
    removed,
    unknown: [],
  };
}

module.exports = {
  CDN_CHARACTER_BASE,
  CDN_ICON_BASE,
  ELEMENT_ICON_FILES,
  LOCAL_CHARACTER_BASE,
  LOCAL_ICON_BASE,
  PATH_ICON_FILES,
  SOURCE_BASE_URL,
  TEAM_CATEGORIES,
  buildRosterHash,
  buildTeamIndex,
  characterImageLocals,
  characterImageUrls,
  characterSourceUrl,
  elementIconLocal,
  elementIconUrl,
  extractFlightPayload,
  isSafeSlug,
  normalizeSentinels,
  parseCharacterPage,
  parseCharactersPage,
  pathIconLocal,
  pathIconUrl,
  planCharacterSync,
  readJsonValue,
  readJsonValues,
  readStringValue,
  slugToDisplayName,
  stripHtml,
  teamKey,
};
