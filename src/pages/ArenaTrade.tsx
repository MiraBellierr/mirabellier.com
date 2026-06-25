import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams, useNavigate } from "react-router-dom";

import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import ArenaSubNav from "@/parts/ArenaSubNav";
import ArenaTradeRequest from "@/parts/ArenaTradeRequest";
import ArenaTradeSession from "@/parts/ArenaTradeSession";
import Divider from "@/parts/Divider";
import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { useWebSocketEvent } from "@/hooks/use-websocket";
import {
  ArenaApiError,
  type ArenaCard,
  type ArenaTradeListing,
  type ArenaTradeListingsResponse,
  type ArenaTradeUser,
  cancelArenaTradeListing,
  createArenaTradeListing,
  fetchArenaCollection,
  fetchArenaTradeListings,
  fetchMyArenaTradeListings,
  searchArenaTradeCards,
  searchArenaTradeUsers,
  sendArenaTradeRequest,
} from "@/lib/arena-api";
import { usePageSeo } from "@/lib/seo";
import { useConfirm } from "@/states/ConfirmContext";

type TradeTab = "listings" | "mine" | "trade";

const RARITIES = ["C", "R", "SR", "SSR", "UR"] as const;
const ELEMENTS = ["Fire", "Water", "Earth", "Wind", "Light", "Dark"] as const;

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena trade request failed.";
}

const WANTED_BADGES: Record<string, string> = {
  C: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  R: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  SR: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  SSR: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  UR: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
};

const ELEMENT_COLORS: Record<string, string> = {
  Fire: "#e74c3c",
  Water: "#3498db",
  Earth: "#27ae60",
  Wind: "#2ecc71",
  Light: "#f1c40f",
  Dark: "#8e44ad",
};

