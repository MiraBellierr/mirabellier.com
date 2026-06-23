import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaSubNav from "@/parts/ArenaSubNav";
import Divider from "@/parts/Divider";
import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import {
  type ArenaEquipmentPiece,
  type ArenaShopItem,
  type ArenaShopResponse,
  equipArenaItem,
  fetchArenaShop,
  fodderArenaPiece,
  unequipArenaSlot,
  useArenaConsumable as activateArenaConsumable,
} from "@/lib/arena-api";
import {
  ArenaItemSprite,
  describeConsumableEffect,
  formatActiveEffects,
  getConsumableChargeValue,
  getEffectFieldForKind,
  normalizeArenaError,
} from "@/lib/arena-shop-ui";
import { usePageSeo } from "@/lib/seo";
import { useConfirm } from "@/states/ConfirmContext";

type InventoryTab = "weapon" | "armor" | "charm" | "consumable";

const TABS: Array<{ id: InventoryTab; label: string }> = [
  { id: "weapon", label: "Weapons" },
  { id: "armor", label: "Armour" },
  { id: "charm", label: "Charms" },
  { id: "consumable", label: "Consumables" },
];

const SUB_STAT_LABELS: Record<string, string> = {
  hp: "HP",
  power: "P",
  guard: "G",
  speed: "S",
  luck: "L",
  hpPct: "HP%",
  dmgPct: "DMG%",
  defendPct: "DEF%",
  crit: "CRIT",
  critDmg: "CDMG",
};

const MAIN_STAT_LABELS: Record<string, string> = {
  power: "Power",
  guard: "Guard",
  critRate: "Crit Rate",
  critDmg: "Crit DMG",
};

const SLOT_TO_ITEM_ID: Record<string, string> = {
  weapon: "weapon_roll",
  armor: "armour_roll",
  charm: "charm_roll",
};

const SLOT_LABELS: Record<string, string> = {
  weapon: "Weapon",
  armor: "Armour",
  charm: "Charm",
};

function slotSpriteItem(slot: string): ArenaShopItem {
  return {
    id: SLOT_TO_ITEM_ID[slot] || slot,
    name: SLOT_LABELS[slot] || slot,
    tier: null,
    unlockLevel: 1,
    price: 0,
    type: "gear",
    ownedQuantity: 0,
    isOwned: false,
    isEquipped: false,
    unlocked: true,
    canBuy: false,
  };
}

function pieceSummary(piece: ArenaEquipmentPiece) {
  const main = `${MAIN_STAT_LABELS[piece.mainStatType] || piece.mainStatType} ${piece.mainStatValue}`;
  const subs = piece.subStats
    .map((s) => `${SUB_STAT_LABELS[s.type] || s.type} +${s.value}`)
    .join(" · ");
  return `${main} · ${subs}`;
}

function flattenItems(shop: ArenaShopResponse | null) {
  if (!shop) return [] as ArenaShopItem[];
  return shop.shop.flatMap((tier) => tier.items);
}

