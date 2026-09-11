import { useEffect, useMemo, useState } from "react";

import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";
import AsyncStateCard from "@/components/AsyncStateCard";
import { usePageSeo } from "@/lib/seo";
import { getFriendlyFetchMessage } from "@/lib/friendly-fetch-message";
import { fetchSiteStats, type SiteStats } from "@/lib/site-stats";
import { guestbookMoodMeta } from "@/lib/guestbook-ui";
import anime6Gif from "@/assets/anime/anime6.webp";

const STATS_DESCRIPTION =
  "Sitewide numbers for mirabellier.com: posts written, guestbook signatures, Question of the Day answers, Arena fights, and more.";

function formatNumber(value: number) {
  return value.toLocaleString();
}

function formatSinceDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-blue-700 dark:text-purple-200">{label}</dt>
      <dd className="font-bold text-blue-700 dark:text-purple-200">
        {formatNumber(value)}
      </dd>
    </div>
  );
}

const Stats = () => {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  usePageSeo({
    canonical: "https://mirabellier.com/stats",
    structuredDataId: "stats-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Stats | Mirabellier",
      description: STATS_DESCRIPTION,
      url: "https://mirabellier.com/stats",
    },
  });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchSiteStats(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setStats(data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load stats");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadTick]);

  const friendlyError = useMemo(
    () => getFriendlyFetchMessage("Site stats", error),
    [error],
  );

  const since = formatSinceDate(stats?.sinceDate ?? null);
  const topMood = stats?.topGuestbookMood
    ? guestbookMoodMeta[stats.topGuestbookMood]
    : null;

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
                  site stats
                </h2>
                <p className="text-sm text-blue-500">{STATS_DESCRIPTION}</p>
                {since ? (
                  <p className="mt-1 text-xs font-medium text-blue-400">
                    Running since {since}
                  </p>
                ) : null}
              </div>

              {loading ? (
                <AsyncStateCard
                  variant="loading"
                  title="Loading stats..."
                  message="Adding everything up."
                />
              ) : error ? (
                <AsyncStateCard
                  variant="error"
                  title={friendlyError.title}
                  message={friendlyError.message}
                  detail={friendlyError.detail}
                  actionLabel="Retry"
                  onAction={() => setReloadTick((value) => value + 1)}
                />
              ) : stats ? (
                <>
                  <dl>
                    <StatRow label="blog posts" value={stats.postsCount} />
                    <StatRow
                      label="guestbook signatures"
                      value={stats.guestbookCount}
                    />
                    <StatRow
                      label="QOTD answers"
                      value={stats.qotdAnswersCount}
                    />
                    <StatRow
                      label="QOTD questions asked"
                      value={stats.qotdQuestionsCount}
                    />
                    <StatRow
                      label="Arena fights"
                      value={stats.arenaFightsCount}
                    />
                    <StatRow label="Pixies posted" value={stats.pixiesCount} />
                  </dl>

                  {topMood && (
                    <div>
                      <h3 className="text-sm font-semibold text-blue-700 dark:text-purple-200">
                        Most popular guestbook mood: {topMood.label}
                      </h3>
                      <dl className="mt-2">
                        {stats.guestbookMoods.map((entry) => (
                          <StatRow
                            key={entry.mood}
                            label={guestbookMoodMeta[entry.mood].label}
                            value={entry.count}
                          />
                        ))}
                      </dl>
                    </div>
                  )}
                </>
              ) : null}
              </section>
            </div>

            <Divider />
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  about this page
                </h2>
                <p>Sitewide numbers, updated live as people use the site.</p>
              </div>
            </div>

            <div className="flex justify-center">
              <img
                className="w-full max-w-[220px] rounded-xl"
                src={anime6Gif}
                width="500"
                height="281"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Stats;
