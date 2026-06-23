import { useEffect, useState } from "react";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Divider from "../parts/Divider";
import kannaSmile from "@/assets/anime/kanna-smile.webp";
import { usePageSeo } from "@/lib/seo";
import { useWebSocket } from "@/states/WebSocketProvider";
import { useWebSocketEvent } from "@/hooks/use-websocket";
import {
  AnimeFeedApiError,
  fetchCurrentlyWatchingAnime,
  type CurrentlyWatchingAnimeItem,
  type CurrentlyWatchingAnimePayload,
} from "@/lib/anime-feed-api";

const ANIME_DESCRIPTION =
  "A live currently-watching anime page synced from MyAnimeList on a short backend refresh window.";
const ANIME_REFRESH_INTERVAL_MS = 60 * 1000;

function formatDateTime(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

function formatProgress(item: CurrentlyWatchingAnimeItem) {
  if (item.totalEpisodes) {
    return `${item.watchedEpisodes} / ${item.totalEpisodes} episodes`;
  }

  return `${item.watchedEpisodes} watched`;
}

function formatSeason(
  season: CurrentlyWatchingAnimeItem["startSeason"],
) {
  if (!season) {
    return "Season unknown";
  }

  const label = season.season
    ? `${season.season.slice(0, 1).toUpperCase()}${season.season.slice(1)}`
    : "Unknown";

  return `${label} ${season.year}`;
}

function formatMediaType(value: string | null) {
  if (!value) {
    return "Anime";
  }

  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatAnimeSummary(item: CurrentlyWatchingAnimeItem) {
  const parts = [formatMediaType(item.mediaType), formatProgress(item)];

  if (item.score !== null) {
    parts.push(`Score ${item.score}/10`);
  }

  return parts.join(" · ");
}

function formatAnimeDetails(item: CurrentlyWatchingAnimeItem) {
  return `Last update ${formatDateTime(item.updatedAt)} · ${formatSeason(
    item.startSeason,
  )}`;
}

const Anime = () => {
  const ws = useWebSocket();
  const [data, setData] = useState<CurrentlyWatchingAnimePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AnimeFeedApiError | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/anime",
    structuredDataId: "anime-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Mirabellier Currently Watching Anime",
      description: ANIME_DESCRIPTION,
      url: "https://mirabellier.com/anime",
    },
  });

  useWebSocketEvent("anime:currently-watching", (raw) => {
    const payload = raw as Record<string, unknown>;

    if (
      payload.code === "MAL_UNAVAILABLE" ||
      payload.code === "MAL_CONFIG_MISSING"
    ) {
      setError(
        new AnimeFeedApiError(
          typeof payload.message === "string"
            ? payload.message
            : "Failed to load currently watching anime",
          { code: payload.code as string },
        ),
      );
      return;
    }

    setData(payload as unknown as CurrentlyWatchingAnimePayload);
    setError(null);
  });

  useEffect(() => {
    let cancelled = false;

    const loadAnime = () => {
      ws.send({ type: "anime:subscribe" });
    };

    const intervalId = window.setInterval(() => {
      loadAnime();
    }, ANIME_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadAnime();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    void (async () => {
      try {
        const payload = await fetchCurrentlyWatchingAnime();
        if (cancelled) {
          return;
        }

        setData(payload);
        setError(null);
      } catch (err) {
        if (cancelled) {
          return;
        }

        const nextError =
          err instanceof AnimeFeedApiError
            ? err
            : new AnimeFeedApiError(
                err instanceof Error
                  ? err.message
                  : "Failed to load currently watching anime",
              );

        setError(nextError);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    ws.send({ type: "anime:subscribe" });

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [ws]);

  return (
    <div className="min-h-screen flex flex-col font-[sans-serif] text-blue-900">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-4 p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />

            <div className="mt-3 mb-auto hidden items-center justify-center lg:flex">
              <img
                className="w-full max-w-[320px] rounded-2xl border border-blue-700 shadow-md"
                src={kannaSmile}
                width="320"
                height="427"
                alt="kanna smiling"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>

          <main className="w-full space-y-2 p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/55 p-4">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-blue-700">
                  my currently watching anime !!!
                </h2>
              </div>

              {loading && !data ? (
                <div className="text-blue-500">Loading anime list...</div>
              ) : error && !data ? (
                <div
                  className={`rounded-xl border p-4 ${
                    error.code === "MAL_CONFIG_MISSING"
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-red-300 bg-red-50 text-red-700"
                  }`}
                >
                  <p className="font-semibold">
                    {error.code === "MAL_CONFIG_MISSING"
                      ? "The live anime sync is not configured yet."
                      : "The MyAnimeList feed is unavailable right now."}
                  </p>
                  <p className="mt-2 text-sm">{error.message}</p>
                </div>
              ) : !data ? (
                <div className="text-blue-500">Loading anime list...</div>
              ) : (
                <div className="space-y-4">
                  {data.stale ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                      MyAnimeList did not answer on the latest refresh, so this
                      page is showing the last successful snapshot from{" "}
                      {formatDateTime(data.fetchedAt)}.
                    </div>
                  ) : null}

                  {data.items.length === 0 ? (
                    <div className="rounded-xl border border-blue-100 bg-white/70 p-5 text-sm text-blue-500">
                      No anime are marked as currently watching on this public
                      MyAnimeList profile right now.
                    </div>
                  ) : (
                    <ol className="space-y-1">
                      {data.items.map((item, index) => (
                        <li
                          key={item.malId || item.url}
                          className="border-b border-blue-100 pb-3 last:border-b-0 last:pb-0"
                        >
                          <article className="flex items-start gap-3">
                            {item.coverImage ? (
                              <img
                                src={item.coverImage}
                                alt={item.title}
                                className="h-20 w-14 shrink-0 rounded-lg border border-blue-100 object-cover shadow-sm"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-blue-200 bg-blue-50 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-400">
                                no art
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="break-words font-bold text-blue-700">
                                {index + 1}. {item.title} ⊹{" "}
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-normal text-sm underline text-blue-600 hover:cursor-pointer hover:text-blue-800 break-all"
                                >
                                  (MyAnimeList)
                                </a>
                              </p>
                              <p className="text-sm text-slate-700">
                                {formatAnimeSummary(item)}
                              </p>
                              <p className="text-sm text-blue-500">
                                {formatAnimeDetails(item)}
                              </p>
                            </div>
                          </article>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </section>

            <Divider />
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  anime page notes
                </h2>
                <p>Here are my updated currently watching anime. ^-^</p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Anime;
