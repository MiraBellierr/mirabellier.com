import { useEffect } from "react";
import { Link } from "react-router-dom";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import kannaKobayashiPoster from "@/assets/anime/kanna-kobayashi-poster.webp";

const Shrine = () => {
  useEffect(() => {
    const canonicalLink = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement | null;

    if (canonicalLink) {
      canonicalLink.href = "https://mirabellier.com/shrine";
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "shrines-structured-data";
    script.text = JSON.stringify({
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
    });
    document.head.appendChild(script);

    return () => {
      document.getElementById("shrines-structured-data")?.remove();
    };
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
              <div className="shrine-side-card w-full max-w-[320px] rounded-[1.4rem] p-3">
                <div className="shrine-frame">
                  <img
                    className="h-[420px] w-full rounded-[1.15rem] object-cover"
                    src={kannaKobayashiPoster}
                    width="320"
                    height="420"
                    alt="Character shrine hall preview"
                    loading="lazy"
                  />
                </div>
                <p className="mt-3 text-center text-sm font-bold text-blue-600">
                  shrine hallway preview
                </p>
              </div>
            </div>
          </div>

          <main className="w-full space-y-4 p-4 lg:w-3/5">
            <Link
              aria-label="Open Kanna shrine"
              className="shrine-directory-link block"
              to="/shrine/kanna"
            >
              <section className="card-border shrine-directory-card shrine-hero">
                <div className="shrine-glow shrine-glow--one" aria-hidden="true" />
                <div className="shrine-glow shrine-glow--two" aria-hidden="true" />

                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="relative z-10 space-y-4 p-5 lg:p-6">
                    <div className="inline-flex rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-blue-600 shadow-sm">
                      ⭐ most beloved character
                    </div>

                    <div className="space-y-3">
                      <h2 className="text-3xl font-bold text-blue-700 lg:text-4xl">
                        Kamui Kanna
                      </h2>
                      <p className="max-w-2xl text-[15px] leading-7 text-slate-700">
                        Kanna Kamui is a tiny dragon with sleepy eyes, soft cloud
                        energy, and the kind of quiet presence that makes every
                        scene feel instantly warmer.
                      </p>
                      <p className="max-w-2xl text-sm leading-7 text-slate-700">
                        She is calm, cute, a little chaotic, very snack-motivated,
                        and basically perfect shrine material if you love comfort
                        characters with hidden thunder inside them.
                      </p>
                    </div>
                  </div>

                  <div className="relative z-10 p-5 lg:p-6">
                    <div className="shrine-frame h-full">
                      <img
                        className="h-full min-h-[260px] w-full rounded-[1.15rem] object-cover object-top"
                        src="/kanna1.jpg"
                        width="420"
                        height="320"
                        alt="Kanna shrine hallway preview"
                        loading="eager"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </Link>

            <Link
              aria-label="Open Rossina shrine"
              className="shrine-directory-link block"
              to="/shrine/rossina"
            >
              <section className="card-border shrine-directory-card shrine-hero shrine-hero--rossina">
                <div className="shrine-glow shrine-glow--one" aria-hidden="true" />
                <div className="shrine-glow shrine-glow--two" aria-hidden="true" />

                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="relative z-10 space-y-4 p-5 lg:p-6">
                    <div className="inline-flex rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-blue-600 shadow-sm">
                      ⭐ Most liked character
                    </div>

                    <div className="space-y-3">
                      <h2 className="text-3xl font-bold text-blue-700 lg:text-4xl">
                        Rossina Wulfperl Luppino
                      </h2>
                      <p className="max-w-2xl text-[15px] leading-7 text-slate-700">
                        Rossina Wulfperl Luppino, or Rossi, carries a sharper kind
                        of charm: Pack loyalty, red-hood gravity, and the cool
                        control of someone already walking toward command.
                      </p>
                      <p className="max-w-2xl text-sm leading-7 text-slate-700">
                        She feels disciplined, dangerous, and completely
                        deliberate, which makes her shrine energy less cloud-soft
                        comfort and more poised wolfpack devotion.
                      </p>
                    </div>
                  </div>

                  <div className="relative z-10 p-5 lg:p-6">
                    <div className="shrine-frame h-full">
                      <img
                        className="h-full min-h-[260px] w-full rounded-[1.15rem] object-cover object-top"
                        src="/rossi1.jpg"
                        width="420"
                        height="320"
                        alt="Rossina shrine hallway preview"
                        loading="eager"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </Link>
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
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Shrine;
