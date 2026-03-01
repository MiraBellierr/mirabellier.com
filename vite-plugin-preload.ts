import type { Plugin } from "vite";

type BundleChunk = {
  type: string;
  isEntry?: boolean;
  imports?: string[];
  name?: string;
  fileName?: string;
};

function isBundleChunk(value: unknown): value is BundleChunk {
  return Boolean(value && typeof value === "object" && "type" in value);
}

/**
 * Vite plugin to automatically add modulepreload hints for critical chunks
 * This moves module dependencies out of the critical rendering path
 */
export function modulePreloadPlugin(): Plugin {
  return {
    name: "vite-plugin-modulepreload",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        // Only apply in production builds
        if (!ctx.bundle) return html;

        const preloadLinks: string[] = [];
        const bundle = ctx.bundle as Record<string, BundleChunk>;

        // Find the entry chunk and its imports
        const entryChunk = Object.values(bundle).find(
          (chunk) =>
            isBundleChunk(chunk) && chunk.type === "chunk" && chunk.isEntry,
        );

        if (entryChunk && entryChunk.imports) {
          // Add preload hints for immediate dependencies
          entryChunk.imports.slice(0, 3).forEach((importFile: string) => {
            const chunk = bundle[importFile];
            if (chunk && chunk.type === "chunk") {
              preloadLinks.push(
                `<link rel="modulepreload" href="/${importFile}" crossorigin />`,
              );
            }
          });
        }

        // Also preload React vendor chunk (most critical)
        const reactChunk = Object.values(bundle).find(
          (chunk) =>
            isBundleChunk(chunk) &&
            chunk.type === "chunk" &&
            chunk.name &&
            chunk.name.includes("react-vendor"),
        );

        if (reactChunk && reactChunk.fileName) {
          preloadLinks.unshift(
            `<link rel="modulepreload" href="/${reactChunk.fileName}" crossorigin />`,
          );
        }

        // Insert preload links at the end of <head>
        if (preloadLinks.length > 0) {
          const preloadHtml = preloadLinks.join("\n    ");
          html = html.replace("</head>", `    ${preloadHtml}\n  </head>`);
        }

        return html;
      },
    },
  };
}
