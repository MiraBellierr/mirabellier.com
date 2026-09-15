import { test } from "node:test";
import assert from "node:assert/strict";

import {
  collectInlineImageSources,
  dataUrlToFile,
  isInlineImageSource,
  materializeInlineImages,
  replaceInlineImageSources,
} from "./inline-images.ts";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

const doc = (...content: unknown[]) => ({ type: "doc", content });
const image = (src: string, extra: Record<string, unknown> = {}) => ({
  type: "image",
  attrs: { src, alt: null, ...extra },
});
const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

test("isInlineImageSource only matches data image URLs", () => {
  assert.equal(isInlineImageSource(PNG_DATA_URL), true);
  assert.equal(isInlineImageSource("data:image/svg+xml,<svg/>"), true);
  assert.equal(isInlineImageSource("https://api.mirabellier.com/v1/images/a.png"), false);
  assert.equal(isInlineImageSource("data:text/plain,hello"), false);
  assert.equal(isInlineImageSource(null), false);
});

test("collectInlineImageSources finds nested and deduplicates repeats", () => {
  const document = doc(
    paragraph("intro"),
    image(PNG_DATA_URL),
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [image("https://api.mirabellier.com/v1/images/x.png")],
            },
            { type: "tableCell", content: [image(PNG_DATA_URL)] },
          ],
        },
      ],
    },
    image("data:image/webp;base64,AAAA"),
  );

  assert.deepEqual(collectInlineImageSources(document), [
    PNG_DATA_URL,
    "data:image/webp;base64,AAAA",
  ]);
});

test("collectInlineImageSources ignores non-src attrs and tolerates junk", () => {
  assert.deepEqual(collectInlineImageSources(null), []);
  assert.deepEqual(
    collectInlineImageSources({
      attrs: { href: PNG_DATA_URL, src: "https://example.com/a.png" },
    }),
    [],
  );
  // A node holding the same URL under another key is not an image source.
  assert.deepEqual(
    collectInlineImageSources({ type: "image", attrs: { poster: PNG_DATA_URL } }),
    [],
  );
});

test("dataUrlToFile decodes base64 bytes and derives a typed filename", () => {
  const file = dataUrlToFile(PNG_DATA_URL, "screenshot");
  assert.ok(file);
  assert.equal(file.type, "image/png");
  assert.equal(file.name, "screenshot.png");
  // 1x1 PNG header magic, proving the bytes round-tripped.
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50); // 'P'
    assert.equal(bytes[2], 0x4e); // 'N'
    assert.equal(bytes[3], 0x47); // 'G'
  });
});

test("dataUrlToFile decodes non-base64 data URLs via decodeURIComponent", () => {
  const file = dataUrlToFile("data:image/svg+xml,<svg%20width='1'/>", "icon");
  assert.ok(file);
  assert.equal(file.type, "image/svg+xml");
  assert.equal(file.name, "icon.svg");
  return file.text().then((text) => assert.equal(text, "<svg width='1'/>"));
});

test("dataUrlToFile returns null for malformed payloads", () => {
  assert.equal(dataUrlToFile("data:image/png;base64,%%%not-base64%%%"), null);
  assert.equal(dataUrlToFile("not-a-data-url"), null);
});

test("replaceInlineImageSources is copy-on-write and only touches mapped srcs", () => {
  const original = doc(
    image(PNG_DATA_URL),
    image("https://api.mirabellier.com/v1/images/keep.png"),
  );
  const replacements = new Map([[PNG_DATA_URL, "/v1/images/uploaded.png"]]);

  const next = replaceInlineImageSources(original, replacements) as typeof original;
  assert.equal(
    (next.content[0] as { attrs: { src: string } }).attrs.src,
    "/v1/images/uploaded.png",
  );
  assert.equal(
    (next.content[1] as { attrs: { src: string } }).attrs.src,
    "https://api.mirabellier.com/v1/images/keep.png",
  );

  // Input untouched (React state / ProseMirror doc must not be mutated).
  assert.equal((original.content[0] as { attrs: { src: string } }).attrs.src, PNG_DATA_URL);
  assert.notEqual(next, original);
  assert.notEqual(next.content[0], original.content[0]);
});

test("materializeInlineImages uploads each unique image once and swaps URLs", async () => {
  const document = doc(image(PNG_DATA_URL), image(PNG_DATA_URL));
  const seen: string[] = [];

  const result = await materializeInlineImages(document, async (file) => {
    seen.push(file.name);
    return `/v1/images/${seen.length}.png`;
  });

  assert.equal(result.uploadedCount, 1);
  assert.deepEqual(seen, ["inline-image-1.png"]);
  assert.deepEqual(
    (result.content as { content: Array<{ attrs: { src: string } }> }).content.map(
      (node) => node.attrs.src,
    ),
    ["/v1/images/1.png", "/v1/images/1.png"],
  );
});

test("materializeInlineImages is a no-op when nothing is inline", async () => {
  const document = doc(image("https://api.mirabellier.com/v1/images/a.png"));
  let calls = 0;

  const result = await materializeInlineImages(document, async () => {
    calls += 1;
    return "unused";
  });

  assert.equal(calls, 0);
  assert.equal(result.uploadedCount, 0);
  assert.equal(result.content, document);
});

test("materializeInlineImages reports which image failed to upload", async () => {
  const document = doc(
    image(PNG_DATA_URL),
    image("data:image/webp;base64,AAAA"),
  );

  await assert.rejects(
    materializeInlineImages(document, async () => {
      throw new Error("File size exceeds maximum allowed (5MB)");
    }),
    /Image 1 could not be uploaded: File size exceeds maximum allowed/,
  );
});
