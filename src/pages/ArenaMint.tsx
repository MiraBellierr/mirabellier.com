import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
  ArenaApiError,
  type ArenaCard,
  type ArenaMintDuplicateGroup,
  fetchMintDuplicates,
  mintRainbowCard,
} from "@/lib/arena-api";

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena request failed.";
}

type Step = "pick" | "preview";

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
    return mintGroups.map(({ malId, cards, total }) => ({
      malId,
      cards: cards.slice(0, 5),
      total,
    }));
  }, [mintGroups]);

  const togglePick = (instanceId: string) => {
    setPicked((prev) => {
      if (prev.includes(instanceId)) {
        return prev.filter((id) => id !== instanceId);
      }
      if (prev.length >= 2) return prev;
      return [...prev, instanceId];
    });
  };

  const pickedCards = useMemo(() => {
    const allCards = mintGroups.flatMap((g) => g.cards);
    return picked
      .map((id) => allCards.find((c) => c.cardInstanceId === id))
      .filter((c): c is ArenaCard => !!c);
  }, [mintGroups, picked]);

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
    let seed = 0;
    for (let i = 0; i < (a.cardInstanceId! + b.cardInstanceId!).length; i++) {
      seed = ((seed << 5) - seed + (a.cardInstanceId! + b.cardInstanceId!).charCodeAt(i)) | 0;
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

  const handleMint = async () => {
    if (!token || pickedCards.length !== 2) return;
    setMintError(null);
    setActioning(true);
    try {
      const [a, b] = pickedCards;
      const res = await mintRainbowCard(token, a.cardInstanceId!, b.cardInstanceId!);
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
          <main className="w-full space-y-2 p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/60 p-4">
              <div className="">
                <h2 className="text-4xl font-bold text-blue-900">Card Minting Forge {`>^. .^<`}</h2>
                <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
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
                  ) : !mintable.length ? (
                    <p className="text-blue-500">No duplicate cards found. Draw more cards to collect duplicates for minting!</p>
                  ) : step === "preview" && previewCard ? (
                    <div className="space-y-4">
                      <h3 className="text-lg font-black text-blue-900">Preview Rainbow Card</h3>
                      <div className="flex flex-wrap items-center justify-center gap-4">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-bold text-blue-700">Material 1</span>
                          <ArenaPortraitCard card={pickedCards[0]} level={1} interactive />
                          <span className="text-xs text-blue-600">
                            IV {pickedCards[0].iv.total}
                          </span>
                        </div>
                        <span className="text-2xl font-bold text-blue-400">+</span>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-bold text-blue-700">Material 2</span>
                          <ArenaPortraitCard card={pickedCards[1]} level={1} interactive />
                          <span className="text-xs text-blue-600">
                            IV {pickedCards[1].iv.total}
                          </span>
                        </div>
                        <span className="text-2xl font-bold text-blue-400">=</span>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-bold text-green-600">Result</span>
                          <ArenaPortraitCard card={previewCard} level={1} interactive showIvLine />
                          <span className="text-xs text-amber-500">+5 random IV bonus</span>
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
                      <div className="max-h-[55vh] overflow-y-auto [scrollbar-gutter:stable] space-y-4 pr-1">
                      {mintable.map(({ malId, cards, total }) => {
                        const characterTitle = cards[0].title;
                        const possibleFirstId = cards[0].cardInstanceId;
                        if (!possibleFirstId) return null;

                        return (
                          <div key={malId} className="space-y-2">
                            <h3 className="text-blue-900 font-extrabold text-sm">
                              {characterTitle}{" "}
                              <span className="text-blue-600 font-semibold">({total} copies)</span>
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
                                        : "opacity-85 hover:opacity-100"
                                    }`}
                                  >
                                    <div className={isPicked ? "ring-2 ring-amber-400 rounded-xl" : ""}>
                                      <ArenaPortraitCard
                                        card={card}
                                        level={1}
                                        size="full"
                                        showIvLine={true}
                                        interactive
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
                <p>Combine two identical non-rainbow cards of the same character.</p>
                <p>The resulting rainbow card inherits the left card's IVs plus a random <span className="font-bold">+5 bonus</span> distributed across stats.</p>
                <p>Rainbow cards keep their original rarity and work in <span className="font-bold">fight, trade, and market</span> normally.</p>
                <p className="text-xs text-blue-400">Tip: Draw more cards daily to collect duplicates for minting!</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ArenaMint;
