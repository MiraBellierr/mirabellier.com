import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import Divider from "@/parts/Divider";
import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import {
  type ArenaShopItem,
  type ArenaShopResponse,
  equipArenaItem,
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
import { usePageSeo } from "@/lib/seo";
import { useConfirm } from "@/states/ConfirmContext";

type InventoryFilter = "all" | "gear" | "consumable" | "material";

const FILTERS: Array<{ id: InventoryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "gear", label: "Gear" },
  { id: "consumable", label: "Consumables" },
  { id: "material", label: "Materials" },
];

function flattenItems(shop: ArenaShopResponse | null) {
  if (!shop) return [] as ArenaShopItem[];
  return shop.shop.flatMap((tier) => tier.items);
}

function typeLabel(type: ArenaShopItem["type"]) {
  if (type === "gear") return "Gear";
  if (type === "consumable") return "Consumables";
  if (type === "material") return "Materials";
  return "Other";
}

const ArenaInventory = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const { confirm } = useConfirm();
  const [shop, setShop] = useState<ArenaShopResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [query, setQuery] = useState("");

  usePageSeo({
    canonical: "https://mirabellier.com/arena/inventory",
    structuredDataId: "arena-inventory-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Inventory",
      description: "View and manage your owned Arena gear, consumables, and materials.",
      url: "https://mirabellier.com/arena/inventory",
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

    const loadInventory = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const payload = await fetchArenaShop(token);
        if (!cancelled) setShop(payload);
      } catch (error) {
        if (!cancelled) setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadInventory();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const ownedItems = useMemo(
    () =>
      flattenItems(shop)
        .filter((item) => item.ownedQuantity > 0 && item.type !== "instant")
        .sort((left, right) => {
          const typeOrder = { gear: 0, consumable: 1, material: 2, instant: 3 };
          return (
            typeOrder[left.type] - typeOrder[right.type] ||
            left.tier.localeCompare(right.tier) ||
            left.name.localeCompare(right.name)
          );
        }),
    [shop],
  );

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return ownedItems.filter((item) => {
      if (filter !== "all" && item.type !== filter) return false;
      if (!normalizedQuery) return true;
      return (
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.tier.toLowerCase().includes(normalizedQuery) ||
        item.slot?.includes(normalizedQuery)
      );
    });
  }, [filter, ownedItems, query]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ArenaShopItem[]>();
    visibleItems.forEach((item) => {
      const label = typeLabel(item.type);
      groups.set(label, [...(groups.get(label) || []), item]);
    });
    return [...groups.entries()];
  }, [visibleItems]);

  const handleUse = async (item: ArenaShopItem) => {
    if (!token) return;
    setActioningId(`use:${item.id}`);
    setErrorMessage(null);
    try {
      const payload = await activateArenaConsumable(token, item.id);
      setShop(payload.shop);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const handleEquip = async (item: ArenaShopItem) => {
    if (!token || !shop || !item.slot || item.isEquipped) return;
    const equippedItem = shop.equipped[item.slot];
    if (equippedItem) {
      const shouldReplace = await confirm({
        title: `Replace equipped ${item.slot}?`,
        message: (
          <div className="space-y-2">
            <p>
              Equip <strong>{item.name}</strong> and replace{" "}
              <strong>{equippedItem.name}</strong>?
            </p>
            <p className="text-sm">
              {equippedItem.name} will remain in your inventory.
            </p>
          </div>
        ),
        confirmLabel: "Equip gear",
        cancelLabel: "Cancel",
      });
      if (!shouldReplace) return;
    }

    setActioningId(`equip:${item.id}`);
    setErrorMessage(null);
    try {
      const payload = await equipArenaItem(token, item.id);
      setShop(payload.shop);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const activeEffects = shop ? formatActiveEffects(shop) : [];
  const totalQuantity = ownedItems.reduce(
    (total, item) => total + item.ownedQuantity,
    0,
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
              <div>
                <h2 className="text-4xl font-bold text-blue-900">
                  Inventory {`>^. .^<`}
                </h2>
                <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                  <span className="text-pink-300">✿</span> All your Arena
                  treasures, tucked safely in one place!{" "}
                  <span className="text-pink-300">✿</span>
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-3 border-b border-sky-100 pb-3">
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
                <span className="font-bold">|</span>
                <Link to="/arena/skill-tree" className="arena-redraw-button hover:animate-wiggle">
                  [ Skill Tree ]
                </Link>
              </div>

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
                  <p className="font-semibold">Login is required to view inventory.</p>
                  <Link to="/login" className="mt-2 inline-block underline">
                    go to login
                  </Link>
                </div>
              ) : loading && !shop ? (
                <p className="text-blue-500">Loading inventory...</p>
              ) : shop ? (
                <div className="space-y-4">
                  <div className="border-y border-sky-500 p-3 text-sm text-blue-950">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-lg font-semibold underline">Equipped Gear</p>
                        <p>✦ Weapon: {shop.equipped.weapon?.name || "none"}</p>
                        <p>✦ Armor: {shop.equipped.armor?.name || "none"}</p>
                        <p>✦ Charm: {shop.equipped.charm?.name || "none"}</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold underline">Bag Summary</p>
                        <p>✦ Unique items: {ownedItems.length}</p>
                        <p>✦ Total quantity: {totalQuantity}</p>
                        <p>✦ Coins: {shop.profile.coins.toLocaleString()} 🪙</p>
                      </div>
                    </div>
                    {activeEffects.length > 0 ? (
                      <div className="mt-3 border-t border-sky-200 pt-2">
                        <p className="font-semibold underline">Active Effects</p>
                        <p>{activeEffects.join(" · ")}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {FILTERS.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setFilter(entry.id)}
                          className="arena-redraw-button hover:animate-wiggle"
                        >
                          {filter === entry.id
                            ? `[ » ${entry.label} « ]`
                            : `[ ${entry.label} ]`}
                        </button>
                      ))}
                    </div>
                    <label htmlFor="inventory-search" className="sr-only">
                      Search inventory
                    </label>
                    <input
                      id="inventory-search"
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search inventory..."
                      className="w-full rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm text-slate-700 sm:w-48"
                    />
                  </div>

                  {groupedItems.length > 0 ? (
                    <div className="space-y-5">
                      {groupedItems.map(([groupName, items]) => (
                        <section key={groupName}>
                          <h3 className="mb-2 border-b border-sky-200 pb-1 text-lg font-bold text-blue-700">
                            {groupName}
                          </h3>
                          <ol className="grid gap-3 sm:grid-cols-2">
                            {items.map((item) => {
                              const isUsing = actioningId === `use:${item.id}`;
                              const isEquipping = actioningId === `equip:${item.id}`;
                              return (
                                <li key={item.id} className="py-2">
                                  <article className="flex items-start gap-3">
                                    <ArenaItemSprite item={item} className="h-10 w-10" />
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-bold text-blue-700">{item.name}</p>
                                        {item.isEquipped ? (
                                          <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-black uppercase text-pink-700 dark:bg-pink-400/20 dark:text-pink-200 dark:ring-1 dark:ring-inset dark:ring-pink-300/40">
                                            equipped
                                          </span>
                                        ) : null}
                                        {item.type === "gear" && !item.isEquipped ? (
                                          <button
                                            type="button"
                                            onClick={() => void handleEquip(item)}
                                            disabled={actioningId !== null}
                                            className="arena-redraw-button hover:animate-wiggle"
                                          >
                                            {isEquipping ? "[ equipping... ]" : "[ equip ]"}
                                          </button>
                                        ) : null}
                                        {item.type === "consumable" ? (
                                          <button
                                            type="button"
                                            onClick={() => void handleUse(item)}
                                            disabled={actioningId !== null}
                                            className="arena-redraw-button hover:animate-wiggle"
                                          >
                                            {isUsing ? "[ using... ]" : "[ use ]"}
                                          </button>
                                        ) : null}
                                      </div>
                                      <p className="text-xs text-slate-600">
                                        {item.tier}
                                        {item.slot ? ` · ${item.slot}` : ""}
                                        {" · "}Owned: {item.ownedQuantity}
                                      </p>
                                      {item.stats ? (
                                        <p className="text-xs text-blue-600">
                                          {formatStats(item.stats)}
                                        </p>
                                      ) : null}
                                      {item.passive ? (
                                        <p className="text-xs text-blue-600">
                                          {describePassive(item.passive)}
                                        </p>
                                      ) : null}
                                      {item.consumableEffect ? (
                                        <p className="text-xs text-blue-600">
                                          {describeConsumableEffect(item.consumableEffect)}
                                        </p>
                                      ) : null}
                                    </div>
                                  </article>
                                </li>
                              );
                            })}
                          </ol>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-700">
                      <p>No items match this view.</p>
                      <Link to="/arena/shop" className="mt-2 inline-block font-bold underline">
                        Visit the shop
                      </Link>
                    </div>
                  )}
                </div>
              ) : null}

              {errorMessage ? <ArenaErrorNotice message={errorMessage} /> : null}
            </section>
            <Divider />
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-2 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  inventory info
                </h2>
                <p>Equip any gear you already own.</p>
                <p>Use consumables directly from your bag.</p>
                <p>Materials are spent when crafting recipes.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaInventory;
