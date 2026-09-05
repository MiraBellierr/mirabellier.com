/**
 * The scalloped "verified account" badge (Material Design `verified` glyph),
 * shown next to an author's username when their source TikTok/Instagram account
 * carried a verified badge. Colour comes from `currentColor` — sky-blue by
 * default.
 */
export default function VerifiedBadge({
  size = 15,
  title = "Verified account",
  className = "",
}: {
  size?: number;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      role="img"
      className={`inline-flex shrink-0 align-middle text-sky-500 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82 1.89 3.2L12 21.03l3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12zm-12.91 4.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.32z" />
      </svg>
    </span>
  );
}
