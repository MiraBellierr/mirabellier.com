import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
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
              <div className="">
                <h2 className="text-4xl font-bold text-blue-900">Material Shop {`>^. .^<`}</h2>
                <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                  <span className="text-pink-300">✿</span> Here are some materials you can use to craft!{" "}
                  <span className="text-pink-300">✿</span>
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-3 pb-3">
                <Link to="/arena" className="arena-redraw-button hover:animate-wiggle">
                  [ Arena Home ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/fight" className="arena-redraw-button hover:animate-wiggle">
                  [ Fight ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/crafting" className="arena-redraw-button hover:animate-wiggle">
                  [ Craft ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/leaderboard" className="arena-redraw-button hover:animate-wiggle">
                  [ Leaderboard ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/collection" className="arena-redraw-button hover:animate-wiggle">
                  [ Collection ]
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
                <div className="space-y-4 ">
                  <div className="gap-2 border-t p-2 border-b border-sky-500 text-sm font-bold">
                    <div className="text-sm pt-2">
                      <p className="text-lg font-semibold underline">Materials</p>
                    </div>
                    {materialEntries.length > 0 ? (
                      materialEntries.map(([itemId, qty]) => (
                        <p key={itemId}>
                          <span className="font-normal">✦ {itemById.get(itemId)?.name || itemId}</span> x{qty}
                        </p>
                      ))
                    ) : (
                      <p><span className="font-normal">✦ none</span></p>
                    )}

                    <div className="arena-draw-count-rowpt-1 pb-1 text-sm font-semibold text-blue-950">
                      <span className="mr-1 items-center justify-center text-md">
                        Coins:
                      </span>
                      {" "}
                      <span className="font-black text-blue-600">
                        {shop.profile.coins} 🪙
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {shop.shop.map((tierBlock) => {
                    const visibleItems = tierBlock.items.filter(
                      (item) => item.acquisition !== "craft",
                    );
                    if (visibleItems.length === 0) return null;

                    return (
                    <section key={tierBlock.tier} className="space-y-2">
                      <h3 className="font-bold text-blue-700 dark:text-white">{tierBlock.tier} (Lv {visibleItems[0]?.unlockLevel} needed)</h3>
                      <ol className="space-y-1">
                        {visibleItems.map((item) => {
                          const isBuying = actioningId === `buy:${item.id}`;
                          const isUsing = actioningId === `use:${item.id}`;
                          return (
                            <li key={item.id} className="pb-3 last:border-b-0 last:pb-0">
                              <article className="flex items-start gap-3">
                                <ArenaItemSprite item={item} />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-blue-700">{item.name}</p>
                                    <div className="flex flex-wrap gap-1 shrink-0">
                                      {item.acquisition === "buy" ? (
                                        <button
                                          type="button"
                                          onClick={() => void handleBuy(item.id)}
                                          disabled={!item.canBuy || isBuying}
                                          className="arena-redraw-button hover:animate-wiggle"
                                        >
                                          {isBuying ? "[ buying... ]" : "[ buy ]"}
                                        </button>
                                      ) : null}
                                      {item.acquisition === "craft" ? (
                                        <Link
                                          to="/arena/crafting"
                                          className="arena-redraw-button hover:animate-wiggle"
                                        >
                                          [ craft ]
                                        </Link>
                                      ) : null}
                                      {item.type === "consumable" ? (
                                        <button
                                          type="button"
                                          onClick={() => void handleUse(item.id)}
                                          disabled={item.ownedQuantity <= 0 || isUsing}
                                          className="arena-redraw-button hover:animate-wiggle"
                                        >
                                          {isUsing ? "[ using... ]" : "[ use ]"}
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
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
                              </article>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  );})}
                  </div>
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
