import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import type { OutputBundle } from "rollup";
import { routeSeoPlugin } from "./vite-plugin-route-seo";

const SITE_URL = "https://mirabellier.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/background.jpg`;

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

// Client-only SPA routes that get a static, crawler-visible head so links
// unfurl with a route-specific card in Discord/Slack/iMessage/Twitter.
const SEO_ROUTES = [
  {
    path: "/arena",
    title: "Character Card Arena ⚔️ — Mirabellier",
    description: ARENA_DESCRIPTION,
    structuredData: ARENA_STRUCTURED_DATA,
  },
  {
    path: "/ar",
    title: "Character Card Arena ⚔️ — Mirabellier",
    description: ARENA_DESCRIPTION,
    url: `${SITE_URL}/arena`,
    structuredData: ARENA_STRUCTURED_DATA,
  },
];

const JS_CHUNK_BUDGET_KB = 450;
const CSS_ASSET_BUDGET_KB = 100;

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
          if (sizeKb > CSS_ASSET_BUDGET_KB) {
            this.warn(
              `[bundle-budget] CSS asset "${fileName}" is ${sizeKb.toFixed(1)}kB (budget: ${CSS_ASSET_BUDGET_KB}kB).`,
            );
          }
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    bundleBudgetPlugin(),
    routeSeoPlugin({
      siteUrl: SITE_URL,
      defaultImage: DEFAULT_OG_IMAGE,
      routes: SEO_ROUTES,
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

            // Everything else from node_modules that isn't categorised above
            // goes to one shared vendor chunk instead of inflating the entry
            // chunk (or being duplicated across route chunks).
            return "vendor";
          }

          if (
            chunkId.includes("/src/components/tiptap-templates/simple/") ||
            chunkId.includes("/src/pages/BlogEdit.tsx")
          ) {
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
