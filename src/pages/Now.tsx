import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";
import AsyncStateCard from "@/components/AsyncStateCard";
import { usePageSeo } from "@/lib/seo";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import { fetchNow, type NowContent } from "@/lib/site-now-api";
import { fetchPosts } from "@/lib/blog-api";
import { slugify, type Post } from "@/lib/blog-utils";
import { fetchCurrentlyWatchingAnime } from "@/lib/anime-feed-api";
import { fetchPixiesFeed } from "@/lib/pixies";
import anyaSticker3 from "@/assets/anime/anya-sticker3.webp";
import anime1Gif from "@/assets/anime/anime1.webp";

type AutoFill = {
  latestPost: { title: string; href: string; date: string | null } | null;
  anime: { title: string; episodes: string | null } | null;
  latestPixie: { title: string; href: string } | null;
};

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDay(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatUpdatedAgo(value: string | null | undefined) {
  const day = formatDay(value);
  if (!value || !day) return null;

  const diffMs = Date.now() - new Date(value).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / dayMs);

  let relative = "today";
  if (days === 1) relative = "yesterday";
  else if (days > 1 && days < 30) relative = `${days} days ago`;
  else if (days >= 30) relative = day;

  return relative === day ? `Updated ${day}` : `Updated ${relative} · ${day}`;
}

function blogHref(post: Post) {
  const id = String(post.id || "").trim();
  if (!id) return "/blog";
  const slug = slugify(post.title);
  return `/blog/${slug ? `${slug}-${id}` : id}`;
}

