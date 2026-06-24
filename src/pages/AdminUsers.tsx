import { useState } from "react";
import { Link } from "react-router-dom";

import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import { usePageSeo } from "@/lib/seo";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import { useAuth } from "@/states/AuthContext";
import { joinApi } from "@/lib/config";
import { ArenaApiError } from "@/lib/arena-api";

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

  const [coinAmount, setCoinAmount] = useState("");
  const [addingCoins, setAddingCoins] = useState(false);
  const [coinResult, setCoinResult] = useState<string | null>(null);

  const [cardCount, setCardCount] = useState("1");
  const [addingCards, setAddingCards] = useState(false);
  const [cardResult, setCardResult] = useState<string | null>(null);

  const [resettingDraws, setResettingDraws] = useState(false);
  const [resetDrawsResult, setResetDrawsResult] = useState<string | null>(null);

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
    if (!Number.isFinite(amount) || amount <= 0) return;
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
      const data = (await response.json()) as { coins: number; added: number };
      setCoinResult(`Added ${data.added.toLocaleString()} coins. New balance: ${data.coins.toLocaleString()}.`);
      setLookedUp({ ...lookedUp, coins: data.coins });
      setCoinAmount("");
    } catch (error) {
      setCoinResult(
        error instanceof ArenaApiError ? error.message : "Failed to add coins",
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
          body: JSON.stringify({ count }),
          cache: "no-store",
        },
      );
      if (!response.ok) throw await readApiError(response);
      const data = (await response.json()) as {
        added: number;
        cards: Array<{ title: string; rarity: string }>;
      };
      const cardList = data.cards
        .map((c) => `${c.title} (${c.rarity})`)
        .join(", ");
      setCardResult(
        `Added ${data.added} card(s): ${cardList || "none"}`,
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleLookup();
                    }}
                    placeholder="e.g. mira"
                    className="flex-1 rounded border border-blue-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
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
                            Add coins
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="1"
                              value={coinAmount}
                              onChange={(e) => setCoinAmount(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void handleAddCoins();
                              }}
                              placeholder="Amount"
                              className="w-32 rounded border border-blue-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => void handleAddCoins()}
                              disabled={
                                addingCoins ||
                                !coinAmount ||
                                Number(coinAmount) <= 0
                              }
                              className="arena-redraw-button hover:animate-wiggle shrink-0"
                            >
                              {addingCoins
                                ? "[ adding... ]"
                                : "[ add coins ]"}
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
