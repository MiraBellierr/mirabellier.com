import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";

import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import ArenaSubNav from "@/parts/ArenaSubNav";
import Divider from "@/parts/Divider";
import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { useWebSocketEvent } from "@/hooks/use-websocket";
import {
  ArenaApiError,
  type ArenaCard,
  type ArenaNotification,
  acceptArenaTradeRequest,
  denyArenaTradeRequest,
  fetchArenaNotifications,
  markArenaNotificationRead,
  markAllArenaNotificationsRead,
} from "@/lib/arena";
import { usePageSeo } from "@/lib/seo";

function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena inbox request failed.";
}

const NOTIFICATION_ICONS: Record<string, string> = {
  market_sold: "^",
  trade_request: "*",
  trade_accepted: "+",
  trade_denied: "-",
};

const NOTIFICATION_LABELS: Record<string, string> = {
  market_sold: "Card Sold",
  trade_request: "Trade Request",
  trade_accepted: "Accepted",
  trade_denied: "Denied",
};

const NOTIFICATION_LABEL_CLASSES: Record<string, string> = {
  trade_accepted: "text-green-500 dark:text-green-400",
  trade_denied: "text-red-500 dark:text-red-400",
};

const ArenaInbox = () => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const navigate = useNavigate();
  const [data, setData] = useState<{
    notifications: ArenaNotification[];
    page: number;
    total: number;
    totalPages: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/arena/inbox",
    structuredDataId: "arena-inbox-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Inbox",
      description: "Notifications for your Arena activity.",
      url: "https://mirabellier.com/arena/inbox",
    },
  });

  const loadData = useCallback(
    async (currentToken: string, currentPage: number) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const payload = await fetchArenaNotifications(currentToken, {
          page: currentPage,
          limit: 30,
        });
        setData(payload);
      } catch (error) {
        setErrorMessage(normalizeArenaError(error));
      }
      setLoading(false);
    },
    [],
  );

  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!token) {
      setData(null);
      return;
    }
    void loadData(token, page);
  }, [token, page, loadData]);

  useWebSocketEvent("arena:notification:unread-count", (data) => {
    const { count } = data as { count: number };
    if (count !== prevCountRef.current) {
      prevCountRef.current = count;
      if (token) void loadData(token, page);
    }
  });

  useWebSocketEvent("arena:notification:new", () => {
    if (token) void loadData(token, page);
  });

  const handleMarkRead = useCallback(
    async (notification: ArenaNotification) => {
      if (!token || notification.isRead) return;
      try {
        await markArenaNotificationRead(token, notification.id);
        setData((prev) =>
          prev
            ? {
                ...prev,
                notifications: prev.notifications.map((n) =>
                  n.id === notification.id ? { ...n, isRead: true } : n,
                ),
              }
            : prev,
        );
        if (notification.link && notification.type !== "trade_request" && notification.type !== "trade_accepted") {
          navigate(notification.link);
        }
      } catch {
        // ignore
      }
    },
    [token, navigate],
  );

  const handleAcceptTrade = useCallback(
    async (notification: ArenaNotification) => {
      if (!token) return;
      try {
        const meta = notification.metadata ? JSON.parse(notification.metadata) : null;
        const requestId = meta?.requestId;
        if (!requestId) return;
        setConfirmAcceptNotification(null);
        setActioning(notification.id);
        const result = await acceptArenaTradeRequest(token, requestId);
        await markArenaNotificationRead(token, notification.id);
        setData((prev) =>
          prev
            ? {
                ...prev,
                notifications: prev.notifications.map((n) =>
                  n.id === notification.id ? { ...n, isRead: true } : n,
                ),
              }
            : prev,
        );
        if (result.sessionId) {
          navigate(`/arena/trade?session=${encodeURIComponent(result.sessionId)}`);
        } else if (result.askerCard) {
          setSuccessCard(result.askerCard as ArenaCard);
        }
      } catch {
        // ignore
      }
      setActioning(null);
    },
    [token, navigate],
  );

  const handleDenyTrade = useCallback(
    async (notification: ArenaNotification) => {
      if (!token) return;
      try {
        const meta = notification.metadata ? JSON.parse(notification.metadata) : null;
        const requestId = meta?.requestId;
        if (!requestId) return;
        setActioning(notification.id);
        await denyArenaTradeRequest(token, requestId);
        await markArenaNotificationRead(token, notification.id);
        const askerName = notification.title.replace(" wants to trade", "");
        setData((prev) =>
          prev
            ? {
                ...prev,
                notifications: prev.notifications.map((n) =>
                  n.id === notification.id
                    ? { ...n, isRead: true, title: `You denied ${askerName} trade request`, body: null }
                    : n,
                ),
              }
            : prev,
        );
      } catch {
        // ignore
      }
      setActioning(null);
    },
    [token],
  );

  const [actioning, setActioning] = useState<string | null>(null);
  const [successCard, setSuccessCard] = useState<ArenaCard | null>(null);
  const [confirmAcceptNotification, setConfirmAcceptNotification] = useState<ArenaNotification | null>(null);

  const handleMarkAllRead = useCallback(async () => {
    if (!token) return;
    try {
      await markAllArenaNotificationsRead(token);
      void loadData(token, page);
    } catch {
      // ignore
    }
  }, [token, page, loadData]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex min-h-screen flex-col font-[sans-serif] text-blue-900">
      <Header />
      <div
        className="flex flex-1 flex-col bg-cover bg-scroll bg-no-repeat"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-4 p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>
          <main className="w-full space-y-2 p-4 lg:w-3/5">
            <section className="card-border space-y-4 bg-white/60 p-4 dark:bg-slate-900/60">
              <div>
                <h1 className="text-4xl font-bold text-blue-900 dark:text-purple-100">
                  Inbox
                </h1>
                <p className="mt-2 text-sm font-black text-blue-800 dark:text-purple-200 sm:text-base">
                  <span className="text-pink-300">*</span> Arena notifications{" "}
                  <span className="text-pink-300">*</span>
                </p>
              </div>

              <ArenaSubNav />

              {!token ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                  <p className="font-semibold">Login is required to view your inbox.</p>
                  <Link to="/login" className="mt-2 inline-block underline">
                    go to login
                  </Link>
                </div>
              ) : (
                <>
                  {data && data.notifications.length > 0 && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {data.total} notification{data.total !== 1 ? "s" : ""}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleMarkAllRead()}
                        className="arena-redraw-button text-xs hover:animate-wiggle"
                      >
                        [ mark all read ]
                      </button>
                    </div>
                  )}

                  {loading ? (
                    <p className="text-blue-500 dark:text-purple-300">Loading...</p>
                  ) : data && data.notifications.length > 0 ? (
                    <div className="space-y-2">
                      {data.notifications.map((notification) => {
                        const meta =
                          (notification.type === "trade_request" ||
                           notification.type === "trade_accepted" ||
                           notification.type === "trade_denied") && notification.metadata
                            ? (() => {
                                try {
                                  return JSON.parse(notification.metadata);
                                } catch {
                                  return null;
                                }
                              })()
                            : null;
                        const isTrade = notification.type === "trade_request" && !notification.isRead;
                        const hasCards = notification.type === "trade_request" ||
                          notification.type === "trade_accepted" ||
                          notification.type === "trade_denied";

                        return (
                          <div
                            key={notification.id}
                            onClick={() => {
                              if (!isTrade) void handleMarkRead(notification);
                            }}
                            className={`w-full rounded-xl border p-3 transition ${
                              notification.isRead
                                ? "border-blue-100 bg-white/40 dark:border-purple-400/10 dark:bg-slate-800/40"
                                : "border-blue-300 bg-blue-50/80 dark:border-purple-400/30 dark:bg-purple-950/40"
                            } ${isTrade ? "" : "cursor-pointer"}`}
                          >
                            <div className="flex items-start gap-3">
                            <span
                              className={`mt-0.5 text-lg ${
                                notification.isRead
                                  ? "text-slate-300 dark:text-slate-600"
                                  : notification.type === "trade_accepted"
                                    ? "text-green-400 dark:text-green-500"
                                    : notification.type === "trade_denied"
                                      ? "text-red-400 dark:text-red-500"
                                      : "text-pink-400 dark:text-pink-500"
                              }`}
                            >
                                {NOTIFICATION_ICONS[notification.type] || "!"}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-xs font-black uppercase tracking-[0.1em] ${
                                      notification.isRead
                                        ? "text-slate-400 dark:text-slate-500"
                                        : NOTIFICATION_LABEL_CLASSES[notification.type] || "text-pink-500 dark:text-pink-400"
                                    }`}
                                  >
                                    {NOTIFICATION_LABELS[notification.type] || notification.type}
                                  </span>
                                {!notification.isRead && (
                                  <span className={`h-2 w-2 rounded-full ${
                                    notification.type === "trade_accepted"
                                      ? "bg-green-500"
                                      : notification.type === "trade_denied"
                                        ? "bg-red-500"
                                        : "bg-pink-500"
                                  }`} />
                                )}
                                </div>
                                <p className="mt-1 text-sm font-semibold text-blue-700 dark:text-purple-100">
                                  {notification.title}
                                </p>
                                {notification.body && (
                                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                                    {notification.body}
                                  </p>
                                )}
                                {hasCards && meta?.askerCard && (
                                  <div className="mt-2">
                                    <div className="flex items-start gap-3">
                                      {notification.type === "trade_accepted" && meta.responderCard ? (
                                        <div className="flex flex-col items-center gap-1">
                                          <span className="text-xs font-semibold text-green-500 dark:text-green-400">You Received</span>
                                          <ArenaPortraitCard
                                            card={meta.responderCard as ArenaCard}
                                            size="compact"
                                            showIvLine
                                          />
                                        </div>
                                      ) : notification.type === "trade_denied" ? (
                                        <div className="flex items-center gap-3">
                                          {meta.askerCard ? (
                                            <div className="flex flex-col items-center gap-1">
                                              <span className="text-xs font-semibold text-blue-500 dark:text-purple-300">Your Card</span>
                                              <ArenaPortraitCard
                                                card={meta.askerCard as ArenaCard}
                                                size="compact"
                                                showIvLine
                                              />
                                            </div>
                                          ) : null}
                                          {meta.responderCard ? (
                                            <div className="flex flex-col items-center gap-1">
                                              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Their Card</span>
                                              <ArenaPortraitCard
                                                card={meta.responderCard as ArenaCard}
                                                size="compact"
                                                showIvLine
                                              />
                                            </div>
                                          ) : null}
                                          <span className="text-xs font-semibold text-red-500 dark:text-red-400">Denied</span>
                                        </div>
                                      ) : (
                                        <>
                                          {meta.responderCard ? (
                                            <div className="flex flex-col items-center gap-1">
                                              <span className="text-xs font-semibold text-blue-500 dark:text-purple-300">Your Card</span>
                                              <ArenaPortraitCard
                                                card={meta.responderCard as ArenaCard}
                                                size="compact"
                                                showIvLine
                                              />
                                            </div>
                                          ) : null}
                                          <div className="flex flex-col items-center gap-1">
                                            <span className="text-xs font-semibold text-pink-500 dark:text-pink-400">Their Card</span>
                                            <ArenaPortraitCard
                                              card={meta.askerCard as ArenaCard}
                                              size="compact"
                                              showIvLine
                                            />
                                          </div>
                                        </>
                                      )}
                                      {isTrade && (
                                        <div className="flex gap-2 pt-2">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setConfirmAcceptNotification(notification);
                                            }}
                                            disabled={actioning === notification.id}
                                            className="rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white transition hover:bg-green-600 disabled:opacity-50 dark:bg-green-600 dark:hover:bg-green-700"
                                          >
                                            Accept
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void handleDenyTrade(notification);
                                            }}
                                            disabled={actioning === notification.id}
                                            className="rounded-full bg-red-400 px-3 py-1 text-xs font-bold text-white transition hover:bg-red-500 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-600"
                                          >
                                            Deny
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {isTrade && !meta?.askerCard && (
                                  <div className="flex gap-2 pt-3">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleAcceptTrade(notification);
                                      }}
                                      disabled={actioning === notification.id}
                                      className="rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white transition hover:bg-green-600 disabled:opacity-50 dark:bg-green-600 dark:hover:bg-green-700"
                                    >
                                      Accept
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleDenyTrade(notification);
                                      }}
                                      disabled={actioning === notification.id}
                                      className="rounded-full bg-red-400 px-3 py-1 text-xs font-bold text-white transition hover:bg-red-500 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-600"
                                    >
                                      Deny
                                    </button>
                                  </div>
                                )}
                                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                  {formatTime(notification.createdAt)}
                                </p>
                              </div>
                              {notification.link && !isTrade && (
                                <span className="mt-1 shrink-0 text-xs text-slate-300 dark:text-slate-600">
                                  →
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-blue-100 bg-white/60 p-6 text-center dark:border-purple-400/20 dark:bg-slate-800/60">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No notifications yet.
                      </p>
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        You'll see notifications here when your market cards are bought or when
                        someone sends you a trade request.
                      </p>
                    </div>
                  )}

                  {data && data.totalPages > 1 && (
                    <div className="flex items-center justify-center gap-3">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="arena-redraw-button disabled:opacity-40"
                      >
                        [ prev ]
                      </button>
                      <span className="text-sm text-blue-600 dark:text-purple-300">
                        Page {data.page} of {data.totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={page >= data.totalPages}
                        onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                        className="arena-redraw-button disabled:opacity-40"
                      >
                        [ next ]
                      </button>
                    </div>
                  )}

                  {errorMessage ? <ArenaErrorNotice message={errorMessage} /> : null}
                </>
              )}
            </section>
            <Divider />
          </main>
          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md dark:border-purple-400/30 dark:bg-slate-800 dark:opacity-95">
              <div className="space-y-2 text-sm text-blue-600 dark:text-purple-200">
                <h2 className="text-center text-lg font-bold text-blue-700 dark:text-purple-100">
                  inbox info
                </h2>
                <p>Notifications from the card market and trade system.</p>
                <p>Click a notification to mark it as read.</p>
                <p>Unread notifications are highlighted.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />

      {confirmAcceptNotification
        ? createPortal(
            <div
              className="fixed inset-0 z-[240000] flex items-center justify-center bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-950/70"
              onClick={() => setConfirmAcceptNotification(null)}
            >
              <div
                className="card-border w-full max-w-md rounded-2xl p-5 shadow-2xl dark:bg-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-500">
                    confirm trade
                  </p>
                  <p className="text-sm font-bold text-blue-700 dark:text-purple-100">
                    Accept this trade offer?
                  </p>
                  {(() => {
                    const meta = confirmAcceptNotification.metadata
                      ? JSON.parse(confirmAcceptNotification.metadata)
                      : null;
                    return (
                      <div className="flex items-center gap-4">
                        {meta?.askerCard ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs font-semibold text-green-500 dark:text-green-400">
                              You Receive
                            </span>
                            <ArenaPortraitCard
                              card={meta.askerCard as ArenaCard}
                              size="compact"
                              showIvLine
                            />
                          </div>
                        ) : null}
                        <span className="text-2xl font-bold text-slate-400">→</span>
                        {meta?.responderCard ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs font-semibold text-red-400 dark:text-red-500">
                              You Give
                            </span>
                            <ArenaPortraitCard
                              card={meta.responderCard as ArenaCard}
                              size="compact"
                              showIvLine
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        void handleAcceptTrade(confirmAcceptNotification);
                      }}
                      className="rounded-full bg-green-500 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
                    >
                      Confirm Swap
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmAcceptNotification(null)}
                      className="rounded-full bg-slate-300 px-4 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-400 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {successCard
        ? createPortal(
            <div
              className="fixed inset-0 z-[240000] flex items-center justify-center bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-950/70"
              onClick={() => {
                setSuccessCard(null);
                if (token) void loadData(token, page);
              }}
            >
              <div
                className="card-border w-full max-w-sm rounded-2xl p-5 shadow-2xl dark:bg-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-500">
                    trade accepted!
                  </p>
                  <p className="text-sm font-bold text-blue-700 dark:text-purple-100">
                    You received:
                  </p>
                  <ArenaPortraitCard card={successCard} size="full" showIvLine />
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">
                    Congratulations!
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSuccessCard(null);
                      if (token) void loadData(token, page);
                    }}
                    className="arena-redraw-button hover:animate-wiggle"
                  >
                    [ close ]
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};

export default ArenaInbox;
