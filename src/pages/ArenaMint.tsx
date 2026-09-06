import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaSubNav from "@/parts/ArenaSubNav";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  ELEMENTS,
  RARITY_ORDER,
  normalizeArenaError,
  type ArenaCard,
  type ArenaMintDuplicateGroup,
  fetchMintDuplicates,
  mintRainbowCard,
} from "@/lib/arena";


type Step = "pick" | "preview";
type MintSort =
  | "recent"
  | "rarity-desc"
  | "rarity-asc"
  | "iv-desc"
  | "iv-asc"
  | "power-desc"
  | "guard-desc"
  | "speed-desc"
  | "effectHit-desc"
  | "name-asc";

// "" is the "All elements" filter option.
const ELEMENT_FILTER_OPTIONS = ["", ...ELEMENTS] as const;
const rarityRank = (rarity: string | null | undefined) =>
  Math.max(0, RARITY_ORDER.indexOf((rarity || "C") as (typeof RARITY_ORDER)[number]));

function compareMintCards(a: ArenaCard, b: ArenaCard, sort: MintSort) {
  const recent = (b.drawnAt || "").localeCompare(a.drawnAt || "");
  switch (sort) {
    case "rarity-desc":
      return rarityRank(b.rarity) - rarityRank(a.rarity) || recent;
    case "rarity-asc":
      return rarityRank(a.rarity) - rarityRank(b.rarity) || recent;
    case "iv-desc":
      return (b.iv?.total || 0) - (a.iv?.total || 0) || recent;
    case "iv-asc":
      return (a.iv?.total || 0) - (b.iv?.total || 0) || recent;
    case "power-desc":
      return (b.iv?.power || 0) - (a.iv?.power || 0) || recent;
    case "guard-desc":
      return (b.iv?.guard || 0) - (a.iv?.guard || 0) || recent;
    case "speed-desc":
      return (b.iv?.speed || 0) - (a.iv?.speed || 0) || recent;
    case "effectHit-desc":
      return (b.iv?.effectHit || 0) - (a.iv?.effectHit || 0) || recent;
    case "name-asc":
      return a.title.localeCompare(b.title) || recent;
    case "recent":
    default:
      return recent;
  }
}

