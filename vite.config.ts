import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import type { OutputBundle } from "rollup";
import { routeSeoPlugin, type RouteSeo } from "./vite-plugin-route-seo";

const SITE_URL = "https://mirabellier.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.jpg`;

// Where the build-time blog-post fetch reads from. Mirrors the default in
// `generate-sitemap.cjs` and `src/lib/config.ts`.
const API_BASE = (
  process.env.VITE_API_BASE || "https://api.mirabellier.com/v1"
).replace(/\/+$/, "");

const ARENA_DESCRIPTION =
  "Draw up to ten character cards a day, grow their IV stats and affinities, then battle through fights, the shop, the market, trading, and the leaderboard.";

const ARENA_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Character Card Arena Hub",
  description: ARENA_DESCRIPTION,
  url: `${SITE_URL}/arena`,
  isPartOf: {
    "@type": "WebSite",
    name: "Mirabellier",
    url: SITE_URL,
  },
};

const breadcrumbList = (items: Array<{ name: string; url: string }>) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: item.url,
  })),
});

const collectionPageJsonLd = (name: string, description: string, url: string) => ({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name,
  description,
  url,
  isPartOf: { "@type": "WebSite", name: "Mirabellier", url: SITE_URL },
});

// Client-only SPA routes that get a static, crawler-visible head so links
// unfurl with a route-specific card in Discord/Slack/iMessage/Twitter AND a
// no-JS crawler fetching the canonical URL sees a real title/description
// instead of the generic site card. Per-blog-post heads are added on top of
// this list at build time — see `blogPostSeoRoutes()` below.
const SEO_ROUTES: RouteSeo[] = [
  {
    path: "/arena",
    title: "Character Card Arena ⚔️ | Mirabellier",
    description: ARENA_DESCRIPTION,
    structuredData: ARENA_STRUCTURED_DATA,
  },
  {
    path: "/ar",
    title: "Character Card Arena ⚔️ | Mirabellier",
    description: ARENA_DESCRIPTION,
    url: `${SITE_URL}/arena`,
    structuredData: ARENA_STRUCTURED_DATA,
  },
  {
    path: "/now",
    title: "Now | Mirabellier",
    description:
      "What Mirabellier is focused on right now: reading, watching, building, and listening. A /now page in the nownownow.com sense.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      name: "Now | Mirabellier",
      description:
        "What Mirabellier is focused on right now: reading, watching, building, and listening.",
      url: `${SITE_URL}/now`,
    },
  },
  {
    path: "/changelog",
    title: "Changelog | Mirabellier",
    description:
      "Notable changes and new features shipped to mirabellier.com, newest first.",
    structuredData: collectionPageJsonLd(
      "Changelog",
      "Notable changes and new features shipped to mirabellier.com, newest first.",
      `${SITE_URL}/changelog`,
    ),
  },
  {
    path: "/uses",
    title: "Uses | Mirabellier",
    description:
      "A colophon for mirabellier.com: the stack, fonts, hosting, and the atomic-symlink deploy that runs the site.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Uses | Mirabellier",
      description:
        "A colophon for mirabellier.com: the stack, fonts, hosting, and the atomic-symlink deploy that runs the site.",
      url: `${SITE_URL}/uses`,
      isPartOf: { "@type": "WebSite", name: "Mirabellier", url: SITE_URL },
    },
  },
  {
    path: "/links",
    title: "Links | Mirabellier",
    description:
      "A blogroll for mirabellier.com: personal sites I read, friends' corners of the web, and the small-web directories worth browsing.",
    structuredData: collectionPageJsonLd(
      "Links",
      "A blogroll for mirabellier.com: personal sites I read, friends' corners of the web, and the small-web directories worth browsing.",
      `${SITE_URL}/links`,
    ),
  },
  {
    path: "/stats",
    title: "Stats | Mirabellier",
    description:
      "Sitewide numbers for mirabellier.com: posts written, guestbook signatures, Question of the Day answers, Arena fights, and more.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Stats | Mirabellier",
      description:
        "Sitewide numbers for mirabellier.com: posts written, guestbook signatures, Question of the Day answers, Arena fights, and more.",
      url: `${SITE_URL}/stats`,
      isPartOf: { "@type": "WebSite", name: "Mirabellier", url: SITE_URL },
    },
  },
  {
    path: "/blog",
    title: "Blog | Mirabellier",
    description: "Personal blog with thoughts, stories, and updates.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Mirabellier Blog",
      description: "Personal blog with thoughts, stories, and updates.",
      url: `${SITE_URL}/blog`,
      author: { "@type": "Person", name: "Mirabellier" },
    },
  },
  {
    path: "/quotes",
    title: "Quotes | Mirabellier",
    description: "Daily quotes across love, art, nature, humor, and more.",
    structuredData: collectionPageJsonLd(
      "Quotes",
      "Daily quotes across love, art, nature, humor, and more.",
      `${SITE_URL}/quotes`,
    ),
  },
  {
    path: "/question-of-the-day",
    title: "Question of the Day | Mirabellier",
    description:
      "Answer one public question each UTC day, then browse the archive of past prompts and answers.",
    structuredData: collectionPageJsonLd(
      "Question of the Day",
      "Answer one public question each UTC day, then browse the archive of past prompts and answers.",
      `${SITE_URL}/question-of-the-day`,
    ),
  },
  {
    path: "/anime",
    title: "Currently Watching | Mirabellier",
    description:
      "A live currently-watching anime page synced from MyAnimeList on a short backend refresh window.",
    structuredData: collectionPageJsonLd(
      "Currently Watching Anime",
      "A live currently-watching anime page synced from MyAnimeList on a short backend refresh window.",
      `${SITE_URL}/anime`,
    ),
  },
  {
    path: "/fanart",
    title: "Fan Art Search | Mirabellier",
    description:
      "Search anime fan art across Safebooru and Pixiv, with links back to each artist's original post.",
    structuredData: collectionPageJsonLd(
      "Fan Art Search",
      "Search anime fan art across Safebooru and Pixiv, with links back to each artist's original post.",
      `${SITE_URL}/fanart`,
    ),
  },
  {
    path: "/pixies",
    title: "Pixies | Mirabellier",
    description: "Short videos and clips from the community.",
    image: `${SITE_URL}/pixies.webp`,
    structuredData: collectionPageJsonLd(
      "Pixies",
      "Short videos and clips from the community.",
      `${SITE_URL}/pixies`,
    ),
  },
  {
    path: "/shrine",
    title: "Character Shrines | Mirabellier",
    description:
      "A directory for Mirabellier character shrine pages, each one a long-form room for a favorite character.",
    structuredData: {
      ...collectionPageJsonLd(
        "Character Shrines",
        "A directory for Mirabellier character shrine pages, each one a long-form room for a favorite character.",
        `${SITE_URL}/shrine`,
      ),
      breadcrumb: breadcrumbList([
        { name: "Home", url: `${SITE_URL}/` },
        { name: "Shrines", url: `${SITE_URL}/shrine` },
      ]),
    },
  },
  // NOTE: individual shrine rooms (/shrine/kana, /shrine/rimuru, ...) are
  // DB-backed and proxied to the backend, which emits their crawler HTML with
  // breadcrumbs. They are intentionally absent here: a build-time list goes
  // stale the moment a room is created or renamed (this file still had the
  // retired kanna/rossina pair).
  {
    path: "/about",
    title: "About Mirabellier",
    description: "Full Stack Developer with 3 years of experience in React and NodeJS",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "About Mirabellier",
      description:
        "Full Stack Developer with 3 years of experience in React and NodeJS",
      url: `${SITE_URL}/about`,
      mainEntity: {
        "@type": "Person",
        name: "Mirabellier",
        jobTitle: "Full Stack Developer",
        knowsAbout: [
          "JavaScript",
          "NodeJS",
          "TypeScript",
          "React",
          "React Native",
        ],
        url: SITE_URL,
        sameAs: [
          "https://github.com/MiraBellierr",
          "https://www.patreon.com/c/jasminebot/",
          "https://ko-fi.com/mirabellier",
        ],
      },
    },
  },
  {
    path: "/projects",
    title: "Projects | Mirabellier",
    // Mirrors `PROJECTS_DESCRIPTION` in src/pages/Projects.tsx
    // (projectCount=10, stackTags=20). Keep in sync when projects change.
    description:
      "Portfolio-style list of 10 public projects across 20 stack tags, including web apps, APIs, bots, and mobile builds by Mirabellier.",
    image: `${SITE_URL}/kanna-kobayashi-poster.webp`,
    structuredData: collectionPageJsonLd(
      "Mirabellier Projects",
      "Portfolio-style list of 10 public projects across 20 stack tags, including web apps, APIs, bots, and mobile builds by Mirabellier.",
      `${SITE_URL}/projects`,
    ),
  },
  {
    path: "/twitch",
    title: "Twitch Stream Predictions | Mirabellier",
    description:
      "When will the streamers we follow go live? A small statistical model predicts the next Twitch stream from each channel's history.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Twitch Stream Predictions",
      description:
        "When will the streamers we follow go live? A small statistical model predicts the next Twitch stream from each channel's history.",
      url: `${SITE_URL}/twitch`,
    },
  },
  {
    path: "/guestbook",
    title: "Guestbook Board | Mirabellier",
    description:
      "A draggable board full of pinned guestbook notes from visitors.",
    structuredData: collectionPageJsonLd(
      "Mirabellier Guestbook Board",
      "A draggable board full of pinned guestbook notes from visitors.",
      `${SITE_URL}/guestbook`,
    ),
  },
  {
    path: "/privacy",
    title: "Privacy Policy | Mirabellier.com",
    description:
      "How Mirabellier.com collects, uses, shares, stores, and protects information when you visit the website.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Privacy Policy",
      description:
        "How Mirabellier.com collects, uses, shares, stores, and protects information when you visit the website.",
      url: `${SITE_URL}/privacy`,
      isPartOf: { "@type": "WebSite", name: "Mirabellier.com", url: SITE_URL },
    },
  },
  {
    path: "/terms",
    title: "Terms of Service | Mirabellier.com",
    description:
      "The rules and conditions for visiting mirabellier.com, creating an account, publishing content, and using interactive features.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Terms of Service",
      description:
        "The rules and conditions for visiting mirabellier.com, creating an account, publishing content, and using interactive features.",
      url: `${SITE_URL}/terms`,
      isPartOf: { "@type": "WebSite", name: "Mirabellier.com", url: SITE_URL },
    },
  },
  {
    path: "/arena/skill-tree",
    title: "Arena Skill Tree | Mirabellier",
    description:
      "Spend arena level-up points across offense, defense, and utility skills.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Skill Tree",
      description:
        "Spend arena level-up points across offense, defense, and utility skills.",
      url: `${SITE_URL}/arena/skill-tree`,
      isPartOf: {
        "@type": "WebSite",
        name: "Mirabellier",
        url: SITE_URL,
      },
    },
  },
  {
    path: "/ar/skill-tree",
    title: "Arena Skill Tree | Mirabellier",
    description:
      "Spend arena level-up points across offense, defense, and utility skills.",
    url: `${SITE_URL}/arena/skill-tree`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Skill Tree",
      description:
        "Spend arena level-up points across offense, defense, and utility skills.",
      url: `${SITE_URL}/arena/skill-tree`,
      isPartOf: {
        "@type": "WebSite",
        name: "Mirabellier",
        url: SITE_URL,
      },
    },
  },
  {
    path: "/question-of-the-day/archive",
    title: "Question of the Day Archive | Mirabellier",
    description:
      "Browse previous question-of-the-day prompts and all public answers.",
    structuredData: collectionPageJsonLd(
      "Mirabellier Question of the Day Archive",
      "Browse previous question-of-the-day prompts and all public answers.",
      `${SITE_URL}/question-of-the-day/archive`,
    ),
  },
  // Private / thin routes. `usePageSeo` also sets robots at runtime, but a
  // crawler that does not run the bundle only sees the static head, so the
  // override is baked in here too.
  ...(
    [
      {
        path: "/login",
        title: "Log In | Mirabellier",
        description: "Sign in to Mirabellier with Discord.",
      },
      {
        path: "/settings",
        title: "Settings | Mirabellier",
        description: "Account settings and preferences.",
      },
      {
        path: "/blog/edit",
        title: "Blog Editor | Mirabellier",
        description: "Create or edit a blog post.",
      },
      {
        path: "/pixies/upload",
        title: "Upload a Pixie | Mirabellier",
        description: "Share a short video clip with the Mirabellier community.",
      },
      {
        path: "/auth/callback",
        title: "Signing In | Mirabellier",
        description: "Completing the sign-in flow.",
      },
    ] as const
  ).map((route) => ({ ...route, robots: "noindex,follow" })),
];

