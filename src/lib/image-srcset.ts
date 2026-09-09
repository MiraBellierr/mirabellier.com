import { API_BASE } from "./config";

/**
 * Build a `srcSet` of width variants for an image served by the backend's
 * `/images/…?w=<n>` resize endpoint (avatars, banners, uploaded thumbnails).
 *
 * Accepts both the absolute form produced by `resolveAsset`
 * (`${API_BASE}/images/…`) and the bare same-origin `/images/…` path the
 * API returns for arena/leaderboard rows (proxied to the backend by nginx in
 * production). Returns `undefined` for anything else — blob previews, external
 * CDNs, data URIs — so the caller just renders `src` with no `srcSet`.
 * Widths must be on the endpoint's allow-list.
 */
const RESIZE_PREFIXES = [`${API_BASE}/images/`, "/images/"];

export function imageWidthSrcSet(
  url: string | null | undefined,
  widths: number[],
): string | undefined {
  if (!url) return undefined;
  if (!RESIZE_PREFIXES.some((prefix) => url.startsWith(prefix))) return undefined;
  const [base] = url.split("?");
  return widths.map((w) => `${base}?w=${w} ${w}w`).join(", ");
}
