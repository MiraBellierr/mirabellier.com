import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { openCommandPalette } from "@/lib/command-palette";

import home from "../assets/icons/img1-24.webp";
import about from "../assets/icons/img2-24.webp";
import blog from "../assets/icons/img3-24.webp";
import projects from "../assets/icons/img4-24.webp";
import guestbook from "../assets/icons/cats-24.webp";
import twitch from "../assets/icons/twitch-24.webp";

type NavItem = {
  label: string;
  to: string;
  icon: string;
  isActive: (pathname: string) => boolean;
};

const NAV_ICON_ANIME =
  "https://cdn.discordapp.com/emojis/761014368476332079.webp?size=40&animated=true";
const NAV_ICON_SHRINE =
  "https://cdn.discordapp.com/emojis/1050193537972584448.webp?size=40";
const NAV_ICON_QUESTION =
  "https://cdn.discordapp.com/emojis/948077750432985128.webp?size=40";
const NAV_ICON_QUOTES =
  "https://cdn.discordapp.com/emojis/761014368476332079.webp?size=40&animated=true";
const NAV_ICON_ARENA =
  "https://cdn.discordapp.com/emojis/1077057865098997800.webp?size=40";

const navSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "me",
    items: [
      {
        label: "home",
        to: "/",
        icon: home,
        isActive: (pathname) => pathname === "/",
      },
      {
        label: "about",
        to: "/about",
        icon: about,
        isActive: (pathname) => pathname === "/about",
      },
      {
        label: "now",
        to: "/now",
        icon: about,
        isActive: (pathname) => pathname === "/now",
      },
      {
        label: "projects",
        to: "/projects",
        icon: projects,
        isActive: (pathname) => pathname === "/projects",
      },
      {
        label: "uses",
        to: "/uses",
        icon: projects,
        isActive: (pathname) => pathname === "/uses",
      },
    ],
  },
  {
    label: "site",
    items: [
      {
        label: "changelog",
        to: "/changelog",
        icon: about,
        isActive: (pathname) => pathname === "/changelog",
      },
      {
        label: "stats",
        to: "/stats",
        icon: about,
        isActive: (pathname) => pathname === "/stats",
      },
      {
        label: "links",
        to: "/links",
        icon: about,
        isActive: (pathname) => pathname === "/links",
      },
    ],
  },
  {
    label: "create",
    items: [
      {
        label: "blog",
        to: "/blog",
        icon: blog,
        isActive: (pathname) => pathname.startsWith("/blog"),
      },
      {
        label: "question",
        to: "/question-of-the-day",
        icon: NAV_ICON_QUESTION,
        isActive: (pathname) => pathname.startsWith("/question-of-the-day"),
      },
      {
        label: "quotes",
        to: "/quotes",
        icon: NAV_ICON_QUOTES,
        isActive: (pathname) => pathname === "/quotes",
      },
      {
        label: "anime",
        to: "/anime",
        icon: NAV_ICON_ANIME,
        isActive: (pathname) => pathname === "/anime",
      },
      {
        label: "shrine",
        to: "/shrine",
        icon: NAV_ICON_SHRINE,
        isActive: (pathname) =>
          pathname === "/shrine" || pathname.startsWith("/shrine/"),
      },
      {
        label: "fan art",
        to: "/fanart",
        icon: NAV_ICON_SHRINE,
        isActive: (pathname) => pathname === "/fanart",
      },
    ],
  },
  {
    label: "community",
    items: [
      {
        label: "guestbook",
        to: "/guestbook",
        icon: guestbook,
        isActive: (pathname) => pathname.startsWith("/guestbook"),
      },
      {
        label: "pixies",
        to: "/pixies",
        icon: NAV_ICON_ANIME,
        isActive: (pathname) => pathname === "/pixies",
      },
      {
        label: "twitch",
        to: "/twitch",
        icon: twitch,
        isActive: (pathname) => pathname === "/twitch",
      },
    ],
  },
  {
    label: "arena",
    items: [
      {
        label: "arena",
        to: "/arena",
        icon: NAV_ICON_ARENA,
        isActive: (pathname) =>
          pathname === "/arena" || pathname.startsWith("/arena/") ||
          pathname === "/ar" || pathname.startsWith("/ar/"),
      },
      {
        label: "hall of fame",
        to: "/arena/hall-of-fame",
        icon: NAV_ICON_ARENA,
        isActive: (pathname) =>
          pathname.startsWith("/arena/hall-of-fame") ||
          pathname.startsWith("/ar/hall-of-fame"),
      },
    ],
  },
];

