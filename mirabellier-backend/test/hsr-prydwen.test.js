const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRosterHash,
  buildTeamIndex,
  extractFlightPayload,
  isSafeSlug,
  normalizeSentinels,
  parseCharacterPage,
  parseCharactersPage,
  planCharacterSync,
  slugToDisplayName,
  stripHtml,
} = require("../lib/hsr-prydwen");

// Build a minimal Next.js flight payload the way prydwen streams it: rows of
// `self.__next_f.push([1,"..."])` where the string is JSON-escaped twice.
function flightScript(rows) {
  const body = rows.join("");
  return `<script>self.__next_f.push([1,${JSON.stringify(body)}])</script>`;
}

const ROSTER_ROW = [
  '5d:["$","$L5e",null,',
  JSON.stringify({
    characters: [
      {
        id: "c1",
        unitId: "49",
        slug: "acheron",
        name: "Acheron",
        rarity: "5",
        element: "Lightning",
        path: "Nihility",
        smallImage: "https://cdn.prydwen.gg/images/honkai-star-rail/characters/acheron_icon.webp",
        cardImage: "https://cdn.prydwen.gg/images/honkai-star-rail/characters/acheron_card.webp",
        isReleased: true,
        isNew: false,
        upcoming: false,
        releasePatch: "$undefined",
        defaultRole: "Main DPS",
        energyUltimate: 0,
        speedBase: 101,
        isSpecialRating: false,
        tierRatings: [
          {
            slug: "acheron",
            category: "DPS",
            moc_rating: 10,
            moc_special_rating: 10,
            pure_rating: 10,
            pure_special_rating: 10,
            apo_rating: 10,
            apo_special_rating: 10,
          },
        ],
      },
      {
        id: "c2",
        unitId: "70",
        slug: "tribbie",
        name: "Tribbie",
        rarity: "5",
        element: "Quantum",
        path: "Harmony",
        smallImage: "https://cdn.prydwen.gg/images/honkai-star-rail/characters/tribbie_icon.webp",
        cardImage: "https://cdn.prydwen.gg/images/honkai-star-rail/characters/tribbie_card.webp",
        isReleased: true,
        isNew: false,
        upcoming: false,
        releasePatch: "4.3",
        defaultRole: "Sub DPS",
        energyUltimate: 120,
        speedBase: 96,
        isSpecialRating: false,
        tierRatings: [],
      },
      {
        id: "c3",
        unitId: "99",
        slug: "pearl",
        name: "Pearl",
        rarity: "5",
        element: "Ice",
        path: "Remembrance",
        smallImage: "https://cdn.prydwen.gg/images/honkai-star-rail/characters/pearl_icon.webp",
        cardImage: "https://cdn.prydwen.gg/images/honkai-star-rail/characters/pearl_card.webp",
        isReleased: false,
        isNew: false,
        upcoming: true,
        releasePatch: "$undefined",
        defaultRole: "Support",
        energyUltimate: 110,
        speedBase: 100,
        isSpecialRating: false,
        tierRatings: [],
      },
    ],
    lastUpdated: "22/September/2026",
  }),
  "]",
].join("");

