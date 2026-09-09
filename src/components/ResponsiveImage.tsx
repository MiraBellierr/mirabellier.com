/**
 * A plain `<img>` with the project's standard perf attributes plus optional
 * `srcSet` / `sizes` for width-variant delivery.
 *
 * Width variants are prebuilt by `convert-images.cjs` as `<name>-<w>w.webp`
 * next to `<name>.webp`; a caller imports each and assembles the `srcSet`
 * string (see `buildSrcSet` in `@/lib/srcset`). `width`/`height` are still
 * required for CLS — pass the intrinsic size of the `src` fallback.
 */
import type { ImgHTMLAttributes } from "react";

type ResponsiveImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "loading" | "decoding" | "fetchPriority"
> & {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** e.g. "img-320w.webp 320w, img-640w.webp 640w" */
  srcSet?: string;
  /** e.g. "(min-width: 1024px) 400px, 100vw" */
  sizes?: string;
  /** `true` => eager + high priority (above-the-fold hero). Default: lazy. */
  priority?: boolean;
};

export default function ResponsiveImage({
  src,
  alt,
  width,
  height,
  srcSet,
  sizes,
  priority = false,
  ...rest
}: ResponsiveImageProps) {
  return (
    <img
      {...rest}
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  );
}
