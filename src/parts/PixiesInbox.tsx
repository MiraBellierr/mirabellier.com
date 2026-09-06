import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { useWebSocket } from "@/states/WebSocketProvider";
import AvatarImage from "@/parts/AvatarImage";
import { resolveAvatarUrl } from "@/lib/pixies";
import {
  fetchPixieNotifications,
  fetchPixieNotificationUnreadCount,
  formatNotificationTime,
  markAllPixieNotificationsRead,
  markPixieNotificationRead,
  type PixieNotification,
} from "@/lib/pixie-notifications";

const PAGE_SIZE = 20;

const BellIcon = ({ size = 22 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const CloseIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function notificationText(n: PixieNotification): {
  headline: string;
  quote: string | null;
  system: boolean;
} {
  const who = n.actor?.username ? `@${n.actor.username}` : "Someone";
  switch (n.type) {
    case "like":
      return { headline: `${who} liked your video`, quote: null, system: false };
    case "comment":
      return { headline: `${who} commented on your video`, quote: n.preview, system: false };
    case "reply":
      return { headline: `${who} replied to your comment`, quote: n.preview, system: false };
    case "comment_like":
      return { headline: `${who} liked your comment`, quote: n.preview, system: false };
    case "follow":
      return { headline: `${who} started following you`, quote: null, system: false };
    case "mention":
      return { headline: `${who} mentioned you`, quote: n.preview, system: false };
    case "video_removed":
      return {
        headline: "Your video was removed because it doesn't meet the guidelines",
        quote: n.preview,
        system: true,
      };
    default:
      return { headline: n.preview || "New activity", quote: null, system: true };
  }
}

const PixiesInbox = ({ className = "" }: { className?: string }) => {
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const ws = useWebSocket();
  const loggedIn = Boolean(auth?.user);

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<PixieNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(false);
  openRef.current = open;

  // Seed the badge as soon as the viewer is known.
  useEffect(() => {
    if (!loggedIn) {
      setUnread(0);
      setItems([]);
      setLoadedOnce(false);
      return;
    }
    let cancelled = false;
    fetchPixieNotificationUnreadCount()
      .then((count) => {
        if (!cancelled) setUnread(count);
      })
      .catch(() => {
        // A missing count just leaves the badge hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  const loadPage = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(false);
      try {
        const data = await fetchPixieNotifications({
          page: targetPage,
          limit: PAGE_SIZE,
        });
        setItems((current) => {
          if (targetPage <= 1) return data.notifications;
          const known = new Set(current.map((n) => n.id));
          return [...current, ...data.notifications.filter((n) => !known.has(n.id))];
        });
        setPage(data.page);
        setTotalPages(data.totalPages);
        setUnread(data.unread);
        setLoadedOnce(true);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Fetch the first page the first time the panel is opened.
  useEffect(() => {
    if (open && loggedIn && !loadedOnce && !loading) {
      void loadPage(1);
    }
  }, [open, loggedIn, loadedOnce, loading, loadPage]);

  // Live updates — only subscribe (and thus open the socket) once logged in.
  useEffect(() => {
    if (!loggedIn) return;
    const offNew = ws.on("pixie:notification:new", (raw) => {
      const incoming = raw as PixieNotification;
      if (!incoming || typeof incoming.id !== "string") return;
      setItems((current) =>
        current.some((n) => n.id === incoming.id)
          ? current
          : [incoming, ...current],
      );
      if (!openRef.current) setUnread((c) => c + 1);
    });
    const offCount = ws.on("pixie:notification:unread-count", (raw) => {
      const data = raw as { count?: number };
      if (typeof data?.count === "number") setUnread(data.count);
    });
    return () => {
      offNew();
      offCount();
    };
  }, [ws, loggedIn]);

  // Dismiss on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const handleOpenToggle = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      if (next && loadedOnce) void loadPage(1);
      return next;
    });
  }, [loadedOnce, loadPage]);

  const handleRowClick = useCallback(
    async (n: PixieNotification) => {
      if (!n.isRead) {
        setItems((current) =>
          current.map((entry) =>
            entry.id === n.id ? { ...entry, isRead: true } : entry,
          ),
        );
        setUnread((c) => Math.max(0, c - 1));
        try {
          await markPixieNotificationRead(n.id);
        } catch {
          // The optimistic update stays; the count re-syncs on next open.
        }
      }
      if (n.type === "follow" && n.actor?.username) {
        setOpen(false);
        navigate(`/profile/${n.actor.username}`);
      } else if (n.videoId && n.type !== "video_removed") {
        setOpen(false);
        navigate(`/pixies/${n.videoId}`);
      }
    },
    [navigate],
  );

  const handleMarkAll = useCallback(async () => {
    setItems((current) => current.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    try {
      await markAllPixieNotificationsRead();
    } catch {
      // ignore
    }
  }, []);

  if (!loggedIn) return null;

  const badge = unread > 0 ? (unread > 99 ? "99+" : String(unread)) : null;

  return (
    <div ref={rootRef} className={`pointer-events-auto relative ${className}`}>
      <button
        type="button"
        onClick={handleOpenToggle}
        aria-label={
          badge ? `Inbox, ${unread} unread notifications` : "Inbox"
        }
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center text-white/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] transition duration-200 ease-out hover:text-white active:scale-90"
      >
        <BellIcon />
        {badge && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-pink-500 px-1 text-[10px] font-bold leading-4 text-white shadow-[0_0_8px_rgba(236,72,153,0.6)]">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 flex max-h-[70vh] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-sky-300/20 bg-blue-950/60 text-white shadow-2xl backdrop-blur-xl"
          onWheel={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-sm font-bold">Notifications</span>
            <div className="flex items-center gap-1">
              {items.some((n) => !n.isRead) && (
                <button
                  type="button"
                  onClick={() => void handleMarkAll()}
                  className="rounded-full px-2 py-1 text-xs font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            {loading && items.length === 0 ? (
              <div className="flex justify-center py-10">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-white/20 border-t-white" />
              </div>
            ) : error && items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-white/60">
                <p>Could not load notifications.</p>
                <button
                  type="button"
                  onClick={() => void loadPage(1)}
                  className="mt-2 rounded-full bg-pink-500 px-4 py-1.5 text-xs font-bold transition hover:bg-pink-600"
                >
                  Retry
                </button>
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-white/55">
                You're all caught up. Likes, comments and replies will show up
                here.
              </p>
            ) : (
              <ul>
                {items.map((n) => {
                  const { headline, quote, system } = notificationText(n);
                  const avatar = resolveAvatarUrl(n.actor?.avatar ?? null);
                  const clickable = Boolean(
                    (n.type === "follow" && n.actor?.username) ||
                      (n.videoId && n.type !== "video_removed"),
                  );
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void handleRowClick(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/5 ${
                          clickable ? "cursor-pointer" : "cursor-default"
                        } ${n.isRead ? "" : "bg-pink-500/10"}`}
                      >
                        <span className="relative mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-500/80 text-sm">
                          {system && !avatar ? (
                            <span aria-hidden="true">!</span>
                          ) : (
                            <AvatarImage src={avatar} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug text-white/90">
                            {headline}
                          </span>
                          {quote && (
                            <span className="mt-0.5 block truncate text-xs text-white/55">
                              “{quote}”
                            </span>
                          )}
                          <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wide text-white/35">
                            {formatNotificationTime(n.createdAt)}
                          </span>
                        </span>
                        {!n.isRead && (
                          <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-pink-500" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {items.length > 0 && page < totalPages && (
              <div className="px-4 py-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void loadPage(page + 1)}
                  className="w-full rounded-full bg-white/10 py-2 text-xs font-bold text-white/80 transition hover:bg-white/15 disabled:opacity-50"
                >
                  {loading ? "Loading…" : "Load older"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PixiesInbox;