function MobileSwapGhost({ slot, pos, card }: { slot: 0 | 1 | null; pos: { clientX: number; clientY: number } | null; card: ArenaCard | null }) {
  if (slot === null || !pos || !card) return null;
  return createPortal(
    <div
      className="fixed pointer-events-none z-[230002] opacity-90"
      style={{
        left: pos.clientX,
        top: pos.clientY,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="w-24 overflow-hidden rounded-lg border-2 border-amber-400 shadow-2xl bg-slate-200">
        <img src={card.imageUrl || ""} alt="" className="w-full object-cover" draggable={false} />
      </div>
      <span className="block text-center text-[0.6rem] font-black text-amber-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] mt-1">
        {slot === 0 ? "Left base" : "Right material"}
      </span>
    </div>,
    document.body,
  );
}

const ArenaMint = () => {
  usePageSeo({
    canonical: "https://mirabellier.com/arena/mint",
    structuredDataId: "arena-mint-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Card Mint",
      description: "Combine duplicate cards to forge rainbow variants.",
      url: "https://mirabellier.com/arena/mint",
    },
  });

  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mintGroups, setMintGroups] = useState<ArenaMintDuplicateGroup[]>([]);
  const [step, setStep] = useState<Step>("pick");
  const [picked, setPicked] = useState<string[]>([]);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintedCard, setMintedCard] = useState<ArenaCard | null>(null);
  const [actioning, setActioning] = useState(false);
  const [draggedSlot, setDraggedSlot] = useState<0 | 1 | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MintSort>("recent");
  const [rarityFilter, setRarityFilter] = useState("");
  const [elementFilter, setElementFilter] = useState("");

  // Virtual scroll (ref only — virtualizer is created after mintable below)
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mobile touch drag
  const [mobileDragSlot, setMobileDragSlot] = useState<0 | 1 | null>(null);
  const [mobileDragPos, setMobileDragPos] = useState<{ clientX: number; clientY: number } | null>(null);
  const mobileDragRef = useRef<{ slot: 0 | 1; startX: number; startY: number } | null>(null);
  const slot0Ref = useRef<HTMLDivElement | null>(null);
  const slot1Ref = useRef<HTMLDivElement | null>(null);

  const handleMobileTouchStart = useCallback((slot: 0 | 1, e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    mobileDragRef.current = { slot, startX: touch.clientX, startY: touch.clientY };
    setMobileDragSlot(slot);
    setMobileDragPos({ clientX: touch.clientX, clientY: touch.clientY });
  }, []);

  // Non-passive touchmove/touchend listeners to prevent scroll during drag
  useEffect(() => {
    if (mobileDragSlot === null) return;

    const onMove = (e: TouchEvent) => {
      e.preventDefault(); // block scroll
      const touch = e.touches[0];
      if (!touch) return;
      setMobileDragPos({ clientX: touch.clientX, clientY: touch.clientY });
    };

    const onEnd = (e: TouchEvent) => {
      const drag = mobileDragRef.current;
      mobileDragRef.current = null;
      setMobileDragSlot(null);
      setMobileDragPos(null);
      if (!drag) return;
      const touch = e.changedTouches[0];
      const point = touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
      if (!point) return;
      const targetEl = document.elementFromPoint(point.clientX, point.clientY);
      const otherSlot = drag.slot === 0 ? 1 : 0;
      const otherRef = otherSlot === 0 ? slot0Ref : slot1Ref;
      if (otherRef.current && targetEl && otherRef.current.contains(targetEl)) {
        swapPickedSlots();
      }
    };

    const onCancel = () => {
      mobileDragRef.current = null;
      setMobileDragSlot(null);
      setMobileDragPos(null);
    };

    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onCancel);
    return () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [mobileDragSlot]);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setMintGroups([]);
      return () => { cancelled = true; };
    }

    const loadDuplicates = async () => {
      setLoading(true);
      setError(null);
      try {
        const groups = await fetchMintDuplicates(token);
        if (cancelled) return;
        setMintGroups(groups);
        setPicked([]);
        setStep("pick");
        setMintedCard(null);
        setMintError(null);
      } catch (err) {
        if (cancelled) return;
        setError(normalizeArenaError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadDuplicates();
    return () => { cancelled = true; };
  }, [token]);

  const mintable = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return mintGroups
      .map(({ malId, cards, total }) => {
        const filtered = cards
          .filter((card) => {
            const matchesQuery =
              !normalizedQuery ||
              card.title.toLowerCase().includes(normalizedQuery) ||
              card.rarity.toLowerCase().includes(normalizedQuery) ||
              String(card.malId).includes(normalizedQuery);
            const matchesRarity = !rarityFilter || card.rarity === rarityFilter;
            const matchesElement = !elementFilter || card.element === elementFilter;
            return matchesQuery && matchesRarity && matchesElement;
          })
          .sort((a, b) => compareMintCards(a, b, sort));

        return {
          malId,
          cards: filtered.slice(0, 12),
          total,
          visibleTotal: filtered.length,
        };
      })
      .filter((group) => group.cards.length > 0)
      .sort((a, b) => {
        const cardA = a.cards[0];
        const cardB = b.cards[0];
        if (!cardA || !cardB) return b.visibleTotal - a.visibleTotal;
        return compareMintCards(cardA, cardB, sort) || b.visibleTotal - a.visibleTotal;
      });
  }, [mintGroups, query, rarityFilter, elementFilter, sort]);

  // Virtual scroll — must follow mintable so .length is usable
  const virtualizer = useVirtualizer({
    count: mintable.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 350,
    overscan: 3,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const visibleMintCardIds = useMemo(
    () => new Set(mintable.flatMap((group) =>
      group.cards
        .map((card) => card.cardInstanceId)
        .filter((id): id is string => !!id),
    )),
    [mintable],
  );

  useEffect(() => {
    setPicked((prev) => prev.filter((id) => visibleMintCardIds.has(id)));
  }, [visibleMintCardIds]);

  const togglePick = (instanceId: string) => {
    setPicked((prev) => {
      if (prev.includes(instanceId)) {
        return prev.filter((id) => id !== instanceId);
      }
      if (prev.length >= 2) return prev;
      return [...prev, instanceId];
    });
  };

  const clearFilters = () => {
    setQuery("");
    setRarityFilter("");
    setElementFilter("");
  };

  const pickedCards = useMemo(() => {
    const allCards = mintGroups.flatMap((g) => g.cards);
    return picked
      .map((id) => allCards.find((c) => c.cardInstanceId === id))
      .filter((c): c is ArenaCard => !!c);
  }, [mintGroups, picked]);

  const swapPickedSlots = () => {
    setPicked((prev) => (prev.length === 2 ? [prev[1], prev[0]] : prev));
  };

  const previewCard = useMemo((): ArenaCard | null => {
    if (pickedCards.length !== 2) return null;
    const [a, b] = pickedCards;
    const CARD_IV_MAX = 31;
    const iv = {
      power: a.iv.power,
      guard: a.iv.guard,
      speed: a.iv.speed,
      effectHit: a.iv.effectHit,
    };
    // Deterministic +5 bonus simulation from card IDs
    const idA = a.cardInstanceId || "";
    const idB = b.cardInstanceId || "";
    let seed = 0;
    for (let i = 0; i < (idA + idB).length; i++) {
      seed = ((seed << 5) - seed + (idA + idB).charCodeAt(i)) | 0;
    }
    const stats = ["power", "guard", "speed", "effectHit"] as const;
    for (let i = 0; i < 5; i++) {
      const eligible = stats.filter((s) => iv[s] < CARD_IV_MAX);
      if (!eligible.length) break;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      iv[eligible[seed % eligible.length]]++;
    }
    return {
      ...a,
      iv: { ...iv, total: iv.power + iv.guard + iv.speed + iv.effectHit },
      rainbow: true,
      title: a.title.replace(/\s*\(rainbow\)\s*$/, "") + " (rainbow)",
    };
  }, [pickedCards]);

  const mobileGhostCard = useMemo(() => {
    if (mobileDragSlot === null || pickedCards.length < 2) return null;
    return pickedCards[mobileDragSlot];
  }, [mobileDragSlot, pickedCards]);

  const handleMint = async () => {
    if (!token || pickedCards.length !== 2) return;
    setMintError(null);
    setActioning(true);
    try {
      const [a, b] = pickedCards;
      if (!a.cardInstanceId || !b.cardInstanceId) return;
      const res = await mintRainbowCard(token, a.cardInstanceId, b.cardInstanceId);
      setMintedCard(res.card);
      setStep("pick");
      setPicked([]);
      const updated = await fetchMintDuplicates(token);
      setMintGroups(updated);
    } catch (err) {
      setMintError(normalizeArenaError(err));
    } finally {
      setActioning(false);
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
          <main className="w-full space-y-2 p-2 sm:p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/60 p-3 sm:p-4">
              <div className="text-center sm:text-left">
                <h2 className="text-3xl font-bold text-blue-900 sm:text-4xl">Card Minting Forge {`>^. .^<`}</h2>
                <p className="mt-1 text-sm text-blue-600">
                  <span className="text-pink-300">✿</span> Combine two identical cards to forge a rainbow variant!{" "}
                  <span className="text-pink-300">✿</span>
                </p>
              </div>

              <ArenaSubNav />

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
                  <p className="font-semibold">Login is required to mint cards.</p>
                  <Link to="/login" className="mt-2 inline-block underline">
                    go to login
                  </Link>
                </div>
              ) : loading ? (
                <p className="text-blue-500">Loading collection...</p>
              ) : (
                <>
                  {error ? <ArenaErrorNotice message={error} /> : null}
                  {mintError ? <ArenaErrorNotice message={mintError} /> : null}

                  {mintedCard ? (
                    <div className="space-y-3">
                      <h3 className="text-lg font-black text-blue-900">Minted!</h3>
                      <div className="flex justify-center">
                        <ArenaPortraitCard card={mintedCard} level={1} interactive />
                      </div>
                      <div className="text-center">
                        <button
                          className="arena-redraw-button"
                          onClick={() => setMintedCard(null)}
                        >
                          [ Mint Another ]
                        </button>
                      </div>
                    </div>
                  ) : !mintGroups.length ? (
                    <div className="rounded-xl border border-dashed border-blue-200 bg-white/60 p-6 text-center">
                      <p className="text-2xl text-pink-300">✿</p>
                      <p className="mt-1 text-sm text-blue-600">No duplicate cards found yet.</p>
                      <p className="text-xs text-blue-400">Draw more cards daily to collect duplicates for minting!</p>
                      <Link
                        to="/arena"
                        className="arena-redraw-button mt-2 inline-block text-sm"
                      >
                        [ Draw more cards ]
                      </Link>
                    </div>
                  ) : step === "preview" && previewCard ? (
                    <div className="space-y-4">
                      <h3 className="text-lg font-black text-blue-900">Preview Rainbow Card</h3>
                      <div className="grid grid-cols-1 items-center justify-items-center gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
                        <div
                          ref={slot0Ref}
                          className={`flex flex-col items-center gap-1 rounded-xl p-1 transition ${draggedSlot === 1 || mobileDragSlot === 1 ? "ring-2 ring-amber-300" : ""}`}
                          draggable
                          onClick={swapPickedSlots}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            setDraggedSlot(0);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (draggedSlot === 1) swapPickedSlots();
                            setDraggedSlot(null);
                          }}
                          onDragEnd={() => setDraggedSlot(null)}
                          onTouchStart={(e) => handleMobileTouchStart(0, e)}
                          title="Tap or drag to swap mint base"
                        >
                          <span className="mint-chip rounded-full bg-blue-100 px-2 py-0.5 text-[0.65rem] font-bold text-blue-700">Left base</span>
                          <ArenaPortraitCard card={pickedCards[0]} level={1} interactive />
                          <span className="text-xs text-blue-600">
                            IV {pickedCards[0].iv.total}
                          </span>
                        </div>
                        <span className="text-2xl font-bold text-blue-400">+</span>
                        <div
                          ref={slot1Ref}
                          className={`flex flex-col items-center gap-1 rounded-xl p-1 transition ${draggedSlot === 0 || mobileDragSlot === 0 ? "ring-2 ring-amber-300" : ""}`}
                          draggable
                          onClick={swapPickedSlots}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            setDraggedSlot(1);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (draggedSlot === 0) swapPickedSlots();
                            setDraggedSlot(null);
                          }}
                          onDragEnd={() => setDraggedSlot(null)}
                          onTouchStart={(e) => handleMobileTouchStart(1, e)}
                          title="Tap or drag to swap mint base"
                        >
                          <span className="mint-chip rounded-full bg-blue-100 px-2 py-0.5 text-[0.65rem] font-bold text-blue-700">Right material</span>
                          <ArenaPortraitCard card={pickedCards[1]} level={1} interactive />
                          <span className="text-xs text-blue-600">
                            IV {pickedCards[1].iv.total}
                          </span>
                        </div>
                        <span className="text-2xl font-bold text-blue-400">=</span>
                        <div className="flex flex-col items-center gap-1">
                          <span className="mint-chip mint-chip--green rounded-full bg-green-100 px-2 py-0.5 text-[0.65rem] font-bold text-green-700">Result</span>
                          <ArenaPortraitCard card={previewCard} level={1} interactive showIvLine />
                          <span className="text-xs font-semibold text-amber-600">+5 random IV bonus</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-3">
                        <button
                          className="arena-redraw-button"
                          onClick={() => { setStep("pick"); setPicked([]); }}
                        >
                          [ Back ]
                        </button>
                        <button
                          className="arena-redraw-button"
                          onClick={handleMint}
                          disabled={actioning}
                        >
                          {actioning ? "[ Minting... ]" : "[ Confirm Mint ]"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-blue-200 bg-white/70 p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor="mint-sort" className="text-xs font-semibold text-slate-500">
                            sort:
                          </label>
                          <select
                            id="mint-sort"
                            value={sort}
                            onChange={(event) => setSort(event.target.value as MintSort)}
                            className="h-8 rounded-lg border border-blue-200 bg-white px-2 text-xs text-slate-700"
                          >
                            <option value="recent">Recent</option>
                            <option value="rarity-desc">Rarity ▼</option>
                            <option value="rarity-asc">Rarity ▲</option>
                            <option value="iv-desc">IV ▼</option>
                            <option value="iv-asc">IV ▲</option>
                            <option value="power-desc">Power ▼</option>
                            <option value="guard-desc">Guard ▼</option>
                            <option value="speed-desc">Speed ▼</option>
                            <option value="effectHit-desc">Effect Hit ▼</option>
                            <option value="name-asc">Name A-Z</option>
                          </select>
                          <label htmlFor="mint-rarity" className="text-xs font-semibold text-slate-500">
                            rarity:
                          </label>
                          <select
                            id="mint-rarity"
                            value={rarityFilter}
                            onChange={(event) => setRarityFilter(event.target.value)}
                            className="h-8 rounded-lg border border-blue-200 bg-white px-2 text-xs text-slate-700"
                          >
                            <option value="">All rarity</option>
                            {RARITY_ORDER.map((rarity) => (
                              <option key={rarity} value={rarity}>{rarity}</option>
                            ))}
                          </select>
                          <label htmlFor="mint-element" className="text-xs font-semibold text-slate-500">
                            element:
                          </label>
                          <select
                            id="mint-element"
                            value={elementFilter}
                            onChange={(event) => setElementFilter(event.target.value)}
                            className="h-8 rounded-lg border border-blue-200 bg-white px-2 text-xs text-slate-700"
                          >
                            {ELEMENT_FILTER_OPTIONS.map((element) => (
                              <option key={element || "all"} value={element}>
                                {element || "All elements"}
                              </option>
                            ))}
                          </select>
                          <input
                            id="mint-search"
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="search by name..."
                            className="h-8 min-w-40 flex-1 rounded-lg border border-blue-200 bg-white px-3 text-sm text-slate-700"
                          />
                          {query || rarityFilter || elementFilter ? (
                            <button
                              type="button"
                              onClick={clearFilters}
                              className="arena-redraw-button text-xs"
                            >
                              [ clear filters ]
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-sm text-blue-600">
                        Mintable groups: <span className="font-bold">{mintable.length}</span>
                      </p>
                      <div
                        ref={scrollRef}
                        className="max-h-[55vh] overflow-y-auto pb-2 pr-1 [scrollbar-gutter:stable]"
                      >
                        {mintable.length > 0 ? (
                          <div
                            style={{
                              height: `${virtualizer.getTotalSize()}px`,
                              width: "100%",
                              position: "relative",
                            }}
                          >
                            {virtualizer.getVirtualItems().map((virtualRow) => {
                              const group = mintable[virtualRow.index];
                              if (!group) return null;
                              const { malId, cards, total, visibleTotal } = group;
                              const characterTitle = cards[0]?.title;
                              if (!characterTitle) return null;

                              return (
                                <div
                                  key={malId}
                                  data-index={virtualRow.index}
                                  ref={virtualizer.measureElement}
                                  className="space-y-2"
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    transform: `translateY(${virtualRow.start}px)`,
                                  }}
                                >
                                  <h3 className="flex flex-wrap items-center gap-2 border-b border-blue-200/70 pb-1.5 text-sm font-extrabold text-blue-900">
                                    <span>{characterTitle}</span>
                                    <span className="mint-chip rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600">
                                      {visibleTotal === total ? `${total} copies` : `${visibleTotal}/${total} copies`}
                                    </span>
                                  </h3>
                                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                                    {cards.map((card) => {
                                      const cid = card.cardInstanceId;
                                      if (!cid) return null;
                                      const isPicked = picked.includes(cid);
                                      const cannotPick = !isPicked && picked.length >= 2;

                                      return (
                                        <div
                                          key={cid}
                                          className={`flex flex-col items-center space-y-1 transition-all ${
                                            cannotPick && !isPicked
                                              ? "opacity-40"
                                              : "hover:-translate-y-0.5"
                                          }`}
                                        >
                                          <div className={isPicked ? "rounded-xl ring-2 ring-amber-400" : "rounded-xl"}>
                                            <ArenaPortraitCard
                                              card={card}
                                              level={1}
                                              size="full"
                                              showIvLine={false}
                                            />
                                          </div>
                                          <button
                                            className={`arena-redraw-button hover:animate-wiggle text-xs ${
                                              isPicked ? "text-amber-600 font-bold" : ""
                                            }`}
                                            onClick={() => togglePick(cid)}
                                            disabled={cannotPick}
                                          >
                                            {isPicked ? "[ selected ]" : "[ pick ]"}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-blue-200 bg-white/60 p-6 text-center">
                            <p className="text-2xl text-pink-300">✿</p>
                            <p className="mt-1 text-sm text-slate-600">No duplicate cards match these filters.</p>
                            {query || rarityFilter || elementFilter ? (
                              <button
                                type="button"
                                onClick={clearFilters}
                                className="arena-redraw-button mt-2 text-xs"
                              >
                                [ clear filters ]
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {pickedCards.length === 2 ? (
                        <div className="flex justify-center pt-2">
                          <button
                            className="arena-redraw-button text-base"
                            onClick={() => setStep("preview")}
                          >
                            [ Forge Rainbow Card ]
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </section>
            <Divider />
          </main>
          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-2 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">minting info</h2>
                <p>The resulting rainbow card inherits the left card's IVs plus a random <span className="font-bold">+5 bonus</span> distributed across stats.</p>
                <p>Rainbow cards keep their original rarity and work in <span className="font-bold">fight, trade, and market</span> normally.</p>
                <p className="text-xs text-blue-400">Tip: Draw more cards daily to collect duplicates for minting!</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <MobileSwapGhost slot={mobileDragSlot} pos={mobileDragPos} card={mobileGhostCard} />
      <Footer />
    </div>
  );
};

export default ArenaMint;
