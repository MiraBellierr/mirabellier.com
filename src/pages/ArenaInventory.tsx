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
  ArenaApiError,
  enhanceArenaPiece,
  equipArenaItem,
  fetchArenaShop,
  fodderArenaPiece,
  rerollArenaSubStat,
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
  getActiveConsumableReplacementChoices,
  normalizeArenaError,
} from "@/lib/arena-shop-ui";
import { usePageSeo } from "@/lib/seo";
import { useConfirm } from "@/states/ConfirmContext";

type InventoryTab = "weapon" | "armor" | "charm" | "consumable" | "cardItem";

const TABS: Array<{ id: InventoryTab; label: string }> = [
  { id: "weapon", label: "Weapons" },
  { id: "armor", label: "Armour" },
  { id: "charm", label: "Charms" },
  { id: "consumable", label: "Consumables" },
  { id: "cardItem", label: "Card Items" },
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
  critRate: "CRIT",
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

const EQUIPMENT_SLOT_NAMES: Record<string, string> = {
  weapon: "Blade",
  armor: "Armour",
  charm: "Charm",
};

const EQUIPMENT_MAIN_NAMES: Record<string, string> = {
  power: "Force",
  guard: "Aegis",
  critRate: "Keen",
  critDmg: "Ruin",
};

const EQUIPMENT_SUB_NAMES: Record<string, string> = {
  hp: "Vitality",
  power: "Power",
  guard: "Guard",
  speed: "Speed",
  effectHit: "Focus",
  hpPct: "Fortitude",
  dmgPct: "Fury",
  defendPct: "Bulwark",
  crit: "Precision",
  critRate: "Precision",
  critDmg: "Ruin",
};

const MAX_ENHANCEMENT_LEVEL = 15;

function enhancementCost(level: number) {
  if (level >= MAX_ENHANCEMENT_LEVEL) return null;
  return Math.round(350 * (1.45 ** Math.max(0, level)));
}

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

function statLabel(type: string) {
  return SUB_STAT_LABELS[type] || MAIN_STAT_LABELS[type] || type;
}

function equipmentDisplayName(piece: { slot: string; mainStatType: string; subStats: ArenaSubStat[] }) {
  const prefix = EQUIPMENT_MAIN_NAMES[piece.mainStatType] || MAIN_STAT_LABELS[piece.mainStatType] || "Balanced";
  const base = EQUIPMENT_SLOT_NAMES[piece.slot] || SLOT_LABELS[piece.slot] || "Gear";
  const bestSub = [...piece.subStats]
    .sort((a, b) => Math.abs(Number(b.value) || 0) - Math.abs(Number(a.value) || 0))[0];
  const suffix = bestSub && bestSub.type !== piece.mainStatType
    ? ` of ${EQUIPMENT_SUB_NAMES[bestSub.type] || statLabel(bestSub.type)}`
    : "";
  return `${prefix} ${base}${suffix}`;
}

function mainStatValue(piece: { mainStatValue: number; enhancedMainStatValue?: number }) {
  return piece.enhancedMainStatValue ?? piece.mainStatValue;
}

function pieceSummary(piece: {
  mainStatType: string;
  mainStatValue: number;
  enhancedMainStatValue?: number;
  enhancementLevel?: number;
  subStats: ArenaSubStat[];
}) {
  const enhanced = Math.max(0, piece.enhancementLevel || 0);
  const main = `${MAIN_STAT_LABELS[piece.mainStatType] || piece.mainStatType} +${mainStatValue(piece)}${enhanced > 0 ? ` (+${enhanced})` : ""}`;
  const subs = piece.subStats
    .map((s) => `${statLabel(s.type)} +${s.value}`)
    .join(" · ");
  return `${main} · ${subs}`;
}

function equippedSummary(piece: { slot: string; mainStatType: string; mainStatValue: number; subStats: ArenaSubStat[] }) {
  return (
    <>
      <span className="font-bold">{equipmentDisplayName(piece)}</span>
      <span className="text-blue-700"> ({pieceSummary(piece)})</span>
    </>
  );
}

function flattenItems(shop: ArenaShopResponse | null) {
  if (!shop) return [] as ArenaShopItem[];
  return shop.shop.flatMap((tier) => tier.items);
}

function isMaxIvCard(card: ArenaShopResponse["profile"]["selectedCard"]) {
  return !!card
    && card.iv.power === 31
    && card.iv.guard === 31
    && card.iv.speed === 31
    && card.iv.effectHit === 31;
}

function hasCardItem(card: ArenaShopResponse["profile"]["selectedCard"], itemId: string) {
  return Array.isArray(card?.cardItemIds) && card.cardItemIds.includes(itemId);
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
  const [selectedFodderId, setSelectedFodderId] = useState<Record<string, string>>({});
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

  const cardItems = useMemo(
    () =>
      (shop?.cardItems || [])
        .filter((item) => item.ownedQuantity > 0 && item.type === "card")
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

  const fodderOptionsByPieceId = useMemo(() => {
    const result: Record<string, ArenaEquipmentPiece[]> = {};
    pieces.forEach((piece) => {
      result[piece.id] = pieces.filter((candidate) => (
        candidate.id !== piece.id &&
        !candidate.equipped &&
        candidate.slot === piece.slot
      ));
    });
    return result;
  }, [pieces]);

  const getSelectedFodderId = (piece: ArenaEquipmentPiece) => {
    const options = fodderOptionsByPieceId[piece.id] || [];
    const selected = selectedFodderId[piece.id];
    if (selected && options.some((option) => option.id === selected)) return selected;
    return options[0]?.id || "";
  };

  const handleUse = async (item: ArenaShopItem) => {
    if (!token || !shop) return;

    const tryUse = async (force: boolean, replaceItemId?: string | null) => {
      const payload = await activateArenaConsumable(token, item.id, { force, replaceItemId });
      setShop(payload.shop);
    };

    setActioningId(`use:${item.id}`);
    setErrorMessage(null);
    try {
      await tryUse(false);
    } catch (error) {
      // When the active consumable cap is reached, show a confirmation modal.
      if (error instanceof ArenaApiError && error.code === "ARENA_CONSUMABLE_CAP_REACHED") {
        setActioningId(null);
        const currentCount = (error.details.activeCount as number) ?? 6;
        const max = (error.details.maxActive as number) ?? 6;
        const replacementChoices = getActiveConsumableReplacementChoices(error.details);
        let selectedReplaceItemId = replacementChoices[0]?.itemId || null;
        const confirmed = await confirm({
          title: "Active Effect Cap Reached",
          message: (
            <div className="space-y-3 text-left">
              <p>
                You can only have <strong>{max}</strong> active consumable effects at once.
                You currently have <strong>{currentCount}</strong>.
              </p>
              <p>
                Choose which active effect <strong>{item.name}</strong> should replace.
              </p>
              {replacementChoices.length > 0 ? (
                <label className="block text-sm font-semibold text-blue-900 dark:text-blue-100">
                  Replace
                  <select
                    className="mt-1 block w-full rounded border border-blue-200 bg-white px-2 py-1 text-blue-900"
                    defaultValue={selectedReplaceItemId || undefined}
                    onChange={(event) => {
                      selectedReplaceItemId = event.target.value || null;
                    }}
                  >
                    {replacementChoices.map((choice) => (
                      <option key={`${choice.itemId}:${choice.kind || ""}`} value={choice.itemId}>
                        {choice.itemName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <p className="text-sm text-amber-600 dark:text-amber-400">
                This cannot be undone. Are you sure?
              </p>
            </div>
          ),
          confirmLabel: "Replace & use",
          cancelLabel: "Cancel",
        });
        if (!confirmed) return;
        setActioningId(`use:${item.id}`);
        setErrorMessage(null);
        try {
          await tryUse(true, selectedReplaceItemId);
        } catch (retryError) {
          setErrorMessage(normalizeArenaError(retryError));
        }
        return;
      }
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
      title: "Scrap equipment?",
      message: `Scrap this ${piece.slot} for 500 coins? This cannot be undone.`,
      confirmLabel: "Scrap",
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

  const handleEnhance = async (piece: ArenaEquipmentPiece) => {
    if (!token) return;
    const fodderPieceId = getSelectedFodderId(piece);
    const cost = enhancementCost(piece.enhancementLevel || 0);
    if (!fodderPieceId || cost === null) return;
    const confirmed = await confirm({
      title: `Enhance ${SLOT_LABELS[piece.slot] || piece.slot}?`,
      message: `Spend ${cost.toLocaleString()} coins and scrap the selected gear for +1 ${MAIN_STAT_LABELS[piece.mainStatType] || piece.mainStatType}?`,
      confirmLabel: "Enhance",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    setActioningId(`enhance:${piece.id}`);
    setErrorMessage(null);
    try {
      const payload = await enhanceArenaPiece(token, piece.id, fodderPieceId);
      setShop(payload.shop);
      setSelectedFodderId((current) => {
        const next = { ...current };
        delete next[piece.id];
        return next;
      });
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const handleRerollSubStat = async (piece: ArenaEquipmentPiece, subStatIndex: number) => {
    if (!token) return;
    const subStat = piece.subStats[subStatIndex];
    const fodderOptions = fodderOptionsByPieceId[piece.id] || [];
    let fodderPieceId = getSelectedFodderId(piece);
    if (!subStat || fodderOptions.length === 0 || !fodderPieceId) return;
    const confirmed = await confirm({
      title: `Reroll ${statLabel(subStat.type)}?`,
      message: (
        <div className="space-y-3 text-left">
          <p>
            <strong>{equipmentDisplayName(piece)}</strong>
          </p>
          <p>
            Reroll <strong>{statLabel(subStat.type)} +{subStat.value}</strong> for{" "}
            <strong>500 coins</strong>.
          </p>
          <label className="block text-sm font-semibold text-blue-900 dark:text-blue-100">
            Scrap gear
            <select
              className="mt-1 block w-full rounded border border-blue-200 bg-white px-2 py-1 text-blue-900"
              defaultValue={fodderPieceId}
              onChange={(event) => {
                fodderPieceId = event.target.value;
              }}
            >
              {fodderOptions.map((fodder) => (
                <option key={fodder.id} value={fodder.id}>
                  {equipmentDisplayName(fodder)} ({MAIN_STAT_LABELS[fodder.mainStatType] || fodder.mainStatType} +{mainStatValue(fodder)})
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            The selected scrap gear will be destroyed. This cannot be undone.
          </p>
        </div>
      ),
      confirmLabel: "Reroll",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    setActioningId(`reroll:${piece.id}:${subStatIndex}`);
    setErrorMessage(null);
    try {
      const payload = await rerollArenaSubStat(token, piece.id, subStatIndex, fodderPieceId);
      setShop(payload.shop);
      setSelectedFodderId((current) => {
        const next = { ...current };
        delete next[piece.id];
        return next;
      });
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
                          ? equippedSummary(shop.equipped.weapon)
                          : "none"}{" "}
                          {shop.equipped.weapon ? (
                            <button type="button" onClick={() => void handleUnequip("weapon")} disabled={actioningId !== null} className="arena-redraw-button hover:animate-wiggle text-xs">[ unequip ]</button>
                          ) : null}
                        </p>
                        <p>✦ Armour: {shop.equipped.armor
                          ? equippedSummary(shop.equipped.armor)
                          : "none"}{" "}
                          {shop.equipped.armor ? (
                            <button type="button" onClick={() => void handleUnequip("armor")} disabled={actioningId !== null} className="arena-redraw-button hover:animate-wiggle text-xs">[ unequip ]</button>
                          ) : null}
                        </p>
                        <p>✦ Charm: {shop.equipped.charm
                          ? equippedSummary(shop.equipped.charm)
                          : "none"}{" "}
                          {shop.equipped.charm ? (
                            <button type="button" onClick={() => void handleUnequip("charm")} disabled={actioningId !== null} className="arena-redraw-button hover:animate-wiggle text-xs">[ unequip ]</button>
                          ) : null}
                        </p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold underline">Bag Summary</p>
                        <p>✦ Equipment pieces: {pieces.length}</p>
                        <p>✦ Card items: {cardItems.reduce((sum, item) => sum + item.ownedQuantity, 0)}</p>
                        <p>✦ Coins: {shop.profile.coins.toLocaleString()} 🪙</p>
                      </div>
                    </div>
                    {activeEffects.length > 0 ? (
                      <div className="mt-3 border-t border-sky-200 pt-2">
                        <p className="font-semibold underline">Active Effects</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {activeEffects.map((effect) => (
                            <span
                              key={effect}
                              className="rounded border border-sky-200 bg-white/70 px-2 py-1 text-xs font-semibold text-blue-800"
                            >
                              {effect}
                            </span>
                          ))}
                        </div>
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
                                  <span>✦ Weapon: {equipmentDisplayName(weapon)}</span>
                                ) : (
                                  <span className="text-blue-300">✦ Weapon: —</span>
                                )}
                                {" · "}
                                {armor ? (
                                  <span>✦ Armour: {equipmentDisplayName(armor)}</span>
                                ) : (
                                  <span className="text-blue-300">✦ Armour: —</span>
                                )}
                                {" · "}
                                {charm ? (
                                  <span>✦ Charm: {equipmentDisplayName(charm)}</span>
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
                                    Owned: {item.ownedQuantity}
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
                  ) : tab === "cardItem" ? (
                    cardItems.length > 0 ? (
                      <ol className="grid gap-3 sm:grid-cols-2">
                        {cardItems.map((item) => {
                          const isUsing = actioningId === `use:${item.id}`;
                          const selectedCardIsMaxIv = isMaxIvCard(shop.profile.selectedCard);
                          const selectedCardHasItem = hasCardItem(shop.profile.selectedCard, item.id);
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
                                      disabled={actioningId !== null || !selectedCardIsMaxIv || selectedCardHasItem}
                                      className="arena-redraw-button hover:animate-wiggle"
                                    >
                                      {isUsing ? "[ using... ]" : "[ use ]"}
                                    </button>
                                  </div>
                                  <p className="text-xs text-slate-600">
                                    Owned: {item.ownedQuantity}
                                  </p>
                                  {item.consumableEffect ? (
                                    <p className="text-xs text-blue-600">
                                      {describeConsumableEffect(item.consumableEffect)}
                                    </p>
                                  ) : null}
                                  <p className="text-xs text-slate-600">
                                    Requires selected card with P/G/S/EH IV all at 31. One use per card.
                                    {selectedCardHasItem ? " Already used on selected card." : ""}
                                  </p>
                                </div>
                              </article>
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <p className="text-sm text-slate-500">No card items.</p>
                    )
                  ) : (
                    visiblePieces.items.length > 0 ? (
                      <div className="space-y-3">
                        <ol className="grid gap-3 sm:grid-cols-2">
                          {visiblePieces.items.map((piece) => {
                          const isEquipping = actioningId === `equip:${piece.id}`;
                          const isEnhancing = actioningId === `enhance:${piece.id}`;
                          const fodderOptions = fodderOptionsByPieceId[piece.id] || [];
                          const selectedFodder = getSelectedFodderId(piece);
                          const nextEnhanceCost = enhancementCost(piece.enhancementLevel || 0);
                          return (
                            <li key={piece.id} className="py-2">
                              <article className="flex items-start gap-3">
                                <ArenaItemSprite item={slotSpriteItem(piece.slot)} className="h-10 w-10" />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-bold text-blue-700">
                                      {equipmentDisplayName(piece)}
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
                                          [ scrap +500 ]
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-600">
                                    {SLOT_LABELS[piece.slot] || piece.slot} · {MAIN_STAT_LABELS[piece.mainStatType] || piece.mainStatType} +{mainStatValue(piece)}
                                    {(piece.enhancementLevel || 0) > 0 ? ` · +${piece.enhancementLevel}` : ""}
                                  </p>
                                  <div className="flex flex-wrap gap-1 text-xs text-blue-600">
                                    {piece.subStats.map((s, index) => (
                                      <button
                                        key={`${piece.id}:${index}:${s.type}`}
                                        type="button"
                                        onClick={() => void handleRerollSubStat(piece, index)}
                                        disabled={actioningId !== null || !selectedFodder}
                                        className="rounded border border-blue-100 bg-white/60 px-1.5 py-0.5 text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        title="Reroll this substat"
                                      >
                                        {actioningId === `reroll:${piece.id}:${index}`
                                          ? "rerolling..."
                                          : `${statLabel(s.type)} +${s.value}`}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                    <label className="flex items-center gap-1">
                                      Scrap
                                      <select
                                        value={selectedFodder}
                                        onChange={(event) => {
                                          setSelectedFodderId((current) => ({
                                            ...current,
                                            [piece.id]: event.target.value,
                                          }));
                                        }}
                                        disabled={actioningId !== null || fodderOptions.length === 0}
                                        className="rounded border border-blue-100 bg-white/80 px-1 py-0.5 text-blue-800"
                                      >
                                        {fodderOptions.length === 0 ? (
                                          <option value="">none</option>
                                        ) : fodderOptions.map((fodder) => (
                                          <option key={fodder.id} value={fodder.id}>
                                            {equipmentDisplayName(fodder)} +{mainStatValue(fodder)}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => void handleEnhance(piece)}
                                      disabled={actioningId !== null || !selectedFodder || nextEnhanceCost === null}
                                      className="arena-redraw-button hover:animate-wiggle"
                                    >
                                      {isEnhancing
                                        ? "[ enhancing... ]"
                                        : nextEnhanceCost === null
                                          ? "[ max +15 ]"
                                          : `[ enhance ${nextEnhanceCost} ]`}
                                    </button>
                                  </div>
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
