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
  type ArenaCollectionResponse,
  fetchArenaCollection,
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
  const [data, setData] = useState<ArenaCollectionResponse | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [picked, setPicked] = useState<string[]>([]);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintedCard, setMintedCard] = useState<ArenaCard | null>(null);
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setData(null);
      return () => { cancelled = true; };
    }

    const loadCollection = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchArenaCollection(token, { perPage: 200, sort: "recent" });
        if (cancelled) return;
        setData(res);
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

    void loadCollection();
    return () => { cancelled = true; };
  }, [token]);

  const mintable = useMemo(() => {
    if (!data) return [];
    const groups = new Map<number, ArenaCard[]>();
    for (const card of data.cards) {
      const list = groups.get(card.malId);
      if (list) {
        list.push(card);
      } else {
        groups.set(card.malId, [card]);
      }
    }
    return Array.from(groups.entries())
      .filter(([, cards]) => cards.length >= 2)
      .map(([malId, cards]) => ({ malId, cards: cards.slice(0, 5), total: cards.length }));
  }, [data]);

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
    if (!data) return [];
    return picked
      .map((id) => data.cards.find((c) => c.cardInstanceId === id))
      .filter((c): c is ArenaCard => !!c);
  }, [data, picked]);

  const previewCard = useMemo((): ArenaCard | null => {
    if (pickedCards.length !== 2) return null;
    const [a, b] = pickedCards;
    const base = a.iv.total >= b.iv.total ? a.iv : b.iv;
    const iv = {
      power: base.power,
      guard: base.guard,
      speed: base.speed,
      luck: base.luck,
      total: base.total,
    };
    return {
      ...a,
      iv,
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
      const updated = await fetchArenaCollection(token, { perPage: 200, sort: "recent" });
      setData(updated);
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
              ) : loading && !data ? (
                <p className="text-blue-500">Loading collection...</p>
              ) : data ? (
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
                    null
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
                          <span className="text-xs text-amber-500">+3 random IV bonus</span>
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
                                      isPicked
                                        ? "ring-2 ring-amber-400 rounded-xl"
                                        : cannotPick
                                          ? "opacity-40"
                                          : "opacity-85 hover:opacity-100"
                                    }`}
                                  >
                                    <ArenaPortraitCard
                                      card={card}
                                      level={1}
                                      size="compact"
                                      showIvLine={true}
                                      interactive
                                    />
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

                      {pickedCards.length === 2 ? (
                        <div className="flex justify-center">
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
              ) : null}
            </section>
            <Divider />
          </main>
          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-2 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">minting info</h2>
                <p>Combine two identical non-rainbow cards of the same character.</p>
                <p>The resulting rainbow card gets averaged IVs <span className="font-bold">rounded up</span>, giving a small bonus.</p>
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
