import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  ArenaApiError,
  type ArenaShopResponse,
  buyArenaItem,
  fetchArenaShop,
  useArenaConsumable,
} from "@/lib/arena-api";

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena request failed.";
}

function describeItemEffect(effect: Record<string, unknown> | undefined) {
  if (!effect || typeof effect !== "object") return "";
  const kind = typeof effect.kind === "string" ? effect.kind : "";
  if (kind === "exp_boost") {
    return `+${Number(effect.pct || 0)}% EXP for ${Number(effect.wins || 0)} win(s)`;
  }
  if (kind === "coin_boost") {
    return `+${Number(effect.pct || 0)}% coins for ${Number(effect.wins || 0)} win(s)`;
  }
  if (kind === "refocus_reroll") return "Reroll your card in next fight";
  if (kind === "streak_shield") return "Protect win streak on one loss";
  if (kind === "upgrade_lowest_rarity") return "Rarity +1 for next fight";
  if (kind === "guarantee_ssr_plus") return "Guarantee SSR+ for next fight";
  if (kind === "ascension") return "+1 permanent all stats";
  return "";
}

const ArenaShop = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const [shop, setShop] = useState<ArenaShopResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/arena/shop",
    structuredDataId: "arena-shop-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Shop",
      description: "Buy and use tiered arena items and gear.",
      url: "https://mirabellier.com/arena/shop",
    },
  });

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setShop(null);
      return () => {
        cancelled = true;
      };
    }

    const loadShop = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const payload = await fetchArenaShop(token);
        if (cancelled) return;
        setShop(payload);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadShop();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleBuy = async (itemId: string) => {
    if (!token) return;
    setActioningId(itemId);
    setErrorMessage(null);
    try {
      const payload = await buyArenaItem(token, itemId);
      setShop(payload.shop);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const handleUse = async (itemId: string) => {
    if (!token) return;
    setActioningId(itemId);
    setErrorMessage(null);
    try {
      const payload = await useArenaConsumable(token, itemId);
      setShop(payload.shop);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

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
              <h2 className="text-2xl font-bold text-blue-700">arena shop</h2>
              <div className="flex flex-wrap gap-2">
                <Link to="/arena" className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                  arena home
                </Link>
                <Link to="/arena/fight" className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                  fight
                </Link>
                <Link
                  to="/arena/leaderboard"
                  className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white"
                >
                  leaderboard
                </Link>
                <Link
                  to="/arena/collection"
                  className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white"
                >
                  collection
                </Link>
              </div>

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
                  <p className="font-semibold">Login is required to use the shop.</p>
                  <Link to="/login" className="mt-2 inline-block underline">
                    go to login
                  </Link>
                </div>
              ) : loading && !shop ? (
                <p className="text-blue-500">Loading shop...</p>
              ) : shop ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-blue-200 bg-white/70 p-3">
                    <p className="text-sm text-blue-500">Coins</p>
                    <p className="font-semibold text-blue-700">{shop.profile.coins}</p>
                    <p className="text-xs text-slate-600">
                      Equipped: W {shop.equipped.weapon?.name || "none"} | A {shop.equipped.armor?.name || "none"} | C{" "}
                      {shop.equipped.charm?.name || "none"}
                    </p>
                  </div>
                  {shop.shop.map((tier) => (
                    <div key={tier.tier} className="space-y-2">
                      <h3 className="font-bold text-blue-700">{tier.tier}</h3>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {tier.items.map((item) => (
                          <article
                            key={item.id}
                            className="rounded-xl border border-blue-200 bg-white/70 p-3"
                          >
                            <p className="font-semibold text-blue-700">{item.name}</p>
                            <p className="text-xs text-slate-600">
                              Lv {item.unlockLevel} | {item.price} coins | {item.type}
                              {item.slot ? ` | ${item.slot}` : ""}
                            </p>
                            {item.effect ? (
                              <p className="text-xs text-blue-600">
                                {describeItemEffect(item.effect)}
                              </p>
                            ) : null}
                            <p className="text-xs text-slate-600">
                              Owned: {item.ownedQuantity}
                              {item.isEquipped ? " | equipped" : ""}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void handleBuy(item.id)}
                                disabled={!item.canBuy || actioningId === item.id}
                                className="rounded-full bg-blue-500 px-3 py-1 text-xs font-bold text-white transition hover:bg-blue-600 disabled:opacity-60"
                              >
                                buy
                              </button>
                              {item.type === "consumable" ? (
                                <button
                                  type="button"
                                  onClick={() => void handleUse(item.id)}
                                  disabled={item.ownedQuantity <= 0 || actioningId === item.id}
                                  className="rounded-full bg-pink-500 px-3 py-1 text-xs font-bold text-white transition hover:bg-pink-600 disabled:opacity-60"
                                >
                                  use
                                </button>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
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
                <h2 className="text-center text-lg font-bold text-blue-700">shop info</h2>
                <p>Buy gear for permanent stat boosts.</p>
                <p>Use consumables to boost upcoming fights.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaShop;
