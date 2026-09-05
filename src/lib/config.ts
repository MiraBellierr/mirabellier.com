const RAW_API_BASE =
  (import.meta.env.VITE_API_BASE as string) || "https://api.mirabellier.com/v1";
export const API_BASE: string = RAW_API_BASE.replace(/\/$/, "");

export const joinApi = (path: string) =>
  `${API_BASE}/${path.replace(/^\//, "")}`;

// The site origin used for canonical links and shareable URLs. In a production
// build it is the real domain (so a copied link never leaks localhost); in dev
// it falls back to the current origin so share links actually open the running
// dev server. Override explicitly with `VITE_SITE_ORIGIN`.
const RAW_SITE_ORIGIN =
  (import.meta.env.VITE_SITE_ORIGIN as string) ||
  (import.meta.env.PROD
    ? "https://mirabellier.com"
    : typeof window !== "undefined"
      ? window.location.origin
      : "https://mirabellier.com");
export const SITE_ORIGIN: string = RAW_SITE_ORIGIN.replace(/\/$/, "");
