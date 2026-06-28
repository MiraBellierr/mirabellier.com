import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaSubNav from "@/parts/ArenaSubNav";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  type ArenaCard,
  type ArenaCardShopResponse,
  type ArenaShopItem,
  type ArenaShopResponse,
  type ArenaSubStat,
  buyArenaItem,
  buyArenaShopCard,
  craftArenaRecipe,
  fetchArenaCardShop,
  fetchArenaShop,
  fodderArenaPiece,
  useArenaConsumable as activateArenaConsumable,
} from "@/lib/arena";
import {
  ArenaItemSprite,
  describeConsumableEffect,
  describePassive,
  formatStats,
  getConsumableChargeValue,
  getEffectFieldForKind,
  normalizeArenaError,
} from "@/lib/arena-shop-ui";
import { useConfirm } from "@/states/ConfirmContext";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import PackOpeningModal from "@/parts/PackOpeningModal";

function formatCardIv(card: ArenaCard) {
  return `P ${card.iv.power} · G ${card.iv.guard} · S ${card.iv.speed} · EH ${card.iv.effectHit}`;
}

function formatOfferCountdown(endsAt: string, nowMs: number) {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((Date.parse(endsAt) - nowMs) / 1000),
  );
  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function getConsumableActiveInfo(
  item: ArenaShopItem,
  effects: Record<string, unknown> | undefined,
) {
  if (!item.consumableEffect || !effects) return null;
  const meta = getEffectFieldForKind(item.consumableEffect.kind);
  if (!meta) return null;
  const remaining = Number(effects[meta.field]) || 0;
  // For percent-based effects, also check the corresponding percent/value field
  const pctField = meta.field.replace(/FightsRemaining|WinsRemaining|Charges$/, "");
  const pctKey = pctField + (pctField.endsWith("Pct") ? "" : "Pct");
  const valueKey = pctField + "Value";
  const amount = Number(effects[pctKey] ?? effects[valueKey]) || 0;
  if (remaining > 0 && amount > 0) {
    return { active: true, remaining, amount };
  }
  // For non-percent effects (charges-only like death_save, streak_shield)
  if (remaining > 0) {
    return { active: true, remaining };
  }
  return null;
}

