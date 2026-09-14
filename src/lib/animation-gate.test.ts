import { test } from "node:test";
import assert from "node:assert/strict";

import { shouldAllowAnimation } from "./animation-gate.ts";

test("allows animation on a wide viewport with motion allowed", () => {
  assert.equal(
    shouldAllowAnimation({ wide: true, reducedMotion: false }),
    true,
  );
});

test("denies animation on a narrow viewport regardless of motion", () => {
  assert.equal(
    shouldAllowAnimation({ wide: false, reducedMotion: false }),
    false,
  );
});

test("denies animation when the visitor prefers reduced motion", () => {
  assert.equal(
    shouldAllowAnimation({ wide: true, reducedMotion: true }),
    false,
  );
});

test("denies animation when Save-Data is on even on a wide viewport", () => {
  assert.equal(
    shouldAllowAnimation({
      wide: true,
      reducedMotion: false,
      saveData: true,
    }),
    false,
  );
});

test("denies animation on slow (2g) connections", () => {
  for (const effectiveType of ["2g", "slow-2g"]) {
    assert.equal(
      shouldAllowAnimation({
        wide: true,
        reducedMotion: false,
        effectiveType,
      }),
      false,
      `expected ${effectiveType} to be denied`,
    );
  }
});

test("does not deny 3g/4g connections", () => {
  for (const effectiveType of ["3g", "4g"]) {
    assert.equal(
      shouldAllowAnimation({
        wide: true,
        reducedMotion: false,
        effectiveType,
      }),
      true,
      `expected ${effectiveType} to be allowed`,
    );
  }
});
