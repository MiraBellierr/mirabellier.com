import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  lockArenaPiece,
  unlockArenaPiece,
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

type SubStatKey = "hp" | "power" | "guard" | "speed" | "effectHit" | "hpPct" | "dmgPct" | "defendPct" | "critRate" | "critDmg";
type GearSort = "recent" | "mainStat-desc" | "mainStat-asc" | "enhance-desc" | "enhance-asc" | "equipped-first" | `sub-${SubStatKey}-desc` | `sub-${SubStatKey}-asc`;
type ItemSort = "name-asc" | "name-desc" | "qty-desc" | "qty-asc";

const SORTABLE_SUBSTATS: SubStatKey[] = ["hp", "power", "guard", "speed", "effectHit", "hpPct", "dmgPct", "defendPct", "critRate", "critDmg"];

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

const GEAR_SORT_LABELS: Record<GearSort, string> = {
  recent: "Recent",
  "mainStat-desc": "Main Stat ▼",
  "mainStat-asc": "Main Stat ▲",
  "enhance-desc": "Enhance ▼",
  "enhance-asc": "Enhance ▲",
  "equipped-first": "Equipped first",
  ...Object.fromEntries(
    SORTABLE_SUBSTATS.flatMap((key) => [
      [`sub-${key}-desc`, `${SUB_STAT_LABELS[key] || key} ▼`],
      [`sub-${key}-asc`, `${SUB_STAT_LABELS[key] || key} ▲`],
    ]),
  ) as Record<`sub-${SubStatKey}-desc` | `sub-${SubStatKey}-asc`, string>,
};

type PrimaryGearSort = "recent" | "mainStat-desc" | "mainStat-asc" | "enhance-desc" | "enhance-asc" | "equipped-first" | "sub-desc" | "sub-asc";

function primaryToGearSort(primary: PrimaryGearSort, subStat: SubStatKey): GearSort {
  if (primary === "sub-desc") return `sub-${subStat}-desc`;
  if (primary === "sub-asc") return `sub-${subStat}-asc`;
  return primary;
}

function gearSortToPrimary(sort: GearSort): { primary: PrimaryGearSort; subStat: SubStatKey } {
  if (sort.startsWith("sub-")) {
    const rest = sort.slice(4);
    const lastDash = rest.lastIndexOf("-");
    const key = rest.slice(0, lastDash) as SubStatKey;
    return { primary: rest.endsWith("-desc") ? "sub-desc" : "sub-asc", subStat: key };
  }
  return { primary: sort as PrimaryGearSort, subStat: "hp" };
}

const PRIMARY_GEAR_SORT_LABELS: Record<PrimaryGearSort, string> = {
  recent: "Recent",
  "mainStat-desc": "Main Stat ▼",
  "mainStat-asc": "Main Stat ▲",
  "enhance-desc": "Enhance ▼",
  "enhance-asc": "Enhance ▲",
  "equipped-first": "Equipped first",
  "sub-desc": "Sub-stat ▼",
  "sub-asc": "Sub-stat ▲",
};

const ITEM_SORT_LABELS: Record<ItemSort, string> = {
  "name-asc": "Name A–Z",
  "name-desc": "Name Z–A",
  "qty-desc": "Qty ▼",
  "qty-asc": "Qty ▲",
};

const TABS: Array<{ id: InventoryTab; label: string }> = [
  { id: "weapon", label: "Weapons" },
  { id: "armor", label: "Armour" },
  { id: "charm", label: "Charms" },
  { id: "consumable", label: "Consumables" },
  { id: "cardItem", label: "Card Items" },
];

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

function getSubStatValue(piece: ArenaEquipmentPiece, type: string): number {
  const sub = piece.subStats.find((s) => s.type === type || (type === "crit" && s.type === "critRate"));
  return sub ? sub.value : 0;
}

