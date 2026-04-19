import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  type ArenaShopItem,
  type ArenaShopResponse,
  buyArenaItem,
  fetchArenaShop,
  useArenaConsumable as activateArenaConsumable,
} from "@/lib/arena-api";
import {
  ArenaItemSprite,
  describeConsumableEffect,
  describePassive,
  formatActiveEffects,
  formatStats,
  normalizeArenaError,
} from "@/lib/arena-shop-ui";

function flattenItems(shop: ArenaShopResponse | null) {
  if (!shop) return [] as ArenaShopItem[];
  return shop.shop.flatMap((tier) => tier.items);
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
      description: "Buy and use arena gear, materials, and consumables.",
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

  const itemById = useMemo(() => {
    const map = new Map<string, ArenaShopItem>();
    flattenItems(shop).forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [shop]);

  const handleBuy = async (itemId: string) => {
    if (!token) return;
    setActioningId(`buy:${itemId}`);
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
    setActioningId(`use:${itemId}`);
    setErrorMessage(null);
    try {
      const payload = await activateArenaConsumable(token, itemId);
      setShop(payload.shop);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const activeEffects = shop ? formatActiveEffects(shop) : [];
  const activePassives = shop?.profile.activePassives || [];
  const materialEntries = Object.entries(shop?.profile.materialInventory || {}).filter(
    ([, quantity]) => Number(quantity || 0) > 0,
  );

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
                <div className="space-y-4">
                  <div className="rounded-xl border border-blue-200 bg-white/70 p-3">
                    <p className="text-sm text-blue-500">
                      Coins: <span className="font-bold text-blue-700">{shop.profile.coins}</span>
                    </p>
                    <p className="text-xs text-slate-600">Catalog: {shop.catalogVersion}</p>
                    <p className="text-xs text-slate-600">
                      Equipped: W {shop.equipped.weapon?.name || "none"} | A {shop.equipped.armor?.name || "none"} | C{" "}
                      {shop.equipped.charm?.name || "none"}
                    </p>
                    {materialEntries.length > 0 ? (
                      <p className="mt-1 text-xs text-slate-600">
                        Materials:{" "}
                        {materialEntries
                          .map(([itemId, qty]) => `${itemById.get(itemId)?.name || itemId} x${qty}`)
                          .join(" | ")}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-600">
                      Craft-only items are available in{" "}
                      <Link to="/arena/crafting" className="font-semibold underline">
                        crafting
                      </Link>
                      .
                    </p>
                    {activeEffects.length > 0 ? (
                      <p className="mt-1 text-xs text-slate-600">Active effects: {activeEffects.join(" | ")}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">Active effects: none</p>
                    )}
                    {activePassives.length > 0 ? (
                      <p className="mt-1 text-xs text-slate-600">
                        Active passives:{" "}
                        {activePassives
                          .map((passive) => {
                            const sourceName = passive.source?.itemName || passive.key;
                            return `${sourceName} (${describePassive(passive)})`;
                          })
                          .join(" | ")}
                      </p>
                    ) : null}
                  </div>

                  {shop.shop.map((tierBlock) => {
                    const visibleItems = tierBlock.items.filter(
                      (item) => item.acquisition !== "craft",
                    );
                    if (visibleItems.length === 0) return null;

                    return (
                    <section key={tierBlock.tier} className="space-y-2">
                      <h3 className="font-bold text-blue-700">{tierBlock.tier}</h3>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {visibleItems.map((item) => {
                          const isBuying = actioningId === `buy:${item.id}`;
                          const isUsing = actioningId === `use:${item.id}`;
                          return (
                            <article key={item.id} className="rounded-xl border border-blue-200 bg-white/70 p-3">
                              <div className="flex gap-3">
                                <ArenaItemSprite item={item} />
                                <div className="space-y-1">
                                  <p className="font-semibold text-blue-700">{item.name}</p>
                                  <p className="text-xs text-slate-600">
                                    Lv {item.unlockLevel} | {item.tier} | {item.type}
                                    {item.slot ? ` | ${item.slot}` : ""}
                                  </p>
                                  {item.acquisition === "buy" ? (
                                    <p className="text-xs text-slate-700">Price: {item.price} coins</p>
                                  ) : null}
                                  {item.acquisition === "craft" && item.recipeId ? (
                                    <p className="text-xs text-slate-700">Craft in /arena/crafting</p>
                                  ) : null}
                                  {item.acquisition === "drop" ? (
                                    <p className="text-xs text-slate-700">Drop source: battle rewards</p>
                                  ) : null}
                                  {item.stats ? <p className="text-xs text-blue-600">{formatStats(item.stats)}</p> : null}
                                  {item.passive ? (
                                    <p className="text-xs text-blue-600">{describePassive(item.passive)}</p>
                                  ) : null}
                                  {item.consumableEffect ? (
                                    <p className="text-xs text-blue-600">{describeConsumableEffect(item.consumableEffect)}</p>
                                  ) : null}
                                  <p className="text-xs text-slate-600">
                                    Owned: {item.ownedQuantity}
                                    {item.isEquipped ? " | equipped" : ""}
                                  </p>
                                  {item.cooldownEndsAt ? (
                                    <p className="text-xs text-amber-700">
                                      Cooldown until {new Date(item.cooldownEndsAt).toLocaleString()}
                                    </p>
                                  ) : null}
                                </div>
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2">
                                {item.acquisition === "buy" ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleBuy(item.id)}
                                    disabled={!item.canBuy || isBuying}
                                    className="rounded-full bg-blue-500 px-3 py-1 text-xs font-bold text-white transition hover:bg-blue-600 disabled:opacity-60"
                                  >
                                    {isBuying ? "buying..." : "buy"}
                                  </button>
                                ) : null}
                                {item.acquisition === "craft" ? (
                                  <Link
                                    to="/arena/crafting"
                                    className="rounded-full bg-sky-500 px-3 py-1 text-xs font-bold text-white transition hover:bg-sky-600"
                                  >
                                    crafting
                                  </Link>
                                ) : null}
                                {item.type === "consumable" ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleUse(item.id)}
                                    disabled={item.ownedQuantity <= 0 || isUsing}
                                    className="rounded-full bg-pink-500 px-3 py-1 text-xs font-bold text-white transition hover:bg-pink-600 disabled:opacity-60"
                                  >
                                    {isUsing ? "using..." : "use"}
                                  </button>
                                ) : null}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  );})}
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
                <p>Buy base items and materials here.</p>
                <p>Craft recipes are now in the dedicated crafting page.</p>
                <p>Equip one weapon, armor, and charm to activate passives.</p>
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
