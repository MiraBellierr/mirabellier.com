import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";
import kannaSmile from "@/assets/anime/kanna-smile.webp";
import anyaSticker1 from "@/assets/anime/anya-sticker1.webp";
import anyaSticker2 from "@/assets/anime/anya-sticker2.webp";
import { USES_UPDATED, usesItemCount, usesSections } from "@/lib/uses";
import { usePageSeo } from "@/lib/seo";

const USES_DESCRIPTION =
  "A colophon for mirabellier.com: the editor, stack, fonts, hosting, and the atomic-symlink deploy that runs the whole site.";

// Sections that get a decorative Anya sticker beside their list.
const SECTION_STICKER: Record<string, string> = {
  "site-frontend": anyaSticker1,
  "site-backend": anyaSticker2,
};

function formatUpdated(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const Uses = () => {
  usePageSeo({
    canonical: "https://mirabellier.com/uses",
    structuredDataId: "uses-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Uses | Mirabellier",
      description: USES_DESCRIPTION,
      url: "https://mirabellier.com/uses",
      dateModified: USES_UPDATED,
    },
    socialMeta: {
      title: "Uses | Mirabellier",
      description: USES_DESCRIPTION,
      url: "https://mirabellier.com/uses",
      image: "https://mirabellier.com/kanna-kobayashi-poster.webp",
      type: "website",
    },
  });

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
                  what this site is built with
                </h2>
                <p className="text-sm text-blue-600">
                  projects page is what I&apos;ve built. This is what I build{" "}
                  <em>with</em>, plus how the site actually ships.
                </p>
                <p className="text-xs font-medium text-blue-400">
                  Last updated {formatUpdated(USES_UPDATED)}
                </p>
              </section>
            </div>

            {usesSections
              .filter((section) => section.items.length > 0)
              .map((section) => (
                <div key={section.id}>
                  <Divider />
                  <section className="card-border space-y-3 p-4">
                    <h3 className="text-lg font-bold text-blue-700">
                      {section.title}
                    </h3>
                    {section.note ? (
                      <p className="text-sm text-blue-600">{section.note}</p>
                    ) : null}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <ul className="space-y-2 sm:flex-1">
                        {section.items.map((item) => (
                          <li key={item.name} className="text-sm">
                            {item.url ? (
                              <a
                                className="font-bold text-blue-700 underline hover:text-blue-900"
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {item.name}
                              </a>
                            ) : (
                              <span className="font-bold text-blue-700">
                                {item.name}
                              </span>
                            )}
                            {item.detail ? (
                              <span className="text-slate-600">
                                {": "}
                                {item.detail}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      {SECTION_STICKER[section.id] ? (
                        <img
                          className="mx-auto w-[200px] shrink-0 sm:mx-0"
                          src={SECTION_STICKER[section.id]}
                          width="500"
                          height="500"
                          alt="Anya sticker"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : null}
                    </div>
                  </section>
                </div>
              ))}
          </main>

          <div className="w-full lg:w-[200px] space-y-4">
            <aside className="right-side-panel w-full mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
              <div className="space-y-2 text-sm text-center font-bold">
                <h2 className="text-blue-600 font-bold text-lg">snapshot</h2>
                <p className="text-blue-500">{usesItemCount} things listed</p>
                <p className="text-blue-500">1 VPS, 1 SQLite file</p>
              </div>
            </aside>

            <div className="hidden justify-center lg:flex">
              <img
                className="w-full rounded-2xl border border-blue-700 shadow-md"
                src={kannaSmile}
                width="300"
                height="404"
                alt="uses mascot"
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

export default Uses;
