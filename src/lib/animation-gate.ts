/**
 * Whether an animated WebP sticker may replace its still on this device.
 *
 * Animated stickers are 80–380 kB each; the stills (`*-poster.webp`, emitted
 * by `optimize-anime-gifs.cjs`) are 4–15 kB. Only a wide viewport with motion
 * allowed — and no `saveData` / 2G signal — gets the animation.
 *
 * Pure decision function, kept out of the hook so it is unit-testable without
 * a DOM (`src/hooks/use-animation-allowed.ts` supplies the browser values).
 */
export type AnimationGateInput = {
  wide: boolean;
  reducedMotion: boolean;
  saveData?: boolean;
  effectiveType?: string;
};

export function shouldAllowAnimation({
  wide,
  reducedMotion,
  saveData,
  effectiveType,
}: AnimationGateInput): boolean {
  if (saveData) return false;
  if (effectiveType && /(^|-)2g$/.test(effectiveType)) return false;
  return wide && !reducedMotion;
}
