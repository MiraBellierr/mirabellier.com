import { test } from "node:test";
import assert from "node:assert/strict";

import { readNullableNumber } from "./nullable-number.ts";

test("readNullableNumber keeps real numbers and numeric strings", () => {
  assert.equal(readNullableNumber(11.25), 11.25);
  assert.equal(readNullableNumber(0), 0);
  assert.equal(readNullableNumber("1.07"), 1.07);
  assert.equal(readNullableNumber(-3), -3);
});

test("readNullableNumber maps missing values to null, never zero", () => {
  // The bug this guards: Number(null) === 0 and Number("") === 0, so a plain
  // coercion turns "no data" into a legitimate-looking rank-0 team.
  assert.equal(readNullableNumber(null), null);
  assert.equal(readNullableNumber(undefined), null);
  assert.equal(readNullableNumber(""), null);
});

test("readNullableNumber rejects non-numeric junk", () => {
  assert.equal(readNullableNumber("abc"), null);
  assert.equal(readNullableNumber({}), null);
  assert.equal(readNullableNumber([]), null);
  assert.equal(readNullableNumber(NaN), null);
  assert.equal(readNullableNumber(Infinity), null);
});