// ---------------------------------------------------------------------------
// Per-published-post SEO heads, resolved at build time.
//
// The app swaps `<title>`/OG tags at runtime via `usePageSeo`, so a no-JS
// crawler that fetches the canonical `mirabellier.com/blog/<slug>` gets the
// generic site card and an empty body. We fetch the published-post list once
// during `vite build` (same endpoint `generate-sitemap.cjs` uses) and emit a
// real head + `BlogPosting` JSON-LD per post. A failed/slow/offline fetch is
// swallowed by the plugin — those URLs just keep today's generic head.
// ---------------------------------------------------------------------------

type ApiPost = {
  id: string | number;
  title?: string;
  shortDescription?: string | null;
  thumbnail?: string | null;
  tags?: string[];
  content?: unknown;
  createdAt?: string;
  updatedAt?: string | null;
  author?: string;
  userId?: string | null;
};

function slugifyTitle(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function blogPathFor(post: ApiPost): string {
  const slug = slugifyTitle(post.title || "");
  return `/blog/${slug ? `${slug}-${post.id}` : post.id}`;
}

// Mirrors the tiptap-JSON walker in `routes/posts.js` / `blog-utils.ts`.
function extractPlainText(node: unknown): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractPlainText).join(" ");
  if (typeof node === "string") return node;
  if (typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown };
  if (n.type === "text") return n.text || "";
  if (n.content) return extractPlainText(n.content);
  return "";
}

