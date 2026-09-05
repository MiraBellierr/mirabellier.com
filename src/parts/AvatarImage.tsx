import { useEffect, useState } from "react";

/**
 * The `<img>` half of an avatar circle. Shows a generic "person" glyph both
 * when there is no `src` and when the image fails to load — expired social-CDN
 * avatar URLs 403 in the browser, and simply hiding the broken `<img>` (the
 * old inline `onError` did) left a bare coloured circle with nothing in it.
 *
 * Drop it straight inside the circle wrapper, which supplies the size and the
 * background colour. `iconClassName` sets the glyph colour for the wrapper's
 * background (defaults to a translucent white that reads on a saturated fill):
 *
 *   <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-pink-500">
 *     <AvatarImage src={resolveAvatarUrl(author?.avatar)} />
 *   </span>
 */
export default function AvatarImage({
  src,
  alt = "",
  className = "h-full w-full object-cover",
  iconClassName = "text-white/85",
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  iconClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  // A recycled list row can hand this component a new `src` for a different
  // person — clear the stale error so their avatar gets a fresh attempt.
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className={`flex h-full w-full items-center justify-center ${iconClassName}`}
      >
        <svg
          viewBox="0 0 24 24"
          width="62%"
          height="62%"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
