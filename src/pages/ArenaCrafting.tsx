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
  craftArenaRecipe,
  fetchArenaShop,
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

const ArenaCrafting = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const [shop, setShop] = useState<ArenaShopResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/arena/crafting",
    structuredDataId: "arena-crafting-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Crafting",
      description: "Craft arena gear and consumables from collected materials.",
      url: "https://mirabellier.com/arena/crafting",
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
    flattenItems(shop).forEach((item) => map.set(item.id, item));
    return map;
  }, [shop]);

  const recipesByTier = useMemo(() => {
    if (!shop) return [] as Array<{ tier: string; recipes: ArenaShopResponse["recipes"] }>;
    const map = new Map<string, ArenaShopResponse["recipes"]>();
    shop.recipes.forEach((recipe) => {
      const existing = map.get(recipe.tier) || [];
      existing.push(recipe);
      map.set(recipe.tier, existing);
    });
    return [...map.entries()].map(([tier, recipes]) => ({ tier, recipes }));
  }, [shop]);

  const materialEntries = Object.entries(shop?.profile.materialInventory || {}).filter(
    ([, quantity]) => Number(quantity || 0) > 0,
  );

  const handleCraft = async (recipeId: string) => {
    if (!token) return;
    setActioningId(recipeId);
    setErrorMessage(null);
    try {
      const payload = await craftArenaRecipe(token, recipeId, 1);
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
              <h2 className="text-2xl font-bold text-blue-700">arena crafting</h2>
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
                  <p className="font-semibold">Login is required to craft.</p>
                  <Link to="/login" className="mt-2 inline-block underline">
                    go to login
                  </Link>
                </div>
              ) : loading && !shop ? (
                <p className="text-blue-500">Loading crafting...</p>
              ) : shop ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-blue-200 bg-white/70 p-3">
                    <p className="text-sm text-blue-500">
                      Coins: <span className="font-bold text-blue-700">{shop.profile.coins}</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Materials:{" "}
                      {materialEntries.length > 0
                        ? materialEntries
                            .map(([itemId, qty]) => `${itemById.get(itemId)?.name || itemId} x${qty}`)
                            .join(" | ")
                        : "none"}
                    </p>
                  </div>

                  {recipesByTier.map((tierBlock) => (
                    <section key={tierBlock.tier} className="space-y-2">
                      <h3 className="font-bold text-blue-700">{tierBlock.tier}</h3>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {tierBlock.recipes.map((recipe) => {
                          const outputItem = itemById.get(recipe.output.itemId);
                          const isCrafting = actioningId === recipe.id;
                          return (
                            <article key={recipe.id} className="rounded-xl border border-blue-200 bg-white/70 p-3">
                              <div className="flex gap-3">
                                {outputItem ? (
                                  <ArenaItemSprite item={outputItem} />
                                ) : (
                                  <div className="h-8 w-8 rounded-md border border-blue-200 bg-blue-50" />
                                )}
                                <div className="space-y-1">
                                  <p className="font-semibold text-blue-700">
                                    {recipe.output.itemName || recipe.output.itemId}
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    Lv {recipe.unlockLevel} | Fee {recipe.coinCost} coins
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    {recipe.inputs
                                      .map(
                                        (input) =>
                                          `${input.itemName || input.itemId} ${input.owned || 0}/${input.required}`,
                                      )
                                      .join(" | ")}
                                  </p>
                                  {outputItem?.stats ? (
                                    <p className="text-xs text-blue-600">{formatStats(outputItem.stats)}</p>
                                  ) : null}
                                  {outputItem?.passive ? (
                                    <p className="text-xs text-blue-600">{describePassive(outputItem.passive)}</p>
                                  ) : null}
                                  {outputItem?.consumableEffect ? (
                                    <p className="text-xs text-blue-600">
                                      {describeConsumableEffect(outputItem.consumableEffect)}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={() => void handleCraft(recipe.id)}
                                  disabled={!recipe.canCraft || isCrafting}
                                  className="rounded-full bg-sky-500 px-3 py-1 text-xs font-bold text-white transition hover:bg-sky-600 disabled:opacity-60"
                                >
                                  {isCrafting ? "crafting..." : "craft"}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
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
                <h2 className="text-center text-lg font-bold text-blue-700">crafting info</h2>
                <p>Craft gear and consumables with materials + coins.</p>
                <p>Fight to gain drop materials, buy extras in shop.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaCrafting;
