import fs from "fs";
import path from "path";
import type { Plugin } from "vite";

/**
 * Vite plugin that prerenders per-route social/SEO metadata for a small set of
 * client-only SPA routes.
 *
 * The app is a single `index.html` that swaps `<title>` / Open Graph tags at
 * runtime via `usePageSeo`. Crawlers that do not execute JavaScript (Discord,
 * Slack, iMessage, Twitter/X, ...) only ever see the static `index.html` head,
 * so a link to `/arena` unfurls with the generic site card.
 *
 * After the normal build finishes we copy the emitted `index.html`, rewrite its
 * head with route-specific metadata, and drop it at `<route>/index.html`. Nginx's
 * SPA fallback (`try_files $uri $uri/ /index.html`) then serves that file for the
 * matching path while the SPA still boots and hydrates as usual.
 */

export type RouteSeo = {
  /** Route path, e.g. "/arena". A file is written to `<path>/index.html`. */
  path: string;
  title: string;
  description: string;
  /** Canonical/og:url. Defaults to `${siteUrl}${path}`. */
  url?: string;
  /** Absolute og:image URL. Defaults to the plugin's `defaultImage`. */
  image?: string;
  /** `og:type` — "website" (default) for listing pages, "article" for posts. */
  ogType?: string;
  /** JSON-LD structured data object injected as `application/ld+json`. */
  structuredData?: Record<string, unknown>;
};

type RouteSeoPluginOptions = {
  siteUrl: string;
  defaultImage: string;
  routes: RouteSeo[];
  /**
   * Extra routes resolved at build time — e.g. one per published blog post,
   * fetched from the API. A rejection (or a slow/offline API) is logged and
   * ignored so it can never break the build; those paths simply fall back to
   * the generic `index.html` head as before.
   */
  dynamicRoutes?: () => Promise<RouteSeo[]>;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function upsertMetaTag(
  html: string,
  attr: "name" | "property",
  key: string,
  content: string,
): string {
  const escaped = escapeHtml(content);
  const pattern = new RegExp(
    `<meta\\s+${attr}="${key}"\\s+content="[\\s\\S]*?"\\s*/?>`,
    "i",
  );
  const replacement = `<meta ${attr}="${key}" content="${escaped}" />`;

  if (pattern.test(html)) {
    return html.replace(pattern, replacement);
  }

  return html.replace("</head>", `    ${replacement}\n  </head>`);
}

function applyRouteSeo(
  html: string,
  route: RouteSeo,
  options: RouteSeoPluginOptions,
): string {
  const url = route.url ?? `${options.siteUrl}${route.path}`;
  const image = route.image ?? options.defaultImage;

  let next = html;

  next = next.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(route.title)}</title>`,
  );

  next = next.replace(
    /<link\s+rel="canonical"[^>]*>/i,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
  );

  next = upsertMetaTag(next, "name", "description", route.description);

  next = upsertMetaTag(next, "property", "og:type", route.ogType ?? "website");
  next = upsertMetaTag(next, "property", "og:title", route.title);
  next = upsertMetaTag(next, "property", "og:description", route.description);
  next = upsertMetaTag(next, "property", "og:url", url);
  next = upsertMetaTag(next, "property", "og:image", image);

  next = upsertMetaTag(next, "name", "twitter:card", "summary_large_image");
  next = upsertMetaTag(next, "name", "twitter:title", route.title);
  next = upsertMetaTag(next, "name", "twitter:description", route.description);
  next = upsertMetaTag(next, "name", "twitter:image", image);

  if (route.structuredData) {
    const json = JSON.stringify(route.structuredData, null, 2);
    const block = `<script type="application/ld+json">\n${json}\n    </script>`;
    if (/<script type="application\/ld\+json">[\s\S]*?<\/script>/i.test(next)) {
      next = next.replace(
        /<script type="application\/ld\+json">[\s\S]*?<\/script>/i,
        block,
      );
    } else {
      next = next.replace("</body>", `    ${block}\n  </body>`);
    }
  }

  return next;
}

export function routeSeoPlugin(options: RouteSeoPluginOptions): Plugin {
  let outDir = "dist";
  let root = process.cwd();
  let log: (msg: string) => void = () => {};

  return {
    name: "vite-plugin-route-seo",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
      log = (msg) => config.logger.info(msg);
    },
    async closeBundle() {
      const resolvedOutDir = path.resolve(root, outDir);
      const indexPath = path.join(resolvedOutDir, "index.html");

      if (!fs.existsSync(indexPath)) {
        this.warn(
          `[route-seo] ${indexPath} not found; skipping route prerender.`,
        );
        return;
      }

      const baseHtml = fs.readFileSync(indexPath, "utf8");

      let dynamicRoutes: RouteSeo[] = [];
      if (options.dynamicRoutes) {
        try {
          dynamicRoutes = await options.dynamicRoutes();
          log(
            `[route-seo] resolved ${dynamicRoutes.length} dynamic route(s) at build time`,
          );
        } catch (error) {
          this.warn(
            `[route-seo] dynamicRoutes() failed, skipping them: ${
              (error as Error).message
            }`,
          );
        }
      }

      const seen = new Set<string>();
      for (const route of [...options.routes, ...dynamicRoutes]) {
        const relPath = route.path.replace(/^\/+/, "");
        if (!relPath || seen.has(relPath)) continue;
        seen.add(relPath);
        const html = applyRouteSeo(baseHtml, route, options);
        const routeDir = path.join(resolvedOutDir, ...relPath.split("/"));
        fs.mkdirSync(routeDir, { recursive: true });
        fs.writeFileSync(path.join(routeDir, "index.html"), html, "utf8");
      }
      log(
        `[route-seo] wrote ${seen.size} prerendered head(s) to ${outDir}/`,
      );
    },
  };
}
