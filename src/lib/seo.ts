import { useEffect } from "react";

type StructuredData = Record<string, unknown>;
type MetaAttribute = "name" | "property";

type SocialMetaInput = {
  title: string;
  description: string;
  url: string;
  image: string;
  type?: string;
  siteName?: string;
  twitterCard?: string;
  twitterSite?: string;
  twitterCreator?: string;
};

const DEFAULT_SOCIAL_META: Required<SocialMetaInput> = {
  title: "Mirabellier ⭐ — Cute thoughts & cozy corners",
  description: "A tiny, cozy blog sharing small joys, photos, and short posts.",
  url: "https://mirabellier.com/",
  image: "https://mirabellier.com/background.jpg",
  type: "website",
  siteName: "Mirabellier",
  twitterCard: "summary_large_image",
  twitterSite: "@mirabellier",
  twitterCreator: "@mirabellier",
};

type UsePageSeoOptions = {
  canonical: string;
  structuredDataId?: string;
  structuredData?: StructuredData | null;
  socialMeta?: SocialMetaInput;
  resetCanonicalTo?: string;
  resetSocialMetaTo?: SocialMetaInput;
};

function setCanonicalUrl(url: string) {
  const canonicalLink = document.querySelector(
    'link[rel="canonical"]',
  ) as HTMLLinkElement | null;

  if (canonicalLink) {
    canonicalLink.href = url;
    return;
  }

  const createdCanonicalLink = document.createElement("link");
  createdCanonicalLink.rel = "canonical";
  createdCanonicalLink.href = url;
  document.head.appendChild(createdCanonicalLink);
}

function upsertMeta(attribute: MetaAttribute, key: string, content: string) {
  const selector = `meta[${attribute}="${key}"]`;
  let metaElement = document.querySelector(selector) as HTMLMetaElement | null;

  if (!metaElement) {
    metaElement = document.createElement("meta");
    metaElement.setAttribute(attribute, key);
    document.head.appendChild(metaElement);
  }

  metaElement.content = content;
}

function applySocialMeta(input: SocialMetaInput) {
  const socialMeta = {
    ...DEFAULT_SOCIAL_META,
    ...input,
  };

  document.title = socialMeta.title;

  upsertMeta("name", "description", socialMeta.description);

  upsertMeta("property", "og:type", socialMeta.type);
  upsertMeta("property", "og:title", socialMeta.title);
  upsertMeta("property", "og:description", socialMeta.description);
  upsertMeta("property", "og:site_name", socialMeta.siteName);
  upsertMeta("property", "og:url", socialMeta.url);
  upsertMeta("property", "og:image", socialMeta.image);

  upsertMeta("name", "twitter:card", socialMeta.twitterCard);
  upsertMeta("name", "twitter:site", socialMeta.twitterSite);
  upsertMeta("name", "twitter:creator", socialMeta.twitterCreator);
  upsertMeta("name", "twitter:title", socialMeta.title);
  upsertMeta("name", "twitter:description", socialMeta.description);
  upsertMeta("name", "twitter:image", socialMeta.image);
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
  socialMeta,
  resetCanonicalTo = "https://mirabellier.com/",
  resetSocialMetaTo,
}: UsePageSeoOptions) {
  const structuredDataJson = structuredData
    ? JSON.stringify(structuredData)
    : null;
  const socialMetaJson = socialMeta ? JSON.stringify(socialMeta) : null;
  const resetSocialMetaJson = JSON.stringify(
    resetSocialMetaTo || DEFAULT_SOCIAL_META,
  );

  useEffect(() => {
    if (typeof document === "undefined") return;

    setCanonicalUrl(canonical);

    if (socialMetaJson) {
      applySocialMeta(JSON.parse(socialMetaJson) as SocialMetaInput);
    }

    if (structuredDataJson && structuredDataId) {
      appendStructuredDataScript(structuredDataId, structuredDataJson);
    }

    return () => {
      setCanonicalUrl(resetCanonicalTo);

      if (socialMetaJson) {
        applySocialMeta(JSON.parse(resetSocialMetaJson) as SocialMetaInput);
      }

      removeStructuredDataScript(structuredDataId);
    };
  }, [
    canonical,
    resetCanonicalTo,
    resetSocialMetaJson,
    socialMetaJson,
    structuredDataId,
    structuredDataJson,
  ]);
}
