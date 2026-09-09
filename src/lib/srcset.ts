/**
 * Assemble a `srcSet` string from prebuilt width variants.
 *
 *   buildSrcSet({ 320: url320, 640: url640 })  // "url320 320w, url640 640w"
 *
 * Variants are produced by `convert-images.cjs` as `<name>-<w>w.webp`.
 */
export function buildSrcSet(entries: Record<number, string>): string {
  return Object.entries(entries)
    .map(([width, url]) => `${url} ${width}w`)
    .join(", ");
}
