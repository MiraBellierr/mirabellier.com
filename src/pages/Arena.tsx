import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  ArenaApiError,
  type ArenaProfile,
  drawArenaCard,
  fetchArenaProfile,
} from "@/lib/arena-api";
import kannaSmile from "@/assets/anime/kanna-smile.webp";

function formatTime(value: string | null) {
  if (!value) return "unknown";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "unknown";
  return new Date(parsed).toLocaleString();
}

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena request failed.";
}

function isMaintenanceMessage(message: string | null) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("maintenance") || normalized.includes("maintanance");
}

const Arena = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;

  const [profile, setProfile] = useState<ArenaProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const showingDrawMaintenance = isMaintenanceMessage(errorMessage);
  const xpBlocksFilled = profile
    ? Math.min(10, Math.max(0, Math.round(Number(profile.xpProgress || 0) * 10)))
    : 0;
  const xpBlocks = `${"▣".repeat(xpBlocksFilled)}${"☐".repeat(10 - xpBlocksFilled)}`;
  usePageSeo({
    canonical: "https://mirabellier.com/arena",
    structuredDataId: "arena-home-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Character Card Arena Hub",
      description:
        "Draw up to five character cards per day, view your IV card stats, and open fight/shop/leaderboard pages.",
      url: "https://mirabellier.com/arena",
    },
  });

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setProfile(null);
      return () => {
        cancelled = true;
      };
    }

    const loadProfile = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const payload = await fetchArenaProfile(token);
        if (cancelled) return;
        setProfile(payload);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(normalizeArenaError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleDrawCard = async () => {
    if (!token) return;
    setDrawing(true);
    setErrorMessage(null);
    try {
      const payload = await drawArenaCard(token);
      setProfile(payload.profile);
    } catch (error) {
      const msg = normalizeArenaError(error);
      if (error instanceof ArenaApiError && error.nextDrawAt) {
        setErrorMessage(`${msg} Next draw: ${formatTime(error.nextDrawAt)}`);
      } else if (error instanceof ArenaApiError && error.retryAfterMs) {
        const seconds = Math.max(1, Math.ceil(error.retryAfterMs / 1000));
        setErrorMessage(`${msg} Retry in about ${seconds}s.`);
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setDrawing(false);
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
            <div className="mt-3 mb-auto hidden items-center justify-center lg:flex">
              <img
                className="w-full max-w-[320px] rounded-2xl border border-blue-700 shadow-md"
                src={kannaSmile}
                width="320"
                height="427"
                alt="kanna smiling"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>

          <main className="w-full space-y-2 p-4 lg:w-3/5">
            <section className="arena-draw-duel">
              {!token ? (
                <div className="rounded-[28px] border-2 border-amber-200 bg-white/90 p-6 text-center text-amber-800 shadow-xl">
                  <p className="font-semibold">Login is required to play Arena.</p>
                  <Link to="/login" className="mt-2 inline-block font-bold underline">
                    go to login
                  </Link>
                </div>
              ) : loading && !profile ? (
                <div className="rounded-[28px] border-2 border-blue-200 bg-white/90 p-6 text-center font-bold text-blue-500 shadow-xl">
                  Loading arena profile...
                </div>
              ) : profile ? (
                <div className="arena-duel-panel relative mx-auto max-w-2xl overflow-hidden p-3 shadow-[0_18px_45px_rgba(67,151,211,0.24)] sm:p-4">
                  <div className="relative space-y-4">
                    <div className="">
                        <h2 className="text-4xl font-bold text-blue-900">Champione Information {`>^. .^<`}</h2>
                      <p className="mt-2 text-sm font-black text-blue-800 sm:text-base">
                        <span className="text-pink-300">✿</span> Draw cards, pick your fighter, and duel!{" "}
                        <span className="text-pink-300">✿</span>
                      </p>
                    </div>

                      <div className="flex flex-wrap justify-center gap-3">
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
                    </div>

                    {profile.activeFight && !profile.activeFight.isFinished ? (
                      <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-center">
                        <p className="text-sm font-bold text-amber-800">
                          Fight in progress — Turn {profile.activeFight.cursor} / {profile.activeFight.totalTurns}
                        </p>
                        <Link
                          to="/arena/fight"
                          className="mt-1 inline-block text-sm font-bold text-blue-600 underline hover:text-blue-800"
                        >
                          Resume fight →
                        </Link>
                      </div>
                    ) : null}

                    <div className="arena-chosen-card-body">
                      <div className="arena-card-portrait-slot">
                        {profile.selectedCard ? (
                          <ArenaPortraitCard
                            card={profile.selectedCard}
                            level={profile.level}
                            className="arena-duel-card"
                          />
                        ) : (
                          <div className="arena-empty-card">CARD</div>
                        )}
                      </div>

                      <div>
                        <div className="arena-chosen-card-heading">
                          <div className="min-w-0 flex-1">
                            <p className="pb-2 break-words text-center text-2xl font-black leading-tight text-blue-900 sm:text-left">
                              {profile.selectedCard?.title || "No card yet"} ({profile.selectedCard?.rarity || "-"}){" "}
                              <span className="whitespace-nowrap text-base text-blue-600">
                                · Level {profile.level}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="border-t-2 border-dotted border-sky-200" />

                        <div className="text-md pt-1 pb-1">
                        <div className="text-sm">
                          {/* <p className="text-lg font-semibold underline">Card Stats (Total)</p> */}
                        </div>
                        <div className="text-sm">
                          <span>✦ Health:</span> <b>{profile.stats.total.hp}</b>{" "}
                          <span className="text-xs text-sky-600">(IV +{profile.stats.card.hp})</span>
                        </div>
                        <div className="text-sm">
                          <span>✦ Power:</span> <b>{profile.stats.total.power}</b>{" "}
                          <span className="text-xs text-sky-600">(IV +{profile.stats.card.power})</span>
                        </div>
                        <div className="text-sm">
                          <span>✦ Guard:</span> <b>{profile.stats.total.guard}</b>{" "}
                          <span className="text-xs text-sky-600">(IV +{profile.stats.card.guard})</span>
                        </div>
                        <div className="text-sm">
                          <span>✦ Speed:</span> <b>{profile.stats.total.speed}</b>{" "}
                          <span className="text-xs text-sky-600">(IV +{profile.stats.card.speed})</span>
                        </div>
                        <div className="text-sm">
                          <span>✦ Luck:</span> <b>{profile.stats.total.luck}</b>{" "}
                          <span className="text-xs text-sky-600">(IV +{profile.stats.card.luck})</span>
                        </div>
                      </div>

                      <div className=" gap-2 border-t border-sky-100 text-sm font-bold">
                        <div className="text-sm">
                        <p className="text-lg font-semibold underline">Gears</p>
                        </div>
                        <p><span className="font-normal">✦ Weapon:</span> {profile.equipment.weapon?.name || "none"}</p>
                        <p><span className="font-normal">✦ Armor:</span> {profile.equipment.armor?.name || "none"}</p>
                        <p><span className="font-normal">✦   Charm:</span> {profile.equipment.charm?.name || "none"}</p>

                        <div className="arena-draw-count-row border-t border-sky-100 pt-1 pb-1 text-sm font-semibold text-blue-950">
                          <span className="mr-1 items-center justify-center text-md">
                            Coins:
                          </span>
                          {" "}
                          <span className="font-black text-blue-600">
                            {profile.coins} 🪙
                          </span>
                        </div>

                        <div className="py-2 text-xs font-semibold text-blue-950">
                          XP: {profile.xp}/{profile.xpToNext}{" "}
                          <span
                            className="whitespace-nowrap tracking-wider text-blue-600"
                            aria-label={`${profile.xp} of ${profile.xpToNext} experience`}
                          >
                            {xpBlocks}
                          </span>
                        </div>

                        <div className="arena-draw-count-row border-t border-sky-100 pt-2 text-sm font-semibold text-blue-950">
                          <span className="mr-1 items-center justify-center text-md">
                            Draws left today:
                          </span>
                          {" "}
                          <span className="font-black text-blue-600">
                            {profile.dailyDrawsRemaining}/{profile.dailyDrawLimit} draws
                          </span>
                        </div>
                      </div>
                      </div>

                      <div />

                      <div>
                        <div className="arena-redraw-row">
                          {!showingDrawMaintenance ? (
                            <button
                              type="button"
                              onClick={() => void handleDrawCard()}
                              disabled={drawing || !profile.canDrawCard}
                              className="arena-redraw-button hover:animate-wiggle"
                            >
                              {drawing
                                ? "[ Drawing... ]"
                                : profile.selectedCard
                                  ? "[ Redraw Cards ]"
                                  : "[ Draw Cards ]"}
                            </button>
                          ) : null}
                        </div>
                        {!showingDrawMaintenance && !profile.canDrawCard ? (
                          <p className="text-sm font-semibold text-amber-700">
                            Daily draw limit reached. Next draw: {formatTime(profile.nextCardDrawAt)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {showingDrawMaintenance && errorMessage ? (
                      <div className="arena-duel-maintenance-wrap">
                        <ArenaErrorNotice message={errorMessage} variant="duel" />
                      </div>
                    ) : null}

                    {errorMessage && !showingDrawMaintenance ? (
                      <ArenaErrorNotice message={errorMessage} />
                    ) : null}
                  </div>
                </div>
              ) : (
                errorMessage ? (
                  <ArenaErrorNotice message={errorMessage} />
                ) : (
                  <p className="rounded-[24px] border-2 border-red-200 bg-white/90 p-4 text-red-600">
                    Failed to load arena profile.
                  </p>
                )
              )}
            </section>
            <Divider />
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">arena flow</h2>
                <p>1) Draw up to 5 cards per day.</p>
                <p>2) Use your card in fights.</p>
                <p>3) Buy gear in shop and climb leaderboards.</p>
              </div>
            </div>
          </aside>

        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Arena;
