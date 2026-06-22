import type { CSSProperties } from "react";

import type { ArenaCard } from "@/lib/arena-api";
import fireIcon from "@/assets/elements/fire.png";
import waterIcon from "@/assets/elements/water.png";
import earthIcon from "@/assets/elements/earth.png";
import windIcon from "@/assets/elements/wind.png";
import lightIcon from "@/assets/elements/light.png";
import darkIcon from "@/assets/elements/dark.png";

type ArenaPortraitCardSize = "compact" | "full";

type ArenaPortraitCardProps = {
  card: ArenaCard;
  level?: number | null;
  size?: ArenaPortraitCardSize;
  showIvLine?: boolean;
  className?: string;
};

type RarityVisual = {
  key: "C" | "R" | "SR" | "SSR" | "UR";
  stars: number;
  frame: string;
  glow: string;
  badge: string;
  accent: string;
};

type ElementVisual = {
  label: string;
  color: string;
  icon: string;
};

const ELEMENT_VISUALS: Record<string, ElementVisual> = {
  Fire:   { label: "Fire",   color: "#e74c3c", icon: fireIcon },
  Water:  { label: "Water",  color: "#3498db", icon: waterIcon },
  Earth:  { label: "Earth",  color: "#27ae60", icon: earthIcon },
  Wind:   { label: "Wind",   color: "#2ecc71", icon: windIcon },
  Light:  { label: "Light",  color: "#f1c40f", icon: lightIcon },
  Dark:   { label: "Dark",   color: "#8e44ad", icon: darkIcon },
};

function normalizeElement(element: string | null | undefined): ElementVisual | null {
  if (!element) return null;
  return ELEMENT_VISUALS[element] ?? null;
}

const RARITY_VISUALS: Record<RarityVisual["key"], RarityVisual> = {
  C: {
    key: "C",
    stars: 1,
    frame: "linear-gradient(160deg, #897055 0%, #d8c39d 46%, #80664a 100%)",
    glow: "rgba(216, 188, 144, 0.38)",
    badge: "#cfb687",
    accent: "#f8e8c9",
  },
  R: {
    key: "R",
    stars: 2,
    frame: "linear-gradient(160deg, #48636f 0%, #96d6e3 46%, #425f6b 100%)",
    glow: "rgba(110, 198, 217, 0.38)",
    badge: "#5db9cf",
    accent: "#cff6ff",
  },
  SR: {
    key: "SR",
    stars: 3,
    frame: "linear-gradient(160deg, #4d3d63 0%, #ad8ce5 46%, #48385f 100%)",
    glow: "rgba(170, 131, 237, 0.38)",
    badge: "#8e62dd",
    accent: "#eadbff",
  },
  SSR: {
    key: "SSR",
    stars: 4,
    frame: "linear-gradient(160deg, #71413d 0%, #f39a88 46%, #6f3f3a 100%)",
    glow: "rgba(236, 138, 116, 0.4)",
    badge: "#df765f",
    accent: "#ffe2d8",
  },
  UR: {
    key: "UR",
    stars: 5,
    frame: "linear-gradient(160deg, #8a6528 0%, #f5d35f 44%, #6f4f1e 100%)",
    glow: "rgba(241, 202, 89, 0.44)",
    badge: "#d8aa2e",
    accent: "#fff4bf",
  },
};

function normalizeRarity(rarity: string | null | undefined): RarityVisual {
  if (!rarity) return RARITY_VISUALS.C;
  const key = rarity.toUpperCase();
  if (key in RARITY_VISUALS) {
    return RARITY_VISUALS[key as keyof typeof RARITY_VISUALS];
  }
  return RARITY_VISUALS.C;
}

function normalizeLevel(level: number | null | undefined) {
  if (!Number.isFinite(level)) return "--";
  return String(Math.max(1, Math.floor(Number(level)))).padStart(2, "0");
}

const ArenaPortraitCard = ({
  card,
  level,
  size = "full",
  showIvLine = true,
  className = "",
}: ArenaPortraitCardProps) => {
  const visual = normalizeRarity(card.rarity);
  const element = normalizeElement(card.element);
  const levelLabel = normalizeLevel(level);
  const stars = "\u2605".repeat(visual.stars);
  const rootStyle: CSSProperties = {
    "--arena-card-frame": visual.frame,
    "--arena-card-glow": visual.glow,
    "--arena-card-badge": visual.badge,
    "--arena-card-accent": visual.accent,
  } as CSSProperties;

  return (
    <article
      className={`arena-portrait-card arena-portrait-card--${size} ${className}`.trim()}
      style={rootStyle}
      title={card.title}
    >
      <div className="arena-portrait-card__inner">
        <img
          src={card.imageUrl}
          alt={card.title}
          className="arena-portrait-card__image"
          loading="lazy"
          draggable={false}
        />
        <div className="arena-portrait-card__veil" />
        <div className="arena-portrait-card__grain" />

        <div className="arena-portrait-card__top">
          <span className="arena-portrait-card__badge">{visual.key}</span>
          {element ? (
            <span
              className="arena-portrait-card__element arena-portrait-card__element--icon"
              title={element.label}
            >
              <img
                className="arena-portrait-card__element-img"
                src={element.icon}
                alt=""
                draggable={false}
              />
            </span>
          ) : null}
        </div>

        <div className="arena-portrait-card__bottom">
          <p className="arena-portrait-card__name">{card.title}</p>
          <div className="arena-portrait-card__meta">
            <span className="arena-portrait-card__stars" aria-label={`${visual.stars} stars`}>
              {stars}
            </span>
            <span className="arena-portrait-card__level">LV {levelLabel}</span>
          </div>
          {showIvLine ? (
            <p className="arena-portrait-card__iv">
              IV {card.iv.total} | P {card.iv.power} G {card.iv.guard} S {card.iv.speed} L {card.iv.luck}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
};

export default ArenaPortraitCard;
