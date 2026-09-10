import type {
  SiteLinkSection,
  SiteLinksContent,
  SiteWebring,
} from "@/lib/site-links-api";
import { EMPTY_WEBRING } from "@/lib/site-links-api";

// The blogroll + webring have an owner-only editor at /admin/links backed by the
// `site_links` table. Until the owner saves once, the public page falls back to
// the built-in defaults below (same "seed then DB" pattern as /now). Editing
// these only changes the pre-save fallback — a deploy is not how you update the
// live page anymore.

// Shown as "last updated" only while the page is still on the defaults.
export const LINKS_UPDATED = "2026-09-10";

export const DEFAULT_LINK_SECTIONS: SiteLinkSection[] = [
  {
    id: "friends-neighbours",
    title: "friends & neighbours",
    note: "People I know, or sites I've traded links with.",
    entries: [],
  },
  {
    id: "small-web-corners",
    title: "small-web corners",
    note: "Directories and rings for finding hand-made sites.",
    entries: [
      {
        name: "512KB Club",
        url: "https://512kb.club",
        blurb:
          "A leaderboard of sites whose front page is under half a megabyte.",
        feed: "",
      },
      {
        name: "Marginalia Search",
        url: "https://search.marginalia.nu",
        blurb: "A search engine that favours text-heavy, non-commercial pages.",
        feed: "",
      },
      {
        name: "ooh.directory",
        url: "https://ooh.directory",
        blurb: "A hand-catalogued directory of blogs, by topic.",
        feed: "",
      },
    ],
  },
];

export const DEFAULT_WEBRING: SiteWebring = { ...EMPTY_WEBRING };

export type ResolvedLinks = {
  sections: SiteLinkSection[];
  webring: SiteWebring;
  updatedAt: string | null;
  // True when we're showing the built-in defaults (owner hasn't saved yet).
  isDefault: boolean;
};

function hasContent(content: SiteLinksContent | null): content is SiteLinksContent {
  if (!content) return false;
  const anyEntries = content.sections.some(
    (section) => section.entries.length > 0,
  );
  return anyEntries || Boolean(content.webring.name);
}

// Merge server content over the defaults: the owner's saved payload wins whole,
// otherwise the seed lists above are used.
export function resolveSiteLinks(
  content: SiteLinksContent | null,
): ResolvedLinks {
  if (hasContent(content)) {
    return {
      sections: content.sections,
      webring: content.webring,
      updatedAt: content.updatedAt,
      isDefault: false,
    };
  }

  return {
    sections: DEFAULT_LINK_SECTIONS,
    webring: DEFAULT_WEBRING,
    updatedAt: null,
    isDefault: true,
  };
}

export function countLinks(sections: SiteLinkSection[]) {
  return sections.reduce((count, section) => count + section.entries.length, 0);
}