function postDescription(post: ApiPost): string {
  const short = (post.shortDescription || "").trim();
  if (short) return short;
  const body = extractPlainText(post.content).replace(/\s+/g, " ").trim();
  if (body) return body.slice(0, 160);
  return post.title || "Untitled";
}

function resolvePostImage(thumbnail?: string | null): string {
  if (!thumbnail) return DEFAULT_OG_IMAGE;
  if (/^https?:\/\//i.test(thumbnail)) return thumbnail;
  if (thumbnail.startsWith("/")) return `${API_BASE}${thumbnail}`;
  if (thumbnail.includes("/")) return `${API_BASE}/${thumbnail}`;
  return `${API_BASE}/images/${thumbnail}`;
}

// The API sits behind Cloudflare, which answers a bot challenge (HTTP 403,
// "Just a moment...") to CI runner IPs — inconsistently, and to both this
// plugin and generate-sitemap.cjs. A couple of retries get through in practice;
// the plugin's dynamicRouteSources wrapper turns a permanent failure into a
// warning so the build still succeeds.
const BUILD_FETCH_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mirabellier-Sitemap/1.0 (+https://mirabellier.com)",
};

const BUILD_FETCH_ATTEMPTS = 3;
const BUILD_FETCH_RETRY_DELAY_MS = 1500;

async function fetchApiJson(path: string): Promise<unknown> {
  let lastError: Error = new Error(`No attempts made for ${path}`);

  for (let attempt = 1; attempt <= BUILD_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: BUILD_FETCH_HEADERS,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`GET ${API_BASE}${path} -> HTTP ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      lastError = error as Error;
      if (attempt < BUILD_FETCH_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, BUILD_FETCH_RETRY_DELAY_MS * attempt),
        );
      }
    }
  }

  throw lastError;
}

async function blogPostSeoRoutes(): Promise<RouteSeo[]> {
  if (process.env.SKIP_BLOG_SEO_PRERENDER === "1") return [];

  const posts = (await fetchApiJson("/posts")) as ApiPost[];
  if (!Array.isArray(posts)) {
    throw new Error(`GET ${API_BASE}/posts -> not an array`);
  }

  return posts
    .filter((post) => post && post.id != null && post.title)
    .map((post) => {
      const path = blogPathFor(post);
      const url = `${SITE_URL}${path}`;
      const title = `${post.title} | Mirabellier`;
      const description = postDescription(post);
      const image = resolvePostImage(post.thumbnail);
      const published = post.createdAt || undefined;
      const modified = post.updatedAt || post.createdAt || undefined;

      return {
        path,
        title,
        description,
        url,
        image,
        ogType: "article",
        structuredData: {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description,
          url,
          mainEntityOfPage: url,
          ...(published ? { datePublished: published } : {}),
          ...(modified ? { dateModified: modified } : {}),
          author: {
            "@type": "Person",
            name: post.author || "Mirabellier",
          },
          publisher: {
            "@type": "Person",
            name: "Mirabellier",
            url: `${SITE_URL}/`,
          },
          image: [image],
          ...(post.tags && post.tags.length
            ? { keywords: post.tags.join(", ") }
            : {}),
          breadcrumb: breadcrumbList([
            { name: "Home", url: `${SITE_URL}/` },
            { name: "Blog", url: `${SITE_URL}/blog` },
            { name: post.title || "Untitled", url },
          ]),
        },
      } satisfies RouteSeo;
    });
}

// ---------------------------------------------------------------------------
// Per-day QOTD archive heads, resolved at build time.
//
// The 69+ `/question-of-the-day/archive/<date>` URLs are all in the sitemap,
// but without this they served the generic homepage head (canonical `/`), so
// Google discarded the whole archive. Each dated page gets a real prompt-derived
// title/description plus a `CollectionPage` node. A failed fetch is swallowed by
// the plugin and those paths keep the generic head, so the archive never breaks
// the build.
// ---------------------------------------------------------------------------

type ApiArchiveDay = {
  recordedDate?: string;
  prompt?: string;
  answerCount?: number;
  updatedAt?: string | null;
  createdAt?: string;
};

function truncateDescription(value: string, max = 160): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

async function questionArchiveSeoRoutes(): Promise<RouteSeo[]> {
  if (process.env.SKIP_BLOG_SEO_PRERENDER === "1") return [];

  const days = (await fetchApiJson(
    "/question-of-the-day/archive",
  )) as ApiArchiveDay[];
  if (!Array.isArray(days)) {
    throw new Error(
      `GET ${API_BASE}/question-of-the-day/archive -> not an array`,
    );
  }

  return days
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day?.recordedDate || ""))
    .map((day) => {
      const recordedDate = day.recordedDate as string;
      const prompt =
        (day.prompt || "").trim() || "Question of the Day";
      const path = `/question-of-the-day/archive/${recordedDate}`;
      const url = `${SITE_URL}${path}`;
      const title = `${prompt} | Question of the Day`;
      const description = truncateDescription(
        `An archived question of the day from ${recordedDate}: "${prompt}"`,
      );

      return {
        path,
        title,
        description,
        url,
        structuredData: {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: title,
          description,
          url,
          isPartOf: {
            "@type": "WebSite",
            name: "Mirabellier",
            url: SITE_URL,
          },
          breadcrumb: breadcrumbList([
            { name: "Home", url: `${SITE_URL}/` },
            { name: "Question of the Day", url: `${SITE_URL}/question-of-the-day` },
            { name: "Archive", url: `${SITE_URL}/question-of-the-day/archive` },
            { name: recordedDate, url },
          ]),
        },
      } satisfies RouteSeo;
    });
}

const JS_CHUNK_BUDGET_KB = 450;
// Route-split CSS chunks (blog, guestbook, arena, simple-editor, …) should
// stay lean.
const CSS_ASSET_BUDGET_KB = 100;
// The global `index-*.css` also carries Tailwind's base + utilities + the
// `@tailwindcss/typography` `.prose` set (~105 kB minified, shared by every
// route and not code-splittable) on top of ~21 kB of genuinely-global custom
// CSS. The ceiling here is to catch a *regression* — a route stylesheet
// leaking into the global bundle — not to chase the Tailwind floor.
const INDEX_CSS_BUDGET_KB = 135;

function normalizedChunkPath(id: string) {
  return id.replace(/\\/g, "/");
}

function bundleBudgetPlugin(): Plugin {
  return {
    name: "bundle-budget",
    apply: "build",
    generateBundle(_options: unknown, bundle: OutputBundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === "chunk") {
          const sizeKb = Buffer.byteLength(output.code, "utf8") / 1024;
          if (sizeKb > JS_CHUNK_BUDGET_KB) {
            this.warn(
              `[bundle-budget] JS chunk "${fileName}" is ${sizeKb.toFixed(1)}kB (budget: ${JS_CHUNK_BUDGET_KB}kB).`,
            );
          }
          continue;
        }

        if (output.type === "asset" && fileName.endsWith(".css")) {
          const source =
            typeof output.source === "string"
              ? output.source
              : Buffer.from(output.source).toString("utf8");
          const sizeKb = Buffer.byteLength(source, "utf8") / 1024;
          const isIndexCss = /(^|\/)index-[^/]*\.css$/.test(fileName);
          const budget = isIndexCss
            ? INDEX_CSS_BUDGET_KB
            : CSS_ASSET_BUDGET_KB;
          if (sizeKb > budget) {
            this.warn(
              `[bundle-budget] CSS asset "${fileName}" is ${sizeKb.toFixed(1)}kB (budget: ${budget}kB).`,
            );
          }
        }
      }
    },
  };
}

// Fails the build if the entry chunk statically pulls in the editor stack
// (tiptap / prosemirror / simple-editor). Those must stay behind BlogEdit's
// dynamic import() so a logged-out visitor on the homepage never downloads
// ~243 kB gzip of editor code. Regressed once already via a manualChunks
// rule that force-assigned BlogEdit.tsx (see the simple-editor rule below).
function entryChunkPurityPlugin(): Plugin {
  const FORBIDDEN = /(tiptap|prosemirror|simple-editor)/;
  return {
    name: "entry-chunk-purity",
    apply: "build",
    generateBundle(_options: unknown, bundle: OutputBundle) {
      const seen = new Set<string>();
      const offenders = new Set<string>();
      const walk = (fileName: string) => {
        if (seen.has(fileName)) return;
        seen.add(fileName);
        const output = bundle[fileName];
        if (!output || output.type !== "chunk") return;
        for (const imported of output.imports) {
          if (FORBIDDEN.test(imported)) offenders.add(imported);
          walk(imported);
        }
      };
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === "chunk" && output.isEntry) walk(fileName);
      }
      if (offenders.size > 0) {
        this.error(
          `[entry-chunk-purity] the entry chunk statically imports the editor ` +
            `stack: ${[...offenders].join(", ")}. Keep it behind BlogEdit's ` +
            `dynamic import() — do not add src/pages to a manualChunks rule.`,
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    bundleBudgetPlugin(),
    entryChunkPurityPlugin(),
    routeSeoPlugin({
      siteUrl: SITE_URL,
      defaultImage: DEFAULT_OG_IMAGE,
      routes: SEO_ROUTES,
      // Two independent build-time fetches; each source fails on its own so
      // one flaky endpoint cannot suppress the other's prerendered heads.
      dynamicRouteSources: [
        { name: "blog posts", load: blogPostSeoRoutes },
        { name: "question archive", load: questionArchiveSeoRoutes },
      ],
    }),
  ],
  base: "/",
  server: {
    proxy: {
      "/ws": {
        target: `http://localhost:3000`,
        ws: true,
      },
    },
  },
  optimizeDeps: {
    // Force pre-bundling to dedupe React instances
    include: ["react", "react-dom", "react-router-dom"],
  },
  build: {
    // Enable modulepreload for faster loading
    modulePreload: {
      polyfill: true,
    },
    rollupOptions: {
      output: {
        // Split editor/arena code without forcing global vendor chunk cycles.
        manualChunks(id) {
          const chunkId = normalizedChunkPath(id);

          if (chunkId.includes("/node_modules/")) {
            // React + router: large, changes rarely. Splitting it out of the
            // entry chunk keeps `index-*.js` under budget and lets the runtime
            // cache it across app deploys.
            if (
              /\/node_modules\/(react|react-dom|scheduler)\//.test(chunkId)
            ) {
              return "react-vendor";
            }

            if (chunkId.includes("/@tiptap/")) {
              return "tiptap-vendor";
            }

            if (chunkId.includes("/prosemirror-")) {
              return "prosemirror-vendor";
            }

            if (
              chunkId.includes("/lowlight/") ||
              chunkId.includes("/highlight.js/")
            ) {
              return "tiptap-vendor";
            }

            if (
              chunkId.includes("/@floating-ui/") ||
              chunkId.includes("/@radix-ui/")
            ) {
              return "ui-vendor";
            }

            // Keep the RUM library in its own async chunk so `import(
            // "web-vitals")` in src/lib/telemetry.ts stays off the critical
            // path — folding it into `vendor` would make it eager.
            if (chunkId.includes("/web-vitals/")) {
              return "web-vitals";
            }

            // socket.io-client + engine.io are behind a dynamic `import()` in
            // src/lib/websocket.ts. Assigning them to a chunk that is also
            // statically imported (like `vendor`) would undo that boundary and
            // drag the ~13 kB gzip back onto every page's critical path, so
            // leave them to Rollup's default async-chunk splitting.
            if (
              chunkId.includes("/socket.io-client/") ||
              chunkId.includes("/socket.io-parser/") ||
              chunkId.includes("/engine.io-client/") ||
              chunkId.includes("/engine.io-parser/") ||
              chunkId.includes("/@socket.io/")
            ) {
              return undefined;
            }

            // Lazy-only libs: react-hotkeys-hook (editor) and
            // @tanstack/react-virtual (ArenaMint). Their own chunks keep them
            // off the pages that never mount those components.
            if (chunkId.includes("/react-hotkeys-hook/")) {
              return "hotkeys-vendor";
            }
            if (
              chunkId.includes("/@tanstack/react-virtual/") ||
              chunkId.includes("/@tanstack/virtual-core/")
            ) {
              return "virtual-vendor";
            }

            // `debug` + `ms` only exist for socket.io (and, in `debug`'s case,
            // nothing else in the browser bundle). Leaving them unassigned
            // lets Rollup hoist them into the socket.io async chunk.
            if (
              /\/node_modules\/(debug|ms)\//.test(chunkId)
            ) {
              return undefined;
            }

            // Everything else from node_modules that isn't categorised above
            // goes to one shared vendor chunk instead of inflating the entry
            // chunk (or being duplicated across route chunks).
            return "vendor";
          }

          // Do NOT add `src/` routes/components to manualChunks. A rule for
          // the editor template or the arena UI forced Rollup to hoist shared
          // modules (e.g. useIsMobile) into those chunks, dragging the whole
          // editor stack (tiptap + prosemirror, ~247 kB gzip) onto every
          // Arena route. Let Rollup split at the route boundary instead. The
          // entryChunkPurityPlugin assertion below guards this.
        },
        // Optimize asset naming for better caching
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
    // Keep sprite images as files so route chunks don't inflate with data URLs.
    assetsInlineLimit: (filePath) => {
      if (normalizedChunkPath(filePath).includes("/src/assets/sprites/")) {
        return false;
      }
      return undefined;
    },
    // Minify and optimize
    minify: "esbuild",
    // Keep syntax compatible with older iPhone Safari builds used in the wild.
    target: "es2018",
    cssCodeSplit: true,
    // Stricter warning threshold than default oversized chunk budget.
    chunkSizeWarningLimit: 450,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Prevent multiple React/router instances (avoids invalid hook calls)
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
  },
});
