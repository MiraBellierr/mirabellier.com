import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import { usePageSeo } from "@/lib/seo";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import { useAuth } from "@/states/AuthContext";
import { joinApi } from "@/lib/config";
import { ArenaApiError } from "@/lib/arena";

type UserLookup = {
  id: string;
  username: string;
  avatar: string | null;
  hasArenaProfile: boolean;
  coins: number | null;
  level: number | null;
  dailyDrawsUsed: number | null;
  lastCardDrawDate: string | null;
};
type UserSuggestion = UserLookup;
type ArenaCharacterSuggestion = {
  malId: number;
  title: string;
  imageUrl: string;
  favorites: number | null;
  from: string | null;
  rarity: string;
};

function makeAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    const message = body?.error || `Request failed (${response.status})`;
    throw new ArenaApiError(message, { status: response.status });
  } catch (error) {
    if (error instanceof ArenaApiError) throw error;
    throw new ArenaApiError("Arena request failed", {
      status: response.status,
    });
  }
}

const AdminUsers = () => {
  const auth = useAuth();
  const isOwner = canAccessAdminPanel(auth.user);
  const token = auth?.token || null;

  const [username, setUsername] = useState("");
  const [lookedUp, setLookedUp] = useState<UserLookup | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([]);

  const [coinAmount, setCoinAmount] = useState("");
  const [addingCoins, setAddingCoins] = useState(false);
  const [coinResult, setCoinResult] = useState<string | null>(null);

  const [cardCount, setCardCount] = useState("1");
  const [grantMaxIvCards, setGrantMaxIvCards] = useState(false);
  const [addingCards, setAddingCards] = useState(false);
  const [cardResult, setCardResult] = useState<string | null>(null);

  const [resettingDraws, setResettingDraws] = useState(false);
  const [resetDrawsResult, setResetDrawsResult] = useState<string | null>(null);

  const [rerollingShop, setRerollingShop] = useState(false);
  const [shopRerollResult, setShopRerollResult] = useState<string | null>(null);

  const [clearingEffects, setClearingEffects] = useState(false);
  const [clearEffectsResult, setClearEffectsResult] = useState<string | null>(null);

  const [compTitle, setCompTitle] = useState("Arena compensation");
  const [compMessage, setCompMessage] = useState(
    "Thanks for playing Arena. Please accept this compensation package.",
  );
  const [compCoins, setCompCoins] = useState("");
  const [compCardSearch, setCompCardSearch] = useState("");
  const [compCardMalId, setCompCardMalId] = useState("");
  const [compCardSuggestions, setCompCardSuggestions] = useState<ArenaCharacterSuggestion[]>([]);
  const [compCardCount, setCompCardCount] = useState("1");
  const [compCardMaxIv, setCompCardMaxIv] = useState(false);
  const [compEquipmentSlot, setCompEquipmentSlot] = useState("");
  const [compEquipmentCount, setCompEquipmentCount] = useState("1");
  const [creatingCompensation, setCreatingCompensation] = useState(false);
  const [compensationResult, setCompensationResult] = useState<string | null>(null);

  const [debugRandomPack, setDebugRandomPack] = useState(
    () => localStorage.getItem("debugRandomPack") === "1",
  );

  usePageSeo({
    canonical: "https://mirabellier.com/admin/users",
    structuredDataId: "admin-users-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Admin Users",
      description: "Admin panel for managing user coins and cards.",
      url: "https://mirabellier.com/admin/users",
    },
  });

  useEffect(() => {
    if (!token || !username.trim()) {
      setUserSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      fetch(
        joinApi(`/admin/users/suggestions?q=${encodeURIComponent(username.trim())}`),
        {
          credentials: "include",
          headers: makeAuthHeaders(token),
          cache: "no-store",
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          if (!response.ok) throw await readApiError(response);
          return response.json() as Promise<{ users: UserSuggestion[] }>;
        })
        .then((data) => setUserSuggestions(data.users || []))
        .catch((error) => {
          if ((error as Error).name !== "AbortError") {
            setUserSuggestions([]);
          }
        });
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [token, username]);

  useEffect(() => {
    if (!token || !compCardSearch.trim()) {
      setCompCardSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      fetch(
        joinApi(`/admin/arena/characters/suggestions?q=${encodeURIComponent(compCardSearch.trim())}`),
        {
          credentials: "include",
          headers: makeAuthHeaders(token),
          cache: "no-store",
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          if (!response.ok) throw await readApiError(response);
          return response.json() as Promise<{ characters: ArenaCharacterSuggestion[] }>;
        })
        .then((data) => setCompCardSuggestions(data.characters || []))
        .catch((error) => {
          if ((error as Error).name !== "AbortError") {
            setCompCardSuggestions([]);
          }
        });
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [compCardSearch, token]);

  if (!auth.user) {
    return (
      <div className="flex min-h-screen flex-col font-[sans-serif] text-blue-900 dark:text-purple-200">
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
              <section className="card-border space-y-4 bg-white/60 p-4 dark:bg-transparent">
                <h2 className="text-2xl font-bold text-blue-700">Please log in</h2>
                <p className="text-sm text-blue-500">You need to log in with the owner account.</p>
                <Link to="/login" className="arena-redraw-button inline-block">
                  [ Go to login ]
                </Link>
              </section>
            </main>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex min-h-screen flex-col font-[sans-serif] text-blue-900 dark:text-purple-200">
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
              <section className="card-border space-y-4 bg-white/60 p-4 dark:bg-transparent">
                <h2 className="text-2xl font-bold text-blue-700">Not authorized</h2>
                <p className="text-sm text-blue-500">This page is only available to the site owner.</p>
                <Link to="/" className="arena-redraw-button inline-block">
                  [ Back to home ]
                </Link>
              </section>
            </main>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const handleLookup = async () => {
    if (!token || !username.trim()) return;
    setLookingUp(true);
    setLookupError(null);
    setLookedUp(null);
    setCoinResult(null);
    setCardResult(null);
    setResetDrawsResult(null);
    try {
      const response = await fetch(
        joinApi(`/admin/users/lookup?username=${encodeURIComponent(username.trim())}`),
        {
          credentials: "include",
          headers: makeAuthHeaders(token),
          cache: "no-store",
        },
      );
      if (!response.ok) throw await readApiError(response);
      const data = (await response.json()) as UserLookup;
      setLookedUp(data);
    } catch (error) {
      setLookupError(
        error instanceof ArenaApiError ? error.message : "Lookup failed",
      );
    } finally {
      setLookingUp(false);
    }
  };

  const handleAddCoins = async () => {
    if (!token || !lookedUp) return;
    const amount = Number(coinAmount);
    if (!Number.isFinite(amount) || amount === 0) return;
    setAddingCoins(true);
    setCoinResult(null);
    try {
      const response = await fetch(
        joinApi(`/admin/users/${lookedUp.id}/coins`),
        {
          method: "POST",
          credentials: "include",
          headers: makeAuthHeaders(token),
          body: JSON.stringify({ amount }),
          cache: "no-store",
        },
      );
      if (!response.ok) throw await readApiError(response);
      const data = (await response.json()) as { coins: number; added: number; delta?: number };
      const delta = data.delta ?? data.added;
      const action = delta > 0 ? "Added" : "Removed";
      setCoinResult(`${action} ${Math.abs(delta).toLocaleString()} coins. New balance: ${data.coins.toLocaleString()}.`);
      setLookedUp({ ...lookedUp, coins: data.coins });
      setCoinAmount("");
    } catch (error) {
      setCoinResult(
        error instanceof ArenaApiError ? error.message : "Failed to update coins",
      );
    } finally {
      setAddingCoins(false);
    }
  };

  const handleAddCards = async () => {
    if (!token || !lookedUp) return;
    const count = Math.min(Math.max(Number(cardCount) || 1, 1), 20);
    setAddingCards(true);
    setCardResult(null);
    try {
      const response = await fetch(
        joinApi(`/admin/users/${lookedUp.id}/cards`),
        {
          method: "POST",
          credentials: "include",
          headers: makeAuthHeaders(token),
          body: JSON.stringify({ count, maxIv: grantMaxIvCards }),
          cache: "no-store",
        },
      );
      if (!response.ok) throw await readApiError(response);
      const data = (await response.json()) as {
        added: number;
        maxIv?: boolean;
        cards: Array<{
          title: string;
          rarity: string;
          iv?: { total: number; power: number; guard: number; speed: number; effectHit: number };
        }>;
      };
      const cardList = data.cards
        .map((c) => {
          const iv = c.iv ? ` IV ${c.iv.total}` : "";
          return `${c.title} (${c.rarity}${iv})`;
        })
        .join(", ");
      setCardResult(
        `Added ${data.added}${data.maxIv ? " max-IV" : ""} card(s): ${cardList || "none"}`,
      );
      setCardCount("1");
    } catch (error) {
      setCardResult(
        error instanceof ArenaApiError ? error.message : "Failed to add cards",
      );
    } finally {
      setAddingCards(false);
    }
  };

  const handleResetDraws = async () => {
    if (!token || !lookedUp?.hasArenaProfile) return;
    setResettingDraws(true);
    setResetDrawsResult(null);
    try {
      const response = await fetch(
        joinApi(`/admin/users/${lookedUp.id}/reset-draws`),
        {
          method: "POST",
          credentials: "include",
          headers: makeAuthHeaders(token),
          cache: "no-store",
        },
      );
      if (!response.ok) throw await readApiError(response);
      const data = (await response.json()) as { message: string; dailyDrawsUsed: number };
      setResetDrawsResult(data.message);
      setLookedUp({ ...lookedUp, dailyDrawsUsed: data.dailyDrawsUsed });
    } catch (error) {
      setResetDrawsResult(
        error instanceof ArenaApiError ? error.message : "Failed to reset draws",
      );
    } finally {
      setResettingDraws(false);
    }
  };

  const handleRerollShop = async () => {
    if (!token) return;
    setRerollingShop(true);
    setShopRerollResult(null);
    try {
      const response = await fetch(joinApi("/admin/arena/card-shop/reroll"), {
        method: "POST",
        credentials: "include",
        headers: makeAuthHeaders(token),
        cache: "no-store",
      });
      if (!response.ok) throw await readApiError(response);
      const data = (await response.json()) as {
        offerDate: string;
        dailyOffers: Array<{ offerId: string }>;
        deletedOffers: number;
        deletedPurchases: number;
      };
      setShopRerollResult(
        `Rerolled ${data.dailyOffers.length} card(s) for ${data.offerDate}. Cleared ${data.deletedOffers} offer(s) and ${data.deletedPurchases} purchase marker(s).`,
      );
    } catch (error) {
      setShopRerollResult(
        error instanceof ArenaApiError ? error.message : "Failed to reroll shop",
      );
    } finally {
      setRerollingShop(false);
    }
  };

  const handleClearConsumableEffects = async () => {
    if (!token || !lookedUp?.hasArenaProfile) return;
    setClearingEffects(true);
    setClearEffectsResult(null);
    try {
      const response = await fetch(
        joinApi(`/admin/users/${lookedUp.id}/clear-consumable-effects`),
        {
          method: "POST",
          credentials: "include",
          headers: makeAuthHeaders(token),
          cache: "no-store",
        },
      );
      if (!response.ok) throw await readApiError(response);
      const data = (await response.json()) as { message: string; clearedCount: number };
      setClearEffectsResult(data.message);
    } catch (error) {
      setClearEffectsResult(
        error instanceof ArenaApiError ? error.message : "Failed to clear effects",
      );
    } finally {
      setClearingEffects(false);
    }
  };

  const handleCreateCompensation = async () => {
    if (!token) return;
    const coins = Math.max(0, Math.trunc(Number(compCoins) || 0));
    const cardMalId = Math.max(0, Math.trunc(Number(compCardMalId) || 0));
    const cardCount = cardMalId > 0
      ? Math.min(Math.max(Math.trunc(Number(compCardCount) || 1), 1), 20)
      : 0;
    const equipmentCount = compEquipmentSlot
      ? Math.min(Math.max(Math.trunc(Number(compEquipmentCount) || 1), 1), 20)
      : 0;
    const hasReward = coins > 0 || cardMalId > 0 || equipmentCount > 0;
    if (!hasReward) {
      setCompensationResult("Choose at least one reward first.");
      return;
    }

    const summary = [
      coins > 0 ? `${coins.toLocaleString()} coins` : "",
      cardMalId > 0 ? `${cardCount} card(s) for MAL ID ${cardMalId}${compCardMaxIv ? " at max IV" : ""}` : "",
      compEquipmentSlot ? `${equipmentCount} ${compEquipmentSlot} equipment piece(s)` : "",
    ].filter(Boolean).join(", ");

    const confirmed = window.confirm(
      `Send this compensation to every existing Arena profile?\n\n${summary}`,
    );
    if (!confirmed) return;

    setCreatingCompensation(true);
    setCompensationResult(null);
    try {
      const response = await fetch(joinApi("/admin/arena/compensations"), {
        method: "POST",
        credentials: "include",
        headers: makeAuthHeaders(token),
        body: JSON.stringify({
          title: compTitle,
          message: compMessage,
          coins,
          cardMalId,
          cardCount,
          cardMaxIv: compCardMaxIv,
          equipmentSlot: compEquipmentSlot || null,
          equipmentCount,
        }),
        cache: "no-store",
      });
      if (!response.ok) throw await readApiError(response);
      const data = (await response.json()) as {
        compensation: {
          recipientCount: number;
          card?: { title?: string } | null;
        };
      };
      setCompensationResult(
        `Created compensation for ${data.compensation.recipientCount.toLocaleString()} existing Arena profile(s).`,
      );
      setCompCoins("");
      setCompCardSearch("");
      setCompCardMalId("");
      setCompCardSuggestions([]);
      setCompCardCount("1");
      setCompCardMaxIv(false);
      setCompEquipmentSlot("");
      setCompEquipmentCount("1");
    } catch (error) {
      setCompensationResult(
        error instanceof ArenaApiError
          ? error.message
          : "Failed to create compensation",
      );
    } finally {
      setCreatingCompensation(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col font-[sans-serif] text-blue-900 dark:text-purple-200">
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
            <section className="card-border space-y-4 bg-white/60 p-4 dark:bg-transparent">
              <div>
                <h2 className="text-2xl font-bold text-blue-700">
                  admin / users
                </h2>
                <p className="text-sm text-blue-500">
                  Add coins or cards to a user for testing.
                </p>
              </div>

              <Link to="/admin" className="arena-redraw-button inline-block">
                [ &laquo; Back to admin ]
              </Link>

              <div className="space-y-3 border-t border-blue-200 pt-3 dark:border-slate-700">
                <label className="block text-sm font-bold text-blue-700">
                  Username
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    list="admin-user-suggestions"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleLookup();
                    }}
                    placeholder="e.g. mira"
                    className="flex-1 rounded border border-blue-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                  <datalist id="admin-user-suggestions">
                    {userSuggestions.map((suggestion) => (
                      <option key={suggestion.id} value={suggestion.username}>
                        {suggestion.hasArenaProfile
                          ? `Level ${suggestion.level}, ${(suggestion.coins ?? 0).toLocaleString()} coins`
                          : "No arena profile"}
                      </option>
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={() => void handleLookup()}
                    disabled={lookingUp || !username.trim()}
                    className="arena-redraw-button hover:animate-wiggle shrink-0"
                  >
                    {lookingUp ? "[ looking up... ]" : "[ lookup ]"}
                  </button>
                </div>

                {lookupError ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{lookupError}</p>
                ) : null}

                {lookedUp ? (
                  <div className="space-y-3 border-t border-blue-200 pt-3 dark:border-slate-700">
                    <div className="rounded bg-blue-50 p-3 text-sm dark:bg-slate-800">
                      <p className="font-bold">{lookedUp.username}</p>
                      <p>ID: {lookedUp.id}</p>
                      <p>
                        Arena:{" "}
                        {lookedUp.hasArenaProfile
                          ? `Level ${lookedUp.level}, ${(lookedUp.coins ?? 0).toLocaleString()} coins, ${lookedUp.dailyDrawsUsed ?? 0}/10 draws`
                          : "No profile"}
                      </p>
                    </div>

                    {!lookedUp.hasArenaProfile ? (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        This user has no arena profile. They need to visit the
                        Arena at least once first.
                      </p>
                    ) : (
                      <>
                        <div className="space-y-2 border-t border-blue-200 pt-3 dark:border-slate-700">
                          <label className="block text-sm font-bold text-blue-700">
                            Add/remove coins
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={coinAmount}
                              onChange={(e) => setCoinAmount(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void handleAddCoins();
                              }}
                              placeholder="e.g. 500 or -500"
                              className="w-32 rounded border border-blue-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => void handleAddCoins()}
                              disabled={
                                addingCoins ||
                                !coinAmount ||
                                Number(coinAmount) === 0 ||
                                !Number.isFinite(Number(coinAmount))
                              }
                              className="arena-redraw-button hover:animate-wiggle shrink-0"
                            >
                              {addingCoins
                                ? "[ updating... ]"
                                : "[ update coins ]"}
                            </button>
                          </div>
                          {coinResult ? (
                            <p className="text-sm text-green-700 dark:text-green-400">
                              {coinResult}
                            </p>
                          ) : null}
                        </div>

                        <div className="space-y-2 border-t border-blue-200 pt-3 dark:border-slate-700">
                          <label className="block text-sm font-bold text-blue-700">
                            Add cards
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="1"
                              max="20"
                              value={cardCount}
                              onChange={(e) => setCardCount(e.target.value)}
                              placeholder="Count"
                              className="w-24 rounded border border-blue-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            />
                            <label className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-purple-100">
                              <input
                                type="checkbox"
                                checked={grantMaxIvCards}
                                onChange={(e) => setGrantMaxIvCards(e.target.checked)}
                                className="rounded"
                              />
                              Max IV
                            </label>
                            <button
                              type="button"
                              onClick={() => void handleAddCards()}
                              disabled={
                                addingCards ||
                                !cardCount ||
                                Number(cardCount) < 1
                              }
                              className="arena-redraw-button hover:animate-wiggle shrink-0"
                            >
                              {addingCards
                                ? "[ adding... ]"
                                : "[ add cards ]"}
                            </button>
                          </div>
                          {cardResult ? (
                            <p className="text-sm text-green-700 dark:text-green-400">
                              {cardResult}
                            </p>
                          ) : null}
                        </div>

                        <div className="space-y-2 border-t border-blue-200 pt-3 dark:border-slate-700">
                          <label className="block text-sm font-bold text-blue-700">
                            Pack draws
                          </label>
                          <p className="text-xs text-blue-500">
                            Used {lookedUp.dailyDrawsUsed ?? 0}/10 draws today. Reset to let them open packs again.
                          </p>
                          <button
                            type="button"
                            onClick={() => void handleResetDraws()}
                            disabled={resettingDraws}
                            className="arena-redraw-button hover:animate-wiggle shrink-0"
                          >
                            {resettingDraws
                              ? "[ resetting... ]"
                              : "[ reset daily draws ]"}
                          </button>
                          {resetDrawsResult ? (
                            <p className="text-sm text-green-700 dark:text-green-400">
                              {resetDrawsResult}
                            </p>
                          ) : null}
                        </div>

                        <div className="space-y-2 border-t border-red-200 pt-3 dark:border-red-900">
                          <label className="block text-sm font-bold text-red-700 dark:text-red-400">
                            Clear consumable effects
                          </label>
                          <p className="text-xs text-red-600 dark:text-red-400">
                            Removes all active consumable buffs (damage boost, speed boost, shields, death saves, etc.). This cannot be undone.
                          </p>
                          <button
                            type="button"
                            onClick={() => void handleClearConsumableEffects()}
                            disabled={clearingEffects}
                            className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
                          >
                            {clearingEffects
                              ? "[ clearing... ]"
                              : "[ clear all consumable effects ]"}
                          </button>
                          {clearEffectsResult ? (
                            <p className="text-sm text-green-700 dark:text-green-400">
                              {clearEffectsResult}
                            </p>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </section>
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
              <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md dark:border-slate-600 dark:bg-slate-800/80">
                <div className="space-y-2 text-sm text-blue-600">
                  <h2 className="text-center text-lg font-bold text-blue-700">
                    debug
                  </h2>
                  <p className="text-xs">Force the random pack offer to always appear in the card shop, regardless of day-of-week restrictions.</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={debugRandomPack}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setDebugRandomPack(next);
                        if (next) {
                          localStorage.setItem("debugRandomPack", "1");
                        } else {
                          localStorage.removeItem("debugRandomPack");
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-xs font-semibold">Force random pack</span>
                  </label>
                  <div className="border-t border-blue-200 pt-2 dark:border-slate-700">
                    <p className="mb-2 text-xs">Regenerate today's global card shop offers for everyone.</p>
                    <button
                      type="button"
                      onClick={() => void handleRerollShop()}
                      disabled={rerollingShop}
                      className="arena-redraw-button hover:animate-wiggle shrink-0"
                    >
                      {rerollingShop ? "[ rerolling... ]" : "[ reroll card shop ]"}
                    </button>
                    {shopRerollResult ? (
                      <p className="mt-2 text-xs text-green-700 dark:text-green-400">
                        {shopRerollResult}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="border-t border-blue-200 pt-2 dark:border-slate-700">
                  <h3 className="mb-2 text-sm font-bold text-blue-700">
                    Global Arena compensation
                  </h3>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={compTitle}
                      onChange={(e) => setCompTitle(e.target.value)}
                      placeholder="Popup title"
                      className="w-full rounded border border-blue-300 bg-white p-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                    <textarea
                      value={compMessage}
                      onChange={(e) => setCompMessage(e.target.value)}
                      placeholder="Popup message"
                      rows={3}
                      className="w-full rounded border border-blue-300 bg-white p-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min="0"
                        value={compCoins}
                        onChange={(e) => setCompCoins(e.target.value)}
                        placeholder="Coins"
                        className="rounded border border-blue-300 bg-white p-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <input
                        type="text"
                        value={compCardSearch}
                        onChange={(e) => {
                          const value = e.target.value;
                          setCompCardSearch(value);
                          const selected = compCardSuggestions.find(
                            (character) => `${character.title} #${character.malId}` === value,
                          );
                          if (selected) {
                            setCompCardMalId(String(selected.malId));
                            return;
                          }
                          const idMatch = value.match(/#?(\d+)$/);
                          setCompCardMalId(idMatch ? idMatch[1] : "");
                        }}
                        list="admin-arena-card-suggestions"
                        placeholder="Find card"
                        className="rounded border border-blue-300 bg-white p-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <datalist id="admin-arena-card-suggestions">
                        {compCardSuggestions.map((character) => (
                          <option
                            key={character.malId}
                            value={`${character.title} #${character.malId}`}
                          >
                            {character.from
                              ? `${character.rarity} · ${character.from}`
                              : character.rarity}
                          </option>
                        ))}
                      </datalist>
                      <input
                        type="number"
                        min="0"
                        value={compCardMalId}
                        onChange={(e) => setCompCardMalId(e.target.value)}
                        placeholder="MAL ID"
                        className="rounded border border-blue-300 bg-white p-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={compCardCount}
                        onChange={(e) => setCompCardCount(e.target.value)}
                        placeholder="Card count"
                        className="rounded border border-blue-300 bg-white p-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <label className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-purple-100">
                        <input
                          type="checkbox"
                          checked={compCardMaxIv}
                          onChange={(e) => setCompCardMaxIv(e.target.checked)}
                          className="rounded"
                        />
                        Max IV card
                      </label>
                      <select
                        value={compEquipmentSlot}
                        onChange={(e) => setCompEquipmentSlot(e.target.value)}
                        className="rounded border border-blue-300 bg-white p-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="">No equipment</option>
                        <option value="weapon">Blade</option>
                        <option value="armor">Armour</option>
                        <option value="charm">Charm</option>
                      </select>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={compEquipmentCount}
                        onChange={(e) => setCompEquipmentCount(e.target.value)}
                        placeholder="Gear count"
                        className="rounded border border-blue-300 bg-white p-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCreateCompensation()}
                      disabled={creatingCompensation}
                      className="arena-redraw-button hover:animate-wiggle shrink-0"
                    >
                      {creatingCompensation
                        ? "[ sending... ]"
                        : "[ send compensation ]"}
                    </button>
                    {compensationResult ? (
                      <p className="text-xs text-green-700 dark:text-green-400">
                        {compensationResult}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default AdminUsers;
