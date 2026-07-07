import { useEffect } from "react";
import { matchPath, useLocation } from "react-router-dom";

type HeaderRouteTitle = {
  path: string;
  title: string;
};

const HEADER_ROUTE_TITLES: HeaderRouteTitle[] = [
  { path: "/", title: "Home" },
  { path: "/home", title: "Home" },
  { path: "/about", title: "About" },
  { path: "/projects", title: "Projects" },
  { path: "/anime", title: "Anime" },
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
  { path: "/arena/shop", title: "Arena Shop" },
  { path: "/arena/inventory", title: "Arena Inventory" },
  { path: "/arena/inbox", title: "Arena Inbox" },
  { path: "/arena/leaderboard", title: "Arena Leaderboard" },
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
  { path: "/login", title: "Login" },
  { path: "/settings", title: "Settings" },
  { path: "/profile", title: "Profile" },
  { path: "/profile/:username", title: "Profile" },
  { path: "/privacy", title: "Privacy Policy" },
  { path: "/terms", title: "Terms of Service" },
];

function resolveHeaderTitle(pathname: string): string {
  for (const routeTitle of HEADER_ROUTE_TITLES) {
    if (matchPath({ path: routeTitle.path, end: true }, pathname)) {
      return routeTitle.title;
    }
  }

  return "Mirabellier";
}

const Header = () => {
  const location = useLocation();
  const pageTitle = resolveHeaderTitle(location.pathname);

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

  return (
    <header className="site-display relative flex items-center justify-center border-b-2 border-blue-300 bg-blue-50 p-4 text-4xl font-bold text-blue-600 shadow-sm dark:border-purple-500/30 dark:bg-gradient-to-r dark:from-purple-900/40 dark:to-pink-900/30 dark:text-purple-200">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:text-blue-700 focus:shadow-md dark:focus:bg-purple-950 dark:focus:text-purple-100"
      >
        Skip to main content
      </a>
      <h1 className="text-center tracking-widest">{pageTitle}</h1>
    </header>
  );
};

export default Header;
