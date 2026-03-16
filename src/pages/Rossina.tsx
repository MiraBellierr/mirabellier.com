import { useEffect } from "react";
import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";

type ShrineOffering = {
  code: string;
  title: string;
  description: string;
  detail: string;
  imageSrc?: string;
  imageAlt?: string;
};

type ShrineCard = {
  eyebrow: string;
  title: string;
  body: string;
};

type ShrineMeter = {
  label: string;
  value: string;
  width: string;
};

const shrineTags = [
  "the pack",
  "future capo",
  "lupo edge",
  "red hood aura",
];

const devotionStats: ShrineMeter[] = [
  {
    label: "pack loyalty",
    value: "97%",
    width: "97%",
  },
  {
    label: "hood aura",
    value: "93%",
    width: "93%",
  },
  {
    label: "blade tempo",
    value: "89%",
    width: "89%",
  },
];

const altarOfferings: ShrineOffering[] = [
  {
    code: "01",
    title: "pack crest ribbon",
    description:
      "A neat strip of red meant for clan loyalty, family weight, and vows said without shaking.",
    detail: "tied carefully and never left crooked",
    imageSrc: "/ribbon.jpg",
    imageAlt: "red ribbon offering",
  },
  {
    code: "02",
    title: "field report notebook",
    description:
      "For plans, grudges, route sketches, and every small detail worth keeping sharp.",
    detail: "no sloppy handwriting permitted",
    imageSrc: "/notebook.jpg",
    imageAlt: "field report notebook offering",
  },
  {
    code: "03",
    title: "midnight watch thermos",
    description:
      "An offering for long nights, colder streets, and the kind of patience that still feels armed.",
    detail: "best served hot and carried without complaint",
    imageSrc: "/thermos.jpg",
    imageAlt: "midnight watch thermos offering",
  },
  {
    code: "04",
    title: "hood clasp polish",
    description:
      "A tiny ritual object for that unmistakable red-silhouette energy and everything it implies.",
    detail: "buffed until it catches low light properly",
    imageSrc: "/redhood.jpg",
    imageAlt: "red hood clasp offering",
  },
];

const devotionCards: ShrineCard[] = [
  {
    eyebrow: "reason one",
    title: "pack lineage with real gravity",
    body: "Rossi being part of the Pack and Wulfgard's younger sister gives her immediate weight before the page even starts talking.",
  },
  {
    eyebrow: "reason two",
    title: "future capo energy",
    body: "She feels like someone already standing one step away from command, all discipline, confidence, and cleanly contained danger.",
  },
  {
    eyebrow: "reason three",
    title: "sharp without becoming noisy",
    body: "The best part of her vibe is how controlled it feels. Nothing here has to shout to look serious.",
  },
];

const ritualLoop: ShrineCard[] = [
  {
    eyebrow: "step 01",
    title: "enter respectfully",
    body: "This room works best when it feels less like a joke and more like a small private place with rules.",
  },
  {
    eyebrow: "step 02",
    title: "remember the full name",
    body: "Rossina Wulfperl Luppino deserves the whole introduction. Anything shorter should still sound deliberate.",
  },
  {
    eyebrow: "step 03",
    title: "leave standing straighter",
    body: "A Rossi shrine should leave the room feeling cleaner, sharper, and a little more dangerous than before.",
  },
];

const memoryWall: ShrineCard[] = [
  {
    eyebrow: "memory shard",
    title: "wolfish silhouette",
    body: "The hood, the posture, and the silence all hit before the details do, which is exactly why the character lands.",
  },
  {
    eyebrow: "memory shard",
    title: "family gravity",
    body: "Being Wulfgard's younger sister adds the kind of built-in tension that makes a shrine feel connected to a bigger story.",
  },
  {
    eyebrow: "memory shard",
    title: "pack before comfort",
    body: "This room is less blanket-fort cozy and more ceremonial loyalty, which gives it a different kind of calm.",
  },
];

const shrineMeters: ShrineMeter[] = [
  {
    label: "capo potential",
    value: "95%",
    width: "95%",
  },
  {
    label: "watchful silence",
    value: "91%",
    width: "91%",
  },
  {
    label: "wolfish poise",
    value: "94%",
    width: "94%",
  },
];

const shrineEtiquette = [
  "Respect the Pack before you say anything else.",
  "Say Rossi like you actually mean it.",
  "Do not leave the room softer than it asked you to be.",
];

