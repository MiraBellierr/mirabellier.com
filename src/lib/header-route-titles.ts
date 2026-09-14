/**
 * Route path -> human title, shared by the Header band and the command
 * palette's static page list.
 *
 * Lives here rather than in `parts/Header.tsx` because that file is a React
 * component module: exporting a data constant from it trips
 * `react-refresh/only-export-components`, which requires component files to
 * export only components. `links.ts` / `projects.ts` / `uses.ts` follow the
 * same pattern.
 */
export type HeaderRouteTitle = {
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
