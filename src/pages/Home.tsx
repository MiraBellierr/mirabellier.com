import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";

import { lazy, Suspense, useEffect, useState } from "react";
import { useOptionalAuth } from "@/hooks/use-optional-auth";

import { Link } from "react-router-dom";
import kannaKobayashi from "@/assets/anime/kanna-kobayashi.webp";

const DeferredAnimatedImage = lazy(
  () => import("@/components/DeferredAnimatedImage"),
);
const HOME_HERO_POSTER_SRC = "/kanna-kobayashi-poster.webp";
const MALAYSIA_TIMEZONE = "Asia/Kuala_Lumpur";
const HOME_HERO_ANIMATION_MEDIA_QUERY = "(min-width: 1024px)";

function getHomeClockParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-MY", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: MALAYSIA_TIMEZONE,
  }).formatToParts(value);

  return {
    hour: parts.find((part) => part.type === "hour")?.value || "12",
    minute: parts.find((part) => part.type === "minute")?.value || "00",
    dayPeriod:
      parts.find((part) => part.type === "dayPeriod")?.value?.toUpperCase() ||
      "",
  };
}

function formatHomeDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: MALAYSIA_TIMEZONE,
  }).format(value);
}

function getMalaysiaHour(value: Date) {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: MALAYSIA_TIMEZONE,
  }).format(value);
  const parsed = Number(formatted);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getHomeGreeting(value: Date) {
  const hour = getMalaysiaHour(value);

  if (hour < 12) {
    return "soft morning ₊˚☀︎⋆ೃ*:･🌻･";
  }

  if (hour < 18) {
    return "sunny afternoon ོ₊⁺☀︎₊⁺⋆.˚";
  }

  return "cozy night ⋆.˚ ☾⭒.˚";
}

const Home = () => {
  const auth = useOptionalAuth();
  const [now, setNow] = useState(() => new Date());
  const [showAnimatedHero, setShowAnimatedHero] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia(HOME_HERO_ANIMATION_MEDIA_QUERY).matches;
  });
  const clockParts = getHomeClockParts(now);
  const showClockSeparator = now.getSeconds() % 2 === 0;

  useEffect(() => {
    const canonicalLink = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement;
    if (canonicalLink) {
      canonicalLink.href = "https://mirabellier.com/";
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "home-structured-data";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Mirabellier",
      description:
        "A tiny, cozy blog sharing small joys, photos, and short posts",
      url: "https://mirabellier.com/",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://mirabellier.com/blog?search={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    });
    document.head.appendChild(script);

    return () => {
      const oldScript = document.getElementById("home-structured-data");
      if (oldScript) oldScript.remove();
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(HOME_HERO_ANIMATION_MEDIA_QUERY);
    const updateAnimatedHero = () => {
      setShowAnimatedHero(mediaQuery.matches);
    };

    updateAnimatedHero();
    mediaQuery.addEventListener("change", updateAnimatedHero);

    return () => {
      mediaQuery.removeEventListener("change", updateAnimatedHero);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col font-[sans-serif] text-blue-900">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />

            <div className="mt-3 mb-auto flex items-center justify-center">
              {showAnimatedHero ? (
                <Suspense
                  fallback={
                    <img
                      className="h-auto w-[200px] rounded-2xl border border-blue-700 shadow-md sm:w-[240px] lg:w-[300px]"
                      src={HOME_HERO_POSTER_SRC}
                      width="300"
                      height="404"
                      alt="anime poster"
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                    />
                  }
                >
                  <DeferredAnimatedImage
                    className="h-auto w-[200px] rounded-2xl border border-blue-700 shadow-md sm:w-[240px] lg:w-[300px]"
                    posterSrc={HOME_HERO_POSTER_SRC}
                    animatedSrc={kannaKobayashi}
                    width="300"
                    height="404"
                    alt="anime gif"
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    waitForLcp
                  />
                </Suspense>
              ) : (
                <img
                  className="h-auto w-[200px] rounded-2xl border border-blue-700 shadow-md sm:w-[240px] lg:w-[300px]"
                  src={HOME_HERO_POSTER_SRC}
                  width="300"
                  height="404"
                  alt="anime poster"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
              )}
            </div>
          </div>

          <main className="w-full space-y-2 p-4 lg:w-3/5">
            <div className="card-border space-y-1 p-4">
              <h2 className="mb-2 text-xl font-bold text-blue-700">
                🌸 About Me 🌸
              </h2>
              <p>Hiya!! I&apos;m Mirabellier! 💙</p>
              <p>
                I&apos;m just a{" "}
                <span className="font-bold text-blue-600">
                  chill internet spirit
                </span>{" "}
                who loves{" "}
                <span className="font-bold text-blue-600 underline">cute</span>{" "}
                things, and making friends!
              </p>
              <p>
                I also enjoy programming, watching anime and cuddling with my
                cat. (I love cats!! 😸)
              </p>
              <div className="mt-2 text-sm text-blue-500">
                <p>If you see this, you&apos;re cute!!</p>
              </div>
              <div className="mt-2 border-t border-blue-200 pt-2 text-[14px]">
                <p className="pr-2">channeling my phychic power. ⚡</p>
              </div>
            </div>

            <Divider variant="image" />

            <div className="card-border space-y-1 p-4">
              <h2 className="mb-2 text-xl font-bold text-blue-700">
                🧠 Random Facts!
              </h2>
              <p>
                • My favorite color is{" "}
                <span className="font-bold text-blue-300">pastel blue</span> 💙
              </p>
              <p>• I love collecting plushies and stickers</p>
              <p>• Sometimes I stay up too late making silly stuff like this</p>
              <p>• I think you&apos;re awesome just for being here ^-^</p>
            </div>

            <Divider variant="image" />

            <div className="card-border space-y-1 p-4">
              <h2 className="mb-2 text-xl font-bold text-blue-700">
                💬 What You&apos;ll Find Here
              </h2>
              <p>
                This site is just my little corner of the web where I share my
                thoughts, memories, and maybe some projects I&apos;m working on! I
                might add more pages soon, like:
              </p>
              <p>• ✏️ My blog</p>
              <p>• 🎨 Art or doodles</p>
              <p>• 💾 Programming experiments</p>
            </div>
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel relative overflow-hidden rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b"
              />

              <div className="relative space-y-4 text-sm">
                <div className="p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-400">
                    my time
                  </p>
                  <div className="mt-2 flex items-end gap-2 text-blue-700">
                    <p className="text-3xl font-bold tabular-nums">
                      <span>{clockParts.hour}</span>
                      <span
                        aria-hidden="true"
                        className={`inline-block w-[0.55ch] text-center transition-opacity duration-150 ${
                          showClockSeparator ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        :
                      </span>
                      <span>{clockParts.minute}</span>
                    </p>
                    {clockParts.dayPeriod ? (
                      <span className="pb-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-400">
                        {clockParts.dayPeriod}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-blue-500">
                    {formatHomeDate(now)}
                  </p>
                  <p className="home-clock-greeting mt-3 rounded-full bg-pink-100/70 px-3 py-1 text-center text-xs font-bold tracking-[0.16em] text-pink-600">
                    {getHomeGreeting(now)}
                  </p>
                </div>

                {auth &&
                  auth.user &&
                  (auth.user as any).discordId === "548050617889980426" && (
                    <div className="text-center">
                      <Link
                        to="/admin"
                        className="inline-flex rounded-full border border-pink-200 bg-white/80 px-4 py-2 text-sm font-semibold text-pink-500 transition hover:bg-pink-50"
                      >
                        Open admin
                      </Link>
                    </div>
                  )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Home;
