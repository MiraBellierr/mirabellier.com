/**
 * Resolves a shrine image name (e.g. "kanna1") to a ready `ShrineImage` field
 * set — `src` (WebP primary, ≤800px), a `srcSet` of prebuilt width variants,
 * plus intrinsic `width`/`height` for CLS.
 *
 * Variants and `manifest.ts` are produced by `convert-images.cjs`. The glob is
 * eager-URL only, so the chunk carries ~60 short URL strings, not image bytes.
 */
import { buildSrcSet } from "@/lib/srcset";
import { imageWidthSrcSet } from "@/lib/image-srcset";
import { shrineManifest } from "@/assets/shrine/manifest";
import type {
  CharacterShrineData,
  ShrineImage,
} from "@/components/CharacterShrinePage";

const urls = import.meta.glob<string>("../assets/shrine/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const byFile: Record<string, string> = {};
for (const [key, url] of Object.entries(urls)) {
  byFile[key.slice(key.lastIndexOf("/") + 1)] = url;
}

export type ShrineImageFields = Pick<
  ShrineImage,
  "src" | "srcSet" | "sizes" | "width" | "height"
>;

/**
 * @param name  base name, e.g. "kanna1" (no extension)
 * @param sizes the `sizes` attribute for the render context
 */
export function shrineImg(name: string, sizes: string): ShrineImageFields {
  const meta = shrineManifest[name];
  const primary = byFile[`${name}.webp`];

  if (!meta || !primary) {
    // Missing from the manifest/glob — fall back to a bare primary URL (or an
    // empty string) so the page still renders instead of crashing.
    return { src: primary ?? "", sizes };
  }

  const candidates: Record<number, string> = {};
  for (const w of meta.variants) {
    const v = byFile[`${name}-${w}w.webp`];
    if (v) candidates[w] = v;
  }
  candidates[meta.w] = primary;

  return {
    src: primary,
    srcSet: buildSrcSet(candidates),
    sizes,
    width: meta.w,
    height: meta.h,
  };
}

// `sizes` presets for the shrine layouts.
export const SHRINE_SIZES = {
  // hero supporting strip + gallery grid cells: main column, ~2-3 up
  gallery: "(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw",
  // full-width media inside the ~720px main column
  wide: "(min-width: 1024px) 700px, 100vw",
  // left rail art — desktop only
  rail: "(min-width: 1024px) 420px, 1px",
} as const;

// API-loaded shrine payloads (ShrineEntry, AdminShrinePreview) carry bare
// image URLs. Add a `?w=` `srcSet` to any that point at the backend's
// `/images/` resize endpoint; leave already-enriched images (the static
// Kanna/Rossina data) and external URLs untouched.
const API_SHRINE_WIDTHS = [320, 480, 640];

function withApiSrcSet(image: ShrineImage, sizes: string): ShrineImage {
  if (image.srcSet) return image;
  const srcSet = imageWidthSrcSet(image.src, API_SHRINE_WIDTHS);
  return srcSet ? { ...image, srcSet, sizes } : image;
}

export function enrichShrineImages(
  data: CharacterShrineData,
): CharacterShrineData {
  return {
    ...data,
    hero: {
      ...data.hero,
      supportingImages: data.hero.supportingImages.map((img) =>
        withApiSrcSet(img, SHRINE_SIZES.gallery),
      ),
    },
    gallery: data.gallery.map((group) => ({
      ...group,
      items: group.items?.map((img) =>
        withApiSrcSet(img, SHRINE_SIZES.gallery),
      ),
    })),
    railImage: withApiSrcSet(data.railImage, SHRINE_SIZES.rail),
    sideImage: withApiSrcSet(data.sideImage, SHRINE_SIZES.gallery),
  };
}
