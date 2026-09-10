import { test } from "node:test";
import assert from "node:assert/strict";

import {
  countWords,
  extractHeadings,
  extractTextFromContent,
  formatReadingTime,
  readingTimeMinutes,
  slugify,
  type ContentNode,
  type DocumentNode,
} from "./blog-reading.ts";

const text = (value: string): ContentNode => ({ type: "text", text: value });
const para = (value: string): ContentNode => ({
  type: "paragraph",
  content: [text(value)],
});
const heading = (level: number, value: string) => ({
  type: "heading",
  attrs: { level, textAlign: null },
  content: [text(value)],
});
const doc = (...content: ContentNode[]): DocumentNode => ({
  type: "doc",
  content,
});

test("extractTextFromContent flattens a doc's text (block joins are seamless)", () => {
  // Documented quirk: no separator is inserted between blocks.
  assert.equal(
    extractTextFromContent(doc(para("First paragraph."), para("Second one."))),
    "First paragraph.Second one.",
  );
});

test("countWords sums per text node, unaffected by block joins", () => {
  const document = {
    type: "doc",
    content: [
      heading(2, "The Setup"),
      para("First paragraph here."),
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [para("one two")] },
          { type: "listItem", content: [para("three")] },
        ],
      },
      { type: "image", attrs: { caption: "a captioned photo" } },
    ],
  };

  // 2 + 3 + 2 + 1 + 3 = 11
  assert.equal(countWords(document), 11);
  assert.equal(countWords(null), 0);
  assert.equal(countWords({ type: "doc", content: [] }), 0);
});

test("readingTimeMinutes rounds at 200 wpm, min 1, 0 when empty", () => {
  const words = (n: number) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [text("word ".repeat(n).trim())] }],
  });

  assert.equal(readingTimeMinutes(words(10)), 1); // rounds up from 0.05
  assert.equal(readingTimeMinutes(words(300)), 2); // 1.5 -> 2
  assert.equal(readingTimeMinutes(words(1000)), 5);
  assert.equal(readingTimeMinutes(null), 0);
  assert.equal(readingTimeMinutes({ type: "doc", content: [] }), 0);
});

test("formatReadingTime renders a label, empty for nothing", () => {
  assert.equal(formatReadingTime(1), "1 min read");
  assert.equal(formatReadingTime(7), "7 min read");
  assert.equal(formatReadingTime(0), "");
});

test("slugify is kebab-case, ascii-only, capped", () => {
  assert.equal(
    slugify("The Trojan Room Coffee Pot!"),
    "the-trojan-room-coffee-pot",
  );
  assert.equal(slugify("  spaced   out  "), "spaced-out");
  assert.equal(slugify("Café — déjà vu"), "cafe-deja-vu");
  assert.equal(slugify(""), "");
});

test("extractHeadings returns levels 2-4 in order with unique slug ids", () => {
  const document = {
    type: "doc",
    content: [
      heading(1, "Document Title"), // h1 -> excluded
      para("intro"),
      heading(2, "Background"),
      para("..."),
      heading(4, "Details"), // this blog jumps h2 -> h4
      heading(5, "Too deep"), // h5 -> excluded
      heading(2, "Background"), // duplicate text
      { type: "heading", attrs: { level: 2 }, content: [] }, // empty -> skipped
    ],
  };

  assert.deepEqual(extractHeadings(document), [
    { id: "background", text: "Background", level: 2 },
    { id: "details", text: "Details", level: 4 },
    { id: "background-2", text: "Background", level: 2 },
  ]);
});

test("extractHeadings honours custom level bounds and bare arrays", () => {
  const nodes = [heading(2, "H2"), heading(3, "H3"), heading(4, "H4")];
  assert.deepEqual(
    extractHeadings(nodes, { minLevel: 3, maxLevel: 3 }).map((h) => h.text),
    ["H3"],
  );
  assert.deepEqual(extractHeadings(null), []);
});

test("extractHeadings finds headings nested inside a blockquote", () => {
  const document = {
    type: "doc",
    content: [
      {
        type: "blockquote",
        content: [heading(2, "Quoted Heading"), para("body")],
      },
    ],
  };

  assert.deepEqual(extractHeadings(document), [
    { id: "quoted-heading", text: "Quoted Heading", level: 2 },
  ]);
});
