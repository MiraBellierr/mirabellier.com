import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import type { OutputBundle } from "rollup";
import { routeSeoPlugin, type RouteSeo } from "./vite-plugin-route-seo";

const SITE_URL = "https://mirabellier.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/background.jpg`;

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
      "A directory for Mirabellier character shrine pages, including Kanna and Rossina shrine rooms.",
    structuredData: collectionPageJsonLd(
      "Character Shrines",
      "A directory for Mirabellier character shrine pages, including Kanna and Rossina shrine rooms.",
      `${SITE_URL}/shrine`,
    ),
  },
  {
    path: "/shrine/kanna",
    title: "Kanna Kamui Shrine | Mirabellier",
    description:
      "A long-form Kanna Kamui shrine with profile notes, lore, favorite line memories, and a personal gallery.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "Kanna Kamui Shrine",
      description:
        "A long-form Kanna Kamui shrine with profile notes, lore, favorite line memories, and a personal gallery.",
      url: `${SITE_URL}/shrine/kanna`,
    },
  },
  {
    path: "/shrine/rossina",
    title: "Rossina Wulfperl Luppino Shrine | Mirabellier",
    description:
      "A long-form Rossina Wulfperl Luppino shrine with profile details, Pack lore, battle notes, quotes, and personal favorites.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "Rossina Wulfperl Luppino Shrine",
      description:
        "A long-form Rossina Wulfperl Luppino shrine with profile details, Pack lore, battle notes, quotes, and personal favorites.",
      url: `${SITE_URL}/shrine/rossina`,
    },
  },
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

async function blogPostSeoRoutes(): Promise<RouteSeo[]> {
  if (process.env.SKIP_BLOG_SEO_PRERENDER === "1") return [];

  const res = await fetch(`${API_BASE}/posts`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`GET ${API_BASE}/posts -> HTTP ${res.status}`);
  }
  const posts = (await res.json()) as ApiPost[];
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
      dynamicRoutes: blogPostSeoRoutes,
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

            // Everything else from node_modules that isn't categorised above
            // goes to one shared vendor chunk instead of inflating the entry
            // chunk (or being duplicated across route chunks).
            return "vendor";
          }

          // Only the editor template itself, which BlogEdit.tsx already pulls
          // in via a dynamic import(). BlogEdit.tsx must NOT be listed here:
          // it statically imports the app shell (Navigation/Header/Footer/
          // Toast), and a manual-chunk assignment for those shared modules
          // wins over the lazy route boundary, dragging the whole editor
          // (tiptap + prosemirror, ~243 kB gzip) onto every page's critical
          // path. The entryChunkPurityPlugin assertion below guards this.
          if (chunkId.includes("/src/components/tiptap-templates/simple/")) {
            return "simple-editor";
          }

          if (chunkId.includes("/src/lib/arena-shop-ui.tsx")) {
            return "arena-shop-ui";
          }
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
