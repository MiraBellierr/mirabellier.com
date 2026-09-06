import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import ArenaSubNav from "@/parts/ArenaSubNav";
import Divider from "@/parts/Divider";
import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import { useAbortableRequest } from "@/hooks/use-abortable-request";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { useWebSocketEvent } from "@/hooks/use-websocket";
import {
  ELEMENT_COLORS,
  RARITIES,
  normalizeArenaError,
  type ArenaCard,
  type ArenaCollectionResponse,
  type ArenaMarketIvBand,
  type ArenaMarketListing,
  type ArenaMarketListingsResponse,
  type ArenaMarketPriceGuideResponse,
  type ArenaMarketSort,
  buyArenaMarketListing,
  cancelArenaMarketListing,
  createArenaMarketListing,
  fetchArenaCollection,
  fetchArenaMarketListings,
  fetchArenaMarketPriceGuide,
  fetchMyArenaMarketListings,
} from "@/lib/arena";
import { usePageSeo } from "@/lib/seo";
import { useConfirm } from "@/states/ConfirmContext";

type MarketTab = "market" | "mine";


function PriceGuide({ guide }: { guide: ArenaMarketPriceGuideResponse | null }) {
  if (!guide) return null;
  return (
    <p className="text-xs font-semibold text-blue-600 dark:text-purple-300">
      {guide.marketPrice.source === "sales_average"
        ? `Market average: ${guide.marketPrice.value.toLocaleString()} coins from ${guide.marketPrice.sampleSize} sales`
        : `No completed sales yet — shop baseline: ${guide.marketPrice.value.toLocaleString()} coins`}
      {" · "}IV band {guide.ivBand.id}
    </p>
  );
}

