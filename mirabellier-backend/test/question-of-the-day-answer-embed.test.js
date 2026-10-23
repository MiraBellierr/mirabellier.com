const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAnswerImagePath,
  buildAnswerPageUrl,
  buildAnswerPreviewState,
  buildAnswerShareHtml,
  getAnswerPreviewDimensions,
  renderAnswerPreviewBuffer,
} = require("../lib/question-of-the-day-answer-embed");

const SAMPLE_ANSWER = {
  id: "1717171717171-ab12cd",
  prompt: "What is a small ritual that keeps you grounded?",
  answer:
    "I don't do any, but sharing meals regularly with your loved ones while talking about your day sounds lovely",
  displayName: "rishoji",
  avatar: "/images/avatars/rishoji.webp",
  createdAt: "2026-09-08T17:27:00.000Z",
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test("buildAnswerPreviewState normalizes a populated answer", () => {
  const state = buildAnswerPreviewState({ answer: SAMPLE_ANSWER });

  assert.equal(state.variant, "answer");
  assert.equal(state.id, SAMPLE_ANSWER.id);
  assert.equal(state.displayName, "rishoji");
  assert.equal(state.answer, SAMPLE_ANSWER.answer);
  assert.equal(state.avatar, SAMPLE_ANSWER.avatar);
  assert.equal(state.prompt, SAMPLE_ANSWER.prompt);
  assert.ok(state.version && state.version.length === 12);
});

test("buildAnswerPreviewState puts the question in the description", () => {
  const state = buildAnswerPreviewState({ answer: SAMPLE_ANSWER });
  assert.equal(state.description, SAMPLE_ANSWER.prompt);
});

test("buildAnswerPreviewState formats the answered-at stamp", () => {
  const state = buildAnswerPreviewState({ answer: SAMPLE_ANSWER });
  assert.equal(state.answeredAt, "Sep 8, 2026, 5:27 PM");
});

test("buildAnswerPreviewState is deterministic for the same input", () => {
  const a = buildAnswerPreviewState({ answer: SAMPLE_ANSWER });
  const b = buildAnswerPreviewState({ answer: { ...SAMPLE_ANSWER } });

  assert.equal(a.version, b.version);
});

test("buildAnswerPreviewState version reacts to every rendered field", () => {
  const base = buildAnswerPreviewState({ answer: SAMPLE_ANSWER });
  const mutate = (patch) =>
    buildAnswerPreviewState({ answer: { ...SAMPLE_ANSWER, ...patch } }).version;

  assert.notEqual(base.version, mutate({ answer: "Different answer entirely." }));
  assert.notEqual(base.version, mutate({ prompt: "A different question?" }));
  assert.notEqual(base.version, mutate({ displayName: "someone else" }));
  assert.notEqual(base.version, mutate({ avatar: "/images/avatars/x.webp" }));
  assert.notEqual(
    base.version,
    mutate({ createdAt: "2026-09-09T10:00:00.000Z" }),
  );
});

test("buildAnswerPreviewState falls back to the missing variant", () => {
  assert.equal(buildAnswerPreviewState({ answer: null }).variant, "missing");
  assert.equal(buildAnswerPreviewState({}).variant, "missing");
  assert.equal(
    buildAnswerPreviewState({ answer: { ...SAMPLE_ANSWER, answer: "   " } })
      .variant,
    "missing",
  );
});

test("buildAnswerImagePath and buildAnswerPageUrl encode the id", () => {
  assert.equal(
    buildAnswerImagePath("a b/c", "v1"),
    "/question-of-the-day/answers/a%20b%2Fc/embed-image.png?v=v1",
  );
  assert.equal(
    buildAnswerPageUrl("https", "mirabellier.com", "abc"),
    "https://mirabellier.com/question-of-the-day/answers/abc",
  );
});

test("getAnswerPreviewDimensions is a 1.91:1 card", () => {
  assert.deepEqual(getAnswerPreviewDimensions(), { width: 1200, height: 630 });
});

test("buildAnswerShareHtml carries the image and the question as description", () => {
  const state = buildAnswerPreviewState({ answer: SAMPLE_ANSWER });
  const html = buildAnswerShareHtml({
    state,
    protocol: "https",
    host: "mirabellier.com",
  });

  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/mirabellier\.com\/question-of-the-day\/answers\/1717171717171-ab12cd"/,
  );
  assert.match(
    html,
    new RegExp(
      `<meta property="og:image" content="https://mirabellier\\.com/question-of-the-day/answers/1717171717171-ab12cd/embed-image\\.png\\?v=${state.version}"`,
    ),
  );
  assert.match(html, /<meta property="og:image:width" content="1200"/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
  assert.match(
    html,
    /<meta property="og:description" content="What is a small ritual that keeps you grounded\?"/,
  );
  assert.match(
    html,
    /<meta name="twitter:description" content="What is a small ritual that keeps you grounded\?"/,
  );
});

test("buildAnswerShareHtml noindexes a missing answer and avoids a dead canonical", () => {
  const html = buildAnswerShareHtml({
    state: buildAnswerPreviewState({ answer: null }),
    protocol: "https",
    host: "mirabellier.com",
  });

  assert.match(html, /<meta name="robots" content="noindex,follow" \/>/);
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/mirabellier\.com\/question-of-the-day" \/>/,
  );
  assert.doesNotMatch(
    html,
    /<link rel="canonical" href="https:\/\/mirabellier\.com\/question-of-the-day\/answers\/"/,
  );
  assert.doesNotMatch(html, /"image":/);
});

test("renderAnswerPreviewBuffer produces a PNG for both variants", async () => {
  const answerBuffer = await renderAnswerPreviewBuffer(
    buildAnswerPreviewState({ answer: { ...SAMPLE_ANSWER, avatar: "" } }),
  );
  assert.ok(Buffer.isBuffer(answerBuffer));
  assert.ok(answerBuffer.length > 1000);
  assert.ok(answerBuffer.subarray(0, 4).equals(PNG_SIGNATURE));

  const missingBuffer = await renderAnswerPreviewBuffer(
    buildAnswerPreviewState({ answer: null }),
  );
  assert.ok(missingBuffer.subarray(0, 4).equals(PNG_SIGNATURE));
});

test("renderAnswerPreviewBuffer tolerates an unresolvable avatar path", async () => {
  const buffer = await renderAnswerPreviewBuffer(
    buildAnswerPreviewState({
      answer: { ...SAMPLE_ANSWER, avatar: "/images/nope/missing.webp" },
    }),
    { imagesDir: "/tmp/definitely-not-here" },
  );
  assert.ok(buffer.subarray(0, 4).equals(PNG_SIGNATURE));
});

test("renderAnswerPreviewBuffer handles very long answers without throwing", async () => {
  const buffer = await renderAnswerPreviewBuffer(
    buildAnswerPreviewState({
      answer: { ...SAMPLE_ANSWER, answer: "word ".repeat(400).trim() },
    }),
  );
  assert.ok(buffer.subarray(0, 4).equals(PNG_SIGNATURE));
});