const DETAIL_ROW = [
  "5f:[\"$\",\"$L60\",null,",
  JSON.stringify({
    character: {
      id: "c1",
      slug: "acheron",
      name: "Acheron",
      rarity: "5",
      thumbnailUrl: "https://cdn.prydwen.gg/images/honkai-star-rail/characters/acheron_icon.webp",
      updatedAt: "2026-05-31T21:58:45.030Z",
      element: "Lightning",
      path: "Nihility",
      introduction: "<p>A drifter claiming to be a Galaxy Ranger.</p>",
      voiceActors: { en: "Allegra Clark", jpn: "Miyuki Sawashiro" },
      review: "$61",
      event_banner: "$undefined",
    },
    statBuilds: [{ name: "Default build", body: "CRIT Rate" }],
    relicBuilds: [{ relic_set_1: "Pioneer Diver of Dead Waters", percentage: "100.00%" }],
    coneBuilds: [{ cone_name: "Along the Passing Shore", percentage: "125.50%" }],
    synergies: [
      {
        synergy_slug: "blade-mortenax",
        comment: "<p>Strongest Nihility option.</p>",
      },
      {
        synergy_slug: "sunday, sparkle, bronya",
        comment: "Flexible support core",
      },
    ],
    skillOrder: {
      ID: 1,
      Character: "acheron",
      Order: "Ultimate > Skill = Talent > Basic",
      Comments: "Build: Default build",
      TracePriority: "The Abyss (A4) > Thunder Core (A6) > Red Oni (A2)",
    },
    lastUpdate: { slug: "acheron", build: "4.0", review: "4.0", synergy: "" },
    analytics: {
      mocPhase: { phase: "4.4.1 — Stormcleanse", totalUsers: 12943 },
      mocTeams: [
        {
          rank: 36,
          app_rate: 1.07,
          char_one: "acheron",
          char_two: "blade-mortenax",
          avg_round: 11.25,
          char_four: "hyacine",
          char_three: "tribbie",
          avg_round_c1: 8.81,
        },
        {
          rank: 137,
          app_rate: 0.23,
          char_one: "acheron",
          char_two: "blade-mortenax",
          avg_round: 99.99,
          char_four: "gallagher",
          char_three: "tribbie",
          avg_round_c1: 9.22,
        },
        {
          rank: 400,
          app_rate: 0.01,
          char_one: "tribbie",
          char_two: "pearl",
          char_three: "pearl",
          char_four: "acheron",
        },
      ],
      pfTeams: [],
      asTeams: [],
      aaTeams: [],
    },
  }),
  "]",
].join("");

test("extractFlightPayload concatenates and string-decodes RSC pushes", () => {
  const html = flightScript([ROSTER_ROW, DETAIL_ROW]);
  const flight = extractFlightPayload(html);
  assert.match(flight, /"slug":"acheron"/);
  assert.match(flight, /"mocTeams"/);
});

test("parseCharactersPage returns the roster with sentinels normalized", () => {
  const parsed = parseCharactersPage(flightScript([ROSTER_ROW]));
  assert.equal(parsed.lastUpdated, "22/September/2026");
  assert.equal(parsed.characters.length, 3);

  const acheron = parsed.characters.find((entry) => entry.slug === "acheron");
  assert.equal(acheron.name, "Acheron");
  assert.equal(acheron.rarity, 5);
  assert.equal(acheron.element, "Lightning");
  assert.equal(acheron.path, "Nihility");
  assert.equal(acheron.role, "Main DPS");
  assert.equal(acheron.releasePatch, null);
  assert.equal(acheron.images.icon.local, "/images/hsr/characters/acheron_icon.webp");
  assert.equal(acheron.images.pathIcon.remote.endsWith("path_nihility.webp"), true);
  assert.equal(acheron.tierRatings[0].moc_rating, 10);

  const pearl = parsed.characters.find((entry) => entry.slug === "pearl");
  assert.equal(pearl.upcoming, true);
  assert.equal(pearl.isReleased, false);
});

test("parseCharacterPage extracts teams as bare member slugs", () => {
  const detail = parseCharacterPage(
    flightScript([ROSTER_ROW, DETAIL_ROW]),
    "acheron",
  );

  assert.equal(detail.slug, "acheron");
  assert.equal(detail.character.name, "Acheron");
  assert.equal(
    detail.character.images.icon.local,
    "/images/hsr/characters/acheron_icon.webp",
  );

  const moc = detail.teams.moc;
  assert.equal(moc.label, "Memory of Chaos");
  assert.equal(moc.scoreLabel, "Avg. cycles");
  assert.equal(moc.count, 3);

  const top = moc.entries[0];
  assert.equal(top.rank, 36);
  assert.equal(top.appRate, 1.07);
  assert.equal(top.avgRound, 11.25);
  assert.equal(top.avgRoundE1, 8.81);
  // Members are slugs only; names and icons are resolved from the roster by
  // whoever consumes the index.
  assert.deepEqual(top.members, ["acheron", "blade-mortenax", "tribbie", "hyacine"]);

  // 99.99 is prydwen's "no data" sentinel for the score column.
  assert.equal(moc.entries[1].avgRound, null);
  assert.equal(moc.entries[1].avgRoundE1, 9.22);

  // A team missing the numeric fields entirely must not come back as zero
  // (Number(null) === 0), which would read as a real rank-0 clear.
  const missingNumericRows = [
    "5f:[\"$\",\"$L60\",null,",
    JSON.stringify({
      character: { slug: "acheron", name: "Acheron" },
      analytics: {
        mocTeams: [
          {
            app_rate: null,
            char_one: "acheron",
            char_two: "tribbie",
            avg_round: null,
            char_three: "pearl",
            char_four: "hyacine",
          },
          { rank: 5, app_rate: 12.5, char_one: "acheron" },
        ],
      },
    }),
    "]",
  ].join("");
  const missingDetail = parseCharacterPage(
    flightScript([missingNumericRows]),
    "acheron",
  );
  assert.equal(missingDetail.teams.moc.entries[0].rank, null);
  assert.equal(missingDetail.teams.moc.entries[0].appRate, null);
  assert.equal(missingDetail.teams.moc.entries[0].avgRound, null);
  assert.equal(missingDetail.teams.moc.entries[1].rank, 5);
  assert.equal(missingDetail.teams.moc.entries[1].appRate, 12.5);

  // Duplicate slots collapse and slots missing entirely are simply absent.
  assert.deepEqual(moc.entries[2].members, ["tribbie", "pearl", "acheron"]);
});