function sortGearPieces(pieces: ArenaEquipmentPiece[], sort: GearSort): ArenaEquipmentPiece[] {
  const sorted = [...pieces];
  if (sort.startsWith("sub-")) {
    // Pattern: sub-{type}-{dir}
    const rest = sort.slice(4); // remove "sub-"
    const lastDash = rest.lastIndexOf("-");
    const type = rest.slice(0, lastDash);
    const dir = rest.slice(lastDash + 1);
    sorted.sort((a, b) => {
      const va = getSubStatValue(a, type);
      const vb = getSubStatValue(b, type);
      return dir === "desc" ? vb - va : va - vb;
    });
    return sorted;
  }
  switch (sort) {
    case "mainStat-desc":
      sorted.sort((a, b) => (b.enhancedMainStatValue ?? b.mainStatValue) - (a.enhancedMainStatValue ?? a.mainStatValue));
      break;
    case "mainStat-asc":
      sorted.sort((a, b) => (a.enhancedMainStatValue ?? a.mainStatValue) - (b.enhancedMainStatValue ?? b.mainStatValue));
      break;
    case "enhance-desc":
      sorted.sort((a, b) => (b.enhancementLevel || 0) - (a.enhancementLevel || 0));
      break;
    case "enhance-asc":
      sorted.sort((a, b) => (a.enhancementLevel || 0) - (b.enhancementLevel || 0));
      break;
    case "equipped-first":
      sorted.sort((a, b) => (b.equipped ? 1 : 0) - (a.equipped ? 1 : 0));
      break;
    case "recent":
    default:
      sorted.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      break;
  }
  return sorted;
}

