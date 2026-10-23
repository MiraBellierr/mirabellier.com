const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLinksPayload,
  mapLinksRow,
  MAX_SECTIONS,
  MAX_ENTRIES_PER_SECTION,
} = require("../lib/site-links");

test("buildLinksPayload keeps valid links, drops junk rows, upgrades bare hosts", () => {
  const before = Date.now();
  const { payload, error } = buildLinksPayload({
    sections: [
      {
        title: "  small-web corners  ",
        note: "  directories worth a look  ",
        entries: [
          { name: "  512KB Club  ", url: "512kb.club", blurb: "  tiny sites  " },
          { name: "no url", url: "   " },
          { name: "", url: "https://example.com" },
          { name: "with feed", url: "https://blog.example", feed: "blog.example/feed.xml" },
          "nope",
        ],
      },
      { title: "", note: "", entries: [] },
    ],
    webring: {},
  });

  assert.equal(error, undefined);
  assert.equal(payload.sections.length, 1);
  assert.equal(payload.sections[0].id, "small-web-corners");
  assert.equal(payload.sections[0].title, "small-web corners");
  assert.equal(payload.sections[0].note, "directories worth a look");
  assert.deepEqual(payload.sections[0].entries, [
    { name: "512KB Club", url: "https://512kb.club/", blurb: "tiny sites", feed: "" },
    {
      name: "with feed",
      url: "https://blog.example/",
      blurb: "",
      feed: "https://blog.example/feed.xml",
    },
  ]);
  assert.ok(Date.parse(payload.updatedAt) >= before);
});

test("buildLinksPayload requires a link or a webring name", () => {
  assert.equal(buildLinksPayload(null).error, "Request body must be an object");
  assert.equal(
    buildLinksPayload({ sections: [], webring: {} }).error,
    "Add at least one link, or fill in the webring name.",
  );
  assert.equal(
    buildLinksPayload({
      sections: [{ title: "empty", entries: [{ name: "x" }] }],
      webring: {},
    }).error,
    "Add at least one link, or fill in the webring name.",
  );
  // A webring name alone is enough to save.
  assert.equal(
    buildLinksPayload({ sections: [], webring: { name: "The Ring" } }).error,
    undefined,
  );
});

test("buildLinksPayload only enables the webring with hub + both neighbours", () => {
  const partial = buildLinksPayload({
    sections: [],
    webring: {
      enabled: true,
      name: "Ring",
      hubUrl: "ring.example",
      prevUrl: "ring.example/prev",
    },
  });
  assert.equal(partial.payload.webring.enabled, false);

  const full = buildLinksPayload({
    sections: [],
    webring: {
      enabled: true,
      name: "Ring",
      hubUrl: "ring.example",
      prevUrl: "ring.example/prev",
      nextUrl: "ring.example/next",
    },
  });
  assert.equal(full.payload.webring.enabled, true);
  assert.equal(full.payload.webring.hubUrl, "https://ring.example/");

  // javascript: URLs are rejected by the sanitizer, keeping enabled false.
  const hostile = buildLinksPayload({
    sections: [],
    webring: {
      enabled: true,
      name: "Ring",
      hubUrl: "javascript:alert(1)",
      prevUrl: "ring.example/prev",
      nextUrl: "ring.example/next",
    },
  });
  assert.equal(hostile.payload.webring.enabled, false);
  assert.equal(hostile.payload.webring.hubUrl, "");
});

test("buildLinksPayload caps section and entry counts", () => {
  const sections = Array.from({ length: MAX_SECTIONS + 5 }, (_, i) => ({
    title: `s${i}`,
    entries: Array.from({ length: MAX_ENTRIES_PER_SECTION + 5 }, (_, j) => ({
      name: `n${j}`,
      url: `https://s${i}-${j}.example`,
    })),
  }));
  const { payload } = buildLinksPayload({ sections, webring: {} });

  assert.equal(payload.sections.length, MAX_SECTIONS);
  assert.equal(payload.sections[0].entries.length, MAX_ENTRIES_PER_SECTION);
});

test("mapLinksRow parses a stored row and survives bad JSON", () => {
  assert.equal(mapLinksRow(null), null);

  const parsed = mapLinksRow({
    payloadJson: JSON.stringify({
      sections: [
        {
          id: "friends",
          title: "friends",
          note: "people I know",
          entries: [{ name: "A", url: "https://a.example", blurb: "", feed: "" }],
        },
        "bad",
      ],
      webring: {
        enabled: true,
        name: "Ring",
        hubUrl: "https://ring.example/",
        prevUrl: "https://ring.example/prev",
        nextUrl: "https://ring.example/next",
        randomUrl: "",
      },
      updatedAt: "2026-02-02T00:00:00.000Z",
    }),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z",
  });

  assert.deepEqual(parsed.sections, [
    {
      id: "friends",
      title: "friends",
      note: "people I know",
      entries: [{ name: "A", url: "https://a.example", blurb: "", feed: "" }],
    },
  ]);
  assert.equal(parsed.webring.enabled, true);
  assert.equal(parsed.webring.name, "Ring");
  assert.equal(parsed.updatedAt, "2026-03-03T00:00:00.000Z");

  const broken = mapLinksRow({
    payloadJson: "{not json",
    createdAt: "c",
    updatedAt: "u",
  });
  assert.deepEqual(broken, {
    sections: [],
    webring: {
      enabled: false,
      name: "",
      hubUrl: "",
      prevUrl: "",
      nextUrl: "",
      randomUrl: "",
    },
    createdAt: "c",
    updatedAt: "u",
  });
});