test("parseCharacterPage survives a page with no team analytics", () => {
  const bareRows = [
    "5f:[\"$\",\"$L60\",null,",
    JSON.stringify({
      character: { slug: "pearl", name: "Pearl", element: "Ice", path: "Remembrance" },
      analytics: { mocTeams: [], pfTeams: [], asTeams: [], aaTeams: [] },
    }),
    "]",
  ].join("");

  const detail = parseCharacterPage(flightScript([bareRows]), "pearl");
  assert.equal(detail.slug, "pearl");
  assert.equal(detail.teams.moc.count, 0);
  assert.equal(detail.teams.aa.count, 0);
});

test("buildTeamIndex dedupes teams across pages and sorts by rank", () => {
  // The same four-character team appears on each member's page. prydwen
  // reports identical rank/app_rate on every copy, so only one row should
  // survive — otherwise the planner would show it four times.
  // Entries use the parser's output shape (camelCase, members as slugs).
  const shared = {
    rank: 36,
    appRate: 1.07,
    members: ["acheron", "blade-mortenax", "tribbie", "hyacine"],
    avgRound: 11.25,
    avgRoundE1: 8.81,
  };
  const weaker = {
    rank: 113,
    appRate: 0.28,
    members: ["acheron", "ashveil", "tribbie", "hyacine"],
    avgRound: 10.67,
    avgRoundE1: 7.47,
  };
  const thin = {
    rank: 9,
    appRate: 5,
    members: ["acheron", "tribbie", "hyacine"],
    avgRound: 1,
    avgRoundE1: null,
  };

  const pages = [
    {
      slug: "acheron",
      teams: {
        moc: { entries: [weaker, shared, thin] },
        pf: { entries: [] },
        as: { entries: [] },
        aa: { entries: [] },
      },
    },
    {
      slug: "tribbie",
      teams: {
        moc: { entries: [shared] },
        pf: { entries: [] },
        as: { entries: [] },
        aa: { entries: [] },
      },
    },
  ];

  const index = buildTeamIndex(pages);
  assert.equal(index.modes.moc.count, 2, "shared team counted once");

  const ids = index.modes.moc.teams.map((team) => team.id);
  assert.deepEqual(ids, [
    "acheron|blade-mortenax|hyacine|tribbie",
    "acheron|ashveil|hyacine|tribbie",
  ]);
  assert.equal(index.modes.moc.teams[0].rank, 36);
  assert.equal(index.modes.moc.teams[1].rank, 113);

  // A three-character row is not a fieldable team.
  assert.equal(index.stats.skippedThin, 1);
  assert.equal(index.total, 2);
});

test("buildTeamIndex honours a minimum app rate", () => {
  const teams = [
    {
      rank: 1,
      appRate: 20,
      members: ["a", "b", "c", "d"],
      avgRound: null,
      avgRoundE1: null,
    },
    {
      rank: 2,
      appRate: 0.01,
      members: ["a", "b", "c", "e"],
      avgRound: null,
      avgRoundE1: null,
    },
  ];
  const pages = [
    {
      slug: "a",
      teams: {
        moc: { entries: teams },
        pf: { entries: [] },
        as: { entries: [] },
        aa: { entries: [] },
      },
    },
  ];

  const filtered = buildTeamIndex(pages, { minAppRate: 0.05 });
  assert.equal(filtered.modes.moc.count, 1);
  assert.equal(filtered.stats.skippedLowRate, 1);

  const everything = buildTeamIndex(pages);
  assert.equal(everything.modes.moc.count, 2);
});

