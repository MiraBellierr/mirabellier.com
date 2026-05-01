import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import type { OutputBundle } from "rollup";

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
  plugins: [react(), bundleBudgetPlugin()],
  base: "/",
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
    // Target modern browsers for smaller bundles
    target: "es2020",
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