const Now = () => {
  const auth = useOptionalAuth();
  const isOwner = canAccessAdminPanel(auth?.user);

  const [now, setNow] = useState<NowContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [autoFill, setAutoFill] = useState<AutoFill>({
    latestPost: null,
    anime: null,
    latestPixie: null,
  });

  usePageSeo({
    canonical: "https://mirabellier.com/now",
    structuredDataId: "now-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      name: "Now | Mirabellier",
      description:
        "What Mirabellier is focused on right now: reading, watching, building, and listening.",
      url: "https://mirabellier.com/now",
    },
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchNow();
        if (!cancelled) setNow(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load the now page");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  useEffect(() => {
    let cancelled = false;

    const loadAutoFill = async () => {
      const [postsResult, animeResult, pixiesResult] = await Promise.allSettled([
        fetchPosts(),
        fetchCurrentlyWatchingAnime(),
        fetchPixiesFeed(undefined, { limit: 1 }),
      ]);

      if (cancelled) return;

      const next: AutoFill = {
        latestPost: null,
        anime: null,
        latestPixie: null,
      };

      if (postsResult.status === "fulfilled") {
        const newest = postsResult.value
          .slice()
          .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))[0];
        if (newest) {
          next.latestPost = {
            title: newest.title,
            href: blogHref(newest),
            date: formatDay(newest.createdAt),
          };
        }
      }

      if (animeResult.status === "fulfilled") {
        const first = animeResult.value.items[0];
        if (first) {
          next.anime = {
            title: first.title,
            episodes:
              first.watchedEpisodes > 0
                ? `episode ${first.watchedEpisodes}${first.totalEpisodes ? ` / ${first.totalEpisodes}` : ""}`
                : null,
          };
        }
      }

      if (pixiesResult.status === "fulfilled") {
        const first = pixiesResult.value[0];
        if (first) {
          next.latestPixie = {
            title: first.title || "latest pixie",
            href: `/pixies/${first.id}`,
          };
        }
      }

      setAutoFill(next);
    };

    void loadAutoFill();
    return () => {
      cancelled = true;
    };
  }, []);

  const updatedLabel = useMemo(
    () => formatUpdatedAgo(now?.updatedAt),
    [now?.updatedAt],
  );

  const hasContent = Boolean(now && (now.intro || now.sections.length));

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
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

              <section className="card-border space-y-4 p-4 bg-white/55">
                <div>
                  <h2 className="text-2xl font-bold text-blue-700">
                    what I&apos;m doing now
                  </h2>
                  <p className="text-sm text-blue-500">
                    What has my attention lately (not a resume).
                  </p>
                  {updatedLabel ? (
                    <p className="mt-1 text-xs font-medium text-blue-400">
                      {updatedLabel}
                    </p>
                  ) : null}
                </div>

                {loading ? (
                  <AsyncStateCard
                    variant="loading"
                    title="Loading the now page..."
                    message="Catching up on what's current."
                  />
                ) : error ? (
                  <AsyncStateCard
                    variant="error"
                    title="Couldn't load the now page"
                    message={error}
                    actionLabel="Retry"
                    onAction={() => setReloadTick((value) => value + 1)}
                  />
                ) : !hasContent ? (
                  <AsyncStateCard
                    variant="empty"
                    title="Nothing here yet"
                    message={
                      isOwner
                        ? "Use the edit button above to add your first update."
                        : "This page is waiting for its first update. Check back soon."
                    }
                  />
                ) : (
                  <div className="space-y-5">
                    {now?.intro ? (
                      <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">
                        {now.intro}
                      </p>
                    ) : null}

                    {now?.sections.length ? (
                      <div className="space-y-4">
                        {now.sections.map((section, index) => (
                          <article
                            key={`${section.label}-${index}`}
                            className={
                              index > 0 ? "border-t border-blue-100 pt-4" : ""
                            }
                          >
                            {section.label ? (
                              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
                                {section.label}
                              </h3>
                            ) : null}
                            {section.body ? (
                              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                                {section.body}
                              </p>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            </div>

            <Divider />

            <section className="card-border space-y-3 p-4 bg-white/55">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-blue-700">
                  website updates and other current things (auto)
                </h3>
                <p className="text-sm text-blue-500">
                  These stay current on their own from the rest of the site.
                </p>
              </div>

              <div className="relative">
                <img
                  className="pointer-events-none mx-auto block w-24 sm:absolute sm:right-2 sm:top-1/2 sm:mx-0 sm:w-32 sm:-translate-y-1/2"
                  src={anyaSticker3}
                  width="500"
                  height="500"
                  alt="Anya sticker"
                  loading="lazy"
                  decoding="async"
                />

                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                      latest blog post
                    </dt>
                    <dd className="mt-0.5">
                      {autoFill.latestPost ? (
                        <Link
                          to={autoFill.latestPost.href}
                          className="font-semibold text-blue-700 underline underline-offset-2 hover:text-pink-600"
                        >
                          {autoFill.latestPost.title}
                        </Link>
                      ) : (
                        <span className="text-blue-400">nothing yet</span>
                      )}
                      {autoFill.latestPost?.date ? (
                        <span className="ml-2 text-xs text-blue-400">
                          {autoFill.latestPost.date}
                        </span>
                      ) : null}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                      currently watching
                    </dt>
                    <dd className="mt-0.5">
                      {autoFill.anime ? (
                        <Link
                          to="/anime"
                          className="font-semibold text-blue-700 underline underline-offset-2 hover:text-pink-600"
                        >
                          {autoFill.anime.title}
                        </Link>
                      ) : (
                        <span className="text-blue-400">nothing right now</span>
                      )}
                      {autoFill.anime?.episodes ? (
                        <span className="ml-2 text-xs text-blue-400">
                          {autoFill.anime.episodes}
                        </span>
                      ) : null}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                      latest pixie
                    </dt>
                    <dd className="mt-0.5">
                      {autoFill.latestPixie ? (
                        <Link
                          to={autoFill.latestPixie.href}
                          className="font-semibold text-blue-700 underline underline-offset-2 hover:text-pink-600"
                        >
                          {autoFill.latestPixie.title}
                        </Link>
                      ) : (
                        <span className="text-blue-400">nothing yet</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  about this page
                </h2>
                <p>
                  A <span className="font-semibold">/now</span> page says what
                  I&apos;m focused on at this point in my life.
                </p>
                <p>
                  It changes as things change, so if it looks kinda outdated, poke me
                  about it.
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <img
                className="w-full max-w-[220px] rounded-xl"
                src={anime1Gif}
                width="500"
                height="281"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
            </div>

            {isOwner ? (
              <Link
                to="/admin/now"
                className="block rounded-full border border-blue-200 bg-white px-4 py-2 text-center text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
              >
                edit
              </Link>
            ) : null}
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Now;
