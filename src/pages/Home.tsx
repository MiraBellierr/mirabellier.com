import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";

import { lazy, Suspense, useEffect, useState } from "react";
import { useOptionalAuth } from "@/hooks/use-optional-auth";

import { Link } from "react-router-dom";
import { fetchPosts } from "@/lib/blog-api";
import { slugify, type Post } from "@/lib/blog-utils";
import {
  fetchCurrentQuestionOfTheDay,
  type QuestionOfTheDayQuestion,
} from "@/lib/question-of-the-day-api";
import { usePageSeo } from "@/lib/seo";
import kannaKobayashi from "@/assets/anime/kanna-kobayashi.webp";

const DeferredAnimatedImage = lazy(
  () => import("@/components/DeferredAnimatedImage"),
);
const HOME_HERO_POSTER_SRC = "/kanna-kobayashi-poster.webp";
const MALAYSIA_TIMEZONE = "Asia/Kuala_Lumpur";
const HOME_HERO_ANIMATION_MEDIA_QUERY = "(min-width: 1024px)";

type HomeUpdatesState = {
  latestPost: Post | null;
  currentQuestion: QuestionOfTheDayQuestion | null;
};

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

function getHomeStatus(value: Date) {
  const hour = getMalaysiaHour(value);

  if (hour < 12) {
    return "Planning and polishing little details";
  }

  if (hour < 18) {
    return "Building features and shipping small improvements";
  }

  return "Writing updates and wrapping up the day's work";
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatHomeUpdateDate(value: string | null | undefined) {
  if (!value) {
    return "recently";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "recently";
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatHomeQuestionDate(recordedDate: string | null | undefined) {
  if (!recordedDate) {
    return "today";
  }

  const parsed = new Date(`${recordedDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return "today";
  }

  return parsed.toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

function truncateHomeText(value: string, maxLength = 96) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function getHomePostHref(post: Post | null) {
  if (!post) {
    return "/blog";
  }

  const postId = String(post.id || "").trim();
  if (!postId) {
    return "/blog";
  }

  const slug = slugify(post.title);
  return `/blog/${slug ? `${slug}-${postId}` : postId}`;
}

const Home = () => {
  const auth = useOptionalAuth();
  const [now, setNow] = useState(() => new Date());
  const [homeUpdates, setHomeUpdates] = useState<HomeUpdatesState>({
    latestPost: null,
    currentQuestion: null,
  });
  const [homeUpdatesLoading, setHomeUpdatesLoading] = useState(true);
  const [homeUpdatesError, setHomeUpdatesError] = useState<string | null>(null);
  const [showAnimatedHero, setShowAnimatedHero] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia(HOME_HERO_ANIMATION_MEDIA_QUERY).matches;
  });
  const clockParts = getHomeClockParts(now);
  const showClockSeparator = now.getSeconds() % 2 === 0;

  usePageSeo({
    canonical: "https://mirabellier.com/",
    structuredDataId: "home-structured-data",
    structuredData: {
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
    },
  });

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

  useEffect(() => {
    let isActive = true;

    const loadHomeUpdates = async () => {
      setHomeUpdatesLoading(true);
      setHomeUpdatesError(null);

      const [postsResult, questionResult] = await Promise.allSettled([
        fetchPosts(),
        fetchCurrentQuestionOfTheDay(),
      ]);

      if (!isActive) {
        return;
      }

      let latestPost: Post | null = null;
      let currentQuestion: QuestionOfTheDayQuestion | null = null;
      const failedSections: string[] = [];

      if (postsResult.status === "fulfilled") {
        latestPost =
          postsResult.value
            .slice()
            .sort(
              (left, right) =>
                toTimestamp(right.createdAt) - toTimestamp(left.createdAt),
            )[0] || null;
      } else {
        failedSections.push("blog");
      }

      if (questionResult.status === "fulfilled") {
        currentQuestion = questionResult.value.question;
      } else {
        failedSections.push("daily question");
      }

      setHomeUpdates({ latestPost, currentQuestion });
      setHomeUpdatesError(
        failedSections.length
          ? `Couldn't refresh ${failedSections.join(" and ")} right now.`
          : null,
      );
      setHomeUpdatesLoading(false);
    };

    void loadHomeUpdates();

    return () => {
      isActive = false;
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
              <p>• 💬 quotes</p>
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

                <div className="border-t border-blue-200/70 pt-4 dark:border-purple-300/20">
                  <p className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-400">
                    What I'm doing now
                  </p>

                  <div className="mt-3 space-y-3 px-1">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-blue-400">
                        status
                      </p>
                      <p className="text-xs font-semibold leading-snug text-blue-700 dark:text-purple-100">
                        {getHomeStatus(now)}
                      </p>
                    </div>

                    <div className="space-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-blue-400">
                        latest blog post
                      </p>
                      {homeUpdatesLoading ? (
                        <p className="text-[11px] leading-snug text-blue-500 dark:text-purple-200">
                          loading...
                        </p>
                      ) : homeUpdates.latestPost ? (
                        <>
                          <p className="text-xs font-bold leading-snug text-blue-700 dark:text-purple-100">
                            {truncateHomeText(homeUpdates.latestPost.title, 72)}
                          </p>
                          <p className="text-[11px] leading-snug text-blue-500 dark:text-purple-200">
                            posted {formatHomeUpdateDate(homeUpdates.latestPost.createdAt)}
                          </p>
                          <Link
                            to={getHomePostHref(homeUpdates.latestPost)}
                            className="inline-flex text-[11px] font-semibold text-blue-600 underline transition hover:text-blue-800 dark:text-pink-200 dark:hover:text-pink-100"
                          >
                            read post
                          </Link>
                        </>
                      ) : (
                        <p className="text-[11px] leading-snug text-blue-500 dark:text-purple-200">
                          No posts yet.
                        </p>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-blue-400">
                        today's question
                      </p>
                      {homeUpdatesLoading ? (
                        <p className="text-[11px] leading-snug text-blue-500 dark:text-purple-200">
                          loading...
                        </p>
                      ) : homeUpdates.currentQuestion?.prompt ? (
                        <>
                          <p className="text-xs font-bold leading-snug text-blue-700 dark:text-purple-100">
                            {truncateHomeText(homeUpdates.currentQuestion.prompt, 78)}
                          </p>
                          <p className="text-[11px] leading-snug text-blue-500 dark:text-purple-200">
                            for {formatHomeQuestionDate(homeUpdates.currentQuestion.recordedDate)}
                          </p>
                          <Link
                            to="/question-of-the-day"
                            className="inline-flex text-[11px] font-semibold text-blue-600 underline transition hover:text-blue-800 dark:text-pink-200 dark:hover:text-pink-100"
                          >
                            answer it
                          </Link>
                        </>
                      ) : (
                        <p className="text-[11px] leading-snug text-blue-500 dark:text-purple-200">
                          No question is live right now.
                        </p>
                      )}
                    </div>

                    {homeUpdatesError ? (
                      <p className="px-1 text-center text-[11px] font-semibold leading-snug text-pink-500 dark:text-pink-200">
                        {homeUpdatesError}
                      </p>
                    ) : null}
                  </div>
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
