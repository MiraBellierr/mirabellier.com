import type { ImgHTMLAttributes } from "react";

import { useAnimationAllowed } from "@/hooks/use-animation-allowed";

type AnimeStickerProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  /** The animated WebP (`*-poster.webp` is derived from it by the script). */
  animatedSrc: string;
  /** The static still emitted by `optimize-anime-gifs.cjs`. */
  posterSrc: string;
};

/**
 * An animated WebP sticker that only downloads the animation on a wide
 * viewport with motion allowed. Phones (and reduced-motion / save-data
 * visitors) get the matching still instead, which is 5–25x smaller — see
 * `src/hooks/use-animation-allowed.ts` for the exact gate.
 *
 * The two `<img>` elements are separate nodes keyed on the animation state:
 * swapping `src` on one node would leave the previous source in the browser
 * cache and, more importantly, would restart the animation each time the
 * viewport crossed the breakpoint.
 */
export default function AnimeSticker({
  animatedSrc,
  posterSrc,
  alt = "",
  ...imgProps
}: AnimeStickerProps) {
  const animationAllowed = useAnimationAllowed();

  return (
    <img
      {...imgProps}
      key={animationAllowed ? "animated" : "poster"}
      src={animationAllowed ? animatedSrc : posterSrc}
      alt={alt}
    />
  );
}
