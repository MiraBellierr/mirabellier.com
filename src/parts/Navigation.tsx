import { useEffect, useRef, useState, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { openCommandPalette } from "@/lib/command-palette";
import { API_BASE } from "@/lib/config";

import home from "../assets/icons/img1-24.webp";
import about from "../assets/icons/img2-24.webp";
import blog from "../assets/icons/img3-24.webp";
import projects from "../assets/icons/img4-24.webp";
import guestbook from "../assets/icons/cats-24.webp";
import cursor from "../assets/icons/cursor-24.webp";
import DarkToggle from "../components/DarkToggle";
import { useCursor } from "../states/CursorContext";

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
const NAV_ICON_TWITCH =
  "https://static.twitchcdn.net/assets/favicon-32-d6025c14e900565d6177.png";

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
        icon: NAV_ICON_TWITCH,
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

function getAvatarSrc(avatar?: string | null) {
  if (!avatar) {
    return null;
  }

  if (avatar.startsWith("blob:") || /^https?:\/\//.test(avatar)) {
    return avatar;
  }

  const base = API_BASE.replace(/\/$/, "");
  return `${base}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
}

const accountLinkClass = (active: boolean) =>
  `block rounded-full px-3 py-1 text-center text-sm font-bold transition hover:underline ${
    active
      ? "bg-white/80 text-blue-700 shadow-sm dark:bg-purple-900/60 dark:text-purple-50"
      : "text-blue-500 dark:text-purple-200"
  }`;

const SectionLabelText = ({ label }: { label: string }) => (
  <div className="text-center font-mono text-[11px] uppercase tracking-[0.24em] text-blue-400 dark:text-purple-300/80">
    -- <span className="font-bold">{label}</span> --
  </div>
);

// Matches `.left-side-rail`'s `top: 1rem` (index.css) — the offset at which
// the rail's native `position: sticky` catches at the top of the viewport.
const RAIL_TOP_OFFSET_PX = 16;
const RAIL_STICKY_BREAKPOINT = "(min-width: 1024px)";

/**
 * On a page whose nav is taller than the viewport, plain `position: sticky`
 * pins the rail at the top and never reveals the rest of it — the bottom
 * links stay off-screen until the reader hits the very end of the (often much
 * taller) main content column. This nudges the sticky rail up by exactly as
 * much as the page scrolls, once it's caught at the top, until its bottom
 * comes into view — then leaves it flush there — and reverses the same way
 * on the way back up.
 */
function useRevealStickyRail(railRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const aside = railRef.current;
    const rail = aside?.parentElement;
    if (!rail) return;

    const mediaQuery = window.matchMedia(RAIL_STICKY_BREAKPOINT);
    let translateY = 0;
    let lastScrollY = window.scrollY;
    let frame = 0;

    const reset = () => {
      translateY = 0;
      rail.style.transform = "";
    };

    const update = () => {
      frame = 0;

      if (!mediaQuery.matches) {
        reset();
        lastScrollY = window.scrollY;
        return;
      }

      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollY;
      lastScrollY = currentScrollY;

      // Back out our own transform to get the rail's native sticky-computed
      // top, so we only start nudging once the browser has actually caught
      // it at the top edge (otherwise it'd jump early, before it's stuck).
      const nativeTop = rail.getBoundingClientRect().top - translateY;
      if (nativeTop > RAIL_TOP_OFFSET_PX + 0.5) {
        reset();
        return;
      }

      const minTranslateY = Math.min(
        0,
        window.innerHeight - RAIL_TOP_OFFSET_PX - rail.offsetHeight,
      );
      translateY = Math.min(0, Math.max(minTranslateY, translateY - delta));
      rail.style.transform = translateY ? `translateY(${translateY}px)` : "";
    };

    const onScrollOrResize = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (frame) cancelAnimationFrame(frame);
      reset();
    };
  }, [railRef]);
}

const Navigation = () => {
  const auth = useOptionalAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { isCustomCursor, toggleCursor } = useCursor();
  const avatarSrc = getAvatarSrc(auth?.user?.avatar);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  const activeNavItem = navSections
    .flatMap((section) => section.items)
    .find((item) => item.isActive(location.pathname));

  useEffect(() => {
    setMobileNavOpen(false);
    setAccountMenuOpen(false);
  }, [location.pathname]);

  useRevealStickyRail(asideRef);

  return (
    <aside
      ref={asideRef}
      className="site-display nav-shell mb-auto w-full overflow-hidden rounded-xl border border-blue-300 bg-blue-100 shadow-md opacity-90"
    >
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

          <div className="space-y-2">
            <SectionLabelText label="settings" />

            <div className="flex justify-center">
              <DarkToggle />
            </div>

            <div className="flex items-center justify-center space-x-1">
              <img
                className="h-4 w-4"
                src={cursor}
                width="16"
                height="16"
                alt=""
                aria-hidden="true"
              />
              <button
                onClick={toggleCursor}
                className="text-center text-sm font-bold text-blue-500 hover:underline dark:text-purple-200"
                aria-label={`${isCustomCursor ? "Disable" : "Enable"} custom cursor`}
                type="button"
              >
                {isCustomCursor ? (
                  <>
                    <span className="hidden sm:inline">anya cursor</span> on
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">anya cursor</span> off
                  </>
                )}
              </button>
              {!isCustomCursor && (
                <span className="ml-2 animate-pulse text-xs font-semibold text-blue-600 dark:text-purple-200">
                  click here
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabelText label="account" />

            {auth?.user ? (
              <>
                <button
                  aria-expanded={accountMenuOpen}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-100/50 px-3 py-2 text-sm font-bold text-blue-700 transition hover:animate-profile-hover dark:bg-purple-900/50 dark:text-purple-100"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  type="button"
                >
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={`${auth.user.username} avatar`}
                      className="h-8 w-8 rounded-full"
                      width="32"
                      height="32"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-200 text-xs uppercase text-blue-700 dark:bg-purple-800 dark:text-purple-100">
                      {auth.user.username.slice(0, 1)}
                    </div>
                  )}
                  <span className="truncate">{auth.user.username}</span>
                </button>

                {accountMenuOpen && (
                  <div className="space-y-1">
                    <Link
                      aria-current={
                        location.pathname.startsWith("/profile")
                          ? "page"
                          : undefined
                      }
                      className={accountLinkClass(
                        location.pathname.startsWith("/profile"),
                      )}
                      to="/profile"
                    >
                      {location.pathname.startsWith("/profile")
                        ? "[profile]"
                        : "profile"}
                    </Link>
                    <Link
                      aria-current={
                        location.pathname === "/pixies/upload"
                          ? "page"
                          : undefined
                      }
                      className={accountLinkClass(
                        location.pathname === "/pixies/upload",
                      )}
                      to="/pixies/upload"
                    >
                      {location.pathname === "/pixies/upload"
                        ? "[upload]"
                        : "upload"}
                    </Link>
                    <Link
                      aria-current={
                        location.pathname === "/settings" ? "page" : undefined
                      }
                      className={accountLinkClass(location.pathname === "/settings")}
                      to="/settings"
                    >
                      {location.pathname === "/settings"
                        ? "[settings]"
                        : "settings"}
                    </Link>
                    <button
                      onClick={() => {
                        auth.logout();
                        navigate("/");
                      }}
                      className="block w-full rounded-full px-3 py-1 text-center text-sm font-bold text-red-600 transition hover:underline dark:text-pink-300"
                      type="button"
                    >
                      logout
                    </button>
                  </div>
                )}
              </>
            ) : (
              <Link
                aria-current={location.pathname === "/login" ? "page" : undefined}
                className={accountLinkClass(location.pathname === "/login")}
                to="/login"
              >
                {location.pathname === "/login" ? "[login]" : "login"}
              </Link>
            )}
          </div>
        </div>
      </nav>
    </aside>
  );
};

export default Navigation;