const SectionLabelText = ({ label }: { label: string }) => (
  <div className="text-center font-mono text-[11px] uppercase tracking-[0.24em] text-blue-400 dark:text-purple-300/80">
    -- <span className="font-bold">{label}</span> --
  </div>
);

const Navigation = () => {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeNavItem = navSections
    .flatMap((section) => section.items)
    .find((item) => item.isActive(location.pathname));

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <aside className="site-display nav-shell mb-auto w-full overflow-hidden rounded-xl border border-blue-300 bg-blue-100 shadow-md opacity-90">
      <div className="border-b border-blue-200/80 p-3 lg:hidden dark:border-purple-300/20">
        <button
          aria-controls="site-navigation-panel"
          aria-expanded={mobileNavOpen}
          aria-label={mobileNavOpen ? "Collapse navigation" : "Expand navigation"}
          className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/75 px-3 py-2 text-left shadow-sm transition hover:bg-white/90 dark:bg-purple-900/40 dark:hover:bg-purple-900/60"
          onClick={() => setMobileNavOpen((open) => !open)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-blue-500 dark:text-purple-200">
              site navigation
            </span>
            <span className="block truncate text-sm font-bold text-blue-700 dark:text-purple-50">
              {activeNavItem ? activeNavItem.label : "menu"}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-6 flex-shrink-0 flex-col justify-center gap-1"
          >
            <span className="block h-0.5 w-full rounded-full bg-blue-500 dark:bg-purple-200" />
            <span className="block h-0.5 w-full rounded-full bg-blue-500 dark:bg-purple-200" />
            <span className="block h-0.5 w-full rounded-full bg-blue-500 dark:bg-purple-200" />
          </span>
        </button>
      </div>

      <nav
        id="site-navigation-panel"
        className={`${mobileNavOpen ? "block" : "hidden"} mb-4 space-y-4 p-4 lg:block`}
      >
        <h2 className="hidden text-center text-lg font-bold text-blue-600 lg:block">
          site navigation
        </h2>

        <button
          type="button"
          onClick={openCommandPalette}
          className="flex w-full items-center justify-between gap-2 rounded-full bg-white/75 px-3 py-1.5 text-sm font-bold text-blue-500 shadow-sm transition hover:bg-white/90 dark:bg-purple-900/40 dark:text-purple-200 dark:hover:bg-purple-900/60"
        >
          <span>search</span>
          <kbd className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[11px] text-blue-600 dark:bg-purple-950/60 dark:text-purple-200">
            ⌘K
          </kbd>
        </button>

        <div className="space-y-4">
          {navSections.map((section) => (
            <div key={section.label} className="space-y-2">
              <SectionLabelText label={section.label} />

              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = item.isActive(location.pathname);

                  return (
                    <div
                      key={item.label}
                      className="flex items-center justify-center gap-2"
                    >
                      <img
                        className="h-4 w-4"
                        src={item.icon}
                        alt=""
                        aria-hidden="true"
                        width="16"
                        height="16"
                      />
                      <Link
                        aria-current={active ? "page" : undefined}
                        className={`text-center text-sm font-bold hover:animate-wiggle hover:underline ${
                          active
                            ? "text-blue-700 dark:text-purple-100"
                            : "text-blue-500 dark:text-purple-200"
                        }`}
                        to={item.to}
                      >
                        {active ? `[${item.label}]` : item.label}
                      </Link>
                      <img
                        className="h-4 w-4"
                        src={item.icon}
                        alt=""
                        aria-hidden="true"
                        width="16"
                        height="16"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </aside>
  );
};

export default Navigation;
