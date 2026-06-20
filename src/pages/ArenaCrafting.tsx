import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { useConfirm } from "@/states/ConfirmContext";
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
  const { confirm } = useConfirm();
  const [shop, setShop] = useState<ArenaShopResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedRecipes, setExpandedRecipes] = useState(new Set<string>());

  const toggleExpanded = (recipeId: string) => {
    setExpandedRecipes((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
  };

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
    if (!token || !shop) return;

    const recipe = shop.recipes.find((candidate) => candidate.id === recipeId);
    const outputItem = recipe ? itemById.get(recipe.output.itemId) : null;
    const equippedItem =
      outputItem?.type === "gear" && outputItem.slot
        ? shop.equipped[outputItem.slot]
        : null;

    if (recipe && outputItem?.type === "gear" && outputItem.slot && equippedItem) {
      const shouldReplace = await confirm({
        title: `Replace equipped ${outputItem.slot}?`,
        message: (
          <div className="space-y-2">
            <p>
              Crafting <strong>{outputItem.name}</strong> will automatically equip it
              and replace <strong>{equippedItem.name}</strong> in the{" "}
              {outputItem.slot} slot.
            </p>
            <p className="text-sm">
              {equippedItem.name} will remain in your inventory.
            </p>
          </div>
        ),
        confirmLabel: "Craft and replace",
        cancelLabel: "Cancel",
      });
      if (!shouldReplace) return;
    }

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
              <div className="">
                <h2 className="text-4xl font-bold text-blue-900">Crafting Workshop {`>^. .^<`}</h2>
                <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                  <span className="text-pink-300">✿</span> Craft gear and consumables from collected materials!{" "}
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
                <Link to="/arena/shop" className="arena-redraw-button hover:animate-wiggle">
                  [ Shop ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/inventory" className="arena-redraw-button hover:animate-wiggle">
                  [ Inventory ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/leaderboard" className="arena-redraw-button hover:animate-wiggle">
                  [ Leaderboard ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/collection" className="arena-redraw-button hover:animate-wiggle">
                  [ Collection ]
                </Link>
                <span className="font-bold">|</span>
                <Link to="/arena/skill-tree" className="arena-redraw-button hover:animate-wiggle">
                  [ Skill Tree ]
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

                    <div className="arena-draw-count-row pt-1 pb-1 text-sm font-semibold text-blue-950">
                      <span className="mr-1 items-center justify-center text-md">
                        Coins:
                      </span>
                      {" "}
                      <span className="font-black text-blue-600">
                        {shop.profile.coins} 🪙
                      </span>
                    </div>

                    <div className=" pt-1 pb-1 text-sm font-bold">
                      <p className="text-lg font-semibold underline pb-1">Gears</p>
                      <p><span className="font-normal">✦ Weapon:</span> {shop.equipped.weapon?.name || "none"}</p>
                      <p><span className="font-normal">✦ Armor:</span> {shop.equipped.armor?.name || "none"}</p>
                      <p><span className="font-normal">✦ Charm:</span> {shop.equipped.charm?.name || "none"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {recipesByTier.map((tierBlock) => {
                    if (tierBlock.recipes.length === 0) return null;

                    return (
                    <section key={tierBlock.tier} className="space-y-2">
                      <h3 className="font-bold text-blue-700 dark:text-white">{tierBlock.tier} (Lv {tierBlock.recipes[0]?.unlockLevel} needed)</h3>
                      <ol className="space-y-1">
                        {tierBlock.recipes.map((recipe) => {
                          const outputItem = itemById.get(recipe.output.itemId);
                          const isCrafting = actioningId === recipe.id;
                          return (
                            <li key={recipe.id} className="pb-3 last:border-b-0 last:pb-0">
                              <article className="flex items-start gap-3">
                                {outputItem ? (
                                  <ArenaItemSprite item={outputItem} />
                                ) : (
                                  <div className="h-8 w-8 shrink-0 rounded-md border border-blue-200 bg-blue-50" />
                                )}
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-blue-700">
                                      {recipe.output.itemName || recipe.output.itemId}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => void handleCraft(recipe.id)}
                                      disabled={!recipe.canCraft || isCrafting}
                                      className="arena-redraw-button hover:animate-wiggle shrink-0"
                                    >
                                      {isCrafting ? "[ crafting... ]" : "[ craft ]"}
                                    </button>
                                  </div>
                                  <p className="text-xs text-slate-600">
                                    Fee {recipe.coinCost} coins
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => toggleExpanded(recipe.id)}
                                    className="text-xs"
                                  >
                                    Materials needed {expandedRecipes.has(recipe.id) ? "▲" : "▼"}
                                  </button>
                                  {expandedRecipes.has(recipe.id) ? (
                                    <div className="text-xs text-slate-600 space-y-0.5">
                                      {recipe.inputs.map((input) => (
                                        <p key={input.itemId}>
                                          ✦ {input.itemName || input.itemId} {input.owned || 0}/{input.required}
                                        </p>
                                      ))}
                                    </div>
                                  ) : null}
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
                <h2 className="text-center text-lg font-bold text-blue-700">crafting info</h2>
                <p>Craft gear and consumables with materials + coins.</p>
                <p>Fight for tier 1–3 materials or buy materials from the shop.</p>
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
