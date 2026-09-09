import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSrcSet } from "./srcset.ts";

// `imageWidthSrcSet` pulls in `./config` (Vite `import.meta.env`), which won't
// resolve under `node --test`; its 2-line URL rewrite is covered end-to-end by
// the backend's image-resize tests. `buildSrcSet` is standalone.
test("buildSrcSet formats width descriptors in insertion order", () => {
  assert.equal(
    buildSrcSet({ 320: "/a-320w.webp", 640: "/a-640w.webp", 800: "/a.webp" }),
    "/a-320w.webp 320w, /a-640w.webp 640w, /a.webp 800w",
  );
});

test("buildSrcSet on an empty map is an empty string", () => {
  assert.equal(buildSrcSet({}), "");
});
