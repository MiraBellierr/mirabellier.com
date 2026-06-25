import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { useWebSocketEvent } from "@/hooks/use-websocket";
import {
  offerCardInArenaTrade,
  removeCardFromArenaTrade,
  offerCoinsInArenaTrade,
  removeCoinsFromArenaTrade,
  confirmArenaTrade,
  unconfirmArenaTrade,
  cancelArenaTradeSession,
  fetchArenaCollection,
  fetchArenaTradeSession,
  fetchArenaProfile,
  type ArenaCard,
  type ArenaTradeSession as ArenaTradeSessionType,
} from "@/lib/arena-api";

type ArenaTradeSessionProps = {
  sessionId: string;
  onClose: () => void;
};

type CardPickerProps = {
  onSelect: (cardInstanceId: string) => void;
  onClose: () => void;
};

const CARD_PICKER_PAGE_SIZE = 30;
const RARITIES = ["C", "R", "SR", "SSR", "UR"] as const;
const ELEMENTS = ["Fire", "Water", "Earth", "Wind", "Light", "Dark"] as const;
const SORT_OPTIONS = [
  { value: "recent", label: "Collection order" },
  { value: "rarity-desc", label: "Rarity: highest first" },
  { value: "rarity-asc", label: "Rarity: lowest first" },
  { value: "iv-desc", label: "IV: highest first" },
  { value: "iv-asc", label: "IV: lowest first" },
] as const;

const ELEMENT_COLORS: Record<string, string> = {
  Fire: "#e74c3c",
  Water: "#3498db",
  Earth: "#27ae60",
  Wind: "#2ecc71",
  Light: "#f1c40f",
  Dark: "#8e44ad",
};

