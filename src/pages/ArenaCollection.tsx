import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  ArenaApiError,
  type ArenaCollectionResponse,
  fetchArenaCollection,
  selectArenaCollectionCard,
} from "@/lib/arena-api";

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena request failed.";
}

function formatIvBlock(stats: { power: number; guard: number; speed: number; luck: number }) {
  return `P ${stats.power} | G ${stats.guard} | S ${stats.speed} | L ${stats.luck}`;
}

const ArenaCollection = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const [collection, setCollection] = useState<ArenaCollectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
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
        const payload = await fetchArenaCollection(token, 300);
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
  }, [token]);

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

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCards = (collection?.cards || []).filter((card) => {
    if (!normalizedQuery) return true;
    const ivText = `${card.iv.power} ${card.iv.guard} ${card.iv.speed} ${card.iv.luck} ${card.iv.total}`;
    return (
      card.title.toLowerCase().includes(normalizedQuery) ||
      card.rarity.toLowerCase().includes(normalizedQuery) ||
      String(card.malId).includes(normalizedQuery) ||
      ivText.includes(normalizedQuery)
    );
  });

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
              <h2 className="text-2xl font-bold text-blue-700">arena collection</h2>
              <div className="flex flex-wrap gap-2">
                <Link to="/arena" className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                  arena home
                </Link>
                <Link to="/arena/fight" className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                  fight
                </Link>
                <Link to="/arena/shop" className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                  shop
                </Link>
                <Link
                  to="/arena/crafting"
                  className="rounded-full bg-sky-600 px-3 py-1 text-xs font-bold text-white"
                >
                  crafting
                </Link>
                <Link
                  to="/arena/leaderboard"
                  className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white"
                >
                  leaderboard
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
                  <p className="text-sm text-blue-600">
                    Cards collected: {collection.cards.length}
                  </p>
                  <div>
                    <label htmlFor="collection-search" className="text-xs font-semibold text-blue-600">
                      Search cards
                    </label>
                    <input
                      id="collection-search"
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search by name, rarity, id, iv..."
                      className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700"
                    />
                  </div>
                  {normalizedQuery ? (
                    <p className="text-xs text-slate-600">
                      Found: {filteredCards.length}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {filteredCards.map((card) => {
                      const isSelected =
                        collection.profile.selectedCard?.cardInstanceId === card.cardInstanceId;
                      return (
                        <article
                          key={card.cardInstanceId || `${card.malId}-${card.drawnAt || "card"}`}
                          className="rounded-xl border border-blue-200 bg-white/70 p-3"
                        >
                          <div className="flex gap-3">
                            <ArenaPortraitCard
                              card={card}
                              level={collection.profile.level}
                              size="compact"
                              showIvLine={false}
                            />
                            <div className="space-y-1">
                              <p className="font-semibold text-blue-700">{card.title}</p>
                              <p className="text-xs text-slate-700">Rarity: {card.rarity}</p>
                              <p className="text-xs text-slate-700">
                                IV Value: {card.iv.total}
                              </p>
                              <p className="text-xs text-slate-700">IV: {formatIvBlock(card.iv)}</p>
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
                                  className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
                                >
                                  {selectingCardId === card.cardInstanceId
                                    ? "choosing..."
                                    : "choose card"}
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {filteredCards.length === 0 ? (
                    <p className="text-sm text-slate-600">No cards match your search.</p>
                  ) : null}
                </div>
              ) : null}

              {errorMessage ? (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  {errorMessage}
                </div>
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
