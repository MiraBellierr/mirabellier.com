import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  type ArenaCard,
  type ArenaCardShopResponse,
  type ArenaShopResponse,
  buyArenaItem,
  buyArenaShopCard,
  fetchArenaCardShop,
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

function formatCardIv(card: ArenaCard) {
  return `P ${card.iv.power} · G ${card.iv.guard} · S ${card.iv.speed} · L ${card.iv.luck}`;
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
          <img
            src={card.imageUrl}
            alt={card.title}
            className="mx-auto h-56 w-40 rounded-xl border-2 border-sky-200 object-cover shadow-lg dark:border-purple-400/50"
          />
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

const ArenaShop = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const [shop, setShop] = useState<ArenaShopResponse | null>(null);
  const [cardShop, setCardShop] = useState<ArenaCardShopResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cardErrorMessage, setCardErrorMessage] = useState<string | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [obtainedCard, setObtainedCard] = useState<ArenaCard | null>(null);

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
      setCardShop(await fetchArenaCardShop(token));
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
    if (!token) return;
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

  const handleCardBuy = async (
    purchase:
      | { kind: "daily"; offerId: string }
      | { kind: "random" },
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
      setObtainedCard(payload.card);
    } catch (error) {
      setCardErrorMessage(normalizeArenaError(error));
    } finally {
      setActioningId(null);
    }
  };

  const closeCardModal = useCallback(() => {
    setObtainedCard(null);
  }, []);


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
                  <p className="font-semibold">Login is required to use the shop.</p>
                  <Link to="/login" className="mt-2 inline-block underline">
                    go to login
                  </Link>
                </div>
              ) : loading && !shop ? (
                <p className="text-blue-500">Loading shop...</p>
              ) : shop ? (
                <div className="space-y-4 ">
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
                          Ten shared cards refresh every day. Prices: C 50 · R 100 · SR
                          1,000 · SSR 5,000 · UR 10,000 coins.
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
                              <img
                                src={offer.card.imageUrl}
                                alt={offer.card.title}
                                className="h-28 w-20 shrink-0 rounded-lg border border-sky-200 object-cover shadow-sm dark:border-purple-400/40"
                                loading="lazy"
                              />
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
                                <p className="text-xs text-slate-700 dark:text-slate-200">
                                  Rarity: {offer.card.rarity} · IV {offer.card.iv.total}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-300">
                                  {formatCardIv(offer.card)}
                                </p>
                                <p className="text-xs font-semibold text-blue-600 dark:text-purple-200">
                                  {offer.price.toLocaleString()} coins
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
                                Random Card
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCardBuy({ kind: "random" })
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
                              Receive one random character card.
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
                <p>Ten shared character cards refresh daily at midnight UTC.</p>
                <p>Daily cards can be bought once per account; random cards stay available.</p>
                <p>Buy gear and consumables here. Use the tabs to browse.</p>
                <p>Craft recipes are in the dedicated crafting page.</p>
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
    </div>
  );
};

export default ArenaShop;