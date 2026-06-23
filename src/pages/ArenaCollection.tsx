import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  ArenaApiError,
  type ArenaCollectionResponse,
  fetchArenaCollection,
  selectArenaCollectionCard,
} from "@/lib/arena-api";

const ELEMENTS = ["Fire", "Water", "Earth", "Wind", "Light", "Dark"] as const;

const ELEMENT_COLORS: Record<string, string> = {
  Fire: "#e74c3c",
  Water: "#3498db",
  Earth: "#27ae60",
  Wind: "#2ecc71",
  Light: "#f1c40f",
  Dark: "#8e44ad",
};

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena request failed.";
}

function formatIvBlock(stats: { power: number; guard: number; speed: number; luck: number }) {
  return `P ${stats.power} | G ${stats.guard} | S ${stats.speed} | L ${stats.luck}`;
}

type CollectionSort =
  | "recent"
  | "rarity-desc"
  | "rarity-asc"
  | "iv-desc"
  | "iv-asc";

const ArenaCollection = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const [collection, setCollection] = useState<ArenaCollectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CollectionSort>("recent");
  const [elementFilter, setElementFilter] = useState("");
  const [selectingCardId, setSelectingCardId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/arena/collection",
    structuredDataId: "arena-collection-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Collection",
      description: "Your collected Arena character cards.",
      url: "https://mirabellier.com/arena/collection",
    },
  });

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setCollection(null);
      return () => {
        cancelled = true;
      };
    }

    const loadCollection = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const payload = await fetchArenaCollection(token, {
          page, perPage: 10, sort, search: query || undefined, element: elementFilter || undefined,
        });
        if (cancelled) return;
        setCollection(payload);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadCollection();
    return () => {
      cancelled = true;
    };
  }, [token, page, sort, query, elementFilter]);

  const handleSelectCard = async (cardInstanceId: string) => {
    if (!token) return;
    setSelectingCardId(cardInstanceId);
    setErrorMessage(null);
    try {
      const payload = await selectArenaCollectionCard(token, cardInstanceId);
      setCollection((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          profile: payload.profile,
        };
      });
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setSelectingCardId(null);
    }
  };

  const cards = collection?.cards || [];
  const totalPages = collection?.totalPages || 1;

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
            <section className="card-border space-y-4 bg-white/60 p-4">
              <div className="">
                <h2 className="text-4xl font-bold text-blue-900">Card Collection {`>^. .^<`}</h2>
                <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                  <span className="text-pink-300">✿</span> Browse your collected character cards!{" "}
                  <span className="text-pink-300">✿</span>
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-3 pb-3 border-b border-sky-100">
                <Link to="/arena" className="arena-redraw-button hover:animate-wiggle">
                  [ Arena Home ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/fight" className="arena-redraw-button hover:animate-wiggle">
                  [ Fight ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/shop" className="arena-redraw-button hover:animate-wiggle">
                  [ Shop ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/crafting" className="arena-redraw-button hover:animate-wiggle">
                  [ Craft ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/inventory" className="arena-redraw-button hover:animate-wiggle">
                  [ Inventory ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/leaderboard" className="arena-redraw-button hover:animate-wiggle">
                  [ Leaderboard ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/market" className="arena-redraw-button hover:animate-wiggle">
                  [ Market ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/skill-tree" className="arena-redraw-button hover:animate-wiggle">
                  [ Skill Tree ]
                </Link>
              </div>

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
                  <p className="font-semibold">Login is required to view collection.</p>
                  <Link to="/login" className="mt-2 inline-block underline">
                    go to login
                  </Link>
                </div>
              ) : loading && !collection ? (
                <p className="text-blue-500">Loading collection...</p>
              ) : collection ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-blue-600">
                      Cards collected: {collection.total}
                    </p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <label htmlFor="collection-sort" className="sr-only">
                        Sort collection
                      </label>
                      <select
                        id="collection-sort"
                        value={sort}
                        onChange={(event) => { setSort(event.target.value as CollectionSort); setPage(1); }}
                        className="rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700"
                      >
                        <option value="recent">Collection order</option>
                        <option value="rarity-desc">Rarity: highest first</option>
                        <option value="rarity-asc">Rarity: lowest first</option>
                        <option value="iv-desc">IV: highest first</option>
                        <option value="iv-asc">IV: lowest first</option>
                      </select>
                      <input
                        id="collection-search"
                        type="search"
                        value={query}
                        onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                        placeholder="Lelouch Lamperouge..."
                        className="w-48 rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-500 mr-1">element:</span>
                    {ELEMENTS.map((el) => {
                      const active = elementFilter === el;
                      return (
                        <button
                          key={el}
                          type="button"
                          onClick={() => {
                            setElementFilter(active ? "" : el);
                            setPage(1);
                          }}
                          style={{
                            backgroundColor: active ? ELEMENT_COLORS[el] : "transparent",
                            borderColor: ELEMENT_COLORS[el],
                            color: active ? "#fff" : ELEMENT_COLORS[el],
                          }}
                          className="text-xs font-bold px-2 py-0.5 rounded-full border transition"
                        >
                          {el}
                        </button>
                      );
                    })}
                  </div>

                  <ol className="space-y-1">
                    {cards.map((card) => {
                      const isSelected =
                        collection.profile.selectedCard?.cardInstanceId === card.cardInstanceId;
                      return (
                        <li
                          key={card.cardInstanceId || `${card.malId}-${card.drawnAt || "card"}`}
                          className="border-b border-blue-100 pb-3 last:border-b-0 last:pb-0"
                        >
                          <article className="flex items-start gap-3">
                            <img
                              src={card.imageUrl}
                              alt={card.title}
                              className="h-16 w-12 shrink-0 rounded-lg border border-blue-100 object-cover shadow-sm"
                              loading="lazy"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-blue-700 text-sm">
                                {card.title}
                                {card.element ? (
                                  <span
                                    className="inline-block ml-1 px-1.5 py-px rounded-full text-[0.6rem] font-bold text-white align-middle"
                                    style={{ backgroundColor: ELEMENT_COLORS[card.element] || "#888" }}
                                  >
                                    {card.element}
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-xs text-slate-700">Rarity: {card.rarity} · IV: {card.iv.total}</p>
                              <p className="text-xs text-slate-500">{formatIvBlock(card.iv)}</p>
                              {isSelected ? (
                                <p className="text-xs font-semibold text-pink-600">currently selected</p>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    card.cardInstanceId
                                      ? void handleSelectCard(card.cardInstanceId)
                                      : undefined
                                  }
                                  disabled={
                                    !card.cardInstanceId ||
                                    selectingCardId === card.cardInstanceId
                                  }
                                  className="arena-redraw-button hover:animate-wiggle text-xs"
                                >
                                  {selectingCardId === card.cardInstanceId
                                    ? "[ choosing... ]"
                                    : "[ choose card ]"}
                                </button>
                              )}
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ol>
                   {cards.length === 0 ? (
                    <p className="text-sm text-slate-600">No cards match your search.</p>
                  ) : null}

                  {totalPages > 1 ? (
                    <div className="flex flex-wrap justify-center gap-2 pt-2 border-t border-sky-100">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="arena-redraw-button hover:animate-wiggle"
                      >
                        [ prev ]
                      </button>
                      <span className="text-sm text-blue-600 self-center">
                        Page {page} of {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="arena-redraw-button hover:animate-wiggle"
                      >
                        [ next ]
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {errorMessage ? (
                <ArenaErrorNotice message={errorMessage} />
              ) : null}
            </section>
            <Divider />
          </main>
          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-2 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">collection info</h2>
                <p>Each daily draw is saved here.</p>
                <p>Your currently selected card is highlighted.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaCollection;