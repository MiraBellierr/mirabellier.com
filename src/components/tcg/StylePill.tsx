import { ELEMENT_COLORS } from "@/lib/tcg-constants";

type StylePillSize = "xs" | "sm" | "md";

const SIZE_CLASSES: Record<StylePillSize, string> = {
  xs: "px-1 py-px text-[0.5rem]",
  sm: "px-1.5 py-0.5 text-[0.6rem]",
  md: "px-2 py-0.5 text-xs",
};

/**
 * Text badge for a combat style (Might / Swift / Skill / Ruse / Surge / Ward).
 * Replaces the old per-element icon art — the styles have no icons.
 */
export default function StylePill({
  style,
  size = "sm",
  className = "",
  title,
}: {
  style: string;
  size?: StylePillSize;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? style}
      className={`inline-flex items-center justify-center rounded-full font-black uppercase leading-none tracking-wide text-white shadow-sm ${SIZE_CLASSES[size]} ${className}`}
      style={{ backgroundColor: ELEMENT_COLORS[style] || "#888" }}
    >
      {style}
    </span>
  );
}
