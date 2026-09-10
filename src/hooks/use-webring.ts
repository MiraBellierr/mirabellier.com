import { useEffect, useState } from "react";

import { DEFAULT_WEBRING } from "@/lib/links";
import { fetchSiteLinks, type SiteWebring } from "@/lib/site-links-api";

// The Footer renders on every page, so this leans entirely on the shared SWR
// cache in `fetchSiteLinks` — the /links page and the footer share one request.
// Any failure just leaves the widget hidden (disabled webring).
export function useWebring(): SiteWebring {
  const [webring, setWebring] = useState<SiteWebring>(DEFAULT_WEBRING);

  useEffect(() => {
    let cancelled = false;

    fetchSiteLinks()
      .then((content) => {
        if (cancelled) return;
        if (content?.webring) setWebring(content.webring);
      })
      .catch(() => {
        // Keep the default (disabled) webring on any error.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return webring;
}
