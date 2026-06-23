import { useEffect, useRef, useState } from "react";
import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";
import kannaSmile from "@/assets/anime/kanna-smile.webp";
import { joinApi } from "@/lib/config";
import { usePageSeo } from "@/lib/seo";
import { useWebSocketEvent } from "@/hooks/use-websocket";

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

function getCurrentUtcRecordedDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

const Quotes = () => {
  const [data, setData] = useState<QuotePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/quotes",
    structuredDataId: "quotes-structured-data",
    structuredData: {
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
    },
  });

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

  const runRef = useRef<((signal: AbortSignal) => Promise<void>) | null>(null);

  useWebSocketEvent("quotes:new-day", () => {
    runRef.current?.(new AbortController().signal);
  });

  useEffect(() => {
    const initialController = new AbortController();
    let disposed = false;

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
        }
      } catch (err) {
        if (signal.aborted || disposed) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load quotes");
      } finally {
        if (showLoading && !signal.aborted && !disposed) {
          setLoading(false);
        }
      }
    };

    runRef.current = run;
    run(initialController.signal, true);

    return () => {
      disposed = true;
      initialController.abort();
    };
  }, []);

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
            {loading ? (
              <div className="space-y-3">
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
                      Loading quotes…↻
                      <pre className="whitespace-pre-wrap font-mono text-sm">
                        {`
                                                        
                            ╲⠀╲⠀╲             ╲

                            ⠀ ╲⠀╲⠀❀ ⠀          ╲ ⠀⠀⠀⠀⠀
                            
                            ⠀⠀⠀❀⠀ ╲⠀⠀⠀⠀⠀⠀⠀   ✿
                            
                            ⠀⠀⠀ ⠀⠀⠀⠀✿
                            
                            ╲⠀╲⠀╲             ╲
                            
                            ⠀⠀╲⠀╲⠀☆ ⠀          ╲ ⠀⠀⠀⠀⠀
                            
                                 ⠀☆⠀ ╲⠀⠀⠀⠀⠀⠀⠀   ★
                            
                                 ⠀⠀⠀ ⠀⠀★
                            
                        `}
                      </pre>
                    </h2>
                  </section>
                </div>
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

          <div className="w-full lg:w-1/5 mb-auto space-y-4">
            <aside className="right-side-panel bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
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

            <div className="hidden justify-center lg:flex">
              <img
                className="w-full max-w-[320px] border border-blue-700 shadow-md rounded-2xl"
                src={kannaSmile}
                width="320"
                height="427"
                alt="kanna smiling"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Quotes;
