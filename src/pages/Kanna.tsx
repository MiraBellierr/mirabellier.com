import { useEffect } from "react";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import kannaKobayashiPoster from "@/assets/anime/kanna-kobayashi-poster.webp";
import kannaShy from "@/assets/anime/kanna-shy.webp";

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
  "dragon daughter",
  "tiny chaos angel",
  "soft cloud energy",
  "mandatory snack break",
];

const devotionStats: ShrineMeter[] = [
  {
    label: "comfort aura",
    value: "99%",
    width: "99%",
  },
  {
    label: "snack devotion",
    value: "maximum",
    width: "100%",
  },
  {
    label: "tiny thunder",
    value: "charged",
    width: "88%",
  },
];

const altarOfferings: ShrineOffering[] = [
  {
    code: "01",
    title: "pancake tower",
    description:
      "A respectful stack of syrup-soft pancakes for post-adventure recovery.",
    detail: "best served with a quiet room and zero interruptions",
    imageSrc: "/pancake.jpg",
    imageAlt: "stack of pancakes",
  },
  {
    code: "02",
    title: "blanket fort permit",
    description:
      "Official permission to vanish into the coziest possible blanket pile.",
    detail: "valid during rain, naps, and emotional battery recharge hours",
    imageSrc: "/blanket.jpg",
    imageAlt: "cozy blanket fort",
  },
  {
    code: "03",
    title: "headpat voucher",
    description:
      "A ceremonial reminder that tiny dragons deserve patient kindness.",
    detail: "redeemable whenever the day feels too loud",
    imageSrc: "/pat.gif",
    imageAlt: "headpat gif",
  },
  {
    code: "04",
    title: "cloud-shaped candy",
    description:
      "Sweet enough to match the whole page and shaped for atmospheric harmony.",
    detail: "may improve mood by at least one level immediately",
    imageSrc: "/cloud-shaped-candy.jpg",
    imageAlt: "cloud-shaped candy",
  },
];

const devotionCards: ShrineCard[] = [
  {
    eyebrow: "reason one",
    title: "peak comfort character design",
    body: "The tiny horns, oversized sleeves, sleepy stare, and impossible amount of softness make every scene feel warmer.",
  },
  {
    eyebrow: "reason two",
    title: "quiet chaos done perfectly",
    body: "Kanna can be adorable, strange, hilarious, and powerful in the same breath without ever feeling forced.",
  },
  {
    eyebrow: "reason three",
    title: "the mood this site already loves",
    body: "The whole website leans cute, dreamy, and a little whimsical, so a Kanna shrine felt like the most natural new room to add.",
  },
];

const ritualLoop: ShrineCard[] = [
  {
    eyebrow: "step 01",
    title: "enter softly",
    body: "Let the page settle in, admire the clouds, and pretend the candles were lit for you specifically.",
  },
  {
    eyebrow: "step 02",
    title: "offer one good thought",
    body: "This can be a compliment, a favorite scene, or simply a commitment to be gentler with yourself today.",
  },
  {
    eyebrow: "step 03",
    title: "leave with better energy",
    body: "A shrine is doing its job when you close the tab feeling a little lighter than when you arrived.",
  },
];

const memoryWall: ShrineCard[] = [
  {
    eyebrow: "memory shard",
    title: "sleepy cloud patrol",
    body: "The ideal emotional weather for this shrine is bright skies, low stress, and a nap waiting somewhere nearby.",
  },
  {
    eyebrow: "memory shard",
    title: "tiny but unstoppable",
    body: "Part of the fun is how Kanna can radiate total calm while still feeling like a tiny storm is hiding underneath.",
  },
  {
    eyebrow: "memory shard",
    title: "snacks as philosophy",
    body: "A truly complete shrine should remind people that food, rest, and softness are serious business.",
  },
];

const shrineMeters: ShrineMeter[] = [
  {
    label: "cozy saturation",
    value: "96%",
    width: "96%",
  },
  {
    label: "candle glow",
    value: "84%",
    width: "84%",
  },
  {
    label: "snack readiness",
    value: "100%",
    width: "100%",
  },
];

const shrineEtiquette = [
  "Compliment the tiny dragon respectfully.",
  "Bring snacks, never stress.",
  "Leave the page calmer than you found it.",
];

const Kanna = () => {
  useEffect(() => {
    const canonicalLink = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement | null;

    if (canonicalLink) {
      canonicalLink.href = "https://mirabellier.com/shrine/kanna";
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "kanna-structured-data";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Kanna Shrine",
      description:
        "A cozy Kanna shrine page with favorite details, offerings, and a tiny ritual loop.",
      url: "https://mirabellier.com/shrine/kanna",
      about: [
        "Kanna Kamui",
        "Miss Kobayashi's Dragon Maid",
        "anime shrine page",
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

      document.getElementById("kanna-structured-data")?.remove();
    };
  }, []);

  return (
    <div className="shrine-page min-h-screen font-[sans-serif] text-blue-900 flex flex-col">
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
                    src={kannaShy}
                    width="320"
                    height="420"
                    alt="Kanna looking shy"
                    loading="lazy"
                  />
                </div>
                <p className="mt-3 text-center text-sm font-bold text-blue-600">
                  quiet guardian of the shrine
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
                  <div className="space-y-3">
                    <h2 className="text-3xl font-bold text-blue-700 lg:text-4xl">
                      Kanna Shrine
                    </h2>
                    <p className="max-w-2xl text-[15px] leading-7 text-slate-700">
                      A small room built for soft clouds, dragon daughter
                      appreciation, and the kind of calm that feels like a warm
                      blanket after a long day.
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
                      src="/kanna3.jpg"
                      width="320"
                      height="208"
                      alt="Kanna shrine image 3"
                      loading="eager"
                      style={{
                        boxShadow: "var(--tt-shadow-elevated-md)",
                      }}
                    />
                  </div>

                  <div>
                    <img
                      className="block h-52 w-full rounded-[1.35rem] object-cover object-top"
                      src="/kanna2.jpg"
                      width="320"
                      height="208"
                      alt="Kanna shrine image 2"
                      loading="lazy"
                      style={{
                        boxShadow: "var(--tt-shadow-elevated-md)",
                      }}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <img
                      className="block h-56 w-full rounded-[1.35rem] object-cover object-top"
                      src="/kanna1.jpg"
                      width="640"
                      height="224"
                      alt="Kanna shrine image"
                      loading="lazy"
                      style={{
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
                    Four humble items currently sustaining the emotional
                    ecosystem of this page.
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
                    A small record of the exact energy this page is trying to
                    protect.
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
                    The intended way to move through the page and leave with a
                    better mood.
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
                  Three little fragments that explain the shrine mood at a
                  glance.
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
                currently glowing at a very responsible level
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
                  className="w-full rounded-[1.15rem] object-cover"
                  src={kannaKobayashiPoster}
                  width="320"
                  height="430"
                  alt="Kanna poster art"
                  loading="lazy"
                />
              </div>
              <p className="mt-3 text-center text-sm font-bold text-blue-600">
                official blessing image
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

export default Kanna;
