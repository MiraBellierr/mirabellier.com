import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import ArenaSubNav from "@/parts/ArenaSubNav";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  ArenaApiError,
  fetchArenaArchive,
  type ArenaArchiveResponse,
} from "@/lib/arena";

type ArchiveOwnershipFilter = "all" | "owned" | "not-owned";

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena archive request failed.";
}

const ArenaArchive = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;

  const [archive, setArchive] = useState<ArenaArchiveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [ownership, setOwnership] = useState<ArchiveOwnershipFilter>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/arena/archive",
    structuredDataId: "arena-archive-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Card Archive",
      description: "Search the Arena character card catalog.",
      url: "https://mirabellier.com/arena/archive",
    },
  });

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setArchive(null);
      return () => {
        cancelled = true;
      };
    }

    const loadArchive = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const payload = await fetchArenaArchive(token, {
          page,
          perPage: 12,
          search: query || undefined,
          ownership,
        });
        if (cancelled) return;
        setArchive(payload);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadArchive();
    return () => {
      cancelled = true;
    };
  }, [token, page, query, ownership]);

  const cards = archive?.cards || [];
  const totalPages = archive?.totalPages || 1;

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
          </div>
          <main className="w-full space-y-2 p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/60 p-4 dark:bg-slate-900/70">
              <div>
                <h2 className="text-4xl font-bold text-blue-900 dark:text-purple-100">
                  Card Archive {`>^. .^<`}
                </h2>
                <p className="mt-2 text-sm font-black text-blue-800 sm:text-base dark:text-purple-200">
                  Search the Arena catalog by character or appearance.
                </p>
              </div>

              <ArenaSubNav />

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
                  <p className="font-semibold">Login is required to view archive.</p>
                  <Link to="/login" className="mt-2 inline-block underline">
                    go to login
                  </Link>
                </div>
              ) : loading && !archive ? (
                <p className="text-blue-500 dark:text-purple-300">Loading archive...</p>
              ) : archive ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-blue-600 dark:text-purple-300">
                      Cards indexed: {archive.total}
                    </p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <div className="flex flex-wrap gap-2" aria-label="Ownership filter">
                        {([
                          ["all", "all"],
                          ["owned", "owned"],
                          ["not-owned", "not owned"],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              setOwnership(value);
                              setPage(1);
                            }}
                            className="arena-redraw-button hover:animate-wiggle"
                          >
                            {ownership === value
                              ? `[ » ${label} « ]`
                              : `[ ${label} ]`}
                          </button>
                        ))}
                      </div>
                      <label htmlFor="archive-search" className="sr-only">
                        Search archive
                      </label>
                      <input
                        id="archive-search"
                        type="search"
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setPage(1);
                        }}
                        placeholder="Faye Valentine or Cowboy Bebop..."
                        className="w-64 rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {cards.map((card) => {
                      const cardId = card.cardInstanceId || `archive-${card.malId}`;
                      return (
                        <div
                          key={cardId}
                          className="arena-card-portrait-slot flex flex-col items-center space-y-1"
                        >
                          <ArenaPortraitCard
                            card={card}
                            size="full"
                            showIvLine
                            interactive
                          />
                          <p
                            className={`text-center text-[0.65rem] font-black uppercase ${
                              card.owned
                                ? "text-emerald-600 dark:text-emerald-300"
                                : "text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {card.owned ? "Owned" : "Not owned"}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {cards.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-purple-300">
                      No cards match this archive filter.
                    </p>
                  ) : null}

                  {totalPages > 1 ? (
                    <div className="flex flex-wrap justify-center gap-2 border-t border-sky-100 pt-2 dark:border-purple-400/20">
                      <button
                        type="button"
                        onClick={() => {
                          setPage((value) => Math.max(1, value - 1));
                        }}
                        disabled={page <= 1}
                        className="arena-redraw-button hover:animate-wiggle"
                      >
                        [ prev ]
                      </button>
                      <span className="self-center text-sm text-blue-600 dark:text-purple-300">
                        Page {page} of {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPage((value) => Math.min(totalPages, value + 1));
                        }}
                        disabled={page >= totalPages}
                        className="arena-redraw-button hover:animate-wiggle"
                      >
                        [ next ]
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {errorMessage ? <ArenaErrorNotice message={errorMessage} /> : null}
            </section>
            <Divider />
          </main>
          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md dark:border-purple-400/30 dark:bg-slate-800 dark:opacity-95">
              <div className="space-y-2 text-sm text-blue-600 dark:text-purple-200">
                <h2 className="text-center text-lg font-bold text-blue-700 dark:text-purple-100">
                  archive info
                </h2>
                <p>Catalog cards are previews.</p>
                <p>Owned cards keep their rolled IVs in Collection.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaArchive;
