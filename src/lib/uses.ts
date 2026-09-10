export type UsesItem = {
  name: string;
  detail?: string;
  url?: string;
};

export type UsesSection = {
  id: string;
  title: string;
  note?: string;
  items: UsesItem[];
};

// Bump when the list below changes; shown as "last updated" on the page.
export const USES_UPDATED = "2026-09-10";

export const usesSections: UsesSection[] = [
  {
    id: "site-frontend",
    title: "frontend",
    note: "One Vite single-page app. Routes are lazy-loaded; the rich-text editor stays behind a dynamic import so a first visit never downloads it.",
    items: [
      { name: "React 19 + TypeScript", detail: "strict mode, function components only" },
      { name: "Vite 7", detail: "dev server + production build, esbuild minify" },
      { name: "React Router 7", detail: "~60 client routes" },
      { name: "Tailwind CSS 3", detail: "with @tailwindcss/typography for post bodies" },
      {
        name: "Tiptap 3",
        detail: "the blog editor; lowlight + highlight.js for code blocks",
        url: "https://tiptap.dev",
      },
      { name: "Socket.IO client", detail: "live Arena fights and currently-watching anime" },
      { name: "web-vitals", detail: "real-user Core Web Vitals beaconed back to the API" },
    ],
  },
  {
    id: "site-backend",
    title: "backend",
    note: "A separate repo with its own CI. Plain Express, no ORM, no build step.",
    items: [
      { name: "Node.js + Express 5" },
      {
        name: "better-sqlite3",
        detail: "one SQLite file in WAL mode; the whole database",
        url: "https://github.com/WiseLibs/better-sqlite3",
      },
      { name: "Passport + Discord OAuth", detail: "the only sign-in method" },
      { name: "Helmet, express-rate-limit, CORS allow-list", detail: "the security middle layer" },
      { name: "sharp", detail: "renders the per-page share/OG images" },
      { name: "Cloudflare Turnstile", detail: "human check before sensitive actions" },
    ],
  },
  {
    id: "hosting-deploy",
    title: "hosting & deploy",
    note: "The part I am most happy with. No containers, no Kubernetes, just one box and a symlink.",
    items: [
      { name: "One VPS", detail: "nginx serves the static build and proxy_passes the API" },
      { name: "Cloudflare", detail: "DNS, TLS, and caching in front" },
      { name: "pm2", detail: "keeps the API process up and reloads it on deploy" },
      {
        name: "GitHub Actions",
        detail:
          "lint + node --test on every push; on main it ships an atomic release",
      },
      {
        name: "Atomic symlink releases",
        detail:
          "upload to releases/<commit-sha>/, flip current with one rename(2), health-check, auto-rollback, keep the last 5",
      },
    ],
  },
  {
    id: "type-and-theme",
    title: "type & theme",
    items: [
      {
        name: "Fredoka",
        detail: "display face for headings and the logo",
        url: "https://fonts.google.com/specimen/Fredoka",
      },
      {
        name: "Quicksand",
        detail: "body face",
        url: "https://fonts.google.com/specimen/Quicksand",
      },
      { name: "Self-hosted woff2", detail: "Latin subset only, font-display: swap, preloaded" },
      { name: "Pastel-blue palette", detail: "light and dark, following prefers-color-scheme with a manual toggle" },
    ],
  },
  {
    id: "tooling",
    title: "tooling",
    items: [
      { name: "ESLint 10" },
      { name: "node --test", detail: "the built-in runner, no Jest or Vitest" },
      { name: "Prettier defaults", detail: "2-space, double quotes, trailing commas" },
    ],
  },
  {
    id: "desk",
    title: "desk",
    // TODO(mira): fill in your editor, keyboard, and anything else you want here.
    items: [
      { name: "Windows 11" },
      { name: "PowerShell + Git Bash" },
    ],
  },
];

export const usesItemCount = usesSections.reduce(
  (count, section) => count + section.items.length,
  0,
);
