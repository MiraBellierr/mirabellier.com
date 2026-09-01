import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Divider from "../parts/Divider";
import { usePageSeo } from "@/lib/seo";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import { useAuth } from "@/states/AuthContext";
import {
  TwitchApiError,
  addTwitchChannel,
  backfillTwitchChannel,
  fetchTwitchAccuracy,
  fetchTwitchChannels,
  removeTwitchChannel,
  type TwitchAccuracy,
  type TwitchChannelSummary,
} from "@/lib/twitch-api";

function AdminNotice({
  title,
  body,
  actionLabel,
  actionTo,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>

          <main className="w-full lg:w-3/5 p-4">
            <section className="card-border p-6 bg-white/55">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-blue-700">{title}</h2>
                <p className="mt-3 text-blue-500">{body}</p>
                {actionLabel && actionTo ? (
                  <Link
                    to={actionTo}
                    className="mt-5 inline-flex rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600"
                  >
                    {actionLabel}
                  </Link>
                ) : null}
              </div>
            </section>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function formatMinutes(minutes: number | null) {
  if (minutes == null) return "—";
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

const AdminTwitch = () => {
  const auth = useAuth();
  const isOwner = canAccessAdminPanel(auth.user);

  const [channels, setChannels] = useState<TwitchChannelSummary[]>([]);
  const [accuracy, setAccuracy] = useState<Record<string, TwitchAccuracy>>({});
  const [loginInput, setLoginInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/admin/twitch",
    structuredDataId: "admin-twitch-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Admin — Twitch Channels",
      description: "Owner-only Twitch channel management for Mirabellier.",
      url: "https://mirabellier.com/admin/twitch",
    },
  });

  const reload = () => {
    fetchTwitchChannels()
      .then(async (list) => {
        setChannels(list);
        const accuracies: Record<string, TwitchAccuracy> = {};
        await Promise.all(
          list.map((channel) =>
            fetchTwitchAccuracy(channel.login)
              .then((result) => {
                accuracies[channel.login] = result;
              })
              .catch(() => undefined),
          ),
        );
        setAccuracy(accuracies);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load channels");
      });
  };

  useEffect(() => {
    if (isOwner) {
      reload();
    }
  }, [isOwner]);

  if (!auth.user) {
    return (
      <AdminNotice
        title="Please log in"
        body="You need to log in with the owner account before using the admin pages."
        actionLabel="Go to login"
        actionTo="/login"
      />
    );
  }

  if (!isOwner) {
    return (
      <AdminNotice
        title="Forbidden"
        body="Only the site owner can manage Twitch channels."
        actionLabel="Back to admin"
        actionTo="/admin"
      />
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const login = loginInput.trim().toLowerCase();
    if (!login) return;

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      await addTwitchChannel(login);
      setLoginInput("");
      setMessage(`Added ${login}. Backfilling stream history in the background.`);
      reload();
    } catch (err) {
      if (err instanceof TwitchApiError && err.code === "TWITCH_CONFIG_MISSING") {
        setError(
          "Twitch is not configured on the server yet. Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to mirabellier-backend/.env.",
        );
      } else if (err instanceof TwitchApiError && err.status === 409) {
        setError("That channel is already tracked.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to add channel");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (login: string) => {
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      await removeTwitchChannel(login);
      setMessage(`Removed ${login}.`);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove channel");
    } finally {
      setBusy(false);
    }
  };

  const handleBackfill = async (login: string) => {
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const result = await backfillTwitchChannel(login);
      setMessage(
        result.ok ? `Backfill complete — ${result.inserted ?? 0} new streams saved.` : "Backfill skipped.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to backfill");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>

          <main className="w-full lg:w-3/5 p-4">
            <section className="card-border p-6 bg-white/55">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-blue-700">
                  twitch channel admin
                </h1>
                <p className="mt-2 text-sm text-blue-500">
                  Add channels to track on the{" "}
                  <Link to="/twitch" className="font-bold underline">
                    /twitch
                  </Link>{" "}
                  prediction page.
                </p>
              </div>

              <Divider />

              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={loginInput}
                  onChange={(event) => setLoginInput(event.target.value)}
                  placeholder="channel login, e.g. kanna_kamui"
                  className="min-w-0 flex-1 rounded-full border border-blue-200 bg-white/80 px-4 py-2 text-sm text-blue-700 placeholder-blue-300 outline-none focus:border-pink-400 dark:border-purple-300/30 dark:bg-purple-900/40 dark:text-purple-100"
                />
                <button
                  type="submit"
                  disabled={busy || !loginInput.trim()}
                  className="rounded-full bg-pink-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-pink-600 disabled:opacity-50"
                >
                  add
                </button>
              </form>

              {message ? (
                <p className="mt-3 text-center text-sm font-semibold text-green-600">
                  {message}
                </p>
              ) : null}
              {error ? (
                <p className="mt-3 text-center text-sm font-semibold text-red-500">
                  {error}
                </p>
              ) : null}

              <Divider />

              {channels.length === 0 ? (
                <p className="text-center text-sm text-blue-500">
                  No channels tracked yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {channels.map((channel) => {
                    const channelAccuracy = accuracy[channel.login];
                    return (
                      <li
                        key={channel.id}
                        className="flex items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm dark:bg-purple-900/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {channel.isLive ? (
                              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                            ) : null}
                            <span className="truncate text-sm font-bold text-blue-700 dark:text-purple-100">
                              {channel.displayName}
                            </span>
                            <span className="text-xs text-blue-400">
                              {channel.login}
                            </span>
                          </div>
                          {channelAccuracy && channelAccuracy.evaluatedPredictions > 0 ? (
                            <p className="text-xs text-blue-400">
                              avg error:{" "}
                              {formatMinutes(channelAccuracy.meanAbsoluteErrorMinutes)}{" "}
                              ({channelAccuracy.evaluatedPredictions} predictions
                              evaluated)
                            </p>
                          ) : (
                            <p className="text-xs text-blue-400">
                              prediction accuracy appears after a few streams
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleBackfill(channel.login)}
                          disabled={busy}
                          className="rounded-full bg-blue-200 px-3 py-1 text-xs font-bold text-blue-700 transition hover:bg-blue-300 disabled:opacity-50 dark:bg-purple-800 dark:text-purple-100"
                        >
                          backfill
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(channel.login)}
                          disabled={busy}
                          className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600 transition hover:bg-red-200 disabled:opacity-50 dark:bg-purple-800 dark:text-pink-200"
                        >
                          remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default AdminTwitch;
