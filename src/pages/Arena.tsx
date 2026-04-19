import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import Footer from "@/parts/Footer";
import Divider from "@/parts/Divider";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  ArenaApiError,
  type ArenaProfile,
  drawArenaCard,
  fetchArenaProfile,
} from "@/lib/arena-api";
import kannaSmile from "@/assets/anime/kanna-smile.webp";

function formatIvBlock(stats: { power: number; guard: number; speed: number; luck: number }) {
  return `P ${stats.power} | G ${stats.guard} | S ${stats.speed} | L ${stats.luck}`;
}

function formatTotalStatBlock(stats: { hp: number; power: number; guard: number; speed: number; luck: number }) {
  return `HP ${stats.hp} | P ${stats.power} | G ${stats.guard} | S ${stats.speed} | L ${stats.luck}`;
}

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

const Arena = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;

  const [profile, setProfile] = useState<ArenaProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/arena",
    structuredDataId: "arena-home-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Character Card Arena Hub",
      description:
        "Draw one character card per day, view your IV card stats, and open fight/shop/leaderboard pages.",
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
              />
            </div>
          </div>

          <main className="w-full space-y-2 p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/60 p-4">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-blue-700">anime card arena</h2>
                <p className="text-sm text-blue-500">
                  Draw one character card per day, then fight with your chosen card.
                </p>
              </div>

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
                  <p className="font-semibold">Login is required to play Arena.</p>
                  <Link to="/login" className="mt-2 inline-block underline">
                    go to login
                  </Link>
                </div>
              ) : loading && !profile ? (
                <p className="text-blue-500">Loading arena profile...</p>
              ) : profile ? (
                <div className="space-y-3">
                  {!profile.selectedCard ? (
                    <div className="rounded-xl border border-blue-300 bg-blue-50 p-4">
                      <p className="font-semibold text-blue-700">Draw a card to start.</p>
                      <p className="mt-1 text-sm text-blue-600">
                        You can draw only one card per day.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleDrawCard()}
                        disabled={drawing || !profile.canDrawCard}
                        className="mt-3 rounded-full bg-pink-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-pink-600 disabled:opacity-60"
                      >
                        {drawing ? "drawing..." : "draw card"}
                      </button>
                      {!profile.canDrawCard ? (
                        <p className="mt-2 text-xs text-amber-700">
                          Next draw: {formatTime(profile.nextCardDrawAt)}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-blue-200 bg-white/70 p-4">
                      <p className="font-bold text-blue-700">Chosen Card</p>
                      <div className="mt-3 flex flex-col gap-3 md:flex-row">
                        <img
                          src={profile.selectedCard.imageUrl}
                          alt={profile.selectedCard.title}
                          className="h-44 w-32 rounded-xl border border-blue-200 object-cover"
                        />
                        <div className="space-y-1">
                          <p className="font-semibold text-blue-700">
                            {profile.selectedCard.title}
                          </p>
                          <p className="text-sm text-slate-700">
                            Rarity: {profile.selectedCard.rarity}
                          </p>
                          <p className="text-sm text-slate-700">
                            IV: {formatIvBlock(profile.selectedCard.iv)}
                          </p>
                          <p className="text-sm text-slate-700">
                            Total IV: {profile.selectedCard.iv.total}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => void handleDrawCard()}
                          disabled={drawing || !profile.canDrawCard}
                          className="rounded-full bg-pink-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-pink-600 disabled:opacity-60"
                        >
                          {drawing ? "drawing..." : "redraw today card"}
                        </button>
                        {!profile.canDrawCard ? (
                          <p className="mt-2 text-xs text-amber-700">
                            You already drew today. Next draw: {formatTime(profile.nextCardDrawAt)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-blue-200 bg-white/70 p-3">
                      <p className="text-sm text-blue-500">Level / XP</p>
                      <p className="font-semibold text-blue-700">
                        Lv {profile.level} | {profile.xp}/{profile.xpToNext}
                      </p>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-white/70 p-3">
                      <p className="text-sm text-blue-500">Coins</p>
                      <p className="font-semibold text-blue-700">{profile.coins}</p>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-white/70 p-3 md:col-span-2">
                      <p className="text-sm text-blue-500">Gear + Stats</p>
                      <p className="text-sm text-slate-700">
                        {formatTotalStatBlock(profile.stats.total)}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Weapon: {profile.equipment.weapon?.name || "none"} | Armor:{" "}
                        {profile.equipment.armor?.name || "none"} | Charm:{" "}
                        {profile.equipment.charm?.name || "none"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      to="/arena/fight"
                      className="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      fight
                    </Link>
                    <Link
                      to="/arena/shop"
                      className="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      shop
                    </Link>
                    <Link
                      to="/arena/leaderboard"
                      className="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      leaderboard
                    </Link>
                    <Link
                      to="/arena/collection"
                      className="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      collection
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="text-red-600">Failed to load arena profile.</p>
              )}

              {errorMessage ? (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}
            </section>
            <Divider />
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">arena flow</h2>
                <p>1) Draw a card once per day.</p>
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