function CardPicker({ onSelect, onClose }: CardPickerProps) {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const [cards, setCards] = useState<ArenaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [rarity, setRarity] = useState("");
  const [element, setElement] = useState("");
  const [previewCard, setPreviewCard] = useState<ArenaCard | null>(null);

  const loadCards = useCallback(async (targetPage: number) => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await fetchArenaCollection(token, {
        page: targetPage,
        perPage: CARD_PICKER_PAGE_SIZE,
        sort,
        search: search || undefined,
        element: element || undefined,
      });
      let filtered = data.cards;
      if (rarity) {
        filtered = filtered.filter((c) => c.rarity === rarity);
      }
      setCards((prev) => (targetPage === 1 ? filtered : [...prev, ...filtered]));
      setHasMore(data.cards.length === CARD_PICKER_PAGE_SIZE);
    } catch {
      // ignore
    }
    setLoading(false);
  }, [token, sort, search, rarity, element]);

  useEffect(() => {
    setPage(1);
  }, [search, sort, rarity, element]);

  useEffect(() => {
    if (!token) return;
    void loadCards(page);
  }, [page, loadCards, token]);

  return (
    <div
      className="fixed inset-0 z-[240000] flex items-center justify-center bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-950/70"
      onClick={onClose}
    >
      <div
        className="card-border w-full max-w-full rounded-2xl p-4 shadow-2xl sm:max-w-5xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-center text-xs font-black uppercase tracking-[0.2em] text-pink-500">
          select a card
        </p>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
          />
          <div className="flex gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="flex-1 rounded-lg border border-blue-200 bg-white px-2 py-2 text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value)}
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
            const active = element === el;
            return (
              <button
                key={el}
                type="button"
                onClick={() => setElement(active ? "" : el)}
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
          {previewCard ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-bold text-blue-700 dark:text-purple-100">
                Offer this card?
              </p>
              <ArenaPortraitCard card={previewCard} size="full" showIvLine />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPreviewCard(null)}
                  className="arena-redraw-button hover:animate-wiggle"
                >
                  [ cancel ]
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(previewCard.cardInstanceId!)}
                  className="arena-redraw-button hover:animate-wiggle"
                >
                  [ confirm ]
                </button>
              </div>
            </div>
          ) : cards.length === 0 && !loading ? (
            <p className="text-center text-sm text-blue-500 dark:text-purple-300">
              No matching cards in your collection.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {cards.map((card) => (
                <button
                  key={card.cardInstanceId}
                  type="button"
                  onClick={() => setPreviewCard(card)}
                  className="cursor-pointer transition hover:scale-105"
                >
                  <ArenaPortraitCard card={card} size="full" showIvLine />
                </button>
              ))}
            </div>
          )}
          {previewCard ? null : hasMore && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={loading}
                className="arena-redraw-button hover:animate-wiggle disabled:opacity-50"
              >
                {loading ? "[ loading... ]" : "[ load more ]"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ArenaTradeSession = ({ sessionId, onClose }: ArenaTradeSessionProps) => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const userId = auth?.user?.id || null;
  const [session, setSession] = useState<ArenaTradeSessionType | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [coinInput, setCoinInput] = useState("");
  const [coinError, setCoinError] = useState<string | null>(null);
  const [coinBalance, setCoinBalance] = useState(0);
  const receivedCardRef = useRef<ArenaCard | null>(null);
  const receivedCoinsRef = useRef(0);
  useWebSocketEvent("arena:trade:session-update", (data) => {
    const sessionData = data as ArenaTradeSessionType | null;
    if (!sessionData) {
      setMessage("Trade session not found.");
      return;
    }
    setSession(sessionData);
    if (sessionData.status === "completed") {
      const isAskerCompleted = userId === sessionData.askerId;
      receivedCardRef.current = isAskerCompleted
        ? sessionData.responderCard
        : sessionData.askerCard;
      receivedCoinsRef.current = isAskerCompleted
        ? (sessionData.responderCoins ?? 0)
        : (sessionData.askerCoins ?? 0);
      // Refresh balance after trade
      if (token) {
        fetchArenaProfile(token).then((p) => setCoinBalance(p.coins)).catch(() => {});
      }
      setMessage("Trade completed!");
    } else if (sessionData.status === "cancelled") {
      setMessage("Trade session cancelled.");
    }
  });

  useEffect(() => {
    if (!token || !sessionId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchArenaTradeSession(token, sessionId);
        if (!cancelled) setSession(data);
      } catch {
        if (!cancelled) setMessage("Failed to load trade session.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [token, sessionId]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      try {
        const profile = await fetchArenaProfile(token);
        if (!cancelled) setCoinBalance(profile.coins);
      } catch { /* ignore */ }
    };
    void load();
    return () => { cancelled = true; };
  }, [token]);

  const isAsker = userId === session?.askerId;
  const myCard = isAsker ? session?.askerCard : session?.responderCard;
  const theirCard = isAsker ? session?.responderCard : session?.askerCard;
  const myCoins = isAsker ? (session?.askerCoins ?? 0) : (session?.responderCoins ?? 0);
  const theirCoins = isAsker ? (session?.responderCoins ?? 0) : (session?.askerCoins ?? 0);
  const theirUsername = isAsker ? session?.responderUsername : session?.askerUsername;
  const myConfirmed = isAsker ? session?.askerConfirmed : session?.responderConfirmed;
  const theirConfirmed = isAsker ? session?.responderConfirmed : session?.askerConfirmed;

  const handlePlaceCard = useCallback(
    async (cardInstanceId: string) => {
      if (!token || !sessionId) return;
      setPending(true);
      setShowPicker(false);
      try {
        const data = await offerCardInArenaTrade(token, sessionId, cardInstanceId);
        setSession(data);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to place card.");
      }
      setPending(false);
    },
    [token, sessionId],
  );

  const handleRemoveCard = useCallback(async () => {
    if (!token || !sessionId) return;
    setPending(true);
    try {
      const data = await removeCardFromArenaTrade(token, sessionId);
      setSession(data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to remove card.");
    }
    setPending(false);
  }, [token, sessionId]);

  const handleConfirm = useCallback(async () => {
    if (!token || !sessionId) return;
    setPending(true);
    try {
      const data = await confirmArenaTrade(token, sessionId);
      setSession(data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to confirm.");
    }
    setPending(false);
  }, [token, sessionId]);

  const handleUnconfirm = useCallback(async () => {
    if (!token || !sessionId) return;
    setPending(true);
    try {
      const data = await unconfirmArenaTrade(token, sessionId);
      setSession(data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to unconfirm.");
    }
    setPending(false);
  }, [token, sessionId]);

  const handleCancel = useCallback(async () => {
    if (!token || !sessionId) return;
    try {
      await cancelArenaTradeSession(token, sessionId);
    } catch {
      // ignore
    }
    onClose();
  }, [token, sessionId, onClose]);

  // Sync coinInput from session when coins change externally (WebSocket)
  useEffect(() => {
    if (!pending) {
      setCoinInput(myCoins > 0 ? String(myCoins) : "");
      setCoinError(null);
    }
  }, [myCoins, pending]);

  // Debounced auto-offer coins on input change
  useEffect(() => {
    if (!token || !sessionId) return;
    const trimmed = coinInput.trim();
    const amount = trimmed ? Math.floor(Number(trimmed) || 0) : 0;

    // Don't re-offer the same amount
    if (amount === myCoins) return;
    if (amount <= 0 && myCoins <= 0) return;

    setCoinError(null);
    const timer = setTimeout(async () => {
      setPending(true);
      try {
        if (amount <= 0) {
          const data = await removeCoinsFromArenaTrade(token, sessionId);
          setSession(data);
        } else {
          const data = await offerCoinsInArenaTrade(token, sessionId, amount);
          setSession(data);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to update coins.";
        setCoinError(msg);
      }
      setPending(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [coinInput, token, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showPicker) onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, showPicker]);

  if (!session) {
    return createPortal(
      <div className="fixed inset-0 z-[231000] flex items-center justify-center bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-950/70">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-300 border-t-transparent" />
      </div>,
      document.body,
    );
  }

  if (message) {
    const isCompleted = message === "Trade completed!";
    return createPortal(
      <div className="fixed inset-0 z-[231000] flex items-center justify-center bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-950/70">
        <div className="card-border w-full max-w-sm rounded-2xl p-5 text-center shadow-2xl dark:bg-slate-900">
          {isCompleted ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-lg font-bold text-pink-500 dark:text-pink-400">
                Congratulations!
              </p>
              {receivedCardRef.current && (
                <>
                  <p className="text-sm text-blue-700 dark:text-purple-100">
                    You received a new card!
                  </p>
                  <ArenaPortraitCard card={receivedCardRef.current} size="full" showIvLine />
                </>
              )}
              {receivedCoinsRef.current > 0 && (
                <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                  +{receivedCoinsRef.current.toLocaleString()} coins received!
                </p>
              )}
              <button
                type="button"
                onClick={onClose}
                className="arena-redraw-button mt-2 hover:animate-wiggle"
              >
                [ close ]
              </button>
            </div>
          ) : (
            <>
              <p className="text-lg font-bold text-blue-700 dark:text-purple-100">
                {message}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="arena-redraw-button mt-4 hover:animate-wiggle"
              >
                [ close ]
              </button>
            </>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[231000] flex items-center justify-center bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-950/70"
      onClick={onClose}
    >
      <div
        className="card-border w-full max-w-full rounded-2xl p-4 shadow-2xl sm:max-w-3xl sm:p-6 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 text-center text-xs font-black uppercase tracking-[0.2em] text-pink-500">
          trade session
        </p>

        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 min-[420px]:gap-6">
          {/* My slot */}
          <div className="flex flex-col items-center space-y-3">
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-bold text-blue-600 dark:text-purple-200">
                Your Card
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Balance: {coinBalance.toLocaleString()} coins
              </p>
            </div>
            <div className="flex aspect-[10/16] w-[118px] items-center justify-center rounded-xl border-2 border-dashed border-blue-200 p-1 dark:border-purple-400/30">
              {myCard ? (
                <button
                  type="button"
                  onClick={() => { if (!myConfirmed) void handleRemoveCard(); }}
                  disabled={pending || myConfirmed}
                  className="group relative disabled:cursor-default"
                  title={myConfirmed ? "Confirmed" : "Click to remove"}
                >
                  <ArenaPortraitCard card={myCard} size="compact" showIvLine />
                  {!myConfirmed && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <span className="text-xs font-bold text-red-300">remove</span>
                    </div>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  disabled={pending || myConfirmed}
                  className="arena-redraw-button hover:animate-wiggle disabled:opacity-50"
                >
                  {pending ? "[ ... ]" : "[ add card ]"}
                </button>
              )}
            </div>

            {/* Coin offer section */}
            <div className="flex flex-col items-center gap-2 w-full">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                Coins
              </p>
              <input
                type="number"
                min="0"
                value={coinInput}
                onChange={(e) => setCoinInput(e.target.value)}
                disabled={pending || myConfirmed}
                placeholder="0"
                className="w-24 rounded-lg border border-blue-200 bg-white px-2 py-1 text-center text-sm text-slate-700 dark:border-purple-400/40 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50"
              />
              {myCoins > 0 && (
                <span className="text-xs text-amber-500 dark:text-amber-400/70">
                  offering {myCoins.toLocaleString()} coins
                </span>
              )}
              {coinError && (
                <p className="text-xs text-red-500 dark:text-red-400">{coinError}</p>
              )}
            </div>

            {myConfirmed ? (
              <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                Confirmed
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={pending}
                className="arena-redraw-button hover:animate-wiggle disabled:opacity-50"
              >
                {pending ? "[ ... ]" : "[ confirm ]"}
              </button>
            )}
          </div>

          {/* Their slot */}
          <div className="flex flex-col items-center space-y-3">
            <p className="text-sm font-bold text-blue-600 dark:text-purple-200">
              {theirUsername}&apos;s Card
            </p>
            <div className="flex aspect-[10/16] w-[118px] items-center justify-center rounded-xl border-2 border-dashed border-blue-200 p-1 dark:border-purple-400/30">
              {theirCard ? (
                <ArenaPortraitCard
                  card={theirCard}
                  size="compact"
                  showIvLine
                />
              ) : (
                <p className="text-sm text-blue-400 dark:text-purple-400/60">
                  Waiting...
                </p>
              )}
            </div>

            {theirCoins > 0 && (
              <div className="flex flex-col items-center gap-1">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Coins
                </p>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                  {theirCoins.toLocaleString()}
                </span>
              </div>
            )}

            {theirConfirmed ? (
              <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                Confirmed
              </p>
            ) : null}
          </div>
        </div>

        {/* Unconfirm */}
        {myConfirmed && session.status === "active" && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => void handleUnconfirm()}
              disabled={pending}
              className="arena-redraw-button text-xs hover:animate-wiggle disabled:opacity-50"
            >
              [ cancel confirm ]
            </button>
          </div>
        )}

        {myConfirmed && theirConfirmed && (
          <p className="mt-4 text-center text-sm font-bold text-green-600 dark:text-green-400">
            Both players confirmed — trade executing...
          </p>
        )}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => void handleCancel()}
            className="arena-redraw-button text-xs hover:animate-wiggle"
          >
            [ cancel trade session ]
          </button>
        </div>
      </div>

      {showPicker && (
        <CardPicker onSelect={(id) => { void handlePlaceCard(id); }} onClose={() => setShowPicker(false)} />
      )}
    </div>,
    document.body,
  );
};

export default ArenaTradeSession;
