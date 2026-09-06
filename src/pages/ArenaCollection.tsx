import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaSubNav from "@/parts/ArenaSubNav";
import ConfirmDialog from "@/parts/ConfirmDialog";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  ELEMENTS,
  ELEMENT_COLORS,
  normalizeArenaError,
  type ArenaCard,
  type ArenaCollectionResponse,
  type ArenaSacrificePreview,
  fetchArenaCollection,
  sacrificeArenaCollectionCards,
  selectArenaCollectionCard,
  toggleArenaCollectionCardFavorite,
} from "@/lib/arena";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";


const SACRIFICE_BLOCK_LABELS: Record<string, string> = {
  favorite: "favorite",
  selected: "selected",
  market_listed: "market",
  trade_listed: "trade",
  trade_session: "trade",
  invalid: "invalid",
  not_found: "missing",
};

type PrimarySort =
  | "recent"
  | "rarity-desc"
  | "rarity-asc"
  | "iv-desc"
  | "iv-asc"
  | "affinity-desc"
  | "affinity-asc"
  | "power-desc"
  | "guard-desc"
  | "speed-desc"
  | "effectHit-desc";

type SecondarySort =
  | ""
  | "iv-desc"
  | "affinity-desc"
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
  const [sacrificeMode, setSacrificeMode] = useState(false);
  const [sacrificeSelectedIds, setSacrificeSelectedIds] = useState<string[]>([]);
  const [sacrificePreview, setSacrificePreview] = useState<ArenaSacrificePreview | null>(null);
  const [sacrificeLoading, setSacrificeLoading] = useState(false);
  const [sacrificeConfirmOpen, setSacrificeConfirmOpen] = useState(false);
  const [sacrificing, setSacrificing] = useState(false);

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

  const refreshCollection = useCallback(async (cancelled?: () => boolean) => {
    if (!token) {
      setCollection(null);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const payload = await fetchArenaCollection(token, {
        page, perPage: 12, sort, search: query || undefined, element: elementFilter || undefined, duplicates: duplicatesFilter,
      });
      if (cancelled?.()) return;
      setCollection(payload);
    } catch (error) {
      if (cancelled?.()) return;
      setErrorMessage(normalizeArenaError(error));
    } finally {
      if (!cancelled?.()) setLoading(false);
    }
  }, [token, page, sort, query, elementFilter, duplicatesFilter]);

  useEffect(() => {
    let cancelled = false;
    void refreshCollection(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [refreshCollection]);

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

  const toggleSacrificeCard = (card: ArenaCard) => {
    const cardInstanceId = card.cardInstanceId;
    if (!cardInstanceId) return;
    setSacrificeSelectedIds((previous) =>
      previous.includes(cardInstanceId)
        ? previous.filter((id) => id !== cardInstanceId)
        : [...previous, cardInstanceId],
    );
  };

  const selectedKey = sacrificeSelectedIds.join("|");

  useEffect(() => {
    let cancelled = false;
    if (!token || !sacrificeMode || sacrificeSelectedIds.length === 0) {
      setSacrificePreview(null);
      setSacrificeLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadPreview = async () => {
      setSacrificeLoading(true);
      try {
        const payload = await sacrificeArenaCollectionCards(token, sacrificeSelectedIds, false);
        if (!cancelled) setSacrificePreview(payload.preview);
      } catch (error) {
        if (!cancelled) {
          setSacrificePreview(null);
          setErrorMessage(normalizeArenaError(error));
        }
      } finally {
        if (!cancelled) setSacrificeLoading(false);
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [token, sacrificeMode, selectedKey, sacrificeSelectedIds]);

  const handleConfirmSacrifice = async () => {
    if (!token || sacrificeSelectedIds.length === 0) return;
    setSacrificing(true);
    setErrorMessage(null);
    try {
      await sacrificeArenaCollectionCards(token, sacrificeSelectedIds, true);
      setSacrificeConfirmOpen(false);
      setSacrificeSelectedIds([]);
      setSacrificePreview(null);
      await refreshCollection();
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setSacrificing(false);
    }
  };

  const cards = collection?.cards || [];
  const totalPages = collection?.totalPages || 1;
  const selectedSacrificeCount = sacrificeSelectedIds.length;
  const sacrificeBlockedCount = sacrificePreview?.blocked.length || 0;
  const sacrificeCanConfirm =
    selectedSacrificeCount > 0 &&
    !!sacrificePreview?.canSacrifice &&
    !sacrificeLoading &&
    !sacrificing;

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
          <main className="w-full space-y-2 p-2 sm:p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/60 p-2 sm:p-4">
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
                        <option value="affinity-desc">Affinity ▼</option>
                        <option value="affinity-asc">Affinity ▲</option>
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
                        <option value="affinity-desc">Affinity ▼</option>
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
                    <button
                      type="button"
                      onClick={() => {
                        setSacrificeMode((current) => !current);
                        setSacrificeSelectedIds([]);
                        setSacrificePreview(null);
                      }}
                      className={`text-xs font-bold px-2 py-0.5 rounded-full border transition ${
                        sacrificeMode
                          ? "bg-rose-600 text-white border-rose-600 ring-2 ring-rose-300"
                          : "text-rose-500 border-rose-300 hover:bg-rose-50"
                      }`}
                    >
                      sacrifice
                    </button>
                  </div>

                  {sacrificeMode ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold">
                          {selectedSacrificeCount} selected · +{sacrificePreview?.totalCoins ?? 0} coins
                          {sacrificeBlockedCount > 0 ? ` · ${sacrificeBlockedCount} blocked` : ""}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSacrificeSelectedIds([]);
                              setSacrificePreview(null);
                            }}
                            disabled={selectedSacrificeCount === 0}
                            className="arena-redraw-button text-xs"
                          >
                            [ clear ]
                          </button>
                          <button
                            type="button"
                            onClick={() => setSacrificeConfirmOpen(true)}
                            disabled={!sacrificeCanConfirm}
                            className="arena-redraw-button text-xs"
                          >
                            {sacrificeLoading ? "[ checking... ]" : "[ sacrifice ]"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {cards.map((card) => {
                      const isSelected =
                        collection.profile.selectedCard?.cardInstanceId === card.cardInstanceId;
                      const isSacrificeSelected = !!card.cardInstanceId && sacrificeSelectedIds.includes(card.cardInstanceId);
                      const sacrificeItem = sacrificePreview?.items.find((item) => item.cardInstanceId === card.cardInstanceId);
                      const blockLabel = sacrificeItem?.blockedReason
                        ? SACRIFICE_BLOCK_LABELS[sacrificeItem.blockedReason] || sacrificeItem.blockedReason
                        : null;
                      return (
                        <div
                          key={card.cardInstanceId || `${card.malId}-${card.drawnAt || "card"}`}
                          className="flex flex-col items-center space-y-1"
                        >
                          <div
                            className={`relative group cursor-pointer ${isSacrificeSelected ? "rounded-xl ring-2 ring-rose-500" : ""}`}
                            onClick={() => {
                              if (sacrificeMode) {
                                toggleSacrificeCard(card);
                              } else if (card.cardInstanceId) {
                                void handleToggleFavorite(card.cardInstanceId, !!card.isFavorite);
                              }
                            }}
                          >
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
                            {sacrificeMode ? (
                              <span className={`absolute left-2 top-2 z-10 rounded-full border px-2 py-0.5 text-[0.65rem] font-black shadow ${
                                isSacrificeSelected
                                  ? "border-rose-500 bg-rose-600 text-white"
                                  : "border-white/80 bg-slate-900/60 text-white"
                              }`}>
                                {isSacrificeSelected ? "sell" : "+"}
                              </span>
                            ) : null}
                          </div>
                          {sacrificeMode && isSacrificeSelected ? (
                            <span className={`text-xs font-semibold ${blockLabel ? "text-red-600" : "text-emerald-700"}`}>
                              {blockLabel ? `blocked: ${blockLabel}` : `+${sacrificeItem?.coins ?? 0} coins`}
                            </span>
                          ) : null}
                          {isSelected ? (
                            <span className="text-xs font-semibold text-pink-600">selected</span>
                          ) : !sacrificeMode ? (
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
                          ) : null}
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
      {sacrificeConfirmOpen ? (
        <ConfirmDialog
          title="Confirm sacrifice"
          message={
            <span>
              Sacrifice {selectedSacrificeCount} card{selectedSacrificeCount === 1 ? "" : "s"} for{" "}
              <span className="font-bold">{sacrificePreview?.totalCoins ?? 0}</span> coins?
            </span>
          }
          confirmLabel={sacrificing ? "Sacrificing..." : "Confirm"}
          cancelLabel="Cancel"
          confirmDisabled={!sacrificeCanConfirm}
          onConfirm={handleConfirmSacrifice}
          onCancel={() => setSacrificeConfirmOpen(false)}
        />
      ) : null}
      <Footer />
    </div>
  );
};

export default ArenaCollection;