const Rossina = () => {
  useEffect(() => {
    const canonicalLink = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement | null;

    if (canonicalLink) {
      canonicalLink.href = "https://mirabellier.com/shrine/rossina";
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "rossina-structured-data";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Rossina Shrine",
      description:
        "A Rossina Wulfperl Luppino shrine page with Pack loyalty, shrine offerings, and wolfish future Capo energy.",
      url: "https://mirabellier.com/shrine/rossina",
      about: [
        "Rossina Wulfperl Luppino",
        "Rossi",
        "Arknights: Endfield",
        "The Pack",
      ],
    });
    document.head.appendChild(script);

    return () => {
      const restoredCanonical = document.querySelector(
        'link[rel="canonical"]',
      ) as HTMLLinkElement | null;

      if (restoredCanonical) {
        restoredCanonical.href = "https://mirabellier.com/";
      }

      document.getElementById("rossina-structured-data")?.remove();
    };
  }, []);

  return (
    <div className="rossina-page shrine-page min-h-screen flex flex-col font-[sans-serif] text-blue-900">
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
                    className="h-[420px] w-full rounded-[1.15rem] object-cover object-top"
                    src="/rossi4.jpg"
                    width="320"
                    height="420"
                    alt="Rossina blessing seal image"
                    loading="lazy"
                  />
                </div>
                <p className="mt-3 text-center text-sm font-bold text-blue-600">
                  wolfpack blessing seal
                </p>
              </div>
            </div>
          </div>

          <main className="w-full space-y-4 p-4 lg:w-3/5">
            <section className="card-border shrine-hero">
              <div className="shrine-glow shrine-glow--one" aria-hidden="true" />
              <div className="shrine-glow shrine-glow--two" aria-hidden="true" />

              <div className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
                <div className="relative z-10 space-y-4 p-5 lg:p-6">
                  <div className="inline-flex rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-blue-600 shadow-sm">
                    wolfpack devotion page
                  </div>

                  <div className="space-y-3">
                    <h2 className="text-3xl font-bold text-blue-700 lg:text-4xl">
                      Rossina Wulfperl Luppino Shrine
                    </h2>
                    <p className="max-w-2xl text-[15px] leading-7 text-slate-700">
                      Rossina Wulfperl Luppino, better known as Rossi, is a Lupo
                      of the Pack and Wulfgard&apos;s younger sister, carrying the
                      exact kind of disciplined, dangerous presence that makes a
                      shrine feel inevitable.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {shrineTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-blue-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {devotionStats.map((stat) => (
                      <div key={stat.label} className="space-y-2">
                        <div className="min-w-0 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-blue-500">
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-blue-400">
                            {stat.label}
                          </span>
                          <span className="flex-shrink-0 whitespace-nowrap text-blue-700">
                            {stat.value}
                          </span>
                        </div>
                        <div className="shrine-meter">
                          <span style={{ width: stat.width }} />
                        </div>
                      </div>
                    ))}
                  </div>

                </div>

                <div className="relative z-10 grid gap-3 p-5 sm:grid-cols-2 lg:p-6">
                  <div>
                    <img
                      className="block h-52 w-full rounded-[1.35rem] object-cover object-top"
                      src="/rossi3.jpg"
                      width="320"
                      height="208"
                      alt="Rossina shrine image 3"
                      loading="eager"
                      style={{
                        boxShadow: "var(--tt-shadow-elevated-md)",
                      }}
                    />
                  </div>

                  <div>
                    <img
                      className="block h-52 w-full rounded-[1.35rem] object-cover object-top"
                      src="/rossi2.jpg"
                      width="320"
                      height="208"
                      alt="Rossina shrine image 2"
                      loading="lazy"
                      style={{
                        boxShadow: "var(--tt-shadow-elevated-md)",
                      }}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <img
                      className="block h-56 w-full rounded-[1.35rem] border object-cover object-top"
                      src="/rossi1.jpg"
                      width="640"
                      height="224"
                      alt="Rossina shrine image"
                      loading="lazy"
                      style={{
                        borderColor: "var(--tt-card-border-color)",
                        boxShadow: "var(--tt-shadow-elevated-md)",
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="card-border shrine-panel p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-blue-700">
                    (づ ᴗ _ᴗ)づ♡ offerings on the altar
                  </h3>
                  <p className="text-sm leading-6 text-slate-700">
                    Four items currently maintaining the exact level of Pack
                    loyalty this room requires.
                  </p>
                </div>
              </div>

              <div className="shrine-copy-list">
                {altarOfferings.map((offering) => (
                  <div key={offering.code} className="shrine-copy-entry">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">
                      {offering.code} . offering
                    </p>
                    <h4 className="mt-2 text-lg font-bold text-blue-700">
                      {offering.title}
                    </h4>
                    {offering.imageSrc ? (
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-7 text-slate-700">
                            {offering.description}{" "}
                            <span className="font-semibold text-blue-500">
                              {offering.detail}.
                            </span>
                          </p>
                        </div>
                        <img
                          className="h-28 w-full rounded-xl object-cover shadow-sm sm:w-32"
                          src={offering.imageSrc}
                          width="128"
                          height="112"
                          alt={offering.imageAlt || offering.title}
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm leading-7 text-slate-700">
                        {offering.description}{" "}
                        <span className="font-semibold text-blue-500">
                          {offering.detail}.
                        </span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <div className="card-border shrine-panel p-4">
                <div className="mb-4">
                  <h3 className="text-2xl font-bold text-blue-700">
                    ( ╹ -╹)? why the shrine exists
                  </h3>
                  <p className="text-sm leading-6 text-slate-700">
                    A small record of the exact kind of sharpness this page is
                    trying to protect.
                  </p>
                </div>

                <div className="shrine-copy-list">
                  {devotionCards.map((card) => (
                    <div key={card.title} className="shrine-copy-entry">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">
                        {card.eyebrow}
                      </p>
                      <h4 className="mt-2 text-lg font-bold text-blue-700">
                        {card.title}
                      </h4>
                      <p className="mt-2 text-sm leading-7 text-slate-700">
                        {card.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card-border shrine-panel p-4">
                <div className="mb-4">
                  <h3 className="text-2xl font-bold text-blue-700">
                    (´˘ -˘ 人) ritual loop
                  </h3>
                  <p className="text-sm leading-6 text-slate-700">
                    The intended way t o move through the room without diluting
                    the mood.
                  </p>
                </div>

                <div className="shrine-copy-list">
                  {ritualLoop.map((step) => (
                    <div key={step.title} className="shrine-copy-entry">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">
                        {step.eyebrow}
                      </p>
                      <h4 className="mt-2 text-lg font-bold text-blue-700">
                        {step.title}
                      </h4>
                      <p className="mt-2 text-sm leading-7 text-slate-700">
                        {step.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="card-border shrine-panel p-4">
              <div className="mb-4">
                <h3 className="text-2xl font-bold text-blue-700">
                  ⸜(｡˃ ᵕ ˂ )⸝♡ memory wall
                </h3>
                <p className="text-sm leading-6 text-slate-700">
                  Three fragments that explain the shrine mood at a glance.
                </p>
              </div>

              <div className="shrine-copy-list">
                {memoryWall.map((card) => (
                  <div key={card.title} className="shrine-copy-entry">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">
                      {card.eyebrow}
                    </p>
                    <h4 className="mt-2 text-lg font-bold text-blue-700">
                      {card.title}
                    </h4>
                    <p className="mt-2 text-sm leading-7 text-slate-700">
                      {card.body}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <section className="right-side-panel shrine-sidebar rounded-xl border border-blue-300 p-4 shadow-md opacity-90">
              <h2 className="text-center text-lg font-bold text-blue-700">
                shrine status
              </h2>
              <p className="mt-2 text-center text-sm text-blue-500">
                currently sharpened and watching the door
              </p>

              <div className="shrine-candle-row" aria-hidden="true">
                <span className="shrine-candle" />
                <span className="shrine-candle" />
                <span className="shrine-candle" />
              </div>

              <div className="space-y-3">
                {shrineMeters.map((meter) => (
                  <div key={meter.label} className="space-y-1">
                    <div className="min-w-0 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-blue-500">
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                        {meter.label}
                      </span>
                      <span className="flex-shrink-0 whitespace-nowrap">
                        {meter.value}
                      </span>
                    </div>
                    <div className="shrine-meter">
                      <span style={{ width: meter.width }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="right-side-panel shrine-side-card rounded-[1.4rem] p-3 shadow-md">
              <div className="shrine-frame">
                <img
                  className="min-h-[260px] w-full rounded-[1.15rem] object-cover object-top"
                  src="/rossi5.jpg"
                  width="320"
                  height="260"
                  alt="Rossina ceremonial wolfpack notice image"
                  loading="lazy"
                />
              </div>
              <p className="mt-3 text-center text-sm font-bold text-blue-600">
                ceremonial wolfpack notice
              </p>
            </section>

            <section className="right-side-panel shrine-sidebar rounded-xl border border-blue-300 p-4 shadow-md opacity-90">
              <h2 className="text-center text-lg font-bold text-blue-700">
                visitor etiquette
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 marker:text-blue-400">
                {shrineEtiquette.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Rossina;