const ArenaTrade = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TradeTab>("listings");
  const [listings, setListings] = useState<ArenaTradeListingsResponse | null>(null);
  const [mine, setMine] = useState<ArenaTradeListingsResponse | null>(null);
  const [collection, setCollection] = useState<ArenaCard[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Filters
  const [wantedRarity, setWantedRarity] = useState("");
  const [wantedElement, setWantedElement] = useState("");
  const [search, setSearch] = useState("");

  // User search for "Trade with Someone" tab
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<ArenaTradeUser[]>([]);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [userHighlight, setUserHighlight] = useState(-1);
  const userDropdownRef = useRef<HTMLDivElement | null>(null);

  // Trade request modal
  const [tradeRequestUser, setTradeRequestUser] = useState<ArenaTradeUser | null>(null);

  // Trade session
  const [tradeSessionId, setTradeSessionId] = useState<string | null>(null);

  // Create listing: card picker
  const [cardSearch, setCardSearch] = useState("");
  const [cardDropdownOpen, setCardDropdownOpen] = useState(false);
  const [cardHighlight, setCardHighlight] = useState(-1);
  const [selectedCard, setSelectedCard] = useState<ArenaCard | null>(null);
  const [wantedCardSearch, setWantedCardSearch] = useState("");
  const [wantedCardDropdownOpen, setWantedCardDropdownOpen] = useState(false);
  const [wantedCardHighlight, setWantedCardHighlight] = useState(-1);
  const [selectedWantedCard, setSelectedWantedCard] = useState<ArenaCard | null>(null);
  const [wantedCardResults, setWantedCardResults] = useState<ArenaCard[]>([]);
  const [createWantedRarity, setCreateWantedRarity] = useState("");
  const [createWantedElement, setCreateWantedElement] = useState("");
  const [createNote, setCreateNote] = useState("");
  const cardDropdownRef = useRef<HTMLDivElement | null>(null);
  const wantedCardDropdownRef = useRef<HTMLDivElement | null>(null);

  // Request from listings: card picker
  const [requestTargetListing, setRequestTargetListing] = useState<ArenaTradeListing | null>(null);
  const [requestCardPickerOpen, setRequestCardPickerOpen] = useState(false);
  const [requestCardQuery, setRequestCardQuery] = useState("");
  const [requestCardSort, setRequestCardSort] = useState("recent");
  const [requestCardRarity, setRequestCardRarity] = useState("");
  const [requestCardElement, setRequestCardElement] = useState("");
  const [requestCardHighlight, setRequestCardHighlight] = useState(-1);
  const [requestPreviewCard, setRequestPreviewCard] = useState<ArenaCard | null>(null);
  const requestCardDropdownRef = useRef<HTMLDivElement | null>(null);
  const [hoverCard, setHoverCard] = useState<{ x: number; y: number; card: ArenaCard } | null>(null);

  const handleCardMouseEnter = (card: ArenaCard, e: React.MouseEvent) => {
    setHoverCard({ x: e.clientX, y: e.clientY, card });
  };
  const handleCardMouseMove = (e: React.MouseEvent) => {
    setHoverCard((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
  };
  const handleCardMouseLeave = () => setHoverCard(null);

  usePageSeo({
    canonical: "https://mirabellier.com/arena/trade",
    structuredDataId: "arena-trade-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Card Trade",
      description: "Trade Arena cards directly with other players.",
      url: "https://mirabellier.com/arena/trade",
    },
  });

  const loadData = useCallback(async (currentToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [listingsPayload, minePayload, collectionPayload] = await Promise.all([
        fetchArenaTradeListings(currentToken, { page: 1, limit: 20 }),
        fetchMyArenaTradeListings(currentToken),
        fetchArenaCollection(currentToken, { perPage: 500 }),
      ]);
      setListings(listingsPayload);
      setMine(minePayload);
      setCollection(collectionPayload.cards);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!token) {
      setListings(null);
      setMine(null);
      setCollection([]);
      return;
    }
    void loadData(token);
  }, [token, loadData]);

  useEffect(() => {
    const sessionFromUrl = searchParams.get("session");
    if (sessionFromUrl) {
      setTradeSessionId(sessionFromUrl);
      setTab("trade");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useWebSocketEvent("arena:trade:listing-changed", () => {
    if (token) void refreshAfterMutation();
  });

  const loadListings = useCallback(
    async (currentPage: number) => {
      if (!token) return;
      setLoading(true);
      try {
        const payload = await fetchArenaTradeListings(token, {
          page: currentPage,
          limit: 20,
          search,
          wantedRarity,
          wantedElement,
        });
        setListings(payload);
      } catch (error) {
        setErrorMessage(normalizeArenaError(error));
      }
      setLoading(false);
    },
    [token, search, wantedRarity, wantedElement],
  );

  const refreshAfterMutation = useCallback(async () => {
    if (!token) return;
    try {
      const [listingsPayload, minePayload, collectionPayload] = await Promise.all([
        fetchArenaTradeListings(token, { page: 1, limit: 20 }),
        fetchMyArenaTradeListings(token),
        fetchArenaCollection(token, { perPage: 500 }),
      ]);
      setListings(listingsPayload);
      setMine(minePayload);
      setCollection(collectionPayload.cards);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    }
  }, [token]);

  // User search
  const filteredUsers = userQuery.trim()
    ? userResults.filter((u) =>
        u.username.toLowerCase().startsWith(userQuery.toLowerCase()),
      )
    : [];

  useEffect(() => {
    if (!token || !userQuery.trim()) {
      setUserResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const users = await searchArenaTradeUsers(token, userQuery);
        setUserResults(users);
      } catch {
        // ignore
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [token, userQuery]);

  // Close user dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Card filter for create-listing picker
  const cardSuggestions = cardSearch.trim()
    ? collection.filter((c: ArenaCard) => {
        const q = cardSearch.toLowerCase();
        return (
          c.title.toLowerCase().includes(q) ||
          (c.from && c.from.toLowerCase().includes(q)) ||
          (c.element && c.element.toLowerCase().includes(q))
        );
      })
    : [];
  const wantedCardSuggestions = wantedCardSearch.trim() ? wantedCardResults : [];

  useEffect(() => {
    if (!token || !wantedCardSearch.trim()) {
      setWantedCardResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const cards = await searchArenaTradeCards(token, wantedCardSearch);
        setWantedCardResults(cards);
      } catch {
        setWantedCardResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [token, wantedCardSearch]);

  // Close card dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (cardDropdownRef.current && !cardDropdownRef.current.contains(e.target as Node)) {
        setCardDropdownOpen(false);
      }
      if (
        wantedCardDropdownRef.current &&
        !wantedCardDropdownRef.current.contains(e.target as Node)
      ) {
        setWantedCardDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleCreateListing = useCallback(async () => {
    if (!token || !selectedCard?.cardInstanceId) return;
    setActioningId(`create:${selectedCard.cardInstanceId}`);
    setErrorMessage(null);
    try {
      await createArenaTradeListing(token, {
        cardInstanceId: selectedCard.cardInstanceId,
        wantedCardMalId: selectedWantedCard?.malId,
        wantedRarity: createWantedRarity || undefined,
        wantedElement: createWantedElement || undefined,
        note: createNote.trim() || undefined,
      });
      setSelectedCard(null);
      setSelectedWantedCard(null);
      setCreateWantedRarity("");
      setCreateWantedElement("");
      setCreateNote("");
      setCardSearch("");
      setWantedCardSearch("");
      await refreshAfterMutation();
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    }
    setActioningId(null);
  }, [token, selectedCard, selectedWantedCard, createWantedRarity, createWantedElement, createNote, refreshAfterMutation]);

  const handleCancelListing = useCallback(
    async (listingId: string) => {
      if (!token) return;
      const approved = await confirm({
        title: "Cancel this listing?",
        message: (
          <span>
            Return your card to your collection? It will not be selected
            automatically.
          </span>
        ),
        confirmLabel: "Cancel listing",
      });
      if (!approved) return;

      setActioningId(`cancel:${listingId}`);
      setErrorMessage(null);
      try {
        await cancelArenaTradeListing(token, listingId);
        await refreshAfterMutation();
      } catch (error) {
        setErrorMessage(normalizeArenaError(error));
      }
      setActioningId(null);
    },
    [token, confirm, refreshAfterMutation],
  );

  const handleSessionClose = useCallback(() => {
    setTradeSessionId(null);
  }, []);

  const handleRequestFromListing = useCallback(
    async (listing: ArenaTradeListing) => {
      if (!token) return;
      setRequestTargetListing(listing);
      setRequestCardPickerOpen(true);
      setRequestCardQuery(listing.wantedCard?.title || "");
      setRequestCardRarity(listing.wantedCard?.rarity || listing.wantedRarity || "");
      setRequestCardElement(listing.wantedCard?.element || listing.wantedElement || "");
      setRequestCardHighlight(-1);
    },
    [token],
  );

  const handleSendRequestCard = useCallback(
    async (cardInstanceId: string) => {
      if (!token || !requestTargetListing) return;
      setActioningId(`request:${requestTargetListing.id}`);
      setErrorMessage(null);
      setRequestCardPickerOpen(false);
      try {
        await sendArenaTradeRequest(
          token,
          requestTargetListing.userId,
          cardInstanceId,
          requestTargetListing.id,
        );
        await refreshAfterMutation();
        setRequestTargetListing(null);
      } catch (error) {
        setErrorMessage(normalizeArenaError(error));
      }
      setActioningId(null);
    },
    [token, requestTargetListing, refreshAfterMutation],
  );

  const renderListingsContent = () => {
    if (!listings) return null;

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {listings.total} active listings
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search cards..."
              className="w-full sm:w-auto rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
            />
            <select
              value={wantedRarity}
              onChange={(e) => {
                setWantedRarity(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Any wanted rarity</option>
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  Wanted: {r}
                </option>
              ))}
            </select>
            <select
              value={wantedElement}
              onChange={(e) => {
                setWantedElement(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Any wanted element</option>
              {ELEMENTS.map((el) => (
                <option key={el} value={el}>
                  Wanted: {el}
                </option>
              ))}
            </select>
          </div>
        </div>

        {listings.listings.length === 0 ? (
          <p className="rounded-xl border border-blue-100 bg-white/60 p-4 text-sm text-slate-600 dark:border-purple-400/20 dark:bg-slate-800/60 dark:text-slate-300">
            No trade listings found.
          </p>
        ) : (
          <>
            {/* Mobile: card-based listing */}
            <div className="flex flex-col gap-3 sm:hidden">
              {listings.listings.map((listing) => (
                <div
                  key={listing.id}
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
                        <span className="inline-block shrink-0 px-1.5 py-px rounded-full text-[0.6rem] font-bold text-white bg-slate-500">
                          {listing.card.element}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">{listing.card.rarity}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500 dark:text-slate-400">IV {listing.card.iv.total}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {listing.wantedCard ? (
                        <span className="rounded-full bg-pink-100 px-1.5 py-0.5 text-xs font-bold text-pink-800 dark:bg-pink-900/40 dark:text-pink-200">
                          {listing.wantedCard.title}
                        </span>
                      ) : null}
                      {listing.wantedRarity ? (
                        <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${WANTED_BADGES[listing.wantedRarity] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"}`}>
                          {listing.wantedRarity}
                        </span>
                      ) : null}
                      {listing.wantedElement ? (
                        <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-bold text-green-800 dark:bg-green-900/40 dark:text-green-200">
                          {listing.wantedElement}
                        </span>
                      ) : null}
                      {!listing.wantedCard && !listing.wantedRarity && !listing.wantedElement ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500">Any</span>
                      ) : null}
                    </div>
                    {listing.note && (
                      <p className="mt-1 text-xs italic text-slate-500 dark:text-slate-400 truncate">
                        &quot;{listing.note}&quot;
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      {listing.username}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {listing.userId === auth?.user?.id ? (
                      <span className="text-xs text-slate-300 dark:text-slate-600">yours</span>
                    ) : listing.hasActiveSession || listing.hasPendingRequest ? (
                      <span className="text-xs font-semibold text-amber-500 dark:text-amber-400">requested</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleRequestFromListing(listing)}
                        disabled={actioningId === `request:${listing.id}`}
                        className="arena-redraw-button text-xs hover:animate-wiggle disabled:opacity-50"
                      >
                        {actioningId === `request:${listing.id}` ? "[ ... ]" : "[ request ]"}
                      </button>
                    )}
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
                    <th className="pb-2 px-2">Wants</th>
                    <th className="pb-2 px-2 hidden md:table-cell">Note</th>
                    <th className="pb-2 px-2">Seller</th>
                    <th className="pb-2 pl-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {listings.listings.map((listing) => (
                    <tr
                      key={listing.id}
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
                            <span className="inline-block shrink-0 px-1.5 py-px rounded-full text-[0.6rem] font-bold text-white bg-slate-500">
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
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap gap-1">
                          {listing.wantedCard ? (
                            <span className="rounded-full bg-pink-100 px-1.5 py-0.5 text-xs font-bold text-pink-800 dark:bg-pink-900/40 dark:text-pink-200">
                              {listing.wantedCard.title}
                            </span>
                          ) : null}
                          {listing.wantedRarity ? (
                            <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${WANTED_BADGES[listing.wantedRarity] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"}`}>
                              {listing.wantedRarity}
                            </span>
                          ) : null}
                          {listing.wantedElement ? (
                            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-bold text-green-800 dark:bg-green-900/40 dark:text-green-200">
                              {listing.wantedElement}
                            </span>
                          ) : null}
                          {!listing.wantedCard && !listing.wantedRarity && !listing.wantedElement ? (
                            <span className="text-xs text-slate-400 dark:text-slate-500">Any</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-xs text-slate-500 dark:text-slate-400 max-w-[150px] truncate hidden md:table-cell">
                        {listing.note || "-"}
                      </td>
                      <td className="py-2 px-2 text-xs text-slate-500 dark:text-slate-400">
                        {listing.username}
                      </td>
                      <td className="py-2 pl-2">
                        {listing.userId === auth?.user?.id ? (
                          <span className="text-xs text-slate-300 dark:text-slate-600">yours</span>
                        ) : listing.hasActiveSession || listing.hasPendingRequest ? (
                          <span className="text-xs font-semibold text-amber-500 dark:text-amber-400">requested</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleRequestFromListing(listing)}
                            disabled={actioningId === `request:${listing.id}`}
                            className="arena-redraw-button text-xs hover:animate-wiggle disabled:opacity-50"
                          >
                            {actioningId === `request:${listing.id}` ? "[ requesting... ]" : "[ request ]"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {listings.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                const newPage = Math.max(1, page - 1);
                setPage(newPage);
                void loadListings(newPage);
              }}
              className="arena-redraw-button disabled:opacity-40"
            >
              [ prev ]
            </button>
            <span className="text-sm text-blue-600 dark:text-purple-300">
              Page {listings.page} of {listings.totalPages}
            </span>
            <button
              type="button"
              disabled={page >= listings.totalPages}
              onClick={() => {
                const newPage = Math.min(listings.totalPages, page + 1);
                setPage(newPage);
                void loadListings(newPage);
              }}
              className="arena-redraw-button disabled:opacity-40"
            >
              [ next ]
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderMineContent = () => {
    return (
      <div className="space-y-5">
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-blue-700 dark:text-purple-100">List a card</h2>
          {collection.length > 0 ? (
            <>
              <div ref={cardDropdownRef} className="relative">
                <input
                  type="text"
                  value={cardSearch}
                  onChange={(e) => {
                    setCardSearch(e.target.value);
                    setCardDropdownOpen(true);
                    setCardHighlight(-1);
                  }}
                  onFocus={() => {
                    if (cardSearch.trim()) setCardDropdownOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (!cardDropdownOpen || cardSuggestions.length === 0) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setCardHighlight((prev) =>
                        prev < cardSuggestions.length - 1 ? prev + 1 : 0,
                      );
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setCardHighlight((prev) =>
                        prev > 0 ? prev - 1 : cardSuggestions.length - 1,
                      );
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (cardHighlight >= 0 && cardHighlight < cardSuggestions.length) {
                        setSelectedCard(cardSuggestions[cardHighlight]);
                        setCardSearch("");
                        setCardDropdownOpen(false);
                      }
                    } else if (e.key === "Escape") {
                      setCardDropdownOpen(false);
                      setCardHighlight(-1);
                    }
                  }}
                  placeholder="Search your collection..."
                  className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                />
                {cardDropdownOpen && cardSearch.trim() && cardSuggestions.length > 0 && (
                  <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-blue-200 bg-white shadow-lg dark:border-purple-400/40 dark:bg-slate-800">
                    {cardSuggestions.map((card, index) => (
                      <li key={card.cardInstanceId || index}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCard(card);
                            setCardSearch("");
                            setCardDropdownOpen(false);
                          }}
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
                )}
              </div>

              {selectedCard && (
                <div className="rounded-xl border border-blue-200 bg-white/80 p-3 dark:border-purple-400/40 dark:bg-slate-800/80">
                  <div className="flex items-start gap-3">
                    <ArenaPortraitCard card={selectedCard} size="compact" showIvLine interactive auto />
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <select
                          value={createWantedRarity}
                          onChange={(e) => setCreateWantedRarity(e.target.value)}
                          className="rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <option value="">Any rarity</option>
                          {RARITIES.map((r) => (
                            <option key={r} value={r}>
                              Wanted: {r}
                            </option>
                          ))}
                        </select>
                        <select
                          value={createWantedElement}
                          onChange={(e) => setCreateWantedElement(e.target.value)}
                          className="rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <option value="">Any element</option>
                          {ELEMENTS.map((el) => (
                            <option key={el} value={el}>
                              Wanted: {el}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div ref={wantedCardDropdownRef} className="relative">
                        <input
                          type="text"
                          value={wantedCardSearch}
                          onChange={(e) => {
                            setWantedCardSearch(e.target.value);
                            setWantedCardDropdownOpen(true);
                            setWantedCardHighlight(-1);
                          }}
                          onFocus={() => {
                            if (wantedCardSearch.trim()) setWantedCardDropdownOpen(true);
                          }}
                          onKeyDown={(e) => {
                            if (!wantedCardDropdownOpen || wantedCardSuggestions.length === 0) return;
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setWantedCardHighlight((prev) =>
                                prev < wantedCardSuggestions.length - 1 ? prev + 1 : 0,
                              );
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setWantedCardHighlight((prev) =>
                                prev > 0 ? prev - 1 : wantedCardSuggestions.length - 1,
                              );
                            } else if (e.key === "Enter") {
                              e.preventDefault();
                              if (
                                wantedCardHighlight >= 0 &&
                                wantedCardHighlight < wantedCardSuggestions.length
                              ) {
                                setSelectedWantedCard(wantedCardSuggestions[wantedCardHighlight]);
                                setWantedCardSearch("");
                                setWantedCardDropdownOpen(false);
                              }
                            } else if (e.key === "Escape") {
                              setWantedCardDropdownOpen(false);
                              setWantedCardHighlight(-1);
                            }
                          }}
                          placeholder="Specific card wanted..."
                          className="w-full rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                        />
                        {wantedCardDropdownOpen && wantedCardSearch.trim() && wantedCardSuggestions.length > 0 && (
                          <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-blue-200 bg-white shadow-lg dark:border-purple-400/40 dark:bg-slate-800">
                            {wantedCardSuggestions.map((card, index) => (
                              <li key={card.cardInstanceId || index}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedWantedCard(card);
                                    setWantedCardSearch("");
                                    setWantedCardDropdownOpen(false);
                                  }}
                                  onMouseEnter={() => setWantedCardHighlight(index)}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                                    index === wantedCardHighlight
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
                        )}
                      </div>
                      {selectedWantedCard ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-pink-200 bg-pink-50 px-2 py-1 text-xs text-pink-700 dark:border-pink-400/40 dark:bg-pink-950/30 dark:text-pink-200">
                          <span className="truncate">
                            Want: {selectedWantedCard.title} · {selectedWantedCard.rarity}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedWantedCard(null);
                              setWantedCardSearch("");
                            }}
                            className="font-bold"
                          >
                            clear
                          </button>
                        </div>
                      ) : null}
                      <input
                        type="text"
                        value={createNote}
                        onChange={(e) => setCreateNote(e.target.value)}
                        placeholder="Optional note (e.g., looking for a specific character...)"
                        maxLength={500}
                        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCard(null);
                            setSelectedWantedCard(null);
                            setCreateWantedRarity("");
                            setCreateWantedElement("");
                            setCreateNote("");
                            setWantedCardSearch("");
                          }}
                          className="arena-redraw-button text-xs hover:animate-wiggle"
                        >
                          [ cancel ]
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCreateListing()}
                          disabled={
                            !selectedCard?.cardInstanceId ||
                            actioningId === `create:${selectedCard.cardInstanceId}` ||
                            (mine?.total || 0) >= 20
                          }
                          className="arena-redraw-button text-xs hover:animate-wiggle disabled:opacity-50"
                        >
                          {actioningId === `create:${selectedCard.cardInstanceId}`
                            ? "[ listing... ]"
                            : (mine?.total || 0) >= 20
                              ? "[ listing limit reached ]"
                              : "[ list now ]"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You have no available cards to list.
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
          {mine && mine.listings.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
              {mine.listings.map((listing) => (
                <div
                  key={listing.id}
                  onMouseEnter={(e) => handleCardMouseEnter(listing.card, e)}
                  onMouseLeave={handleCardMouseLeave}
                  className="flex flex-col items-center gap-2 rounded-xl border border-blue-100 bg-white/60 p-3 dark:border-purple-400/20 dark:bg-slate-800/60"
                >
                  <ArenaPortraitCard card={listing.card} size="compact" showIvLine interactive auto />
                  {(listing.wantedCard || listing.wantedRarity || listing.wantedElement) && (
                    <div className="flex flex-wrap justify-center gap-1">
                      {listing.wantedCard && (
                        <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-bold text-pink-800 dark:bg-pink-900/40 dark:text-pink-200">
                          Want: {listing.wantedCard.title}
                        </span>
                      )}
                      {listing.wantedRarity && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${WANTED_BADGES[listing.wantedRarity] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"}`}
                        >
                          Want: {listing.wantedRarity}
                        </span>
                      )}
                      {listing.wantedElement && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800 dark:bg-green-900/40 dark:text-green-200">
                          Want: {listing.wantedElement}
                        </span>
                      )}
                    </div>
                  )}
                  {listing.note && (
                    <p className="w-full text-center text-xs italic text-slate-500 dark:text-slate-400">
                      "{listing.note}"
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleCancelListing(listing.id)}
                    disabled={actioningId === `cancel:${listing.id}`}
                    className="arena-redraw-button text-xs hover:animate-wiggle disabled:opacity-50"
                  >
                    {actioningId === `cancel:${listing.id}`
                      ? "[ cancelling... ]"
                      : "[ cancel ]"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-blue-100 bg-white/60 p-4 text-sm text-slate-600 dark:border-purple-400/20 dark:bg-slate-800/60 dark:text-slate-300">
              You do not have any active trade listings.
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderTradeContent = () => {
    return (
      <div className="space-y-4">
        <div ref={userDropdownRef} className="relative">
          <label
            htmlFor="trade-user-search"
            className="block text-sm font-bold text-blue-700 dark:text-purple-200"
          >
            Search for a user to trade with
          </label>
          <input
            id="trade-user-search"
            type="text"
            value={userQuery}
            onChange={(e) => {
              setUserQuery(e.target.value);
              setUserDropdownOpen(true);
              setUserHighlight(-1);
            }}
            onFocus={() => {
              if (userQuery.trim()) setUserDropdownOpen(true);
            }}
            onKeyDown={(e) => {
              if (!userDropdownOpen || filteredUsers.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setUserHighlight((prev) =>
                  prev < filteredUsers.length - 1 ? prev + 1 : 0,
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setUserHighlight((prev) =>
                  prev > 0 ? prev - 1 : filteredUsers.length - 1,
                );
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (userHighlight >= 0 && userHighlight < filteredUsers.length) {
                  setTradeRequestUser(filteredUsers[userHighlight]);
                  setUserDropdownOpen(false);
                }
              } else if (e.key === "Escape") {
                setUserDropdownOpen(false);
                setUserHighlight(-1);
              }
            }}
            placeholder="Type a username..."
            className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
          />
          {userDropdownOpen && filteredUsers.length > 0 && (
            <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-blue-200 bg-white shadow-lg dark:border-purple-400/40 dark:bg-slate-800">
              {filteredUsers.map((user, index) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTradeRequestUser(user);
                      setUserDropdownOpen(false);
                      setUserQuery("");
                    }}
                    onMouseEnter={() => setUserHighlight(index)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                      index === userHighlight
                        ? "bg-blue-100 text-blue-700 dark:bg-purple-900/50 dark:text-purple-100"
                        : "text-slate-700 hover:bg-blue-50 dark:text-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {user.avatar && (
                      <img
                        src={user.avatar}
                        alt={user.username}
                        className="h-8 w-8 rounded-full"
                      />
                    )}
                    <span className="font-semibold">{user.username}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {userQuery.trim() && filteredUsers.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            No users found.
          </p>
        )}
      </div>
    );
  };

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
                  Card Trade
                </h1>
                <p className="mt-2 text-sm font-black text-blue-800 dark:text-purple-200 sm:text-base">
                  <span className="text-pink-300">*</span> Trade cards directly
                  with other players!{" "}
                  <span className="text-pink-300">*</span>
                </p>
              </div>

              <ArenaSubNav />

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                  <p className="font-semibold">Login is required to use the card trade.</p>
                  <Link to="/login" className="mt-2 inline-block underline">
                    go to login
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTab("listings")}
                      className="arena-redraw-button hover:animate-wiggle"
                    >
                      {tab === "listings" ? "[ >> Listings << ]" : "[ Listings ]"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("mine")}
                      className="arena-redraw-button hover:animate-wiggle"
                    >
                      {tab === "mine"
                        ? `[ >> Your Listings (${mine?.total || 0}) << ]`
                        : `[ Your Listings (${mine?.total || 0}) ]`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("trade")}
                      className="arena-redraw-button hover:animate-wiggle"
                    >
                      {tab === "trade" ? "[ >> Trade << ]" : "[ Trade ]"}
                    </button>
                  </div>

                  {loading ? (
                    <p className="text-blue-500 dark:text-purple-300">Loading...</p>
                  ) : tab === "listings" ? (
                    renderListingsContent()
                  ) : tab === "mine" ? (
                    renderMineContent()
                  ) : (
                    renderTradeContent()
                  )}

                  {errorMessage ? <ArenaErrorNotice message={errorMessage} /> : null}
                </>
              )}
            </section>
            <Divider />
          </main>
          <aside className="hidden mb-auto w-full space-y-4 lg:block lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md dark:border-purple-400/30 dark:bg-slate-800 dark:opacity-95">
              <div className="space-y-2 text-sm text-blue-600 dark:text-purple-200">
                <h2 className="text-center text-lg font-bold text-blue-700 dark:text-purple-100">
                  trade info
                </h2>
                <p>List cards you want to trade and set criteria for what you want in return.</p>
                <p>Use the Trade tab to send direct trade requests to other players.</p>
                <p>Both players must confirm before a trade completes.</p>
                <p>Trade sessions expire after 5 minutes of inactivity.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />

      {/* Trade request modal (asker side) */}
      {tradeRequestUser && (
        <ArenaTradeRequest
          user={tradeRequestUser}
          onClose={() => setTradeRequestUser(null)}
          onSessionStart={(sessionId) => {
            setTradeRequestUser(null);
            setTradeSessionId(sessionId);
            navigate(`/arena/trade?session=${encodeURIComponent(sessionId)}`, { replace: true });
          }}
        />
      )}

      {/* Trade session modal */}
      {tradeSessionId && (
        <ArenaTradeSession sessionId={tradeSessionId} onClose={handleSessionClose} />
      )}

      {/* Request card picker */}
      {requestTargetListing && requestCardPickerOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[240000] flex items-center justify-center bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-950/70"
              onClick={() => {
                setRequestCardPickerOpen(false);
                setRequestTargetListing(null);
                setRequestPreviewCard(null);
              }}
            >
              <div
                className="card-border w-full max-w-5xl rounded-2xl p-4 shadow-2xl dark:bg-slate-900" 
                onClick={(e) => e.stopPropagation()}
              >
                <p className="mb-3 text-center text-xs font-black uppercase tracking-[0.2em] text-pink-500">
                  select a card to offer
                </p>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:gap-2">
                  <div ref={requestCardDropdownRef} className="relative flex-1">
                    <input
                      type="text"
                      value={requestCardQuery}
                      onChange={(e) => {
                        setRequestCardQuery(e.target.value);
                        setRequestCardHighlight(-1);
                      }}
                      onKeyDown={(e) => {
                        const filtered = collection.filter(
                          (c) => c.cardInstanceId &&
                            (requestCardQuery ? c.title.toLowerCase().includes(requestCardQuery.toLowerCase()) : true) &&
                            (!requestCardRarity || c.rarity === requestCardRarity) &&
                            (!requestCardElement || c.element === requestCardElement),
                        );
                        if (filtered.length === 0) return;
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setRequestCardHighlight((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setRequestCardHighlight((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          if (requestCardHighlight >= 0 && requestCardHighlight < filtered.length) {
                            setRequestPreviewCard(filtered[requestCardHighlight]);
                          }
                        } else if (e.key === "Escape") {
                          setRequestCardPickerOpen(false);
                          setRequestTargetListing(null);
                          setRequestPreviewCard(null);
                        }
                      }}
                      placeholder="Search..."
                      className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={requestCardSort}
                      onChange={(e) => {
                        setRequestCardSort(e.target.value);
                        setRequestCardHighlight(-1);
                      }}
                      className="flex-1 rounded-lg border border-blue-200 bg-white px-2 py-2 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <option value="recent">Recent</option>
                      <option value="rarity-desc">Rarity ↓</option>
                      <option value="rarity-asc">Rarity ↑</option>
                      <option value="iv-desc">IV ↓</option>
                      <option value="iv-asc">IV ↑</option>
                    </select>
                    <select
                      value={requestCardRarity}
                      onChange={(e) => {
                        setRequestCardRarity(e.target.value);
                        setRequestCardHighlight(-1);
                      }}
                      className="flex-1 rounded-lg border border-blue-200 bg-white px-2 py-2 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <option value="">All rarities</option>
                      {RARITIES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">element:</span>
                  {ELEMENTS.map((el) => {
                    const active = requestCardElement === el;
                    return (
                      <button
                        key={el}
                        type="button"
                        onClick={() => {
                          setRequestCardElement(active ? "" : el);
                          setRequestCardHighlight(-1);
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
                <div className="max-h-[50vh] overflow-y-auto">
                  {requestPreviewCard ? (
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm font-bold text-blue-700 dark:text-purple-100">
                        Offer this card?
                      </p>
                      <ArenaPortraitCard card={requestPreviewCard} size="full" showIvLine interactive auto />
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setRequestPreviewCard(null)}
                          className="arena-redraw-button hover:animate-wiggle"
                        >
                          [ cancel ]
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSendRequestCard(requestPreviewCard.cardInstanceId!)}
                          className="arena-redraw-button hover:animate-wiggle"
                        >
                          [ confirm ]
                        </button>
                      </div>
                    </div>
                  ) : (
                    (() => {
                    const filtered = collection.filter(
                      (c) =>
                        c.cardInstanceId &&
                        (requestCardQuery ? c.title.toLowerCase().includes(requestCardQuery.toLowerCase()) : true) &&
                        (!requestCardRarity || c.rarity === requestCardRarity) &&
                        (!requestCardElement || c.element === requestCardElement),
                    );
                    const sorted = [...filtered].sort((a, b) => {
                      if (requestCardSort === "rarity-desc") return RARITIES.indexOf(b.rarity as typeof RARITIES[number]) - RARITIES.indexOf(a.rarity as typeof RARITIES[number]);
                      if (requestCardSort === "rarity-asc") return RARITIES.indexOf(a.rarity as typeof RARITIES[number]) - RARITIES.indexOf(b.rarity as typeof RARITIES[number]);
                      if (requestCardSort === "iv-desc") return b.iv.total - a.iv.total;
                      if (requestCardSort === "iv-asc") return a.iv.total - b.iv.total;
                      return 0;
                    });
                    if (sorted.length === 0) {
                      return (
                        <p className="text-center text-sm text-blue-500 dark:text-purple-300">
                          No matching cards in your collection.
                        </p>
                      );
                    }
                    return (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                        {sorted.slice(0, 30).map((card, i) => (
                          <button
                            key={card.cardInstanceId}
                            type="button"
                            onClick={() => setRequestPreviewCard(card)}
                            className={`cursor-pointer rounded-lg p-1 transition hover:scale-105 ${
                              i === requestCardHighlight
                                ? "ring-2 ring-pink-400 dark:ring-pink-500"
                                : ""
                            }`}
                          >
                            <ArenaPortraitCard card={card} size="full" showIvLine />
                          </button>
                        ))}
                      </div>
                    );
                  })())}
                </div>
                {!requestPreviewCard && (
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setRequestCardPickerOpen(false);
                      setRequestTargetListing(null);
                      setRequestPreviewCard(null);
                    }}
                    className="arena-redraw-button hover:animate-wiggle"
                  >
                    [ cancel ]
                  </button>
                </div>
                )}
              </div>
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

export default ArenaTrade;