test("planCharacterSync fetches only changed or previously failed pages", () => {
  const characters = parseCharactersPage(flightScript([ROSTER_ROW])).characters;
  const rosterHashes = {};
  for (const character of characters) {
    rosterHashes[character.slug] = buildRosterHash(character);
  }

  const meta = {
    lastFullSyncAt: new Date().toISOString(),
    characters: {
      acheron: { rosterHash: rosterHashes.acheron, updatedAt: "2026-05-31T21:58:45.030Z" },
      tribbie: { rosterHash: "stale-hash", updatedAt: "2026-01-01T00:00:00.000Z" },
      pearl: { rosterHash: rosterHashes.pearl, error: "fetch-timeout" },
    },
  };

  const plan = planCharacterSync({
    characters,
    rosterHashes,
    meta,
    now: new Date(),
  });

  assert.deepEqual(plan.slugs, ["pearl", "tribbie"]);
  assert.equal(plan.reason, "roster-changed");
  assert.equal(plan.fullRefresh, false);
});

test("planCharacterSync does a full sweep when due or forced", () => {
  const characters = parseCharactersPage(flightScript([ROSTER_ROW])).characters;
  const rosterHashes = {};
  for (const character of characters) {
    rosterHashes[character.slug] = buildRosterHash(character);
  }

  const forced = planCharacterSync({
    characters,
    rosterHashes,
    meta: { lastFullSyncAt: new Date().toISOString(), characters: {} },
    force: true,
  });
  assert.equal(forced.fullRefresh, true);
  assert.equal(forced.reason, "forced");
  assert.deepEqual(forced.slugs, ["acheron", "tribbie", "pearl"]);

  const due = planCharacterSync({
    characters,
    rosterHashes,
    meta: {
      lastFullSyncAt: new Date(Date.now() - 8 * 86400000).toISOString(),
      characters: {},
    },
  });
  assert.equal(due.fullRefresh, true);
  assert.equal(due.reason, "full-refresh-due");

  const initial = planCharacterSync({ characters, rosterHashes, meta: {} });
  assert.equal(initial.fullRefresh, true);
  assert.equal(initial.reason, "initial");
});

test("planCharacterSync reports characters that left the roster", () => {
  const characters = parseCharactersPage(flightScript([ROSTER_ROW])).characters;
  const plan = planCharacterSync({
    characters,
    rosterHashes: {},
    meta: {
      lastFullSyncAt: new Date().toISOString(),
      characters: { "old-unit": { rosterHash: "x" } },
    },
  });
  assert.deepEqual(plan.removed, ["old-unit"]);
});

test("planCharacterSync accepts explicit slugs and ignores unknown ones", () => {
  const characters = parseCharactersPage(flightScript([ROSTER_ROW])).characters;
  const plan = planCharacterSync({
    characters,
    rosterHashes: {},
    meta: {},
    slugs: ["tribbie", "nobody"],
  });
  assert.deepEqual(plan.slugs, ["tribbie"]);
  assert.deepEqual(plan.unknown, ["nobody"]);
  assert.equal(plan.reason, "explicit");
});

test("utility helpers normalize names, slugs, and HTML", () => {
  assert.equal(slugToDisplayName("blade-mortenax"), "Blade Mortenax");
  assert.equal(stripHtml("<p>Hello &amp; <b>welcome</b></p>"), "Hello & welcome");
  assert.equal(normalizeSentinels("$D2026-05-11T18:32:16.237Z"), "2026-05-11T18:32:16.237Z");
  assert.equal(normalizeSentinels("$undefined"), null);
  assert.deepEqual(normalizeSentinels({ a: "$undefined", b: [1] }), { a: null, b: [1] });
  assert.equal(isSafeSlug("aventurine-waveflair"), true);
  assert.equal(isSafeSlug("../etc/passwd"), false);
  assert.equal(isSafeSlug("Acheron"), false);
  assert.equal(isSafeSlug(""), false);
});