function sortItems<T extends { name: string; ownedQuantity: number }>(items: T[], sort: ItemSort): T[] {
  const sorted = [...items];
  switch (sort) {
    case "name-desc":
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "qty-desc":
      sorted.sort((a, b) => b.ownedQuantity - a.ownedQuantity);
      break;
    case "qty-asc":
      sorted.sort((a, b) => a.ownedQuantity - b.ownedQuantity);
      break;
    case "name-asc":
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }
  return sorted;
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
  const [gearSort, setGearSort] = useState<GearSort>("recent");
  const [gearSubStat, setGearSubStat] = useState<SubStatKey>("hp");
  const [itemSort, setItemSort] = useState<ItemSort>("name-asc");
  const [enhanceModal, setEnhanceModal] = useState<{
    piece: ArenaEquipmentPiece;
    fodderId: string;
  } | null>(null);
  const [fodderSort, setFodderSort] = useState<GearSort>("recent");
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
    () => {
      const filtered = flattenItems(shop)
        .filter((item) => item.ownedQuantity > 0 && item.type === "consumable");
      return sortItems(filtered, itemSort);
    },
    [shop, itemSort],
  );

  const cardItems = useMemo(
    () => {
      const filtered = (shop?.cardItems || [])
        .filter((item) => item.ownedQuantity > 0 && item.type === "card");
      return sortItems(filtered, itemSort);
    },
    [shop, itemSort],
  );

  const visiblePieces = useMemo(
    () => {
      const filtered = pieces.filter((p) => p.slot === tab);
      const sorted = sortGearPieces(filtered, gearSort);
      const start = (page - 1) * PER_PAGE;
      return { items: sorted.slice(start, start + PER_PAGE), total: sorted.length };
    },
    [pieces, tab, page, gearSort],
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
        !candidate.locked &&
        candidate.slot === piece.slot
      ));
    });
    return result;
  }, [pieces]);

  const sortedFodderForModal = useMemo(() => {
    if (!enhanceModal) return [];
    const raw = fodderOptionsByPieceId[enhanceModal.piece.id] || [];
    return sortGearPieces(raw, fodderSort);
  }, [enhanceModal, fodderOptionsByPieceId, fodderSort]);

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

  const handleToggleLock = async (piece: ArenaEquipmentPiece) => {
    if (!token) return;
    setActioningId(`lock:${piece.id}`);
    setErrorMessage(null);
    try {
      if (piece.locked) {
        await unlockArenaPiece(token, piece.id);
      } else {
        await lockArenaPiece(token, piece.id);
      }
      const refreshed = await fetchArenaShop(token);
      setShop(refreshed);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const handleEnhance = async (piece: ArenaEquipmentPiece, fodderPieceId: string) => {
    if (!token) return;
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

  const loadoutNamesByPieceId = useMemo(() => {
    const map = new Map<string, string[]>();
    loadouts.forEach((loadout) => {
      const pieceIds = [loadout.weaponPieceId, loadout.armorPieceId, loadout.charmPieceId];
      pieceIds.forEach((pieceId) => {
        if (!pieceId) return;
        const names = map.get(pieceId) || [];
        if (!names.includes(loadout.name)) {
          names.push(loadout.name);
        }
        map.set(pieceId, names);
      });
    });
    return map;
  }, [loadouts]);

  return (
    <div className="min-h-screen flex flex-col font-[sans-serif] text-blue-900">
      <Header />
      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-3 p-2 sm:gap-4 sm:p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>

          <main className="w-full space-y-2 p-1 sm:p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/60 p-3 sm:p-4">
              <div>
                <h2 className="text-3xl font-bold leading-tight text-blue-900 sm:text-4xl">
                  Inventory {`>^. .^<`}
                </h2>
                <p className="mt-2 text-sm font-black leading-relaxed text-blue-800 sm:text-base">
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
                  <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 sm:p-4">
                    <p className="mb-3 text-lg font-bold text-sky-700">✦ Equipped Gear</p>
                    <div>
                      {(["weapon", "armor", "charm"] as const).map((slot) => {
                        const piece = shop.equipped[slot];
                        return (
                          <div key={slot} className="py-2.5 first:pt-0 last:pb-0">
                            <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap sm:items-center sm:gap-3">
                              <span className="w-14 shrink-0 pt-1 text-xs font-bold uppercase tracking-wide text-sky-400 sm:pt-0">
                                {SLOT_LABELS[slot]}
                              </span>
                              {piece ? (
                                <>
                                  <ArenaItemSprite item={slotSpriteItem(piece.slot)} className="h-7 w-7 shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                      <span className="text-sm font-bold text-blue-700">
                                        {equipmentDisplayName(piece)}
                                      </span>
                                      <span className="text-xs text-slate-500">
                                        {MAIN_STAT_LABELS[piece.mainStatType]} +{mainStatValue(piece)}
                                        {(piece.enhancementLevel || 0) > 0 ? ` · +${piece.enhancementLevel}` : ""}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                                      {piece.subStats.map((s, i) => (
                                        <span
                                          key={`${slot}:${i}:${s.type}`}
                                          className="rounded border border-blue-100 bg-white/60 px-1.5 py-0.5 text-blue-700"
                                        >
                                          {statLabel(s.type)} +{s.value}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void handleUnequip(slot)}
                                    disabled={actioningId !== null}
                                    className="arena-redraw-button hover:animate-wiggle basis-full text-left text-xs sm:basis-auto sm:text-right"
                                  >
                                    {actioningId === `unequip:${slot}` ? "[ unequipping... ]" : "[ unequip ]"}
                                  </button>
                                </>
                              ) : (
                                <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm italic text-sky-300">
                                  <span>empty</span>
                                  <Link to="/arena/shop" className="text-xs text-sky-500 underline not-italic">
                                    visit shop →
                                  </Link>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-sky-200 pt-3 text-xs text-sky-600 sm:flex sm:flex-wrap sm:gap-x-5">
                      <span><span className="font-semibold">Pieces:</span> {pieces.length}</span>
                      <span><span className="font-semibold">Card items:</span> {cardItems.reduce((sum, item) => sum + item.ownedQuantity, 0)}</span>
                      <span className="col-span-2 sm:col-span-1"><span className="font-semibold">Coins:</span> {shop.profile.coins.toLocaleString()} 🪙</span>
                    </div>

                    {activeEffects.length > 0 ? (
                      <div className="mt-3 border-t border-sky-200 pt-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-500">Active Effects</p>
                        <div className="flex flex-wrap gap-2">
                          {activeEffects.map((effect) => (
                            <span
                              key={effect}
                              className="rounded-full border border-sky-300 bg-white/80 px-2.5 py-1 text-xs font-semibold text-sky-700"
                            >
                              {effect}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-white/40 p-3 sm:border-0 sm:bg-transparent sm:p-0 sm:pt-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      <p className="text-sm font-semibold text-blue-900">Loadouts:</p>
                      <input
                        type="text"
                        value={loadoutName}
                        onChange={(e) => setLoadoutName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSaveLoadout();
                        }}
                        placeholder="loadout name..."
                        className="w-full rounded border border-blue-200 bg-white/80 px-2 py-2 text-sm text-blue-800 placeholder-blue-300 outline-none focus:border-blue-400 sm:w-auto sm:py-1 sm:text-xs"
                        disabled={loadoutActionId !== null}
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveLoadout()}
                        disabled={loadoutActionId !== null}
                        className="arena-redraw-button hover:animate-wiggle text-left text-xs sm:text-center"
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
                              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                                <span className="font-bold">{loadout.name}</span>
                                <span className="flex flex-wrap gap-1">
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
                              <div className="mt-2 grid gap-1 text-blue-600 sm:block">
                                {weapon ? (
                                  <span className="block sm:inline">✦ Weapon: {equipmentDisplayName(weapon)}</span>
                                ) : (
                                  <span className="block text-blue-300 sm:inline">✦ Weapon: —</span>
                                )}
                                <span className="hidden sm:inline"> · </span>
                                {armor ? (
                                  <span className="block sm:inline">✦ Armour: {equipmentDisplayName(armor)}</span>
                                ) : (
                                  <span className="block text-blue-300 sm:inline">✦ Armour: —</span>
                                )}
                                <span className="hidden sm:inline"> · </span>
                                {charm ? (
                                  <span className="block sm:inline">✦ Charm: {equipmentDisplayName(charm)}</span>
                                ) : (
                                  <span className="block text-blue-300 sm:inline">✦ Charm: —</span>
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

                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {TABS.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleTabChange(entry.id)}
                        className="arena-redraw-button hover:animate-wiggle rounded-lg border border-blue-100 bg-white/50 px-2 text-center text-sm sm:border-0 sm:bg-transparent sm:px-0"
                      >
                        {tab === entry.id
                          ? `[ » ${entry.label} « ]`
                          : `[ ${entry.label} ]`}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center">
                    <label htmlFor="inventory-sort" className="text-slate-500 dark:text-slate-400">sort:</label>
                    {tab === "consumable" || tab === "cardItem" ? (
                      <select
                        id="inventory-sort"
                        value={itemSort}
                        onChange={(event) => { setItemSort(event.target.value as ItemSort); setPage(1); }}
                        className="w-full rounded-lg border border-blue-200 bg-white px-2 py-2 text-sm text-slate-700 dark:border-purple-700/40 dark:bg-slate-800 dark:text-purple-200 sm:w-auto sm:py-1 sm:text-xs"
                      >
                        {(Object.keys(ITEM_SORT_LABELS) as ItemSort[]).map((key) => (
                          <option key={key} value={key} className="dark:bg-slate-800 dark:text-slate-200">{ITEM_SORT_LABELS[key]}</option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <select
                          id="inventory-sort"
                          value={gearSortToPrimary(gearSort).primary}
                          onChange={(event) => {
                            const primary = event.target.value as PrimaryGearSort;
                            setGearSort(primaryToGearSort(primary, gearSubStat));
                            setPage(1);
                          }}
                          className="w-full rounded-lg border border-blue-200 bg-white px-2 py-2 text-sm text-slate-700 dark:border-purple-700/40 dark:bg-slate-800 dark:text-purple-200 sm:w-auto sm:py-1 sm:text-xs"
                        >
                          {(Object.keys(PRIMARY_GEAR_SORT_LABELS) as PrimaryGearSort[]).map((key) => (
                            <option key={key} value={key} className="dark:bg-slate-800 dark:text-slate-200">{PRIMARY_GEAR_SORT_LABELS[key]}</option>
                          ))}
                        </select>
                        {gearSort.startsWith("sub-") && (
                          <select
                            id="inventory-substat"
                            value={gearSubStat}
                            onChange={(event) => {
                              const key = event.target.value as SubStatKey;
                              setGearSubStat(key);
                              const dir = gearSort.endsWith("-desc") ? "desc" : "asc";
                              setGearSort(`sub-${key}-${dir}` as GearSort);
                              setPage(1);
                            }}
                            className="w-full rounded-lg border border-blue-200 bg-white px-2 py-2 text-sm text-slate-700 dark:border-purple-700/40 dark:bg-slate-800 dark:text-purple-200 sm:w-auto sm:py-1 sm:text-xs"
                          >
                            {SORTABLE_SUBSTATS.map((key) => (
                              <option key={key} value={key} className="dark:bg-slate-800 dark:text-slate-200">{SUB_STAT_LABELS[key] || key}</option>
                            ))}
                          </select>
                        )}
                      </>
                    )}
                  </div>

                  {tab === "consumable" ? (
                    consumables.length > 0 ? (
                      <ol className="grid gap-3 sm:grid-cols-2">
                        {consumables.map((item) => {
                          const isUsing = actioningId === `use:${item.id}`;
                          return (
                            <li key={item.id} className="rounded-xl border border-blue-100 bg-white/50 p-3 sm:border-0 sm:bg-transparent sm:py-2">
                              <article className="flex items-start gap-3">
                                <ArenaItemSprite item={item} className="h-12 w-12 shrink-0 sm:h-16 sm:w-16" />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                                    <p className="font-bold text-blue-700">{item.name}</p>
                                    <button
                                      type="button"
                                      onClick={() => void handleUse(item)}
                                      disabled={actioningId !== null}
                                      className="arena-redraw-button hover:animate-wiggle text-left sm:text-center"
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
                            <li key={item.id} className="rounded-xl border border-blue-100 bg-white/50 p-3 sm:border-0 sm:bg-transparent sm:py-2">
                              <article className="flex items-start gap-3">
                                <ArenaItemSprite item={item} className="h-12 w-12 shrink-0 sm:h-16 sm:w-16" />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                                    <p className="font-bold text-blue-700">{item.name}</p>
                                    <button
                                      type="button"
                                      onClick={() => void handleUse(item)}
                                      disabled={actioningId !== null || !selectedCardIsMaxIv || selectedCardHasItem}
                                      className="arena-redraw-button hover:animate-wiggle text-left sm:text-center"
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
                          const isFoddering = actioningId === `fodder:${piece.id}`;
                          const isEnhancing = actioningId === `enhance:${piece.id}`;
                          const isLocking = actioningId === `lock:${piece.id}`;
                          const selectedFodder = getSelectedFodderId(piece);
                          const nextEnhanceCost = enhancementCost(piece.enhancementLevel || 0);
                          return (
                            <li key={piece.id} className="rounded-xl border border-blue-100 bg-white/50 p-3 sm:border-0 sm:bg-transparent sm:py-2">
                              <article className="flex items-start gap-3">
                                <ArenaItemSprite item={slotSpriteItem(piece.slot)} className="h-10 w-10 shrink-0" />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                                    <p className="break-words font-bold leading-tight text-blue-700">
                                      {equipmentDisplayName(piece)}
                                    </p>
                                    {piece.equipped ? (
                                      <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-black uppercase text-pink-700 dark:bg-pink-400/20 dark:text-pink-200 dark:ring-1 dark:ring-inset dark:ring-pink-300/40">
                                        equipped
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => void handleEquipPiece(piece)}
                                        disabled={actioningId !== null}
                                        className="arena-redraw-button hover:animate-wiggle text-left sm:text-center"
                                      >
                                        {isEquipping ? "[ equipping... ]" : "[ equip ]"}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleLock(piece)}
                                      disabled={actioningId !== null}
                                      className="arena-redraw-button hover:animate-wiggle text-left sm:text-center"
                                      title={piece.locked ? "Unlock to allow scrapping" : "Lock to prevent accidental scrap"}
                                    >
                                      {isLocking ? "[ ... ]" : piece.locked ? "[ 🔒 ]" : "[ 🔓 ]"}
                                    </button>
                                  </div>
                                  {loadoutNamesByPieceId.has(piece.id) && (
                                    <div className="flex flex-wrap gap-1">
                                      {loadoutNamesByPieceId.get(piece.id)!.map((name) => (
                                        <span
                                          key={name}
                                          className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-400/20 dark:text-purple-200 dark:ring-1 dark:ring-inset dark:ring-purple-300/40"
                                        >
                                          {name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
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
                                        className="min-h-7 rounded border border-blue-100 bg-white/60 px-1.5 py-0.5 text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        title="Reroll this substat"
                                      >
                                        {actioningId === `reroll:${piece.id}:${index}`
                                          ? "rerolling..."
                                          : `${statLabel(s.type)} +${s.value}`}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="grid gap-1 text-xs text-slate-600 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                                    {!piece.equipped && (
                                      <button
                                        type="button"
                                        onClick={() => void handleFodder(piece)}
                                        disabled={actioningId !== null}
                                        className="arena-redraw-button hover:animate-wiggle text-left sm:text-center"
                                      >
                                        {isFoddering ? "[ scrapping... ]" : "[ scrap +500 ]"}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const options = fodderOptionsByPieceId[piece.id] || [];
                                        if (options.length === 0 || nextEnhanceCost === null) return;
                                        setEnhanceModal({ piece, fodderId: options[0].id });
                                      }}
                                      disabled={actioningId !== null || (fodderOptionsByPieceId[piece.id] || []).length === 0 || nextEnhanceCost === null}
                                      className="arena-redraw-button hover:animate-wiggle text-left sm:text-center"
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
                        <div className="grid gap-2 text-center sm:flex sm:items-center sm:justify-between">
                          <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="arena-redraw-button hover:animate-wiggle order-2 sm:order-none"
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
                            className="arena-redraw-button hover:animate-wiggle order-3 sm:order-none"
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

          <aside className="mb-auto w-full space-y-4 px-1 sm:px-0 lg:w-1/5">
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

      {enhanceModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 p-2 dark:bg-black/60 sm:items-center sm:p-4" onClick={() => setEnhanceModal(null)}>
            <div
              className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border-2 border-pink-200 bg-white/95 p-3 shadow-2xl backdrop-blur-sm dark:border-pink-700/60 dark:bg-slate-900/95 sm:max-h-[85vh] sm:rounded-2xl sm:p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3 sm:gap-4">
                <div className="min-w-0">
                  <h3 className="break-words text-base font-bold text-pink-700 dark:text-pink-400 sm:text-lg">
                    ✦ Enhance {equipmentDisplayName(enhanceModal.piece)}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {SLOT_LABELS[enhanceModal.piece.slot]} · {MAIN_STAT_LABELS[enhanceModal.piece.mainStatType]} +{mainStatValue(enhanceModal.piece)}
                    {(enhanceModal.piece.enhancementLevel || 0) > 0 ? ` · +${enhanceModal.piece.enhancementLevel}` : ""}
                    {" → "}+{mainStatValue(enhanceModal.piece) + 1}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnhanceModal(null)}
                  className="text-xl leading-none text-pink-400 hover:text-pink-600 dark:text-pink-500 dark:hover:text-pink-300 transition"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="text-sm font-semibold text-pink-600 dark:text-pink-400">
                  Select a piece to scrap as fodder:
                </p>
                <div className="flex items-center gap-2">
                  <label htmlFor="fodder-sort" className="text-xs text-slate-400 dark:text-slate-500">sort:</label>
                  <select
                    id="fodder-sort"
                    value={fodderSort}
                    onChange={(e) => setFodderSort(e.target.value as GearSort)}
                    className="min-w-0 flex-1 rounded border border-pink-200 bg-white px-2 py-2 text-sm text-slate-600 dark:border-pink-700/40 dark:bg-slate-800 dark:!text-purple-100 dark:[color-scheme:dark] sm:flex-none sm:py-0.5 sm:text-xs"
                  >
                    {(Object.keys(GEAR_SORT_LABELS) as GearSort[])
                      .filter((key) => key !== "equipped-first")
                      .map((key) => (
                        <option key={key} value={key} className="dark:bg-slate-800 dark:text-slate-200">{GEAR_SORT_LABELS[key]}</option>
                      ))}
                  </select>
                </div>
              </div>

              {sortedFodderForModal.length > 0 ? (
                <ol className="grid max-h-[48vh] grid-auto-rows-[1fr] gap-3 overflow-y-auto rounded-lg border border-pink-100 bg-pink-50/30 p-2 dark:border-pink-800/30 dark:bg-pink-950/20 sm:max-h-96 sm:grid-cols-2 sm:p-3">
                  {sortedFodderForModal.map((fodder) => {
                    const isSelected = enhanceModal.fodderId === fodder.id;
                    return (
                      <li key={fodder.id} className="h-full">
                        <button
                          type="button"
                          onClick={() => setEnhanceModal({ piece: enhanceModal.piece, fodderId: fodder.id })}
                          className={`h-full w-full rounded-xl border p-3 text-left transition ring-2 ${
                            isSelected
                              ? "border-pink-400 bg-pink-100/80 ring-pink-300/50 dark:border-pink-500/70 dark:bg-pink-900/40 dark:ring-pink-500/30"
                              : "border-slate-200 bg-white/70 ring-transparent hover:border-pink-200 hover:bg-pink-50/60 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-pink-700/50 dark:hover:bg-pink-950/30"
                          }`}
                        >
                          <article className="flex items-start gap-3">
                            <ArenaItemSprite item={slotSpriteItem(fodder.slot)} className="h-10 w-10 shrink-0" />
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="break-words text-sm font-bold leading-tight text-blue-700 dark:text-purple-200">
                                {equipmentDisplayName(fodder)}
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                {SLOT_LABELS[fodder.slot] || fodder.slot} · {MAIN_STAT_LABELS[fodder.mainStatType] || fodder.mainStatType} +{mainStatValue(fodder)}
                                {(fodder.enhancementLevel || 0) > 0 ? ` · +${fodder.enhancementLevel}` : ""}
                              </p>
                              <div className="flex flex-wrap gap-1 text-[10px] text-blue-600 dark:text-purple-300">
                                {fodder.subStats.map((s, index) => (
                                  <span
                                    key={`${fodder.id}:${index}:${s.type}`}
                                    className="rounded border border-blue-100 bg-white/60 px-1.5 py-0.5 text-blue-700 dark:border-purple-700/40 dark:bg-slate-800/80 dark:text-purple-300"
                                  >
                                    {statLabel(s.type)} +{s.value}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <span className={`shrink-0 text-lg leading-none mt-1 ${isSelected ? "text-pink-500 dark:text-pink-400" : "invisible"}`}>✓</span>
                          </article>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="rounded-xl border border-pink-100 bg-pink-50/60 p-6 text-center text-sm text-pink-400 dark:border-pink-800/30 dark:bg-pink-950/20 dark:text-pink-500/60">
                  <p>No eligible fodder pieces.</p>
                  <p className="mt-1 text-xs">You need another unequipped, unlocked {enhanceModal.piece.slot} of the same type.</p>
                </div>
              )}

              <div className="mt-5 grid gap-2 sm:flex sm:justify-end sm:gap-3">
                <button
                  type="button"
                  onClick={() => setEnhanceModal(null)}
                  className="arena-redraw-button hover:animate-wiggle text-left sm:text-center"
                >
                  [ cancel ]
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const m = enhanceModal;
                    setEnhanceModal(null);
                    await handleEnhance(m.piece, m.fodderId);
                  }}
                  disabled={sortedFodderForModal.length === 0}
                  className="arena-redraw-button hover:animate-wiggle text-left sm:text-center"
                >
                  [ enhance {enhancementCost(enhanceModal.piece.enhancementLevel || 0)?.toLocaleString()} ]
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default ArenaInventory;
