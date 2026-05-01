import { useEffect } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";

import DeferredAnimatedImage from "@/components/DeferredAnimatedImage";
import Divider from "../parts/Divider";
import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import kannaKobayashi from "@/assets/anime/kanna-kobayashi-lite.webp";
import kannaKobayashiPoster from "@/assets/anime/kanna-kobayashi-poster.webp";
import kannaRight from "@/assets/anime/kanna-right.webp";
import { fetchShrinePages, type ShrinePageRecord } from "@/lib/shrine-api";
import { usePageSeo } from "@/lib/seo";
import "@/styles/shrine.css";

const shrineEntries = [
  {
    title: "Kamui Kanna",
    path: "/shrine/kanna",
    imageSrc: "/kanna1.jpg",
    imageAlt: "Kanna shrine hallway preview",
    summary:
      "Kanna Kamui is a tiny dragon with sleepy eyes, soft cloud energy, and the kind of quiet presence that makes every scene feel warmer.",
    details:
      "Calm, cute, snack-motivated, and a little chaotic in the best way.",
  },
  {
    title: "Rossina Wulfperl Luppino",
    path: "/shrine/rossina",
    imageSrc: "/rossi1.jpg",
    imageAlt: "Rossina shrine hallway preview",
    summary:
      "Rossina carries a sharper kind of charm: pack loyalty, red-hood gravity, and the cool control of someone already walking toward command.",
    details:
      "Disciplined, dangerous, and deliberate with poised wolfpack devotion.",
  },
] as const;

const Shrine = () => {
  const [dynamicEntries, setDynamicEntries] = useState<ShrinePageRecord[]>([]);

  usePageSeo({
    canonical: "https://mirabellier.com/shrine",
    structuredDataId: "shrines-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Character Shrines",
      description:
        "A directory for Mirabellier character shrine pages, including Kanna and Rossina shrine rooms.",
      url: "https://mirabellier.com/shrine",
      about: [
        "character shrine page",
        "anime shrine page",
        "Kanna Kamui",
        "Rossina Wulfperl Luppino",
      ],
    },
  });

  useEffect(() => {
    fetchShrinePages()
      .then((entries) => {
        setDynamicEntries(
          entries.filter((entry) => !["kanna", "rossina"].includes(entry.slug)),
        );
      })
      .catch(() => setDynamicEntries([]));
  }, []);

  return (
    <div className="shrine-page min-h-screen flex flex-col font-[sans-serif] text-blue-900">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-4 p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />

            <div className="mt-3 hidden justify-center lg:flex">
              <div className="  w-full rounded-[1.4rem] p-3">
                <div className="">
                  <DeferredAnimatedImage
                    className="h-[420px] w-full rounded-[1.15rem] object-cover object-top"
                    posterSrc={kannaKobayashiPoster}
                    animatedSrc={kannaKobayashi}
                    width="320"
                    height="420"
                    alt="Kanna gif preview"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </div>
            </div>
          </div>

          <main className="w-full space-y-2 p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/55 p-4">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-blue-700">
                  my shrine directory <span className="font-normal">₍₍⚞(˶{">"}ᗜ{"<"}˶)⚟⁾⁾</span>
                </h2>
                <p className="text-sm text-blue-500">
                  little rooms for characters I really love
                </p>
              </div>

              <ol className="space-y-1">
                {[
                  ...shrineEntries,
                  ...dynamicEntries.map((entry) => ({
                    title: entry.title,
                    path: entry.path,
                    imageSrc: entry.image || "/background.jpg",
                    imageAlt: entry.imageAlt || `${entry.title} shrine preview`,
                    summary: entry.description || entry.excerpt || "Shrine page",
                    details: entry.excerpt || "Custom shrine entry",
                  })),
                ].map((entry, index) => (
                  <li
                    key={entry.path}
                    className="border-b border-blue-100 pb-3 last:border-b-0 last:pb-0"
                  >
                    <article className="flex items-start gap-3">
                      <img
                        src={entry.imageSrc}
                        alt={entry.imageAlt}
                        className="h-20 w-14 shrink-0 rounded-lg border border-blue-100 object-cover shadow-sm"
                        loading={index === 0 ? "eager" : "lazy"}
                      />

                      <div className="min-w-0 flex-1">
                        <p className="break-words font-bold text-blue-700">
                          {index + 1}. {entry.title}{" "}
                          <Link
                            to={entry.path}
                            className="break-all text-sm font-normal text-blue-600 underline hover:text-blue-800"
                          >
                            (Open shrine)
                          </Link>
                        </p>
                        <p className="text-sm text-slate-700">
                          {entry.summary}
                        </p>
                        <p className="text-sm text-blue-500">
                          {entry.details}
                        </p>
                      </div>
                    </article>
                  </li>
                ))}
              </ol>
            </section>

            <Divider />
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <section className="right-side-panel shrine-sidebar rounded-xl border border-blue-300 p-4 shadow-md opacity-90">
              <h2 className="text-center text-lg font-bold text-blue-700">
                future slots
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 marker:text-blue-400">
                <li>Reserved for the next comfort character.</li>
                <li>Reserved for another chaotic favorite.</li>
                <li>Reserved for any new tiny legend.</li>
              </ul>
            </section>

                <img
                  className="aspect-video w-full rounded-[1.15rem] object-cover object-center"
                  src={kannaRight}
                  width="498"
                  height="280"
                  alt="Kanna gif preview"
                  loading="lazy"
                  decoding="async"
                />
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Shrine;
