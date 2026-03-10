import { useEffect, useState } from "react";
import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";
import kannaSmile from "@/assets/anime/kanna-smile.webp";
import { joinApi } from "@/lib/config";

type QuoteEntry = {
  key: string;
  category: string;
  quote: string;
  author: string;
  quoteUrl?: string | null;
  authorUrl?: string | null;
  sourceUrl: string;
  publishedAt?: string | null;
};

type QuotePayload = {
  provider: string;
  sourceType: "html" | "rss";
  displayDate: string | null;
  publishedAt: string | null;
  recordedDate: string | null;
  quotesCount: number;
  primaryQuote: QuoteEntry | null;
  quotes: QuoteEntry[];
  fetchedAt: string;
  fallbackReason?: string;
  stale?: boolean;
  staleReason?: string;
};

const DEFAULT_DESCRIPTION =
  "Daily quotes across love, art, nature, humor, and more.";
const STALE_QUOTE_RETRY_MS = 60 * 1000;

function getCurrentUtcRecordedDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getDelayUntilNextUtcMidnight(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(next.getTime() - now.getTime(), 1000);
}

function isCurrentUtcQuotePayload(
  payload: QuotePayload | null,
  recordedDate: string,
) {
  return !!payload && payload.recordedDate === recordedDate && !payload.stale;
}

const Quotes = () => {
  const [data, setData] = useState<QuotePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canonicalLink = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement;
    if (canonicalLink) {
      canonicalLink.href = "https://mirabellier.com/quotes";
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "quotes-structured-data";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Mirabellier Quotes",
      description: DEFAULT_DESCRIPTION,
      url: "https://mirabellier.com/quotes",
      about: [
        "Quote of the Day",
        "Love Quote of the Day",
        "Art Quote of the Day",
        "Nature Quote of the Day",
        "Funny Quote Of the Day",
      ],
    });
    document.head.appendChild(script);

    return () => {
      const restoredCanonical = document.querySelector(
        'link[rel="canonical"]',
      ) as HTMLLinkElement;
      if (restoredCanonical) {
        restoredCanonical.href = "https://mirabellier.com/";
      }
      const oldScript = document.getElementById("quotes-structured-data");
      if (oldScript) {
        oldScript.remove();
      }
    };
  }, []);

  const loadQuotes = async (recordedDate: string, signal?: AbortSignal) => {
    const searchParams = new URLSearchParams({
      date: recordedDate,
      _rt: Date.now().toString(),
    });
    const response = await fetch(
      joinApi(`/quote-of-the-day?${searchParams.toString()}`),
      {
        signal,
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to load quotes (${response.status})`);
    }

    return (await response.json()) as QuotePayload;
  };

  useEffect(() => {
    const initialController = new AbortController();
    let scheduledController: AbortController | null = null;
    let midnightRefreshTimer: number | null = null;
    let staleRetryTimer: number | null = null;
    let disposed = false;

    const clearStaleRetry = () => {
      if (staleRetryTimer !== null) {
        window.clearTimeout(staleRetryTimer);
        staleRetryTimer = null;
      }
    };

    const scheduleStaleRetry = () => {
      if (disposed || staleRetryTimer !== null) {
        return;
      }

      staleRetryTimer = window.setTimeout(async () => {
        staleRetryTimer = null;
        scheduledController?.abort();
        scheduledController = new AbortController();
        await run(scheduledController.signal);
      }, STALE_QUOTE_RETRY_MS);
    };

    const run = async (signal: AbortSignal, showLoading = false) => {
      if (showLoading) {
        setLoading(true);
      }

      try {
        const currentRecordedDate = getCurrentUtcRecordedDate();
        const payload = await loadQuotes(currentRecordedDate, signal);
        if (!signal.aborted && !disposed) {
          setError(null);
          setData(payload);
          if (isCurrentUtcQuotePayload(payload, currentRecordedDate)) {
            clearStaleRetry();
          } else {
            scheduleStaleRetry();
          }
        }
      } catch (err) {
        if (signal.aborted || disposed) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load quotes");
        scheduleStaleRetry();
      } finally {
        if (showLoading && !signal.aborted && !disposed) {
          setLoading(false);
        }
      }
    };

    const scheduleRefresh = () => {
      midnightRefreshTimer = window.setTimeout(async () => {
        scheduledController?.abort();
        scheduledController = new AbortController();
        await run(scheduledController.signal);
        if (!disposed) {
          scheduleRefresh();
        }
      }, getDelayUntilNextUtcMidnight());
    };

    run(initialController.signal, true);
    scheduleRefresh();

    return () => {
      disposed = true;
      initialController.abort();
      scheduledController?.abort();
      clearStaleRetry();
      if (midnightRefreshTimer !== null) {
        window.clearTimeout(midnightRefreshTimer);
      }
    };
  }, []);

  const currentUtcRecordedDate = getCurrentUtcRecordedDate();
  const waitingForLatestUtcQuote =
    !!data && !isCurrentUtcQuotePayload(data, currentUtcRecordedDate);

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
          <div className="flex-grow flex-col">
            <Navigation />

            <div className="mt-3 mb-auto justify-center items-center hidden lg:flex">
              <img
                className="w-full max-w-[320px] border border-blue-700 shadow-md rounded-2xl"
                src={kannaSmile}
                width="320"
                height="427"
                alt="kanna smiling"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            {loading ? (
              <div className="card-border p-4 text-blue-600">
                Loading quotes...
              </div>
            ) : error && !data ? (
              <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
                {error}
              </div>
            ) : !data ? (
              <div className="card-border p-4 text-blue-600">
                Loading quotes...
              </div>
            ) : (
              <div className="space-y-3">
                {waitingForLatestUtcQuote ? (
                  <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-blue-700">
                    Waiting for the latest UTC quote snapshot. Refreshing
                    automatically...
                  </div>
                ) : null}
                {error ? (
                  <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-yellow-800">
                    Failed to refresh quotes at the UTC rollover. Showing the
                    last loaded snapshot.
                  </div>
                ) : null}
                <div className="relative space-y-2">
                    <img
                      className="pointer-events-none absolute h-14 w-14 object-contain"
                      src="/flower.png"
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

                    <section className="card-border space-y-3 p-4 bg-white/55">
                      <h2 className="mb-2 text-xl font-bold text-blue-700">
                        ⸜(｡˃ ᵕ ˂ )⸝♡ <span className="underline">Quote</span> of the day <span className="text-sm font-normal">({new Date(data.fetchedAt).toLocaleString()})</span>
                      </h2>
                      <div className="space-y-4">
                        {data.quotes.map((entry, index) => (
                          <div
                            key={entry.key}
                            className="space-y-1"
                          >
                            <p className="font-bold">
                              <span className="">
                                {index === 0 ? "❀ Featured quote ❀" : `°❀.࿔${entry.category}`}
                              </span>
                            </p>
                            <p className="italic text-slate-700">
                              "{entry.quote}" <span className="text-sm font-semibold text-blue-600">-- {entry.author}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                </div>
              </div>
            )}
            <Divider />
          </main>

          <aside className="w-full lg:w-1/5 mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
            <div className="space-y-3 text-sm text-blue-600">
              <h2 className="text-blue-700 font-bold text-lg text-center">
                tiny quote corner
              </h2>
              <p>
                This page gathers the daily quotes from brainyquote.com
              </p>
              <p>
                You get the main quote plus the love, art, nature, and funny
                picks.
              </p>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Quotes;