const ArenaInventory = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const { confirm } = useConfirm();
  const [shop, setShop] = useState<ArenaShopResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<InventoryTab>("weapon");
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

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

  const pieces = useMemo(
    () => shop?.profile?.equipmentPieces || [],
    [shop],
  );

  const consumables = useMemo(
    () =>
      flattenItems(shop)
        .filter((item) => item.ownedQuantity > 0 && item.type === "consumable")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [shop],
  );

  const visiblePieces = useMemo(
    () => {
      const filtered = pieces.filter((p) => p.slot === tab);
      const start = (page - 1) * PER_PAGE;
      return { items: filtered.slice(start, start + PER_PAGE), total: filtered.length };
    },
    [pieces, tab, page],
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(visiblePieces.total / PER_PAGE)),
    [visiblePieces.total],
  );

  const handleTabChange = (newTab: InventoryTab) => {
    setTab(newTab);
    setPage(1);
  };

  const equippedPieceIdBySlot = useMemo(() => {
    const map: Record<string, string> = {};
    if (shop?.equipped?.weapon?.id) map.weapon = shop.equipped.weapon.id;
    if (shop?.equipped?.armor?.id) map.armor = shop.equipped.armor.id;
    if (shop?.equipped?.charm?.id) map.charm = shop.equipped.charm.id;
    return map;
  }, [shop]);

  const handleUse = async (item: ArenaShopItem) => {
    if (!token || !shop) return;

    const effect = item.consumableEffect;
    if (effect) {
      const kind = typeof effect.kind === "string" ? effect.kind : "";
      const charges = getConsumableChargeValue(effect);
      const field = getEffectFieldForKind(kind);
      if (field && charges > 0) {
        const current =
          Number(shop.profile.effects[field as keyof typeof shop.profile.effects]) || 0;
        const cap = charges * 2;
        if (current + charges >= cap) {
          const desc = describeConsumableEffect(effect);
          const confirmed = await confirm({
            title: `Use ${item.name}?`,
            message: (
              <div className="space-y-2">
                <p>{desc}</p>
                <p className="text-sm text-amber-700">
                  You already have {current} charge{current !== 1 ? "s" : ""}{" "}
                  (cap: {cap}). Using this will be partially wasted.
                </p>
              </div>
            ),
            confirmLabel: "Use anyway",
            cancelLabel: "Cancel",
          });
          if (!confirmed) return;
        }
      }
    }

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

  const handleEquipPiece = async (piece: ArenaEquipmentPiece) => {
    if (!token || !shop || piece.equipped) return;
    if (equippedPieceIdBySlot[piece.slot]) {
      const shouldReplace = await confirm({
        title: `Replace equipped ${piece.slot}?`,
        message: "The currently equipped gear will be unequipped.",
        confirmLabel: "Equip gear",
        cancelLabel: "Cancel",
      });
      if (!shouldReplace) return;
    }

    setActioningId(`equip:${piece.id}`);
    setErrorMessage(null);
    try {
      const payload = await equipArenaItem(token, piece.id);
      setShop(payload.shop);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const handleUnequip = async (slot: string) => {
    if (!token) return;
    setActioningId(`unequip:${slot}`);
    setErrorMessage(null);
    try {
      await unequipArenaSlot(token, slot);
      const refreshed = await fetchArenaShop(token);
      setShop(refreshed);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const handleFodder = async (piece: ArenaEquipmentPiece) => {
    if (!token || piece.equipped) return;
    const confirmed = await confirm({
      title: "Fodder equipment?",
      message: `Remove this ${piece.slot} for 500 coins? This cannot be undone.`,
      confirmLabel: "Fodder",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    setActioningId(`fodder:${piece.id}`);
    setErrorMessage(null);
    try {
      await fodderArenaPiece(token, piece.id);
      const refreshed = await fetchArenaShop(token);
      setShop(refreshed);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const activeEffects = shop ? formatActiveEffects(shop) : [];

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

              <ArenaSubNav />

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
                        <p>✦ Weapon: {shop.equipped.weapon
                          ? pieceSummary(shop.equipped.weapon as unknown as ArenaEquipmentPiece)
                          : "none"}{" "}
                          {shop.equipped.weapon ? (
                            <button type="button" onClick={() => void handleUnequip("weapon")} disabled={actioningId !== null} className="arena-redraw-button hover:animate-wiggle text-xs">[ unequip ]</button>
                          ) : null}
                        </p>
                        <p>✦ Armour: {shop.equipped.armor
                          ? pieceSummary(shop.equipped.armor as unknown as ArenaEquipmentPiece)
                          : "none"}{" "}
                          {shop.equipped.armor ? (
                            <button type="button" onClick={() => void handleUnequip("armor")} disabled={actioningId !== null} className="arena-redraw-button hover:animate-wiggle text-xs">[ unequip ]</button>
                          ) : null}
                        </p>
                        <p>✦ Charm: {shop.equipped.charm
                          ? pieceSummary(shop.equipped.charm as unknown as ArenaEquipmentPiece)
                          : "none"}{" "}
                          {shop.equipped.charm ? (
                            <button type="button" onClick={() => void handleUnequip("charm")} disabled={actioningId !== null} className="arena-redraw-button hover:animate-wiggle text-xs">[ unequip ]</button>
                          ) : null}
                        </p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold underline">Bag Summary</p>
                        <p>✦ Equipment pieces: {pieces.length}</p>
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

                  <div className="flex flex-wrap gap-2">
                    {TABS.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleTabChange(entry.id)}
                        className="arena-redraw-button hover:animate-wiggle"
                      >
                        {tab === entry.id
                          ? `[ » ${entry.label} « ]`
                          : `[ ${entry.label} ]`}
                      </button>
                    ))}
                  </div>

                  {tab === "consumable" ? (
                    consumables.length > 0 ? (
                      <ol className="grid gap-3 sm:grid-cols-2">
                        {consumables.map((item) => {
                          const isUsing = actioningId === `use:${item.id}`;
                          return (
                            <li key={item.id} className="py-2">
                              <article className="flex items-start gap-3">
                                <ArenaItemSprite item={item} className="h-10 w-10" />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-bold text-blue-700">{item.name}</p>
                                    <button
                                      type="button"
                                      onClick={() => void handleUse(item)}
                                      disabled={actioningId !== null}
                                      className="arena-redraw-button hover:animate-wiggle"
                                    >
                                      {isUsing ? "[ using... ]" : "[ use ]"}
                                    </button>
                                  </div>
                                  <p className="text-xs text-slate-600">
                                    {item.tier} · Owned: {item.ownedQuantity}
                                  </p>
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
                    ) : (
                      <p className="text-sm text-slate-500">No consumables.</p>
                    )
                  ) : (
                    visiblePieces.items.length > 0 ? (
                      <div className="space-y-3">
                        <ol className="grid gap-3 sm:grid-cols-2">
                          {visiblePieces.items.map((piece) => {
                          const isEquipping = actioningId === `equip:${piece.id}`;
                          return (
                            <li key={piece.id} className="py-2">
                              <article className="flex items-start gap-3">
                                <ArenaItemSprite item={slotSpriteItem(piece.slot)} className="h-10 w-10" />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-bold text-blue-700">
                                      {MAIN_STAT_LABELS[piece.mainStatType] || piece.mainStatType}{" "}
                                      {piece.mainStatValue}
                                    </p>
                                    {piece.equipped ? (
                                      <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-black uppercase text-pink-700 dark:bg-pink-400/20 dark:text-pink-200 dark:ring-1 dark:ring-inset dark:ring-pink-300/40">
                                        equipped
                                      </span>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => void handleEquipPiece(piece)}
                                          disabled={actioningId !== null}
                                          className="arena-redraw-button hover:animate-wiggle"
                                        >
                                          {isEquipping ? "[ equipping... ]" : "[ equip ]"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleFodder(piece)}
                                          disabled={actioningId !== null}
                                          className="arena-redraw-button hover:animate-wiggle"
                                        >
                                          [ fodder +500 ]
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-600">
                                    {piece.slot}
                                  </p>
                                  <p className="text-xs text-blue-600">
                                    {piece.subStats
                                      .map((s) => `${SUB_STAT_LABELS[s.type] || s.type} +${s.value}`)
                                      .join(" · ")}
                                  </p>
                                </div>
                              </article>
                            </li>
                          );
                        })}
                      </ol>
                      {totalPages > 1 ? (
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="arena-redraw-button hover:animate-wiggle"
                          >
                            [ « prev ]
                          </button>
                          <span className="text-xs text-slate-600">
                            Page {page} of {totalPages} · {visiblePieces.total} total
                          </span>
                          <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="arena-redraw-button hover:animate-wiggle"
                          >
                            [ next » ]
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-700">
                      <p>No {TABS.find((t) => t.id === tab)?.label.toLowerCase()} yet.</p>
                      <Link to="/arena/shop" className="mt-2 inline-block font-bold underline">
                        Visit the shop
                      </Link>
                    </div>
                    )
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
                <p>Use the tabs to browse weapons, armour, charms, or consumables.</p>
                <p>Equip gear and use consumables directly from your bag.</p>
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
