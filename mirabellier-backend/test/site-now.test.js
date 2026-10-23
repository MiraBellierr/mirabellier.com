const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildNowPayload,
  mapNowRow,
  MAX_SECTIONS,
  MAX_SECTION_BODY_LENGTH,
} = require("../lib/site-now");

test("buildNowPayload trims, drops blank rows, and stamps updatedAt", () => {
  const before = Date.now();
  const { payload, error } = buildNowPayload({
    intro: "  building small things  \r\n",
    sections: [
      { label: "  Reading  ", body: "a book\r\nand another  " },
      { label: "", body: "" },
      { label: "Watching", body: "  " },
      { notAnObject: true },
      "nope",
    ],
  });

  assert.equal(error, undefined);
  assert.equal(payload.intro, "building small things");
  assert.deepEqual(payload.sections, [
    { label: "Reading", body: "a book\nand another" },
    { label: "Watching", body: "" },
  ]);
  assert.ok(Date.parse(payload.updatedAt) >= before);
});

test("buildNowPayload rejects empty and non-object input", () => {
  assert.equal(buildNowPayload(null).error, "Request body must be an object");
  assert.equal(
    buildNowPayload({ intro: "   ", sections: [] }).error,
    "Add an intro or at least one section",
  );
  assert.equal(
    buildNowPayload({ sections: [{ label: "", body: "  \n " }] }).error,
    "Add an intro or at least one section",
  );
});

test("buildNowPayload caps section count and body length", () => {
  const many = Array.from({ length: MAX_SECTIONS + 8 }, (_, i) => ({
    label: `s${i}`,
    body: "x".repeat(MAX_SECTION_BODY_LENGTH + 50),
  }));
  const { payload } = buildNowPayload({ intro: "hi", sections: many });

  assert.equal(payload.sections.length, MAX_SECTIONS);
  assert.equal(payload.sections[0].body.length, MAX_SECTION_BODY_LENGTH);
});

test("mapNowRow parses a stored row and survives bad JSON", () => {
  assert.equal(mapNowRow(null), null);

  const parsed = mapNowRow({
    payloadJson: JSON.stringify({
      intro: "now",
      sections: [{ label: "Reading", body: "a book" }, { label: "x" }],
      updatedAt: "2026-02-02T00:00:00.000Z",
    }),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z",
  });
  assert.deepEqual(parsed, {
    intro: "now",
    sections: [
      { label: "Reading", body: "a book" },
      { label: "x", body: "" },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z",
  });

  const broken = mapNowRow({
    payloadJson: "{not json",
    createdAt: "c",
    updatedAt: "u",
  });
  assert.deepEqual(broken, {
    intro: "",
    sections: [],
    createdAt: "c",
    updatedAt: "u",
  });
});
