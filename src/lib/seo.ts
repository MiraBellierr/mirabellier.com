import { useEffect } from "react";

type StructuredData = Record<string, unknown>;

type UsePageSeoOptions = {
  canonical: string;
  structuredDataId?: string;
  structuredData?: StructuredData | null;
  resetCanonicalTo?: string;
};

function setCanonicalUrl(url: string) {
  const canonicalLink = document.querySelector(
    'link[rel="canonical"]',
  ) as HTMLLinkElement | null;
  if (!canonicalLink) return;
  canonicalLink.href = url;
}

function appendStructuredDataScript(id: string, structuredDataJson: string) {
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = id;
  script.text = structuredDataJson;
  document.head.appendChild(script);
}

function removeStructuredDataScript(id?: string) {
  if (!id) return;
  const existing = document.getElementById(id);
  if (existing) existing.remove();
}

export function usePageSeo({
  canonical,
  structuredDataId,
  structuredData,
  resetCanonicalTo = "https://mirabellier.com/",
}: UsePageSeoOptions) {
  const structuredDataJson = structuredData
    ? JSON.stringify(structuredData)
    : null;

  useEffect(() => {
    if (typeof document === "undefined") return;

    setCanonicalUrl(canonical);
    if (structuredDataJson && structuredDataId) {
      appendStructuredDataScript(structuredDataId, structuredDataJson);
    }

    return () => {
      setCanonicalUrl(resetCanonicalTo);
      removeStructuredDataScript(structuredDataId);
    };
  }, [canonical, structuredDataId, structuredDataJson, resetCanonicalTo]);
}
