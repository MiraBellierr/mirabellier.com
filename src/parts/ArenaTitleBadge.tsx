import { getArenaTitleEffect } from "@/lib/arena/titleStyles";

type ArenaTitleBadgeProps = {
  title: { id: string; name: string } | null | undefined;
  /**
   * `full` runs the tier animation and is for the one-per-screen spots
   * (profile header, duel opponent, shop listing). `inline` is static — the
   * leaderboard paints ~25 of these per page and animating them all is what
   * turns a cosmetic into a frame-rate problem.
   */
  variant?: "full" | "inline";
  className?: string;
};

export default function ArenaTitleBadge({
  title,
  variant = "full",
  className = "",
}: ArenaTitleBadgeProps) {
  if (!title) return null;
  const effect = getArenaTitleEffect(title.id);
  return (
    <span
      className={`arena-title arena-title--${variant}${className ? ` ${className}` : ""}`}
      data-title-effect={effect}
    >
      <span className="arena-title__text">{title.name}</span>
    </span>
  );
}
