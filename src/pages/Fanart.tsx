import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Divider from "../parts/Divider";
import { usePageSeo } from "@/lib/seo";
import {
  FanArtApiError,
  searchFanArt,
  type FanArtItem,
  type FanArtSearchPayload,
  type FanArtSite,
} from "@/lib/fanart-api";

const FANART_DESCRIPTION =
  "Search anime fan art across Safebooru and Pixiv, with links back to each artist's original post.";

const SITE_OPTIONS: Array<{ value: FanArtSite; label: string }> = [
  { value: "safebooru", label: "Safebooru" },
  { value: "pixiv", label: "Pixiv" },
];

const PAGE_LIMIT = 24;
const DEFAULT_QUERY = "kanna kamui";

function mergeItems(payloads: FanArtSearchPayload[]) {
  const seen = new Set<string>();

  return payloads.flatMap((payload) =>
    payload.sites.flatMap((siteResult) =>
      siteResult.items.filter((item) => {
        const key = `${item.site}:${item.id}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      }),
    ),
  );
}

function sortItems(items: FanArtItem[]) {
  return [...items].sort((left, right) => {
    const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return left.postUrl.localeCompare(right.postUrl);
  });
}

function FanArtCard({
  item,
  onOpen,
}: {
  item: FanArtItem;
  onOpen: (item: FanArtItem) => void;
}) {
  return (
    <figure className="card-border mb-4 break-inside-avoid overflow-hidden rounded-2xl bg-white/70 p-2 shadow-sm">
      <button
        type="button"
        className="block w-full overflow-hidden rounded-xl text-left"
        onClick={() => onOpen(item)}
        title={item.title || `View full image (${item.site})`}
      >
        <img
          src={item.imageUrl || item.sampleUrl || item.thumbnailUrl}
          alt={item.title || item.tags.slice(0, 3).join(", ")}
          className="w-full object-cover transition hover:scale-[1.02] hover:opacity-90"
          width={item.width ?? undefined}
          height={item.height ?? undefined}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </button>
      <figcaption className="space-y-1 px-1 pt-2 pb-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-bold text-blue-700 dark:text-purple-100">
            {item.artist || "???"}
          </span>
        </div>
        {item.artistUrl ? (
          <a
            href={item.artistUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs text-blue-600 underline hover:text-blue-800 dark:text-purple-300 dark:hover:text-purple-100"
          >
            artist page
          </a>
        ) : null}
        {item.score !== null ? (
          <p className="text-xs text-slate-500">♥ {item.score}</p>
        ) : null}
      </figcaption>
    </figure>
  );
}

function FanArtLightbox({
  item,
  items,
  onClose,
  onNavigate,
}: {
  item: FanArtItem;
  items: FanArtItem[];
  onClose: () => void;
  onNavigate: (item: FanArtItem) => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [item]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      const index = items.findIndex(
        (candidate) =>
          candidate.site === item.site && candidate.id === item.id,
      );

      if (event.key === "ArrowRight" && index >= 0) {
        onNavigate(items[(index + 1) % items.length]);
      }

      if (event.key === "ArrowLeft" && index >= 0) {
        onNavigate(items[(index - 1 + items.length) % items.length]);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [item, items, onClose, onNavigate]);

  const fullUrl = item.imageUrl || item.sampleUrl || item.thumbnailUrl;
  const dimensions =
    item.width !== null && item.height !== null
      ? `${item.width} × ${item.height}`
      : null;

  return (
    <div
      className="fanart-lightbox fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Full image by ${item.artist || "???"}`}
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-2xl font-bold text-white transition hover:bg-white/30"
        onClick={onClose}
        aria-label="Close image viewer"
      >
        ×
      </button>

      {items.length > 1 ? (
        <>
          <button
            type="button"
            className="absolute left-2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-2xl font-bold text-white transition hover:bg-white/30 sm:left-4"
            onClick={(event) => {
              event.stopPropagation();
              const index = items.findIndex(
                (candidate) =>
                  candidate.site === item.site && candidate.id === item.id,
              );
              onNavigate(items[(index - 1 + items.length) % items.length]);
            }}
            aria-label="Previous image"
          >
            ‹
          </button>
          <button
            type="button"
            className="absolute right-2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-2xl font-bold text-white transition hover:bg-white/30 sm:right-4"
            onClick={(event) => {
              event.stopPropagation();
              const index = items.findIndex(
                (candidate) =>
                  candidate.site === item.site && candidate.id === item.id,
              );
              onNavigate(items[(index + 1) % items.length]);
            }}
            aria-label="Next image"
          >
            ›
          </button>
        </>
      ) : null}

      <div
        className="flex max-h-full max-w-5xl flex-col items-center gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative flex min-h-[200px] items-center justify-center">
          {!imageLoaded && !imageError ? (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <span className="animate-pulse text-sm font-semibold">
                loading full image...
              </span>
            </div>
          ) : null}

          {imageError ? (
            <div className="rounded-xl border border-red-400 bg-red-950/60 p-5 text-center text-sm text-red-200">
              The full image failed to load.
              <a
                href={item.postUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block font-bold text-white underline"
              >
                open the original post instead
              </a>
            </div>
          ) : (
            <img
              src={fullUrl}
              alt={item.title || item.tags.slice(0, 3).join(", ")}
              className={`max-h-[72vh] max-w-full rounded-xl object-contain shadow-2xl transition-opacity duration-200 ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              referrerPolicy="no-referrer"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-sm text-white">
          <span className="font-bold">{item.artist || "???"}</span>
          <span
            className={`fanart-site-badge fanart-site-badge--${item.site} rounded-full border-2 px-2 py-0.5 text-xs font-bold uppercase tracking-wide`}
          >
            {item.site}
          </span>
          {item.score !== null ? <span>♥ {item.score}</span> : null}
          {dimensions ? <span className="text-white/70">{dimensions}</span> : null}
          {item.postUrl ? (
            <a
              href={item.postUrl}
              target="_blank"
              rel="noreferrer"
              className="font-bold underline hover:text-blue-200"
            >
              view original post
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const Fanart = () => {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [sites, setSites] = useState<FanArtSite[]>([]);
  const [rating, setRating] = useState<"safe" | "all">("safe");
  const [payloads, setPayloads] = useState<FanArtSearchPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FanArtApiError | null>(null);
  const [selectedItem, setSelectedItem] = useState<FanArtItem | null>(null);
  const [showNsfwWarning, setShowNsfwWarning] = useState(true);
  const navigate = useNavigate();

  usePageSeo({
    canonical: "https://mirabellier.com/fanart",
    structuredDataId: "fanart-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Mirabellier Fan Art Search",
      description: FANART_DESCRIPTION,
      url: "https://mirabellier.com/fanart",
    },
  });

  const latestPayload = payloads[payloads.length - 1] ?? null;
  const latestQuery = latestPayload?.query ?? "";
  const items = useMemo(
    () => sortItems(mergeItems(payloads)),
    [payloads],
  );

  const groupedItems = useMemo(
    () =>
      SITE_OPTIONS.map((option) => ({
        ...option,
        items: items.filter((item) => item.site === option.value),
      })).filter((group) => group.items.length > 0),
    [items],
  );

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedItem]);

  useEffect(() => {
    if (showNsfwWarning) {
      return;
    }

    void runSearch({ query: DEFAULT_QUERY });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNsfwWarning]);

  const toggleSite = (site: FanArtSite) => {
    setSites((current) =>
      current.includes(site)
        ? current.filter((value) => value !== site)
        : [...current, site],
    );
  };

  const activeSites = (() => {
    if (sites.length > 0) {
      return sites;
    }

    return ["safebooru", "pixiv"] as FanArtSite[];
  })();

  const runSearch = async (input: { query: string; page?: number }) => {
    const trimmedQuery = input.query.trim();
    if (!trimmedQuery) {
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedItem(null);

    try {
      const payload = await searchFanArt({
        query: trimmedQuery,
        page: input.page ?? 1,
        limit: PAGE_LIMIT,
        sites: activeSites,
        rating,
      });

      setPayloads((current) => {
        if (input.page && input.page > 1) {
          return [...current, payload];
        }
        return [payload];
      });
    } catch (err) {
      setPayloads([]);
      setError(
        err instanceof FanArtApiError
          ? err
          : new FanArtApiError(
              err instanceof Error ? err.message : "Failed to search fan art",
            ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch({ query });
  };

  const handleLoadMore = () => {
    if (!latestPayload) {
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    void runSearch({ query: latestPayload.query, page: latestPayload.page + 1 });
  };

  const unavailableSites =
    latestPayload?.sites.filter((siteResult) => !siteResult.available) ?? [];

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
              <p className="max-w-[320px] text-center text-sm text-blue-600 dark:text-purple-300">
                fan art belongs to the artists — every result links back to the
                original post ^-^
              </p>
            </div>
          </div>

          <main className="w-full space-y-2 p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/55 p-4">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-blue-700">
                  anime fan art search !!!
                </h2>
                <p className="text-sm text-slate-700">
                  Type an anime or character name to browse art from multiple
                  sites at once.
                </p>
              </div>

              <form
                className="space-y-3"
                onSubmit={handleSubmit}
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="w-full rounded-xl border border-blue-200 bg-white/80 px-3 py-2 text-sm text-blue-900 outline-none placeholder:text-blue-300 focus:border-blue-400 dark:border-purple-400/30 dark:bg-purple-900/40 dark:text-purple-100 dark:placeholder:text-purple-300/60"
                    type="search"
                    placeholder="e.g. kanna kamui"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    maxLength={120}
                    aria-label="Fan art search query"
                  />
                  <button
                    className="shrink-0 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    type="submit"
                    disabled={loading || !query.trim()}
                  >
                    {loading ? "searching..." : "search"}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  {SITE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-1.5 text-blue-700 dark:text-purple-200"
                    >
                      <input
                        type="checkbox"
                        className="accent-blue-600"
                        checked={sites.includes(option.value)}
                        onChange={() => toggleSite(option.value)}
                      />
                      {option.label}
                    </label>
                  ))}

                  <select
                    className="ml-auto rounded-lg border border-blue-200 bg-white/80 px-2 py-1 text-sm text-blue-700 outline-none focus:border-blue-400 dark:border-purple-400/30 dark:bg-purple-900/40 dark:text-purple-200"
                    value={rating}
                    onChange={(event) =>
                      setRating(event.target.value === "all" ? "all" : "safe")
                    }
                    aria-label="Content rating filter"
                  >
                    <option value="safe">safe only</option>
                    <option value="all">all ratings</option>
                  </select>
                </div>
              </form>

              {error ? (
                <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
                  <p className="font-semibold">
                    The fan art search failed.
                  </p>
                  <p className="mt-2 text-sm">{error.message}</p>
                </div>
              ) : null}

              {unavailableSites.length > 0 ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                  {unavailableSites.map((siteResult) => (
                    <p key={siteResult.site}>
                      <span className="font-semibold capitalize">
                        {siteResult.site}
                      </span>
                      : {siteResult.error}
                    </p>
                  ))}
                </div>
              ) : null}

              {!latestPayload && !loading && !error ? (
                <div className="rounded-xl border border-blue-100 bg-white/70 p-5 text-sm text-blue-500 dark:border-purple-400/20 dark:bg-purple-950/40 dark:text-purple-300">
                  Search for an anime to see fan art from your selected sites.
                </div>
              ) : null}

              {latestPayload && items.length === 0 && !loading && !error ? (
                <div className="rounded-xl border border-blue-100 bg-white/70 p-5 text-sm text-blue-500 dark:border-purple-400/20 dark:bg-purple-950/40 dark:text-purple-300">
                  No fan art found for “{latestQuery}”. Try a different name or
                  include more sites.
                </div>
              ) : null}

              {items.length > 0 ? (
                <div className="space-y-6">
                  <p className="text-xs text-blue-500 dark:text-purple-300">
                    {items.length} result{items.length === 1 ? "" : "s"} for{" "}
                    “{latestQuery}” · click an image to view it full size
                  </p>

                  {groupedItems.map((group) => (
                    <div key={group.value} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700 dark:text-purple-200">
                          {group.label}
                        </h3>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:bg-purple-900/60 dark:text-purple-100">
                          {group.items.length}
                        </span>
                        <div className="h-px flex-1 bg-blue-200/70 dark:bg-purple-300/20" />
                      </div>

                      <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
                        {group.items.map((item) => (
                          <FanArtCard
                            key={`${item.site}:${item.id}`}
                            item={item}
                            onOpen={setSelectedItem}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-center pt-2">
                    <button
                      className="rounded-xl border border-blue-300 bg-white/80 px-5 py-2 text-sm font-bold text-blue-600 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-400/40 dark:bg-purple-900/40 dark:text-purple-200 dark:hover:bg-purple-900/60"
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loading}
                    >
                      {loading ? "loading..." : "load more"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <Divider />
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  fan art notes
                </h2>
                <p>
                  Results come from Safebooru tag searches, plus Pixiv when it
                  is configured on the server.
                </p>
                <p>
                  Artwork stays on the original sites — this page only links to
                  the artist posts, it does not host anything.
                </p>
                <p>
                  The safe rating filter is on by default. Switching to “all
                  ratings” can include adult content.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {showNsfwWarning ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="fanart-nsfw-warning-title"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border-4 border-blue-300 bg-white p-6 text-blue-900 shadow-2xl dark:border-purple-400/40 dark:bg-purple-950 dark:text-purple-100">
            <h2
              id="fanart-nsfw-warning-title"
              className="text-center text-2xl font-bold text-blue-700 dark:text-purple-200"
            >
              nsfw warning !!!
            </h2>
            <p className="text-sm leading-relaxed">
              this page searches fan art from multiple sites and can include
              adult or suggestive content.
            </p>
            <p className="text-sm leading-relaxed">
              the safe only filter is on by default, but switching to all
              ratings can show explicit material.
            </p>
            <p className="text-sm leading-relaxed">
              safe only does not guarantee safe results either — mislabeled or
              borderline posts can slip through, so some results may still
              contain questionable content.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-500"
                onClick={() => setShowNsfwWarning(false)}
              >
                i understand, show me the fan art
              </button>
              <button
                type="button"
                className="rounded-xl border border-blue-300 bg-white/80 px-5 py-2 text-sm font-bold text-blue-600 shadow-sm transition hover:bg-blue-50 dark:border-purple-400/40 dark:bg-purple-900/40 dark:text-purple-100 dark:hover:bg-purple-900/60"
                onClick={() => navigate("/")}
              >
                take me back home
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedItem ? (
        <FanArtLightbox
          item={selectedItem}
          items={items}
          onClose={() => setSelectedItem(null)}
          onNavigate={setSelectedItem}
        />
      ) : null}

      <Footer />
    </div>
  );
};

export default Fanart;
