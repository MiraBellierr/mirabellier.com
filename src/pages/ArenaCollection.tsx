import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaSubNav from "@/parts/ArenaSubNav";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  ArenaApiError,
  type ArenaCollectionResponse,
  fetchArenaCollection,
  selectArenaCollectionCard,
  toggleArenaCollectionCardFavorite,
} from "@/lib/arena";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";

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


type PrimarySort =
  | "recent"
  | "rarity-desc"
  | "rarity-asc"
  | "iv-desc"
  | "iv-asc"
  | "power-desc"
  | "guard-desc"
  | "speed-desc"
  | "effectHit-desc";

type SecondarySort =
  | ""
  | "iv-desc"
  | "power-desc"
  | "guard-desc"
  | "speed-desc"
  | "effectHit-desc";

const ArenaCollection = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const [collection, setCollection] = useState<ArenaCollectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [primarySort, setPrimarySort] = useState<PrimarySort>("recent");
  const [secondarySort, setSecondarySort] = useState<SecondarySort>("");
  const [elementFilter, setElementFilter] = useState("");
  const [duplicatesFilter, setDuplicatesFilter] = useState(false);
  const [selectingCardId, setSelectingCardId] = useState<string | null>(null);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Combine both dropdowns with AND logic: primary first, secondary as tiebreaker
  const sort = useMemo<string>(
    () => (secondarySort ? `${primarySort},${secondarySort}` : primarySort),
    [primarySort, secondarySort],
  );

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
          page, perPage: 12, sort, search: query || undefined, element: elementFilter || undefined, duplicates: duplicatesFilter,
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
  }, [token, page, sort, query, elementFilter, duplicatesFilter]);

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

  const handleToggleFavorite = async (cardInstanceId: string, current: boolean) => {
    if (!token || !cardInstanceId || !collection) return;
    setTogglingFavoriteId(cardInstanceId);

    // Optimistic update
    setCollection((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cards: prev.cards.map((c) =>
          c.cardInstanceId === cardInstanceId ? { ...c, isFavorite: !current } : c,
        ),
      };
    });

    try {
      await toggleArenaCollectionCardFavorite(token, cardInstanceId);
    } catch {
      // Revert on error
      setCollection((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map((c) =>
            c.cardInstanceId === cardInstanceId ? { ...c, isFavorite: current } : c,
          ),
        };
      });
    } finally {
      setTogglingFavoriteId(null);
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

              <ArenaSubNav />

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
                      <label htmlFor="collection-sort-primary" className="text-xs text-slate-500">
                        sort:
                      </label>
                      <select
                        id="collection-sort-primary"
                        value={primarySort}
                        onChange={(event) => { setPrimarySort(event.target.value as PrimarySort); setPage(1); }}
                        className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs text-slate-700"
                      >
                        <option value="recent">Recent</option>
                        <option value="rarity-desc">Rarity ▼</option>
                        <option value="rarity-asc">Rarity ▲</option>
                        <option value="iv-desc">IV ▼</option>
                        <option value="iv-asc">IV ▲</option>
                        <option value="power-desc">Power ▼</option>
                        <option value="guard-desc">Guard ▼</option>
                        <option value="speed-desc">Speed ▼</option>
                        <option value="effectHit-desc">Effect Hit ▼</option>
                      </select>
                      <span className="text-xs text-slate-400">then</span>
                      <select
                        id="collection-sort-secondary"
                        value={secondarySort}
                        onChange={(event) => { setSecondarySort(event.target.value as SecondarySort); setPage(1); }}
                        className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs text-slate-700"
                      >
                        <option value="">—</option>
                        <option value="iv-desc">IV ▼</option>
                        <option value="power-desc">Power ▼</option>
                        <option value="guard-desc">Guard ▼</option>
                        <option value="speed-desc">Speed ▼</option>
                        <option value="effectHit-desc">Effect Hit ▼</option>
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

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-500 mr-1">show:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDuplicatesFilter((prev) => !prev);
                        setPage(1);
                      }}
                      className={`text-xs font-bold px-2 py-0.5 rounded-full border transition ${
                        duplicatesFilter
                          ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-300"
                          : "text-purple-500 border-purple-300 hover:bg-purple-50"
                      }`}
                    >
                      duplicates only
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {cards.map((card) => {
                      const isSelected =
                        collection.profile.selectedCard?.cardInstanceId === card.cardInstanceId;
                      return (
                        <div
                          key={card.cardInstanceId || `${card.malId}-${card.drawnAt || "card"}`}
                          className="flex flex-col items-center space-y-1"
                        >
                          <div className="relative group cursor-pointer" onClick={() => { if (card.cardInstanceId) { void handleToggleFavorite(card.cardInstanceId!, !!card.isFavorite); } }}>
                            <ArenaPortraitCard
                              card={card}
                              size="full"
                              showIvLine={true}
                              interactive
                            />
                            {card.cardInstanceId ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void handleToggleFavorite(card.cardInstanceId!, !!card.isFavorite); }}
                                disabled={togglingFavoriteId === card.cardInstanceId}
                                className={`absolute top-1 right-2 z-10 text-base transition disabled:opacity-50 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)] ${card.isFavorite ? "text-pink-400" : "text-white/70 opacity-0 group-hover:opacity-100"}`}
                                title={card.isFavorite ? "Remove favorite" : "Mark as favorite"}
                              >
                                {card.isFavorite ? "♥" : "♡"}
                              </button>
                            ) : null}
                          </div>
                          {isSelected ? (
                            <span className="text-xs font-semibold text-pink-600">selected</span>
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
                      );
                    })}
                  </div>
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