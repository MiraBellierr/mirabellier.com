import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";
import anime5Gif from "@/assets/anime/anime5.webp";
import {
  LINKS_UPDATED,
  countLinks,
  resolveSiteLinks,
  type ResolvedLinks,
} from "@/lib/links";
import { fetchSiteLinks } from "@/lib/site-links-api";
import { usePageSeo } from "@/lib/seo";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { canAccessAdminPanel } from "@/lib/user-permissions";

const LINKS_DESCRIPTION =
  "A blogroll for mirabellier.com: friends' corners of the web and the small-web directories worth browsing, plus the webring this site belongs to.";

function formatUpdated(value: string) {
  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value,
  );
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const Links = () => {
  const auth = useOptionalAuth();
  const isOwner = canAccessAdminPanel(auth?.user);

  const [resolved, setResolved] = useState<ResolvedLinks>(() =>
    resolveSiteLinks(null),
  );
  const [loading, setLoading] = useState(true);

  usePageSeo({
    canonical: "https://mirabellier.com/links",
    structuredDataId: "links-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Links | Mirabellier",
      description: LINKS_DESCRIPTION,
      url: "https://mirabellier.com/links",
      isPartOf: {
        "@type": "WebSite",
        name: "Mirabellier",
        url: "https://mirabellier.com",
      },
    },
    socialMeta: {
      title: "Links | Mirabellier",
      description: LINKS_DESCRIPTION,
      url: "https://mirabellier.com/links",
      image: "https://mirabellier.com/kanna-kobayashi-poster.webp",
      type: "website",
    },
  });

  useEffect(() => {
    let cancelled = false;

    fetchSiteLinks()
      .then((content) => {
        if (!cancelled) setResolved(resolveSiteLinks(content));
      })
      .catch(() => {
        // Cozy page — on any error just keep the built-in default list.
        if (!cancelled) setResolved(resolveSiteLinks(null));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const { sections, webring, updatedAt, isDefault } = resolved;
  const populatedSections = sections.filter(
    (section) => section.entries.length > 0,
  );
  const linkCount = countLinks(sections);
  const updatedLabel = updatedAt
    ? formatUpdated(updatedAt)
    : isDefault
      ? formatUpdated(LINKS_UPDATED)
      : null;

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <div className="relative">
              <img
                className="pointer-events-none absolute h-14 w-14 object-contain"
                src="/flower.webp"
                width="56"
                height="56"
                alt=""
                aria-hidden="true"
                style={{
                  top: "-18px",
                  right: "-10px",
                  zIndex: 2,
                }}
              />

              <section className="card-border space-y-2 p-4">
                <h2 className="text-xl font-bold text-blue-700">
                  places I like on the web
                </h2>
                <p className="text-sm text-blue-600">
                  A blogroll. Friends&apos; corners and the directories I use to
                  find more hand-made pages. The web is better with a door out.
                </p>
                {updatedLabel ? (
                  <p className="text-xs font-medium text-blue-400">
                    Last updated {updatedLabel}
                  </p>
                ) : null}
              </section>
            </div>

            {loading ? (
              <p className="p-4 text-sm text-blue-500">Gathering links…</p>
            ) : (
              <>
                {populatedSections.map((section) => (
                  <div key={section.id}>
                    <Divider />
                    <section className="card-border space-y-3 p-4">
                      <h3 className="text-lg font-bold text-blue-700">
                        {section.title}
                      </h3>
                      {section.note ? (
                        <p className="text-sm text-blue-600">{section.note}</p>
                      ) : null}
                      <ul className="space-y-2">
                        {section.entries.map((entry) => (
                          <li key={entry.url} className="text-sm">
                            <a
                              className="font-bold text-blue-700 underline hover:text-blue-900"
                              href={entry.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {entry.name}
                            </a>
                            {entry.feed ? (
                              <>
                                {" "}
                                <a
                                  className="text-xs font-mono text-blue-400 underline hover:text-blue-600"
                                  href={entry.feed}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  rss
                                </a>
                              </>
                            ) : null}
                            {entry.blurb ? (
                              <span className="text-slate-600">
                                {" — "}
                                {entry.blurb}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                ))}

                <Divider />
                <section className="card-border space-y-2 p-4">
                  <h3 className="text-lg font-bold text-blue-700">webring</h3>
                  {webring.enabled ? (
                    <p className="text-sm text-blue-600">
                      This site is part of{" "}
                      <a
                        className="font-bold text-blue-700 underline hover:text-blue-900"
                        href={webring.hubUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {webring.name || "a webring"}
                      </a>
                      . Use the arrows in the footer to hop to a neighbouring
                      site.
                    </p>
                  ) : (
                    <p className="text-sm text-blue-600">
                      Not in a webring yet. If you run one that would fit a cozy
                      personal site, tell me in the guestbook.
                    </p>
                  )}
                </section>

                <Divider />
                <section className="card-border space-y-2 p-4">
                  <h3 className="text-lg font-bold text-blue-700">
                    want a link back?
                  </h3>
                  <p className="text-sm text-blue-600">
                    If you have a personal site with a feed, sign the{" "}
                    <Link
                      className="font-bold text-blue-700 underline hover:text-blue-900"
                      to="/guestbook"
                    >
                      guestbook
                    </Link>{" "}
                    and leave the URL. I read all of them.
                  </p>
                </section>
              </>
            )}
          </main>

          <div className="w-full lg:w-[200px] space-y-4">
            <aside className="right-side-panel w-full mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
              <div className="space-y-2 text-sm text-center font-bold">
                <h2 className="text-blue-600 font-bold text-lg">blogroll</h2>
                <p className="text-blue-500">{linkCount} sites listed</p>
                <p className="text-blue-500">
                  <a className="underline hover:text-blue-700" href="/feed.xml">
                    subscribe to mine
                  </a>
                </p>
              </div>
            </aside>

            {isOwner ? (
              <Link
                to="/admin/links"
                className="block rounded-full border border-blue-200 bg-white px-4 py-2 text-center text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
              >
                edit links
              </Link>
            ) : null}

            <div className="hidden justify-center lg:flex">
              <img
                className="w-full max-w-[220px] rounded-xl"
                src={anime5Gif}
                width="480"
                height="270"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Links;