const ArenaMarket = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const { confirm } = useConfirm();
  const [tab, setTab] = useState<MarketTab>("market");
  const [market, setMarket] = useState<ArenaMarketListingsResponse | null>(null);
  const [mine, setMine] = useState<ArenaMarketListingsResponse | null>(null);
  const [collection, setCollection] = useState<ArenaCollectionResponse | null>(null);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [price, setPrice] = useState("");
  const [priceGuide, setPriceGuide] =
    useState<ArenaMarketPriceGuideResponse | null>(null);
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState("");
  const [ivBand, setIvBand] = useState("");
  const [sort, setSort] = useState<ArenaMarketSort>("newest");
  const [page, setPage] = useState(1);
  const [minePage, setMinePage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [marketLoading, setMarketLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [cardSearch, setCardSearch] = useState("");
  const [cardSearchResults, setCardSearchResults] = useState<ArenaCard[]>([]);
  const [cardDropdownOpen, setCardDropdownOpen] = useState(false);
  const [cardHighlight, setCardHighlight] = useState(-1);
  const [hoverCard, setHoverCard] = useState<{ x: number; y: number; card: ArenaCard } | null>(null);

  const handleCardMouseEnter = (card: ArenaCard, e: React.MouseEvent) => {
    setHoverCard({ x: e.clientX, y: e.clientY, card });
  };
  const handleCardMouseMove = (e: React.MouseEvent) => {
    setHoverCard((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
  };
  const handleCardMouseLeave = () => setHoverCard(null);
  const cardDropdownRef = useRef<HTMLDivElement | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/arena/market",
    structuredDataId: "arena-market-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Card Market",
      description: "Buy and sell player-owned Arena character cards.",
      url: "https://mirabellier.com/arena/market",
    },
  });

  // These loaders are refetched from several places that can overlap (debounced
  // filters, the websocket "changed" event, post-mutation refreshes). Each hook
  // instance aborts its previous request and drops stale responses so a slow
  // reply can't overwrite fresher data or clear the loading flag mid-flight.
  const runMarket = useAbortableRequest();
  const runOwned = useAbortableRequest();

  const loadOwnedData = useCallback(
    (currentToken: string) =>
      runOwned(
        (signal) =>
          Promise.all([
            fetchMyArenaMarketListings(currentToken, signal),
            fetchArenaCollection(currentToken, { perPage: 500 }, signal),
          ]),
        {
          onResult: ([minePayload, collectionPayload]) => {
            setMine(minePayload);
            setCollection(collectionPayload);
          },
        },
      ),
    [runOwned],
  );

  const loadMarket = useCallback(
    (currentToken: string) => {
      setMarketLoading(true);
      return runMarket(
        (signal) =>
          fetchArenaMarketListings(
            currentToken,
            { page, limit: 20, search: query.trim(), rarity, ivBand, sort },
            signal,
          ),
        {
          onResult: setMarket,
          onError: (error) => setErrorMessage(normalizeArenaError(error)),
          onSettled: () => setMarketLoading(false),
        },
      );
    },
    [runMarket, page, query, rarity, ivBand, sort],
  );

  useEffect(() => {
    if (!token) {
      setMarket(null);
      setMine(null);
      setCollection(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    Promise.all([
      fetchArenaMarketListings(token, { page: 1, limit: 20, sort: "newest" }),
      fetchMyArenaMarketListings(token),
      fetchArenaCollection(token, { perPage: 500 }),
    ])
      .then(([marketPayload, minePayload, collectionPayload]) => {
        if (cancelled) return;
        setMarket(marketPayload);
        setMine(minePayload);
        setCollection(collectionPayload);
      })
      .catch((error) => {
        if (!cancelled) setErrorMessage(normalizeArenaError(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || loading) return;
    const timeout = window.setTimeout(() => {
      void loadMarket(token);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [token, loading, loadMarket]);

  useWebSocketEvent("arena:market:changed", () => {
    if (token) {
      void loadMarket(token);
      void loadOwnedData(token);
    }
  });

  const selectedCard = useMemo(
    () =>
      collection?.cards.find(
        (card) => card.cardInstanceId === selectedCardId,
      ) || cardSearchResults.find(
        (card) => card.cardInstanceId === selectedCardId,
      ) || null,
    [collection, selectedCardId, cardSearchResults],
  );

  useEffect(() => {
    if (!token || !selectedCard) {
      setPriceGuide(null);
      return;
    }
    let cancelled = false;
    fetchArenaMarketPriceGuide(token, selectedCard)
      .then((payload) => {
        if (!cancelled) setPriceGuide(payload);
      })
      .catch(() => {
        if (!cancelled) setPriceGuide(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedCard]);

  const cardSuggestions = useMemo(() => {
    if (!cardSearch.trim()) return [] as ArenaCard[];
    return cardSearchResults;
  }, [cardSearch, cardSearchResults]);

  // Server-side card search for listing (debounced)
  useEffect(() => {
    if (!token) return;
    const query = cardSearch.trim();
    if (!query) {
      setCardSearchResults([]);
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const result = await fetchArenaCollection(token, { perPage: 30, search: query });
        if (!cancelled) setCardSearchResults(result.cards);
      } catch {
        if (!cancelled) setCardSearchResults([]);
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timeout); };
     
  }, [cardSearch, token]);

  const MINE_PAGE_SIZE = 10;
  const mineTotalPages = Math.max(1, Math.ceil((mine?.listings.length || 0) / MINE_PAGE_SIZE));
  const paginatedMineListings = useMemo(() => {
    if (!mine) return [] as ArenaMarketListing[];
    return mine.listings.slice(
      (minePage - 1) * MINE_PAGE_SIZE,
      minePage * MINE_PAGE_SIZE,
    );
  }, [mine, minePage]);

  const handleCardSelect = useCallback((card: ArenaCard) => {
    setSelectedCardId(card.cardInstanceId || "");
    setCardSearch(card.title);
    setCardDropdownOpen(false);
    setCardHighlight(-1);
  }, []);

  // Close the card dropdown on outside click
  useEffect(() => {
    if (!cardDropdownOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        cardDropdownRef.current &&
        !cardDropdownRef.current.contains(event.target as Node)
      ) {
        setCardDropdownOpen(false);
        setCardHighlight(-1);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [cardDropdownOpen]);

  const refreshAfterMutation = async () => {
    if (!token) return;
    await Promise.all([loadMarket(token), loadOwnedData(token)]);
  };

  const handleList = async () => {
    if (!token || !selectedCard) return;
    const parsedPrice = Number(price);
    if (
      !Number.isSafeInteger(parsedPrice) ||
      parsedPrice < 1 ||
      parsedPrice > 1_000_000
    ) {
      setListError("Price must be a whole number from 1 to 1,000,000.");
      return;
    }
    setActioningId(`list:${selectedCard.cardInstanceId}`);
    setErrorMessage(null);
    try {
      await createArenaMarketListing(
        token,
        selectedCard.cardInstanceId || "",
        parsedPrice,
      );
      setPrice("");
    setListError(null);
      setSelectedCardId("");
      setCardSearch("");
      closeListModal();
      await refreshAfterMutation();
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const closeListModal = useCallback(() => {
    setSelectedCardId("");
    setCardSearch("");
    setPrice("");
    setListError(null);
    setCardHighlight(-1);
  }, []);

  // Close list modal on Escape
  useEffect(() => {
    if (!selectedCard) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeListModal();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedCard, closeListModal]);

  const handleBuy = async (listing: ArenaMarketListing) => {
    if (!token) return;
    const approved = await confirm({
      title: "Buy this card?",
      message: (
        <span>
          Buy <b>{listing.card.title}</b> for{" "}
          <b>{listing.price.toLocaleString()} coins</b>?
        </span>
      ),
      confirmLabel: "Buy card",
    });
    if (!approved) return;

    setActioningId(`buy:${listing.listingId}`);
    setErrorMessage(null);
    try {
      await buyArenaMarketListing(token, listing.listingId);
      await refreshAfterMutation();
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const handleCancel = async (listing: ArenaMarketListing) => {
    if (!token) return;
    const approved = await confirm({
      title: "Cancel this listing?",
      message: (
        <span>
          Return <b>{listing.card.title}</b> to your collection? It will not be
          selected automatically.
        </span>
      ),
      confirmLabel: "Cancel listing",
    });
    if (!approved) return;

    setActioningId(`cancel:${listing.listingId}`);
    setErrorMessage(null);
    try {
      await cancelArenaMarketListing(token, listing.listingId);
      await refreshAfterMutation();
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const resetFilters = () => {
    setQuery("");
    setRarity("");
    setIvBand("");
    setSort("newest");
    setPage(1);
  };

  const bands: ArenaMarketIvBand[] =
    market?.ivBands || [
      { id: "0-31", min: 0, max: 31 },
      { id: "32-62", min: 32, max: 62 },
      { id: "63-93", min: 63, max: 93 },
      { id: "94-124", min: 94, max: 124 },
    ];

  const minePagination = mineTotalPages > 1 ? (
    <div className="flex justify-center gap-3 border-t border-sky-100 pt-3 dark:border-purple-400/20">
      <button
        type="button"
        disabled={minePage <= 1}
        onClick={() => setMinePage((current) => Math.max(1, current - 1))}
        className="arena-redraw-button disabled:opacity-40"
      >
        [ prev ]
      </button>
      <span className="self-center text-sm text-blue-600 dark:text-purple-300">
        Page {minePage} of {mineTotalPages}
      </span>
      <button
        type="button"
        disabled={minePage >= mineTotalPages}
        onClick={() =>
          setMinePage((current) =>
            Math.min(mineTotalPages, current + 1),
          )
        }
        className="arena-redraw-button disabled:opacity-40"
      >
        [ next ]
      </button>
    </div>
  ) : null;

  const mineListingsContent = mine?.listings.length ? (
    <>
      {/* Mobile: card-based listing */}
      <div className="flex flex-col gap-3 sm:hidden">
        {paginatedMineListings.map((listing) => (
          <div
            key={listing.listingId}
            onMouseEnter={(e) => handleCardMouseEnter(listing.card, e)}
            onMouseMove={handleCardMouseMove}
            onMouseLeave={handleCardMouseLeave}
            className="flex items-center gap-3 rounded-xl border border-blue-100 bg-white/60 p-3 dark:border-purple-400/20 dark:bg-slate-800/60"
          >
            <img
              src={listing.card.imageUrl}
              alt={listing.card.title}
              className="h-12 w-9 shrink-0 rounded object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-blue-700 truncate dark:text-purple-100">
                  {listing.card.title}
                </span>
                {listing.card.element ? (
                  <span
                    className="inline-block shrink-0 px-1.5 py-px rounded-full text-[0.6rem] font-bold text-white"
                    style={{ backgroundColor: ELEMENT_COLORS[listing.card.element] || "#888" }}
                  >
                    {listing.card.element}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                <span className="text-slate-500 dark:text-slate-400">{listing.card.rarity}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500 dark:text-slate-400">IV {listing.card.iv.total}</span>
                <span className="text-slate-400">·</span>
                <span className="font-bold text-blue-700 dark:text-purple-200">{listing.price.toLocaleString()} 🪙</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Market: {listing.marketPrice?.value?.toLocaleString() ?? "—"}
              </p>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => void handleCancel(listing)}
                disabled={
                  actioningId === `cancel:${listing.listingId}`
                }
                className="arena-redraw-button text-xs hover:animate-wiggle disabled:opacity-50"
              >
                {actioningId === `cancel:${listing.listingId}`
                  ? "[ ... ]"
                  : "[ cancel ]"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {/* Desktop: table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-blue-200 text-xs font-bold text-blue-500 uppercase tracking-wider dark:border-purple-400/30 dark:text-purple-300">
              <th className="pb-2 pr-2">Card</th>
              <th className="pb-2 px-2">Rarity</th>
              <th className="pb-2 px-2">IV</th>
              <th className="pb-2 px-2">Price</th>
              <th className="pb-2 px-2">Market</th>
              <th className="pb-2 pl-2"></th>
            </tr>
          </thead>
          <tbody>
            {paginatedMineListings.map((listing) => (
              <tr
                key={listing.listingId}
                  onMouseEnter={(e) => handleCardMouseEnter(listing.card, e)}
                  onMouseMove={handleCardMouseMove}
                  onMouseLeave={handleCardMouseLeave}
                  className="border-b border-blue-50 last:border-b-0 dark:border-purple-400/10"
                >
                  <td className="py-2 pr-2 relative">
                  <div className="flex items-center gap-2">
                    <img
                      src={listing.card.imageUrl}
                      alt={listing.card.title}
                      className="h-10 w-7 shrink-0 rounded object-cover"
                    />
                    <span className="font-bold text-blue-700 truncate max-w-[120px] dark:text-purple-100">
                      {listing.card.title}
                    </span>
                    {listing.card.element ? (
                      <span
                        className="inline-block shrink-0 px-1.5 py-px rounded-full text-[0.6rem] font-bold text-white"
                        style={{ backgroundColor: ELEMENT_COLORS[listing.card.element] || "#888" }}
                      >
                        {listing.card.element}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="py-2 px-2 text-slate-600 dark:text-slate-300">
                  {listing.card.rarity}
                </td>
                <td className="py-2 px-2 text-slate-600 dark:text-slate-300">
                  {listing.card.iv.total}
                </td>
                <td className="py-2 px-2 font-bold text-blue-700 dark:text-purple-200">
                  {listing.price.toLocaleString()} 🪙
                </td>
                <td className="py-2 px-2 text-xs text-blue-600 dark:text-purple-300">
                  {listing.marketPrice?.value?.toLocaleString() ?? "—"}
                </td>
                <td className="py-2 pl-2">
                  <button
                    type="button"
                    onClick={() => void handleCancel(listing)}
                    disabled={
                      actioningId === `cancel:${listing.listingId}`
                    }
                    className="arena-redraw-button text-xs hover:animate-wiggle disabled:opacity-50"
                  >
                    {actioningId === `cancel:${listing.listingId}`
                      ? "[ cancelling... ]"
                      : "[ cancel ]"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {minePagination}
    </>
  ) : (
    <p className="rounded-xl border border-blue-100 bg-white/60 p-4 text-sm text-slate-600 dark:border-purple-400/20 dark:bg-slate-800/60 dark:text-slate-300">
      You do not have any active listings.
    </p>
  );

  return (
    <div className="flex min-h-screen flex-col font-[sans-serif] text-blue-900">
      <Header />
      <div
        className="flex flex-1 flex-col bg-cover bg-scroll bg-no-repeat"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-4 p-4 lg:flex-row">
          <div className="left-side-rail hidden flex-grow flex-col lg:flex">
            <Navigation />
          </div>
          <main className="w-full space-y-2 p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/60 p-4 dark:bg-slate-900/60">
              <div>
                <h1 className="text-4xl font-bold text-blue-900 dark:text-purple-100">
                  Card Market {`>^. .^<`}
                </h1>
                <p className="mt-2 text-sm font-black text-blue-800 dark:text-purple-200 sm:text-base">
                  <span className="text-pink-300">✿</span> Trade unique Arena
                  cards with other players!{" "}
                  <span className="text-pink-300">✿</span>
                </p>
              </div>

              <ArenaSubNav />

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                  <p className="font-semibold">Login is required to use the card market.</p>
                  <Link to="/login" className="mt-2 inline-block underline">
                    go to login
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTab("market")}
                      className="arena-redraw-button hover:animate-wiggle"
                    >
                      {tab === "market" ? "[ » Market « ]" : "[ Market ]"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("mine")}
                      className="arena-redraw-button hover:animate-wiggle"
                    >
                      {tab === "mine"
                        ? `[ » Your Listings (${mine?.total || 0}) « ]`
                        : `[ Your Listings (${mine?.total || 0}) ]`}
                    </button>
                  </div>

                  {loading ? (
                    <p className="text-blue-500 dark:text-purple-300">Opening the market...</p>
                  ) : tab === "market" ? (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                        <div className="flex items-center gap-3">
                          <p className="font-bold text-blue-700 dark:text-purple-200">
                            Coins: {market?.profile.coins.toLocaleString() || 0} 🪙
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {market?.total || 0} active listings
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <select
                            value={sort}
                            onChange={(event) => {
                              setSort(event.target.value as ArenaMarketSort);
                              setPage(1);
                            }}
                            className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <option value="newest">Newest</option>
                            <option value="price-asc">Price ↑</option>
                            <option value="price-desc">Price ↓</option>
                            <option value="iv-desc">IV ↓</option>
                            <option value="iv-asc">IV ↑</option>
                          </select>
                          <select
                            value={rarity}
                            onChange={(event) => {
                              setRarity(event.target.value);
                              setPage(1);
                            }}
                            className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <option value="">All rarities</option>
                            {RARITIES.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                          <select
                            value={ivBand}
                            onChange={(event) => {
                              setIvBand(event.target.value);
                              setPage(1);
                            }}
                            className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <option value="">All IV</option>
                            {bands.map((band) => (
                              <option key={band.id} value={band.id}>
                                IV {band.id}
                              </option>
                            ))}
                          </select>
                          <input
                            type="search"
                            value={query}
                            onChange={(event) => {
                              setQuery(event.target.value);
                              setPage(1);
                            }}
                            placeholder="Search character..."
                            className="w-full sm:w-44 rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="arena-redraw-button text-xs hover:animate-wiggle"
                      >
                        [ clear filters ]
                      </button>
                      {marketLoading ? (
                        <p className="text-sm text-blue-500">Refreshing listings...</p>
                      ) : market?.listings.length ? (
                        <>
                          {/* Mobile: card-based listing */}
                          <div className="flex flex-col gap-3 sm:hidden">
                            {market.listings.map((listing) => (
                              <div
                                key={listing.listingId}
                                onMouseEnter={(e) => handleCardMouseEnter(listing.card, e)}
                                onMouseMove={handleCardMouseMove}
                                onMouseLeave={handleCardMouseLeave}
                                className="flex items-center gap-3 rounded-xl border border-blue-100 bg-white/60 p-3 dark:border-purple-400/20 dark:bg-slate-800/60"
                              >
                                <img
                                  src={listing.card.imageUrl}
                                  alt={listing.card.title}
                                  className="h-12 w-9 shrink-0 rounded object-cover"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-blue-700 truncate dark:text-purple-100">
                                      {listing.card.title}
                                    </span>
                                    {listing.card.element ? (
                                      <span
                                        className="inline-block shrink-0 px-1.5 py-px rounded-full text-[0.6rem] font-bold text-white"
                                        style={{ backgroundColor: ELEMENT_COLORS[listing.card.element] || "#888" }}
                                      >
                                        {listing.card.element}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                                    <span className="text-slate-500 dark:text-slate-400">{listing.card.rarity}</span>
                                    <span className="text-slate-400">·</span>
                                    <span className="text-slate-500 dark:text-slate-400">IV {listing.card.iv.total}</span>
                                    <span className="text-slate-400">·</span>
                                    <span className="font-bold text-blue-700 dark:text-purple-200">{listing.price.toLocaleString()} 🪙</span>
                                  </div>
                                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                                    {listing.seller.username}{listing.isMine ? " (you)" : ""}
                                  </p>
                                </div>
                                <div className="shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => void handleBuy(listing)}
                                    disabled={
                                      listing.isMine ||
                                      actioningId === `buy:${listing.listingId}` ||
                                      Boolean(market && market.profile.coins < listing.price)
                                    }
                                    className="arena-redraw-button text-xs hover:animate-wiggle disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {listing.isMine
                                      ? "[ yours ]"
                                      : actioningId === `buy:${listing.listingId}`
                                        ? "[ buying... ]"
                                        : market && market.profile.coins < listing.price
                                          ? "[ no coins ]"
                                          : "[ buy ]"}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          {/* Desktop: table */}
                          <div className="hidden overflow-x-auto sm:block">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr className="border-b border-blue-200 text-xs font-bold text-blue-500 uppercase tracking-wider dark:border-purple-400/30 dark:text-purple-300">
                                  <th className="pb-2 pr-2">Card</th>
                                  <th className="pb-2 px-2">Rarity</th>
                                  <th className="pb-2 px-2">IV</th>
                                  <th className="pb-2 px-2">Price</th>
                                  <th className="pb-2 px-2">Market</th>
                                  <th className="pb-2 px-2">Seller</th>
                                  <th className="pb-2 pl-2"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {market.listings.map((listing) => (
                                  <tr
                                    key={listing.listingId}
                                    onMouseEnter={(e) => handleCardMouseEnter(listing.card, e)}
                                    onMouseLeave={handleCardMouseLeave}
                                    className="border-b border-blue-50 last:border-b-0 dark:border-purple-400/10"
                                  >
                                    <td className="py-2 pr-2 relative">
                                      <div className="flex items-center gap-2">
                                        <img
                                          src={listing.card.imageUrl}
                                          alt={listing.card.title}
                                          className="h-10 w-7 shrink-0 rounded object-cover"
                                        />
                                        <span className="font-bold text-blue-700 truncate max-w-[120px] dark:text-purple-100">
                                          {listing.card.title}
                                        </span>
                                        {listing.card.element ? (
                                          <span
                                            className="inline-block shrink-0 px-1.5 py-px rounded-full text-[0.6rem] font-bold text-white"
                                            style={{ backgroundColor: ELEMENT_COLORS[listing.card.element] || "#888" }}
                                          >
                                            {listing.card.element}
                                          </span>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td className="py-2 px-2 text-slate-600 dark:text-slate-300">
                                      {listing.card.rarity}
                                    </td>
                                    <td className="py-2 px-2 text-slate-600 dark:text-slate-300">
                                      {listing.card.iv.total}
                                    </td>
                                    <td className="py-2 px-2 font-bold text-blue-700 dark:text-purple-200">
                                      {listing.price.toLocaleString()} 🪙
                                    </td>
                                    <td className="py-2 px-2 text-xs text-blue-600 dark:text-purple-300">
                                      {listing.marketPrice?.value?.toLocaleString() ?? "—"}
                                    </td>
                                    <td className="py-2 px-2 text-xs text-slate-500 dark:text-slate-400">
                                      {listing.seller.username}
                                      {listing.isMine ? " (you)" : ""}
                                    </td>
                                    <td className="py-2 pl-2">
                                      <button
                                        type="button"
                                        onClick={() => void handleBuy(listing)}
                                        disabled={
                                          listing.isMine ||
                                          actioningId === `buy:${listing.listingId}` ||
                                          Boolean(market && market.profile.coins < listing.price)
                                        }
                                        className="arena-redraw-button text-xs hover:animate-wiggle disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {listing.isMine
                                          ? "[ your listing ]"
                                          : actioningId === `buy:${listing.listingId}`
                                            ? "[ buying... ]"
                                            : market && market.profile.coins < listing.price
                                              ? "[ not enough coins ]"
                                              : "[ buy card ]"}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <p className="rounded-xl border border-blue-100 bg-white/60 p-4 text-sm text-slate-600 dark:border-purple-400/20 dark:bg-slate-800/60 dark:text-slate-300">
                          No active listings match these filters.
                        </p>
                      )}
                      {market && market.totalPages > 1 ? (
                        <div className="flex justify-center gap-3 border-t border-sky-100 pt-3 dark:border-purple-400/20">
                          <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                            className="arena-redraw-button disabled:opacity-40"
                          >
                            [ prev ]
                          </button>
                          <span className="self-center text-sm text-blue-600 dark:text-purple-300">
                            Page {market.page} of {market.totalPages}
                          </span>
                          <button
                            type="button"
                            disabled={page >= market.totalPages}
                            onClick={() =>
                              setPage((current) =>
                                Math.min(market.totalPages, current + 1),
                              )
                            }
                            className="arena-redraw-button disabled:opacity-40"
                          >
                            [ next ]
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="space-y-3 p-4">
                        <div>
                          <h2 className="text-lg font-bold text-blue-700 dark:text-purple-100">List a card</h2>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Find your listed card here. You can list up to 20 cards at a time.
                          </p>
                        </div>
                        {collection?.cards.length ? (
                          <>
                            <div ref={cardDropdownRef} className="relative">
                              <input
                                type="text"
                                value={cardSearch}
                                onChange={(event) => {
                                  setCardSearch(event.target.value);
                                  setCardDropdownOpen(true);
                                  setCardHighlight(-1);
                                }}
                                onFocus={() => {
                                  if (cardSearch.trim()) setCardDropdownOpen(true);
                                }}
                                onKeyDown={(event) => {
                                  if (!cardDropdownOpen || cardSuggestions.length === 0) return;
                                  if (event.key === "ArrowDown") {
                                    event.preventDefault();
                                    setCardHighlight((prev) =>
                                      prev < cardSuggestions.length - 1 ? prev + 1 : 0,
                                    );
                                  } else if (event.key === "ArrowUp") {
                                    event.preventDefault();
                                    setCardHighlight((prev) =>
                                      prev > 0 ? prev - 1 : cardSuggestions.length - 1,
                                    );
                                  } else if (event.key === "Enter") {
                                    event.preventDefault();
                                    if (cardHighlight >= 0 && cardHighlight < cardSuggestions.length) {
                                      handleCardSelect(cardSuggestions[cardHighlight]);
                                    }
                                  } else if (event.key === "Escape") {
                                    setCardDropdownOpen(false);
                                    setCardHighlight(-1);
                                  }
                                }}
                                placeholder="search to list your card"
                                className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                              />
                              {cardDropdownOpen && cardSearch.trim() && cardSuggestions.length > 0 ? (
                                <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-blue-200 bg-white shadow-lg dark:border-purple-400/40 dark:bg-slate-800">
                                  {cardSuggestions.map((card, index) => (
                                    <li key={card.cardInstanceId || index}>
                                      <button
                                        type="button"
                                        onClick={() => handleCardSelect(card)}
                                        onMouseEnter={() => setCardHighlight(index)}
                                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                                          index === cardHighlight
                                            ? "bg-blue-100 text-blue-700 dark:bg-purple-900/50 dark:text-purple-100"
                                            : "text-slate-700 hover:bg-blue-50 dark:text-slate-200 dark:hover:bg-slate-700"
                                        }`}
                                      >
                                        <img
                                          src={card.imageUrl}
                                          alt={card.title}
                                          className="h-10 w-7 shrink-0 rounded object-cover"
                                        />
                                        <span className="truncate">
                                          {card.title} · {card.rarity} · IV {card.iv.total}
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            You have no available collection cards to list.
                          </p>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="text-lg font-bold text-blue-700 dark:text-purple-100">
                            Active listings
                          </h2>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {mine?.total || 0}/20
                          </span>
                        </div>
                        {mineListingsContent}
                      </div>
                    </div>
                  )}
                </>
              )}

              {errorMessage ? <ArenaErrorNotice message={errorMessage} /> : null}
            </section>
            <Divider />
          </main>
          <aside className="hidden mb-auto w-full space-y-4 lg:block lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md dark:border-purple-400/30 dark:bg-slate-800 dark:opacity-95">
              <div className="space-y-2 text-sm text-blue-600 dark:text-purple-200">
                <h2 className="text-center text-lg font-bold text-blue-700 dark:text-purple-100">
                  market info
                </h2>
                <p>Prices are set by sellers.</p>
                <p>Market averages use the latest 30 completed matching sales.</p>
                <p>There are no listing fees or expirations.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
      {selectedCard && tab === "mine"
        ? createPortal(
            <div
              className="fixed inset-0 z-[230000] flex items-center justify-center bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-950/70"
              onClick={closeListModal}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="list-card-modal-title"
                className="card-border w-full max-w-sm rounded-2xl p-5 shadow-2xl dark:bg-slate-900"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-500">
                      list a card
                    </p>
                    <h2
                      id="list-card-modal-title"
                      className="mt-1 text-xl font-bold text-blue-700 dark:text-purple-100"
                    >
                      {selectedCard.title}
                    </h2>
                  </div>
                  <img
                    src={selectedCard.imageUrl}
                    alt={selectedCard.title}
                    className="mx-auto h-56 w-40 rounded-xl border-2 border-sky-200 object-cover shadow-lg dark:border-purple-400/50"
                  />
                  <div className="space-y-1 text-sm text-blue-700 dark:text-purple-100">
                    <p>
                      <span className="font-bold">Rarity:</span> {selectedCard.rarity}
                    </p>
                    <p>
                      <span className="font-bold">IV:</span> {selectedCard.iv.total}{" "}
                      · P {selectedCard.iv.power} · G {selectedCard.iv.guard} · S{" "}
                      {selectedCard.iv.speed} · EH {selectedCard.iv.effectHit}
                    </p>
                    <PriceGuide guide={priceGuide} />
                  </div>
                  <div>
                    <label
                      htmlFor="list-card-price"
                      className="block text-sm font-bold text-blue-700 dark:text-purple-200"
                    >
                      Asking price
                    </label>
                    <input
                      id="list-card-price"
                      type="number"
                      min={1}
                      max={1_000_000}
                      step={1}
                      required
                      value={price}
                      onChange={(event) => {
                        setPrice(event.target.value);
                        setListError(null);
                      }}
                      placeholder="1–1,000,000 coins"
                      className="mt-1 block w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                    />
                    {listError ? (
                      <p className="mt-1 text-xs font-semibold text-red-500">{listError}</p>
                    ) : null}
                  </div>
                  <div className="flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={closeListModal}
                      className="arena-redraw-button hover:animate-wiggle"
                    >
                      [ cancel ]
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleList()}
                      disabled={
                        !selectedCard?.cardInstanceId ||
                        actioningId === `list:${selectedCard?.cardInstanceId}` ||
                        (mine?.total || 0) >= 20
                      }
                      className="arena-redraw-button hover:animate-wiggle disabled:opacity-50"
                    >
                      {actioningId === `list:${selectedCard?.cardInstanceId}`
                        ? "[ listing... ]"
                        : (mine?.total || 0) >= 20
                          ? "[ listing limit reached ]"
                          : "[ list now ]"}
                    </button>
                  </div>
                </div>
              </section>
            </div>,
            document.body,
          )
            : null}
      {hoverCard
        ? createPortal(
            <div
              className="pointer-events-none fixed"
              style={{
                left: Math.min(hoverCard.x + 16, window.innerWidth - 170),
                top: Math.min(hoverCard.y + 16, window.innerHeight - 260),
                zIndex: 230001,
              }}
            >
              <ArenaPortraitCard card={hoverCard.card} size="full" showIvLine interactive auto />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};

export default ArenaMarket;