function CardRewardModal({
  card,
  onClose,
}: {
  card: ArenaCard;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[230000] flex items-center justify-center bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-950/70"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-reward-title"
        className="card-border w-full max-w-sm rounded-2xl p-5 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-500">
              Card obtained
            </p>
            <h2
              id="card-reward-title"
              className="mt-1 text-2xl font-bold text-blue-700 dark:text-purple-100"
            >
              {card.title}
            </h2>
          </div>
          <div className="flex justify-center">
            <ArenaPortraitCard card={card} interactive />
          </div>
          <div className="space-y-1 text-sm text-blue-700 dark:text-purple-100">
            <p className="font-black">Rarity: {card.rarity}</p>
            <p>IV {card.iv.total} · {formatCardIv(card)}</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Added to your collection.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="arena-redraw-button hover:animate-wiggle"
          >
            [ nice! ]
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function EquipmentRewardModal({
  piece,
  pieceId,
  price,
  shopItem,
  onClose,
  onFodder,
}: {
  piece: { slot: string; mainStatType: string; mainStatValue: number; subStats: ArenaSubStat[] };
  pieceId: string;
  price: number;
  shopItem: ArenaShopItem;
  onClose: () => void;
  onFodder: (pieceId: string, refundAmount: number) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const MAIN_LABELS: Record<string, string> = { power: "Power", guard: "Guard", critRate: "Crit Rate", critDmg: "Crit DMG" };
  const SUB_LABELS: Record<string, string> = {
    hp: "HP", power: "P", guard: "G", speed: "S", effectHit: "EH",
    hpPct: "HP%", dmgPct: "DMG%", defendPct: "DEF%",
    crit: "CRIT", critDmg: "CDMG",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[230000] flex items-center justify-center bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-950/70"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="equip-reward-title"
        className="card-border w-full max-w-sm rounded-2xl p-5 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-500">
              Congratulations!
            </p>
            <h2
              id="equip-reward-title"
              className="mt-1 text-2xl font-bold text-blue-700 dark:text-purple-100"
            >
              You got a {shopItem.name}!
            </h2>
          </div>
          <div className="flex justify-center">
            <ArenaItemSprite item={shopItem} className="h-14 w-14" />
          </div>
          <div className="space-y-2 text-sm text-blue-700 dark:text-purple-100">
            <p className="font-black text-lg">
              {MAIN_LABELS[piece.mainStatType] || piece.mainStatType} {piece.mainStatValue}
            </p>
            <div className="space-y-0.5 text-xs text-blue-600 dark:text-purple-200">
              {piece.subStats.map((s, i) => (
                <p key={i}>⊹ {SUB_LABELS[s.type] || s.type} +{s.value} ⊹</p>
              ))}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Added to your inventory.
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="arena-redraw-button hover:animate-wiggle"
            >
              [ nice! ]
            </button>
            {pieceId && price > 0 ? (
              <button
                type="button"
                onClick={() => onFodder(pieceId, Math.floor(price / 2))}
                className="arena-redraw-button hover:animate-wiggle"
              >
                [ fodder +{Math.floor(price / 2)} ]
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

const ArenaShop = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const { confirm } = useConfirm();
  const [shop, setShop] = useState<ArenaShopResponse | null>(null);
  const [cardShop, setCardShop] = useState<ArenaCardShopResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cardErrorMessage, setCardErrorMessage] = useState<string | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [obtainedCard, setObtainedCard] = useState<ArenaCard | null>(null);
  const [obtainedCards, setObtainedCards] = useState<ArenaCard[] | null>(null);
  const [obtainedPiece, setObtainedPiece] = useState<{ piece: { slot: string; mainStatType: string; mainStatValue: number; subStats: ArenaSubStat[] }; pieceId: string; price: number; shopItem: ArenaShopItem } | null>(null);



  usePageSeo({
    canonical: "https://mirabellier.com/arena/shop",
    structuredDataId: "arena-shop-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Shop",
      description: "Buy arena character cards, materials, gear, and consumables.",
      url: "https://mirabellier.com/arena/shop",
    },
  });

  const loadCardOffers = useCallback(async () => {
    if (!token) {
      setCardShop(null);
      setCardErrorMessage(null);
      return;
    }

    setCardsLoading(true);
    setCardErrorMessage(null);
    try {
      setCardShop(await fetchArenaCardShop(token, localStorage.getItem("debugRandomPack") === "1"));
    } catch (error) {
      setCardErrorMessage(normalizeArenaError(error));
    } finally {
      setCardsLoading(false);
    }
  }, [token]);

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

  useEffect(() => {
    void loadCardOffers();
  }, [loadCardOffers]);

  useEffect(() => {
    const endsAt = cardShop?.randomOffer?.endsAt;
    if (!endsAt) return;
    const remainingMs = Date.parse(endsAt) - Date.now();
    if (remainingMs <= 0) {
      setCardShop((previous) =>
        previous ? { ...previous, randomOffer: null } : previous,
      );
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCardShop((previous) =>
        previous ? { ...previous, randomOffer: null } : previous,
      );
    }, remainingMs);
    return () => window.clearTimeout(timeoutId);
  }, [cardShop?.randomOffer?.endsAt]);

  useEffect(() => {
    if (!cardShop?.randomOffer?.endsAt) return;
    setCountdownNow(Date.now());
    const intervalId = window.setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [cardShop?.randomOffer?.endsAt]);

  const handleBuy = async (itemId: string) => {
    if (!token || !shop) return;

    const item = shop.equipment?.find((i) => i.id === itemId)
      || shop.shop.flatMap((t) => t.items).find((i) => i.id === itemId);
    if (!item) return;

    if (item.type === "gear") {
      const confirmed = await confirm({
        title: `Buy ${item.name}?`,
        message: (
          <div className="space-y-2">
            <p>Purchase a random-rolled <strong>{item.name}</strong> for{" "}
              <strong>{item.price.toLocaleString()} coins</strong>?</p>
            <p className="text-sm text-slate-500">
              Stats are randomised on purchase.
            </p>
          </div>
        ),
        confirmLabel: "Buy",
        cancelLabel: "Cancel",
      });
      if (!confirmed) return;
    }

    setActioningId(`buy:${itemId}`);
    setErrorMessage(null);
    try {
      const payload = await buyArenaItem(token, itemId);
      setShop(payload.shop);
      setCardShop((previous) => {
        if (!previous) return previous;
        const coins = payload.shop.profile.coins;
        return {
          ...previous,
          profile: payload.shop.profile,
          dailyOffers: previous.dailyOffers.map((offer) => ({
            ...offer,
            canBuy: !offer.sold && coins >= offer.price,
          })),
          randomOffer: previous.randomOffer
            ? {
                ...previous.randomOffer,
                canBuy: coins >= previous.randomOffer.price,
              }
            : null,
        };
      });
      if (payload.rolledPiece) {
        setObtainedPiece({
          piece: payload.rolledPiece,
          pieceId: payload.rolledPieceId || "",
          price: item.price,
          shopItem: item,
        });
      }
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

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

  const handleCraft = async (recipeId: string) => {
    if (!token || !shop) return;
    setActioningId(`craft:${recipeId}`);
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

  const handleCardBuy = async (
    purchase:
      | { kind: "daily"; offerId: string }
      | { kind: "random"; forceRandomPack?: boolean },
  ) => {
    if (!token) return;
    const offerId = purchase.kind === "daily" ? purchase.offerId : "random-card";
    setActioningId(`card:${offerId}`);
    setCardErrorMessage(null);
    try {
      const payload = await buyArenaShopCard(token, purchase);
      setCardShop(payload.cardShop);
      setShop((previous) =>
        previous
          ? {
              ...previous,
              profile: payload.profile,
              shop: previous.shop.map((tier) => ({
                ...tier,
                items: tier.items.map((item) => ({
                  ...item,
                  canBuy:
                    item.canBuy &&
                    payload.profile.coins >= item.price,
                })),
              })),
              recipes: previous.recipes.map((recipe) => ({
                ...recipe,
                canCraft:
                  recipe.canCraft &&
                  payload.profile.coins >= recipe.coinCost,
              })),
            }
          : previous,
      );
      setObtainedCard(payload.card ?? null);
      if (payload.cards) setObtainedCards(payload.cards);
    } catch (error) {
      setCardErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const closeCardModal = useCallback(() => {
    setObtainedCard(null);
  }, []);

  const closePackModal = useCallback(() => {
    setObtainedCards(null);
  }, []);

  const closeEquipModal = useCallback(() => {
    setObtainedPiece(null);
  }, []);

  const handleFodderReward = useCallback(async (pieceId: string, refundAmount: number) => {
    if (!token) return;
    const confirmed = await confirm({
      title: "Fodder equipment?",
      message: `Convert this gear to ${refundAmount} coins? This cannot be undone.`,
      confirmLabel: "Fodder",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    setActioningId(`fodder:${pieceId}`);
    try {
      await fodderArenaPiece(token, pieceId, refundAmount);
      const refreshed = await fetchArenaShop(token);
      setShop(refreshed);
      setObtainedPiece(null);
    } catch (error) {
      setErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  }, [token, confirm]);

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
                <h2 className="text-4xl font-bold text-blue-900">Arena Shop {`>^. .^<`}</h2>
                <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                  <span className="text-pink-300">✿</span> Find cards, materials, and battle supplies!{" "}
                  <span className="text-pink-300">✿</span>
                </p>
              </div>

              <ArenaSubNav />

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
                  <div className="arena-draw-count-rowpt-1 pb-1 text-sm font-semibold text-blue-950 dark:text-purple-200">
                    <span className="mr-1 items-center justify-center text-md">Coins:</span>{" "}
                    <span className="font-black text-blue-600 dark:text-purple-300">{shop.profile.coins} 🪙</span>
                  </div>
                  <section
                    aria-labelledby="arena-card-shop-title"
                    className="space-y-3 py-3"
                  >
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <h3
                          id="arena-card-shop-title"
                          className="text-xl font-bold text-blue-700 dark:text-purple-100"
                        >
                          Cards
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          Five cards spawn every day.
                        </p>
                      </div>
                      {cardShop ? (
                        <p className="text-xs font-semibold text-blue-600 dark:text-purple-200">
                          Refreshes {new Date(cardShop.nextRefreshAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>

                    {cardsLoading && !cardShop ? (
                      <p className="text-sm text-blue-500">Preparing today&apos;s cards...</p>
                    ) : null}

                    {cardErrorMessage ? (
                      <div className="space-y-2">
                        <ArenaErrorNotice message={cardErrorMessage} />
                        <button
                          type="button"
                          onClick={() => void loadCardOffers()}
                          disabled={cardsLoading}
                          className="arena-redraw-button hover:animate-wiggle"
                        >
                          {cardsLoading ? "[ retrying... ]" : "[ retry cards ]"}
                        </button>
                      </div>
                    ) : null}

                    {cardShop ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {cardShop.dailyOffers.map((offer) => {
                          const isBuying =
                            actioningId === `card:${offer.offerId}`;
                          return (
                            <article
                              key={offer.offerId}
                              className="flex gap-3 rounded-xl p-3"
                            >
                              <div className="shrink-0">
                                <ArenaPortraitCard
                                  card={offer.card}
                                  size="compact"
                                  showIvLine={true}
                                  interactive
                                />
                              </div>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-blue-700 dark:text-purple-100">
                                    {offer.card.title}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleCardBuy({
                                        kind: "daily",
                                        offerId: offer.offerId,
                                      })
                                    }
                                    disabled={
                                      offer.sold ||
                                      !offer.canBuy ||
                                      isBuying
                                    }
                                    className="arena-redraw-button hover:animate-wiggle"
                                  >
                                    {offer.sold
                                      ? "[ sold ]"
                                      : isBuying
                                        ? "[ buying... ]"
                                        : "[ buy ]"}
                                  </button>
                                </div>
                                <p className="text-xs font-semibold text-blue-600 dark:text-purple-200">
                                  {offer.price.toLocaleString()} coins
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Owned: {offer.ownedCount}
                                </p>
                              </div>
                            </article>
                          );
                        })}

                        {cardShop.randomOffer ? (
                        <article className="flex min-h-36 gap-3 rounded-xl p-3">
                          <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-blue-300 bg-white/60 text-4xl font-black text-pink-500 shadow-sm dark:border-purple-400/60 dark:bg-slate-950/40">
                            ?
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-blue-700 dark:text-purple-100">
                                Random Pack
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCardBuy({
                                    kind: "random",
                                    forceRandomPack: localStorage.getItem("debugRandomPack") === "1",
                                  })
                                }
                                disabled={
                                  !cardShop.randomOffer.canBuy ||
                                  actioningId === "card:random-card"
                                }
                                className="arena-redraw-button hover:animate-wiggle"
                              >
                                {actioningId === "card:random-card"
                                  ? "[ drawing... ]"
                                  : "[ buy ]"}
                              </button>
                            </div>
                            <p className="text-xs text-slate-700 dark:text-slate-200">
                              Receive a random pack of 5 character cards.
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              Leaves in{" "}
                              {formatOfferCountdown(
                                cardShop.randomOffer.endsAt,
                                countdownNow,
                              )}{" "}
                              · duplicates possible
                            </p>
                            <p className="text-xs font-semibold text-blue-600 dark:text-purple-200">
                              {cardShop.randomOffer.price.toLocaleString()} coins
                            </p>
                          </div>
                        </article>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

                  {shop.equipment && shop.equipment.length > 0 ? (
                    <section className="space-y-2">
                      <h3 className="font-bold text-blue-700 dark:text-white">Equipment</h3>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {shop.equipment.map((item) => {
                          const isBuying = actioningId === `buy:${item.id}`;
                          return (
                            <article
                              key={item.id}
                              className="flex gap-3 rounded-xl p-3"
                            >
                              <ArenaItemSprite item={item} />
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-blue-700 dark:text-purple-100">{item.name}</p>
                                  <button
                                    type="button"
                                    onClick={() => void handleBuy(item.id)}
                                    disabled={!item.canBuy || isBuying}
                                    className="arena-redraw-button hover:animate-wiggle shrink-0"
                                  >
                                    {isBuying ? "[ buying... ]" : "[ buy ]"}
                                  </button>
                                </div>
                                <p className="text-xs text-slate-700 dark:text-slate-200">
                                  {item.mainStat?.type === "random"
                                    ? "Crit Rate or Crit DMG"
                                    : `${item.mainStat?.type} ${item.mainStat?.min}–${item.mainStat?.max}`}
                                  {" "}· 4 random sub-stats
                                </p>
                                <p className="text-xs font-semibold text-blue-600 dark:text-purple-200">
                                  {item.price.toLocaleString()} coins
                                </p>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {shop.shop.map((tierBlock) => {
                    if (tierBlock.items.length === 0) return null;

                    return (
                    <section key={tierBlock.tier} className="space-y-2">
                      <h3 className="font-bold text-blue-700 dark:text-white">{tierBlock.tier} (Lv {tierBlock.items[0]?.unlockLevel} needed)</h3>
                      <ol className="space-y-1">
                        {tierBlock.items.map((item) => {
                          const isBuying = actioningId === `buy:${item.id}`;
                          const isUsing = actioningId === `use:${item.id}`;
                          const isCrafting = item.recipeId ? actioningId === `craft:${item.recipeId}` : false;
                          const recipe = item.recipeId ? shop.recipes.find((r) => r.id === item.recipeId) : null;
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
                                        <button
                                          type="button"
                                          onClick={() => item.recipeId ? void handleCraft(item.recipeId) : null}
                                          disabled={!recipe?.canCraft || isCrafting}
                                          className="arena-redraw-button hover:animate-wiggle"
                                        >
                                          {isCrafting ? "[ crafting... ]" : "[ craft ]"}
                                        </button>
                                      ) : null}
                                      {item.type === "consumable" ? (
                                        <button
                                          type="button"
                                           onClick={() => void handleUse(item)}
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
                                  {item.acquisition === "craft" && recipe ? (
                                    <p className="text-xs text-slate-700">
                                      Craft: {recipe.coinCost.toLocaleString()} coins
                                      {recipe.inputs?.length > 0 ? ` · ${recipe.inputs.map((i) => `${i.itemName || i.itemId} x${i.required}`).join(", ")}` : ""}
                                    </p>
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
                                  {item.consumableEffect ? (() => {
                                    const activeInfo = getConsumableActiveInfo(item, shop.profile.effects as Record<string, unknown>);
                                    return activeInfo?.active ? (
                                      <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                                        Active · {activeInfo.remaining} charge{activeInfo.remaining !== 1 ? "s" : ""} left
                                      </p>
                                    ) : null;
                                  })() : null}
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
                <p>Five character cards spawn daily at midnight UTC.</p>
                <p>Daily cards can be bought once per account; random packs stay available.</p>
                <p>Buy gear and consumables here. Use the tabs to browse.</p>
                <p>Equip gear from your inventory to activate passives.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
      {obtainedCard ? (
        <CardRewardModal card={obtainedCard} onClose={closeCardModal} />
      ) : null}
      {obtainedCards ? (
        <PackOpeningModal cards={obtainedCards} onClose={closePackModal} />
      ) : null}
      {obtainedPiece ? (
        <EquipmentRewardModal
          piece={obtainedPiece.piece}
          pieceId={obtainedPiece.pieceId}
          price={obtainedPiece.price}
          shopItem={obtainedPiece.shopItem}
          onClose={closeEquipModal}
          onFodder={handleFodderReward}
        />
      ) : null}
    </div>
  );
};

export default ArenaShop;