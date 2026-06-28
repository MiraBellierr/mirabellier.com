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
  type ArenaEquipmentLoadout,
  type ArenaEquipmentPiece,
  type ArenaShopItem,
  type ArenaShopResponse,
  type ArenaSubStat,
  equipArenaItem,
  fetchArenaShop,
  fodderArenaPiece,
  saveEquipmentLoadout,
  restoreEquipmentLoadout,
  deleteEquipmentLoadout,
  unequipArenaSlot,
  useArenaConsumable as activateArenaConsumable,
} from "@/lib/arena";
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
  effectHit: "EH",
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

function pieceSummary(piece: { mainStatType: string; mainStatValue: number; subStats: ArenaSubStat[] }) {
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
  const [loadoutName, setLoadoutName] = useState("");
  const [loadoutActionId, setLoadoutActionId] = useState<string | null>(null);
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
      const effectMeta = getEffectFieldForKind(kind);
      if (effectMeta && charges > 0) {
        const { field, max } = effectMeta;
        const current =
          Number(shop.profile.effects[field as keyof typeof shop.profile.effects]) || 0;
        const cap = max;
        const newValue = Math.min(current + charges, cap);
        const wasted = current + charges - newValue;
        if (wasted > 0) {
          const desc = describeConsumableEffect(effect);
          const confirmed = await confirm({
            title: `Use ${item.name}?`,
            message: (
              <div className="space-y-2">
                <p>{desc}</p>
                <p className="text-sm text-amber-700">
                  You already have {current} charge{current !== 1 ? "s" : ""}{" "}
                  (cap: {cap}). {wasted} charge{wasted !== 1 ? "s" : ""} will be wasted.
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

  const handleSaveLoadout = async () => {
    if (!token) return;
    setLoadoutActionId("save");
    setErrorMessage(null);
    try {
      const payload = await saveEquipmentLoadout(token, loadoutName);
      setShop(payload.shop);
      setLoadoutName("");
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setLoadoutActionId(null);
    }
  };

  const handleRestoreLoadout = async (loadout: ArenaEquipmentLoadout) => {
    if (!token) return;
    const pieceMap = new Map(
      (shop?.profile?.equipmentPieces || []).map((p) => [p.id, p]),
    );
    const slots: string[] = [];
    if (loadout.weaponPieceId && pieceMap.has(loadout.weaponPieceId)) slots.push("Weapon");
    if (loadout.armorPieceId && pieceMap.has(loadout.armorPieceId)) slots.push("Armour");
    if (loadout.charmPieceId && pieceMap.has(loadout.charmPieceId)) slots.push("Charm");

    if (slots.length === 0) {
      setErrorMessage("No pieces in this loadout still exist.");
      return;
    }

    const hasEquipped = ["weapon", "armor", "charm"].some(
      (s) => shop?.equipped?.[s as keyof typeof shop.equipped],
    );
    if (hasEquipped) {
      const shouldRestore = await confirm({
        title: `Restore "${loadout.name}"?`,
        message: (
          <span>
            Currently equipped gear will be replaced. Restoring: {slots.join(", ")}.
          </span>
        ),
        confirmLabel: "Restore loadout",
        cancelLabel: "Cancel",
      });
      if (!shouldRestore) return;
    }

    setLoadoutActionId(`restore:${loadout.id}`);
    setErrorMessage(null);
    try {
      const payload = await restoreEquipmentLoadout(token, loadout.id);
      setShop(payload.shop);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setLoadoutActionId(null);
    }
  };

  const handleDeleteLoadout = async (loadout: ArenaEquipmentLoadout) => {
    if (!token) return;
    const shouldDelete = await confirm({
      title: `Delete "${loadout.name}"?`,
      message: "This loadout will be permanently removed.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!shouldDelete) return;

    setLoadoutActionId(`delete:${loadout.id}`);
    setErrorMessage(null);
    try {
      const payload = await deleteEquipmentLoadout(token, loadout.id);
      setShop(payload.shop);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setLoadoutActionId(null);
    }
  };

  const activeEffects = shop ? formatActiveEffects(shop) : [];
  const loadouts = shop?.profile?.equipmentLoadouts || [];
  const pieceMap = useMemo(
    () => new Map((pieces).map((p) => [p.id, p])),
    [pieces],
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
                          ? pieceSummary(shop.equipped.weapon)
                          : "none"}{" "}
                          {shop.equipped.weapon ? (
                            <button type="button" onClick={() => void handleUnequip("weapon")} disabled={actioningId !== null} className="arena-redraw-button hover:animate-wiggle text-xs">[ unequip ]</button>
                          ) : null}
                        </p>
                        <p>✦ Armour: {shop.equipped.armor
                          ? pieceSummary(shop.equipped.armor)
                          : "none"}{" "}
                          {shop.equipped.armor ? (
                            <button type="button" onClick={() => void handleUnequip("armor")} disabled={actioningId !== null} className="arena-redraw-button hover:animate-wiggle text-xs">[ unequip ]</button>
                          ) : null}
                        </p>
                        <p>✦ Charm: {shop.equipped.charm
                          ? pieceSummary(shop.equipped.charm)
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

                  <div className="border-t border-sky-200 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-blue-900">Loadouts:</p>
                      <input
                        type="text"
                        value={loadoutName}
                        onChange={(e) => setLoadoutName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSaveLoadout();
                        }}
                        placeholder="loadout name..."
                        className="rounded border border-blue-200 bg-white/80 px-2 py-1 text-xs text-blue-800 placeholder-blue-300 outline-none focus:border-blue-400"
                        disabled={loadoutActionId !== null}
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveLoadout()}
                        disabled={loadoutActionId !== null}
                        className="arena-redraw-button hover:animate-wiggle text-xs"
                      >
                        {loadoutActionId === "save" ? "[ saving... ]" : "[ save loadout ]"}
                      </button>
                    </div>
                    {loadouts.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {loadouts.map((loadout) => {
                          const weapon = loadout.weaponPieceId ? pieceMap.get(loadout.weaponPieceId) : null;
                          const armor = loadout.armorPieceId ? pieceMap.get(loadout.armorPieceId) : null;
                          const charm = loadout.charmPieceId ? pieceMap.get(loadout.charmPieceId) : null;
                          const isBusy = loadoutActionId !== null;
                          const isRestoring = loadoutActionId === `restore:${loadout.id}`;
                          const isDeleting = loadoutActionId === `delete:${loadout.id}`;
                          const hasAnyPiece = weapon || armor || charm;

                          return (
                            <div key={loadout.id} className="rounded border border-blue-100 bg-blue-50/60 p-2 text-xs text-blue-900">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-bold">{loadout.name}</span>
                                <span className="flex gap-1">
                                  {hasAnyPiece ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleRestoreLoadout(loadout)}
                                      disabled={isBusy}
                                      className="arena-redraw-button hover:animate-wiggle text-xs"
                                    >
                                      {isRestoring ? "[ restoring... ]" : "[ restore ]"}
                                    </button>
                                  ) : (
                                    <span className="text-amber-600 italic">[ empty ]</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteLoadout(loadout)}
                                    disabled={isBusy}
                                    className="arena-redraw-button hover:animate-wiggle text-xs"
                                  >
                                    {isDeleting ? "[ deleting... ]" : "[ delete ]"}
                                  </button>
                                </span>
                              </div>
                              <div className="mt-1 text-blue-600">
                                {weapon ? (
                                  <span>✦ Weapon: {MAIN_STAT_LABELS[weapon.mainStatType] || weapon.mainStatType} {weapon.mainStatValue}</span>
                                ) : (
                                  <span className="text-blue-300">✦ Weapon: —</span>
                                )}
                                {" · "}
                                {armor ? (
                                  <span>✦ Armour: {MAIN_STAT_LABELS[armor.mainStatType] || armor.mainStatType} {armor.mainStatValue}</span>
                                ) : (
                                  <span className="text-blue-300">✦ Armour: —</span>
                                )}
                                {" · "}
                                {charm ? (
                                  <span>✦ Charm: {MAIN_STAT_LABELS[charm.mainStatType] || charm.mainStatType} {charm.mainStatValue}</span>
                                ) : (
                                  <span className="text-blue-300">✦ Charm: —</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-blue-400">No loadouts saved yet. Equip gear and save it here for quick swapping.</p>
                    )}
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
                                <ArenaItemSprite item={item} className="h-16 w-16" />
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
