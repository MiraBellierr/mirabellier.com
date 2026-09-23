/**
 * Null-safe numeric coercion for API payloads.
 *
 * `Number(null)` and `Number("")` are both `0`, so a plain `Number(value)`
 * turns a missing field into a real-looking zero — the Star Rail team payloads
 * mark "no data" as `null`, and a `0` there would read as a genuine rank-0
 * clear. Only actual numbers and non-empty numeric strings qualify; other
 * types (arrays coerce to `0`/`NaN`, objects to `NaN`) are rejected outright.
 *
 * Kept standalone (no `import.meta.env`, no React) so it can be unit tested
 * under `node --test`.
 */
export function readNullableNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
