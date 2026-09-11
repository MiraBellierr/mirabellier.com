import { useEffect, useState } from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";

import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { API_BASE } from "@/lib/config";

import cursor from "../assets/icons/cursor-24.webp";
import discordLoginIcon from "../assets/icons/discord-login-24.webp";
import settingsIcon from "../assets/icons/img4-24.webp";
import DarkToggle from "../components/DarkToggle";
import DiscordLoginLink from "../components/DiscordLoginLink";
import { useCursor } from "../states/CursorContext";

type HeaderRouteTitle = {
  path: string;
  title: string;
};

export const HEADER_ROUTE_TITLES: HeaderRouteTitle[] = [
  { path: "/", title: "Home" },
  { path: "/home", title: "Home" },
  { path: "/about", title: "About" },
  { path: "/projects", title: "Projects" },
  { path: "/stats", title: "Site Stats" },
  { path: "/anime", title: "Anime" },
  { path: "/fanart", title: "Fan Art Search" },
  { path: "/shrine", title: "Shrine" },
  { path: "/shrine/kanna", title: "Kanna Shrine" },
  { path: "/shrine/rossina", title: "Rossina Shrine" },
  { path: "/shrine/:slug", title: "Character Shrine" },
  { path: "/blog", title: "Blog" },
  { path: "/blog/edit", title: "Blog Editor" },
  { path: "/blog/:slug", title: "Blog Post" },
  { path: "/quotes", title: "Quotes" },
  { path: "/question-of-the-day", title: "Question of the Day" },
  { path: "/question-of-the-day/archive", title: "Question Archive" },
  {
    path: "/question-of-the-day/archive/:recordedDate",
    title: "Question Archive Day",
  },
  { path: "/guestbook", title: "Guestbook" },
  { path: "/guestbook/sign", title: "Sign Guestbook" },
  { path: "/arena", title: "Arena" },
  { path: "/arena/fight", title: "Arena Fight" },
  { path: "/arena/fight/:id", title: "Arena Fight Replay" },
  { path: "/arena/shop", title: "Arena Shop" },
  { path: "/arena/inventory", title: "Arena Inventory" },
  { path: "/arena/inbox", title: "Arena Inbox" },
  { path: "/arena/leaderboard", title: "Arena Leaderboard" },
  { path: "/arena/spectate", title: "Arena Spectate" },
  { path: "/arena/spectate/:userId", title: "Arena Spectate" },
  { path: "/arena/collection", title: "Arena Collection" },
  { path: "/arena/archive", title: "Arena Archive" },
  { path: "/arena/market", title: "Arena Card Market" },
  { path: "/arena/skill-tree", title: "Arena Skill Tree" },
  { path: "/arena/trade", title: "Arena Card Trade" },
  { path: "/arena/tcg/decks", title: "TCG Decks" },
  { path: "/arena/tcg/match", title: "TCG Match" },
  { path: "/ar/tcg/decks", title: "TCG Decks" },
  { path: "/ar/tcg/match", title: "TCG Match" },
  { path: "/ar/archive", title: "Arena Archive" },
  { path: "/admin", title: "Admin Home" },
  { path: "/admin/arena-updates", title: "Arena Updates Admin" },
  { path: "/admin/arena-metrics", title: "Arena Metrics Admin" },
  { path: "/admin/question-of-the-day", title: "Admin Question of the Day" },
  { path: "/admin/shrines", title: "Admin Shrines" },
  { path: "/admin/shrines/preview", title: "Admin Shrine Preview" },
  { path: "/admin/pixies", title: "Admin Pixies" },
  { path: "/login", title: "Login" },
  { path: "/settings", title: "Settings" },
  { path: "/profile", title: "Profile" },
  { path: "/profile/:username", title: "Profile" },
  { path: "/pixies", title: "Pixies" },
  { path: "/pixies/upload", title: "Upload a Pixie" },
  { path: "/privacy", title: "Privacy Policy" },
  { path: "/terms", title: "Terms of Service" },
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

const menuLinkClass = (active: boolean) =>
  `block rounded-lg px-3 py-1.5 text-left text-sm font-bold transition hover:underline ${
    active
      ? "bg-blue-100 text-blue-700 dark:bg-purple-900/60 dark:text-purple-50"
      : "text-blue-500 dark:text-purple-200"
  }`;

function resolveHeaderTitle(pathname: string): string {
  for (const routeTitle of HEADER_ROUTE_TITLES) {
    if (matchPath({ path: routeTitle.path, end: true }, pathname)) {
      return routeTitle.title;
    }
  }

  return "Mirabellier";
}

type HeaderProps = {
  /**
   * The page's real subject (post title, character name, username, …). When
   * given it becomes the page `<h1>`; otherwise the route label is used.
   * Every page renders exactly one `<h1>` — this one — so in-page content
   * headings must start at `<h2>`.
   */
  title?: string | null;
  /**
   * Whether this header carries the page `<h1>`. Defaults to `true`. Pass
   * `false` when the page renders its own `<h1>` inside its main content (e.g.
   * a blog post shows its title above the byline); the band then labels the
   * route with a plain `<p>` so the page still has exactly one `<h1>`.
   */
  ownsPageHeading?: boolean;
};

const Header = ({ title, ownsPageHeading = true }: HeaderProps = {}) => {
  const auth = useOptionalAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { isCustomCursor, toggleCursor } = useCursor();
  const routeTitle = resolveHeaderTitle(location.pathname);
  const pageTitle = title?.trim() ? title.trim() : routeTitle;
  const avatarSrc = getAvatarSrc(auth?.user?.avatar);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    const mainElement = document.querySelector("main");
    if (!mainElement) {
      return;
    }

    if (mainElement.id !== "main-content") {
      mainElement.id = "main-content";
    }

    if (!mainElement.hasAttribute("tabindex")) {
      mainElement.setAttribute("tabindex", "-1");
    }
  }, [location.pathname]);

  useEffect(() => {
    setSettingsOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  return (
    <header className="site-display relative z-[999] flex flex-col items-center gap-2 border-b-2 border-blue-300 bg-blue-50 p-4 text-blue-600 shadow-sm sm:flex-row sm:justify-center dark:border-purple-500/30 dark:bg-gradient-to-r dark:from-purple-900/40 dark:to-pink-900/30 dark:text-purple-200">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:text-blue-700 focus:shadow-md dark:focus:bg-purple-950 dark:focus:text-purple-100"
      >
        Skip to main content
      </a>

      <div className="order-2 flex items-center gap-2 text-sm sm:absolute sm:right-4 sm:top-1/2 sm:order-none sm:-translate-y-1/2">
        <div className="relative">
          <button
            aria-expanded={settingsOpen}
            aria-label="Site settings"
            className="flex items-center gap-1.5 rounded-full bg-pink-100 px-3 py-1 text-sm font-bold text-blue-600 shadow-sm transition hover:animate-wiggle hover:bg-pink-200 dark:bg-purple-900/50 dark:text-purple-100 dark:hover:bg-purple-900/70"
            onClick={() => {
              setSettingsOpen((open) => !open);
              setAccountOpen(false);
            }}
            type="button"
          >
            <img
              className="h-4 w-4"
              src={settingsIcon}
              width="16"
              height="16"
              alt=""
              aria-hidden="true"
            />
            settings
          </button>

          {settingsOpen && (
            <div className="absolute right-0 top-full z-[999] mt-2 flex w-max flex-col gap-2 rounded-xl border border-blue-200 bg-white p-3 shadow-lg dark:border-purple-500/30 dark:bg-purple-950">
              <DarkToggle />

              <div className="flex items-center gap-1">
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
                  className="text-left text-sm font-bold text-blue-500 hover:underline dark:text-purple-200"
                  aria-label={`${isCustomCursor ? "Disable" : "Enable"} custom cursor`}
                  type="button"
                >
                  anya cursor {isCustomCursor ? "on" : "off"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          {auth?.user ? (
            <>
              <button
                aria-expanded={accountOpen}
                className="flex items-center gap-2 rounded-full bg-pink-100/50 px-2 py-1 text-sm font-bold text-blue-700 transition hover:animate-profile-hover dark:bg-purple-900/50 dark:text-purple-100"
                onClick={() => {
                  setAccountOpen((open) => !open);
                  setSettingsOpen(false);
                }}
                type="button"
              >
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={`${auth.user.username} avatar`}
                    className="h-7 w-7 rounded-full"
                    width="28"
                    height="28"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-200 text-xs uppercase text-blue-700 dark:bg-purple-800 dark:text-purple-100">
                    {auth.user.username.slice(0, 1)}
                  </div>
                )}
                <span className="hidden max-w-[8rem] truncate sm:inline">
                  {auth.user.username}
                </span>
              </button>

              {accountOpen && (
                <div className="absolute right-0 top-full z-[999] mt-2 flex w-max flex-col gap-1 rounded-xl border border-blue-200 bg-white p-2 shadow-lg dark:border-purple-500/30 dark:bg-purple-950">
                  <Link
                    aria-current={
                      location.pathname.startsWith("/profile")
                        ? "page"
                        : undefined
                    }
                    className={menuLinkClass(
                      location.pathname.startsWith("/profile"),
                    )}
                    to="/profile"
                  >
                    profile
                  </Link>
                  <Link
                    aria-current={
                      location.pathname === "/pixies/upload"
                        ? "page"
                        : undefined
                    }
                    className={menuLinkClass(
                      location.pathname === "/pixies/upload",
                    )}
                    to="/pixies/upload"
                  >
                    upload
                  </Link>
                  <Link
                    aria-current={
                      location.pathname === "/settings" ? "page" : undefined
                    }
                    className={menuLinkClass(location.pathname === "/settings")}
                    to="/settings"
                  >
                    settings
                  </Link>
                  <button
                    onClick={() => {
                      auth.logout();
                      navigate("/");
                    }}
                    className="block w-full rounded-lg px-3 py-1.5 text-left text-sm font-bold text-red-600 transition hover:underline dark:text-pink-300"
                    type="button"
                  >
                    logout
                  </button>
                </div>
              )}
            </>
          ) : (
            <DiscordLoginLink className="flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-600 shadow-sm transition hover:animate-wiggle hover:bg-blue-200 dark:bg-purple-900/50 dark:text-purple-100 dark:hover:bg-purple-900/70">
              <img
                className="h-4 w-4"
                src={discordLoginIcon}
                width="16"
                height="16"
                alt=""
                aria-hidden="true"
              />
              login
            </DiscordLoginLink>
          )}
        </div>
      </div>

      {ownsPageHeading ? (
        <h1 className="order-1 text-center text-3xl font-bold tracking-widest sm:order-none sm:text-4xl">
          {pageTitle}
        </h1>
      ) : (
        <p className="order-1 text-center text-3xl font-bold tracking-widest sm:order-none sm:text-4xl">
          {pageTitle}
        </p>
      )}
    </header>
  );
};

export default Header;
