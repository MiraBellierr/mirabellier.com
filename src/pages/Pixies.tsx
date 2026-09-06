import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { useToast } from "@/states/ToastContext";
import { usePageSeo } from "@/lib/seo";
import { SITE_ORIGIN } from "@/lib/config";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import {
  deletePixie,
  deletePixieComment,
  fetchFollowingPixies,
  fetchPopularPixies,
  fetchPixieComments,
  fetchPixiesFeed,
  markPixieViewed,
  postPixieComment,
  resolveAvatarUrl,
  resolveVideoUrl,
  searchPixies,
  togglePixieCommentLike,
  togglePixieLike,
  type PopularWindow,
  type Pixie,
  type PixieComment,
} from "@/lib/pixies";
import { MentionText } from "@/parts/MentionText";
import AvatarImage from "@/parts/AvatarImage";
import VerifiedBadge from "@/parts/VerifiedBadge";
import { PixiesOnboarding } from "@/parts/PixiesOnboarding";
import PixiesInbox from "@/parts/PixiesInbox";
import { hasOnboardedPixies, readStoredInterests } from "@/lib/pixies-prefs";
import { fetchFollowState, toggleFollow } from "@/lib/user-follows";

const PRELOAD_WINDOW_AHEAD = 2;
const RENDER_WINDOW_BEFORE = 2;
const RENDER_WINDOW_AFTER = 4;
const SWIPE_THRESHOLD_PX = 60;
const WHEEL_THRESHOLD_PX = 60;
const WHEEL_COOLDOWN_MS = 650;
const FEED_BATCH_SIZE = 10;
const FEED_FETCH_AHEAD = 2;

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

// Blocks the mobile browser's long-press selection / media callout (the blue
// tint over the clip). Attached natively so it can run non-passive.
const blockNativeLongPress = (event: Event) => {
  event.preventDefault();
};

type PixieTab = "fyp" | "following" | "search" | "popular";

const PIXIE_TABS: ReadonlyArray<{
  id: PixieTab;
  label: string;
  /** Tabs flagged `authOnly` are hidden from signed-out viewers. */
  authOnly?: boolean;
}> = [
  { id: "fyp", label: "For You" },
  { id: "following", label: "Following", authOnly: true },
  { id: "search", label: "Search" },
  { id: "popular", label: "Popular" },
];

const POPULAR_WINDOW_OPTIONS: ReadonlyArray<{
  value: PopularWindow;
  label: string;
}> = [
  { value: "24h", label: "Today" },
  { value: "7d", label: "Week" },
  { value: "30d", label: "Month" },
  { value: "all", label: "All time" },
];

interface LikeState {
  liked: boolean;
  count: number;
}

const HeartIcon = ({
  filled,
  size = 30,
}: {
  filled: boolean;
  size?: number;
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const ShareIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="30"
    height="30"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const TrashIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="30"
    height="30"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const CommentIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="30"
    height="30"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const VolumeOnIcon = ({ size = 26 }: { size?: number }) => (
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
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

const VolumeOffIcon = ({ size = 26 }: { size?: number }) => (
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
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const CloseIcon = ({ size = 24 }: { size?: number }) => (
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

const PlayIcon = ({ size = 64 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="rgba(255,255,255,0.85)"
    stroke="none"
    aria-hidden="true"
  >
    <polygon points="6 3 21 12 6 21 6 3" />
  </svg>
);

const SearchIcon = ({ size = 18 }: { size?: number }) => (
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
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// ── Options-menu icons (thin line style, 20px) ──
const MenuIcon = ({ children }: { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="flex-shrink-0 text-white/85"
  >
    {children}
  </svg>
);

const SpeedIcon = () => (
  <MenuIcon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 12l4-3" />
    <path d="M12 3v2M3 12h2M12 21v-0M19 12h2" />
  </MenuIcon>
);

const EyeSlashIcon = ({ off }: { off: boolean }) => (
  <MenuIcon>
    {off ? (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </MenuIcon>
);

const DownloadIcon = () => (
  <MenuIcon>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </MenuIcon>
);

const ShareArrowIcon = () => (
  <MenuIcon>
    <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </MenuIcon>
);

const LinkIcon = () => (
  <MenuIcon>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </MenuIcon>
);

const PixieCaptionText = ({
  id,
  title,
  expanded,
  onOverflowChange,
}: {
  id: string;
  title: string;
  expanded: boolean;
  onOverflowChange: (id: string, overflows: boolean) => void;
}) => {
  const captionRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    const measure = () => {
      onOverflowChange(id, el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
  }, [id, title, expanded, onOverflowChange]);

  return (
    <p
      ref={captionRef}
      className={`text-sm leading-snug text-white/90 drop-shadow whitespace-pre-line break-words ${
        expanded ? "max-h-[40vh] overflow-y-auto pr-2" : "line-clamp-1"
      }`}
    >
      <MentionText text={title} mentionClassName="font-semibold text-pink-300 hover:underline" />
    </p>
  );
};

const Pixies = () => {
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { videoId: sharedVideoId } = useParams<{ videoId?: string }>();

  const [pixies, setPixies] = useState<Pixie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [likeOverrides, setLikeOverrides] = useState<Record<string, LikeState>>(
    {},
  );
  // Follow state keyed by author id; `followBusy` guards double-taps mid-request.
  const [followState, setFollowState] = useState<Record<string, boolean>>({});
  const [followBusy, setFollowBusy] = useState<Set<string>>(new Set());
  const [commentPanelOpen, setCommentPanelOpen] = useState(false);
  const [comments, setComments] = useState<PixieComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentCountDeltas, setCommentCountDeltas] = useState<
    Record<string, number>
  >({});
  const [commentLikeOverrides, setCommentLikeOverrides] = useState<
    Record<string, LikeState>
  >({});
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(
    new Set(),
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [overflowCaptions, setOverflowCaptions] = useState<Set<string>>(
    new Set(),
  );
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hearts, setHearts] = useState<
    Array<{ id: number; x: number; y: number }>
  >([]);
  const [shareTarget, setShareTarget] = useState<Pixie | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [tab, setTab] = useState<PixieTab>("fyp");
  const [searchInput, setSearchInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [popularWindow, setPopularWindow] = useState<PopularWindow>("7d");
  const [interests, setInterests] = useState<string[]>(() =>
    readStoredInterests(),
  );
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Which edges of the tab strip currently have hidden content to scroll to —
  // drives the edge fade so it disappears once you reach that end.
  const [tabEdges, setTabEdges] = useState({ start: false, end: false });
  // Video options menu: right-click opens it anchored at the cursor, a
  // mobile long-press opens it as a bottom sheet. Holds speed, a clear-display
  // toggle, and download / share / copy actions for the active clip.
  const [optionsMenu, setOptionsMenu] = useState<
    { mode: "anchored"; x: number; y: number } | { mode: "sheet" } | null
  >(null);
  const [speedRate, setSpeedRate] = useState(1);
  const [clearDisplay, setClearDisplay] = useState(false);

  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const speedRateRef = useRef(1);
  const contextMenuOpenRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerTypeRef = useRef<string>("mouse");
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const progressTrackRef = useRef<HTMLDivElement | null>(null);
  const scrubbingRef = useRef(false);
  const resumeAfterScrubRef = useRef(false);
  const activeIndexRef = useRef(0);
  const lastActiveIndexRef = useRef(-1);
  const commentPanelOpenRef = useRef(false);
  const shareOpenRef = useRef(false);
  const touchStartRef = useRef<{ y: number } | null>(null);
  const wheelAccumRef = useRef(0);
  const lastWheelNavRef = useRef(0);
  const lastTapRef = useRef(0);
  const tapTimeoutRef = useRef<number | null>(null);
  const heartIdRef = useRef(0);
  const audioUnlockNeededRef = useRef(false);
  const audioUnlockAtRef = useRef(0);
  const fetchingMoreRef = useRef(false);
  const forceUnmuteOnActivateRef = useRef(true);
  const mutedRef = useRef(false);
  const preplayedIndexRef = useRef(-1);
  const initializedRef = useRef(false);
  const lastSharedIdRef = useRef<string | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const showOnboardingRef = useRef(false);

  const sharePageUrl = sharedVideoId
    ? `${SITE_ORIGIN}/pixies/${sharedVideoId}`
    : `${SITE_ORIGIN}/pixies`;

  const sharedPixie = sharedVideoId
    ? (pixies.find((pixie) => pixie.id === sharedVideoId) ?? null)
    : null;

  usePageSeo({
    canonical: sharePageUrl,
    structuredDataId: "pixies-structured-data",
    structuredData: sharedPixie
      ? {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name:
            sharedPixie.title.trim() ||
            `Pixie by @${sharedPixie.author?.username ?? "someone"}`,
          description:
            sharedPixie.title.trim() ||
            "A short video clip on the Mirabellier community.",
          contentUrl: resolveVideoUrl(sharedPixie.url),
          uploadDate: sharedPixie.createdAt,
          url: sharePageUrl,
        }
      : {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Pixies",
          description: "Short videos and clips from the Mirabellier community",
          url: sharePageUrl,
        },
  });

  useEffect(() => {
    let cancelled = false;
    fetchingMoreRef.current = false;
    lastActiveIndexRef.current = -1;
    activeIndexRef.current = 0;
    setActiveIndex(0);
    setExpandedIds(new Set());
    setError(null);
    setPixies([]);
    // The delta map is an offset against the pixie objects currently in state.
    // Once we throw those away and refetch fresh `commentsCount` values from the
    // server, any accumulated deltas would double-count — reset them here.
    setCommentCountDeltas({});
    setHasMore(false);
    setLoading(true);
    if (progressBarRef.current) progressBarRef.current.style.width = "0%";

    // Force an unmuted (re)start only on first mount or when the shared-link
    // target changes — not when the viewer merely switches section tabs.
    if (!initializedRef.current || lastSharedIdRef.current !== sharedVideoId) {
      forceUnmuteOnActivateRef.current = true;
    }
    initializedRef.current = true;
    lastSharedIdRef.current = sharedVideoId;

    // Search tab with no submitted query yet: show the prompt, fetch nothing.
    if (tab === "search" && !submittedQuery) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    // Following tab needs a signed-in viewer; otherwise show the empty state.
    if (tab === "following" && !auth?.user) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const request =
      tab === "popular"
        ? fetchPopularPixies({ window: popularWindow, limit: FEED_BATCH_SIZE })
        : tab === "search"
          ? searchPixies(submittedQuery, { limit: FEED_BATCH_SIZE })
          : tab === "following"
            ? fetchFollowingPixies({ limit: FEED_BATCH_SIZE })
            : fetchPixiesFeed(sharedVideoId, {
                limit: FEED_BATCH_SIZE,
                interests,
              });

    request
      .then((data) => {
        if (cancelled) return;
        setPixies(data);
        setHasMore(data.length >= FEED_BATCH_SIZE);
        if (tab === "fyp" && sharedVideoId) {
          const index = data.findIndex((pixie) => pixie.id === sharedVideoId);
          if (index >= 0) {
            activeIndexRef.current = index;
            setActiveIndex(index);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(
          tab === "search"
            ? "Could not run that search"
            : "Could not load pixies",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sharedVideoId, tab, submittedQuery, popularWindow, interests, auth?.user]);

  // Fetch the next batch in real time once we get within 2 videos of the end.
  useEffect(() => {
    if (loading) return;
    if (!hasMore) return;
    if (pixies.length - activeIndex > FEED_FETCH_AHEAD) return;
    if (fetchingMoreRef.current) return;
    if (tab === "search" && !submittedQuery) return;
    if (tab === "following" && !auth?.user) return;
    fetchingMoreRef.current = true;
    // Offset pagination: the server slices the (deterministic within a session)
    // ordering from here instead of us shipping an ever-growing exclude list.
    // The client-side `fresh` filter below still dedupes any drift.
    const offset = pixies.length;
    const request =
      tab === "popular"
        ? fetchPopularPixies({
            window: popularWindow,
            limit: FEED_BATCH_SIZE,
            offset,
          })
        : tab === "search"
          ? searchPixies(submittedQuery, {
              limit: FEED_BATCH_SIZE,
              offset,
            })
          : tab === "following"
            ? fetchFollowingPixies({ limit: FEED_BATCH_SIZE, offset })
            : fetchPixiesFeed(sharedVideoId, {
                limit: FEED_BATCH_SIZE,
                offset,
                interests,
              });
    request
      .then((data) => {
        setHasMore(data.length >= FEED_BATCH_SIZE);
        setPixies((current) => {
          const known = new Set(current.map((pixie) => pixie.id));
          const fresh = data.filter((pixie) => !known.has(pixie.id));
          return fresh.length > 0 ? [...current, ...fresh] : current;
        });
      })
      .catch(() => {
        // Keep hasMore so the next scroll retries the fetch.
      })
      .finally(() => {
        fetchingMoreRef.current = false;
      });
  }, [
    activeIndex,
    pixies,
    hasMore,
    loading,
    tab,
    submittedQuery,
    popularWindow,
    interests,
    sharedVideoId,
    auth?.user,
  ]);

  // Mark the active pixie as watched so unwatched pixies come first in future feeds.
  const markedViewedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pixie = pixies[activeIndex];
    if (!pixie || !auth?.user) return;
    if (markedViewedRef.current.has(pixie.id)) return;
    markedViewedRef.current.add(pixie.id);
    void markPixieViewed(pixie.id);
  }, [activeIndex, pixies, auth?.user]);

  // Resolve the "am I following this creator?" flag once per author as it
  // scrolls into view, so the action-rail avatar can show the follow (+) badge.
  const fetchedFollowRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const author = pixies[activeIndex]?.author;
    if (!author?.id || !auth?.user || author.id === auth.user.id) return;
    if (fetchedFollowRef.current.has(author.id)) return;
    fetchedFollowRef.current.add(author.id);
    fetchFollowState(author.id)
      .then((state) => {
        setFollowState((current) => ({
          ...current,
          [author.id]: state.following,
        }));
      })
      .catch(() => {
        fetchedFollowRef.current.delete(author.id);
      });
  }, [activeIndex, pixies, auth?.user]);

  const handleFollow = async (pixie: Pixie) => {
    const author = pixie.author;
    if (!author?.id) return;
    if (!auth?.user) {
      navigate("/login");
      return;
    }
    if (author.id === auth.user.id || followBusy.has(author.id)) return;
    setFollowBusy((current) => new Set(current).add(author.id));
    const optimistic = !followState[author.id];
    setFollowState((current) => ({ ...current, [author.id]: optimistic }));
    try {
      const result = await toggleFollow(author.id);
      setFollowState((current) => ({
        ...current,
        [author.id]: result.following,
      }));
    } catch {
      setFollowState((current) => ({ ...current, [author.id]: !optimistic }));
      showToast("Could not update follow");
    } finally {
      setFollowBusy((current) => {
        const next = new Set(current);
        next.delete(author.id);
        return next;
      });
    }
  };

  const clampIndex = useCallback(
    (index: number) => Math.max(0, Math.min(pixies.length - 1, index)),
    [pixies.length],
  );

  const goTo = useCallback(
    (target: number) => {
      if (pixies.length === 0) return;
      // A pending single-tap (play/pause) was scheduled against the pixie we're
      // leaving — cancel it so it doesn't fire on the newly active video. Also
      // drop the tap timestamp so a tap on the old pixie can't pair with one on
      // the new pixie into a stray double-tap.
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      lastTapRef.current = 0;
      setOptionsMenu(null);
      const next = clampIndex(target);
      activeIndexRef.current = next;
      setActiveIndex(next);
      setPaused(false);
      setExpandedIds(new Set());
      if (progressBarRef.current) progressBarRef.current.style.width = "0%";
    },
    [clampIndex, pixies.length],
  );

  const goNext = useCallback(() => {
    goTo(activeIndexRef.current + 1);
  }, [goTo]);

  const goPrev = useCallback(() => {
    goTo(activeIndexRef.current - 1);
  }, [goTo]);

  // Start the newly active video synchronously inside the navigation gesture.
  // Browsers (especially iOS) only allow unmuted playback tied to a user gesture.
  const startPlayback = useCallback(
    (index: number, onBlocked?: () => void) => {
      const video = videoRefs.current[index];
      if (!video) return;
      video.playbackRate = speedRateRef.current;
      void video.play().catch((error: unknown) => {
        // The browser aborts a pending play() with AbortError when the video
        // is paused because the slide changed before playback started. That is
        // not a failure and must not touch the paused state.
        if ((error as DOMException | undefined)?.name === "AbortError") return;
        // Only apply the fallback if this video is still the active one; a late
        // rejection from a superseded slide must not stale out the controls.
        if (videoRefs.current[activeIndexRef.current] !== video) return;
        onBlocked?.();
      });
    },
    [],
  );

  const playActiveImmediately = useCallback(() => {
    const index = activeIndexRef.current;
    if (lastActiveIndexRef.current === index) return;
    const video = videoRefs.current[index];
    if (!video) return;
    videoRefs.current.forEach((entry, entryIndex) => {
      if (entryIndex !== index && entry) entry.pause();
    });
    video.currentTime = 0;
    video.muted = mutedRef.current;
    preplayedIndexRef.current = index;
    startPlayback(index, () => {
      audioUnlockNeededRef.current = true;
      setPaused(true);
    });
  }, [startPlayback]);

  // Keep mutedRef in sync so gesture handlers never read a stale mute state.
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // `muted` is owned imperatively. React only syncs the `<video muted>` prop on
  // mount, not on later prop changes, which is why the gesture code sets
  // `.muted` by hand — keeping the prop too made the two models fight. The prop
  // is dropped; instead every mounted <video> is (re)synced here whenever the
  // mute state changes or new videos mount.
  useEffect(() => {
    for (const video of videoRefs.current) {
      if (video) video.muted = muted;
    }
  }, [muted, pixies]);

  // Kill the iOS/Android long-press blue tint on the <video> itself: block the
  // gestures that start it (touchstart, selectstart, contextmenu) with native
  // non-passive listeners. CSS `user-select`/`touch-callout` alone doesn't
  // fully suppress it on media elements. Each <video> is guarded once.
  const longPressGuardedRef = useRef<WeakSet<HTMLVideoElement>>(new WeakSet());
  useEffect(() => {
    for (const video of videoRefs.current) {
      if (!video || longPressGuardedRef.current.has(video)) continue;
      longPressGuardedRef.current.add(video);
      video.addEventListener("touchstart", blockNativeLongPress, {
        passive: false,
      });
      video.addEventListener("selectstart", blockNativeLongPress);
      video.addEventListener("contextmenu", blockNativeLongPress);
    }
  }, [pixies, activeIndex]);

  // Playback speed is applied the same imperative way as mute: keep a ref for
  // gesture handlers, and (re)sync every mounted <video> when the rate changes
  // or new slides mount.
  useEffect(() => {
    speedRateRef.current = speedRate;
    for (const video of videoRefs.current) {
      if (video) video.playbackRate = speedRate;
    }
  }, [speedRate, pixies]);

  useEffect(() => {
    contextMenuOpenRef.current = optionsMenu !== null;
  }, [optionsMenu]);

  // The pixie viewer owns the whole screen and uses vertical drags to navigate.
  // Freeze the document scroll and disable vertical overscroll while it's open
  // so a downward swipe at the top of the feed can't trigger the mobile
  // browser's pull-to-refresh (or rubber-band the page behind the overlay).
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    const prev = {
      htmlOverscroll: html.style.overscrollBehaviorY,
      bodyOverscroll: body.style.overscrollBehaviorY,
      bodyOverflow: body.style.overflow,
    };
    html.style.overscrollBehaviorY = "contain";
    body.style.overscrollBehaviorY = "contain";
    body.style.overflow = "hidden";
    return () => {
      html.style.overscrollBehaviorY = prev.htmlOverscroll;
      body.style.overscrollBehaviorY = prev.bodyOverscroll;
      body.style.overflow = prev.bodyOverflow;
    };
  }, []);

  // The viewer is a full-screen dark surface — force dark mode while it's open
  // (so `dark:` styles in the onboarding / shared parts resolve dark) and
  // restore the viewer's real theme preference on exit.
  useEffect(() => {
    const root = document.documentElement;
    const addedDark = !root.classList.contains("dark");
    if (addedDark) root.classList.add("dark");
    root.style.colorScheme = "dark";
    return () => {
      if (addedDark) root.classList.remove("dark");
      root.style.colorScheme = "";
    };
  }, []);

  // Keep playback in sync with the active slide
  useEffect(() => {
    const activeChanged = lastActiveIndexRef.current !== activeIndex;
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index === activeIndex) {
        if (activeChanged) {
          // Every navigation (up or down) starts the video from the beginning,
          // unless playback already started synchronously in the gesture.
          if (preplayedIndexRef.current !== index) {
            video.currentTime = 0;
          }
          if (forceUnmuteOnActivateRef.current) {
            // Page entry or a shared pixie link: unmute first, then play.
            forceUnmuteOnActivateRef.current = false;
            video.pause();
            video.muted = false;
            setMuted(false);
          } else {
            video.muted = muted;
          }
        } else {
          video.muted = muted;
        }
        startPlayback(index, () => {
          audioUnlockNeededRef.current = true;
          setPaused(true);
        });
      } else {
        video.pause();
        if (
          index > activeIndex + PRELOAD_WINDOW_AHEAD ||
          index < activeIndex - PRELOAD_WINDOW_AHEAD
        ) {
          video.currentTime = 0;
        }
      }
    });
    lastActiveIndexRef.current = activeIndex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, pixies]);

  // Start playback with sound as soon as the user interacts with the page,
  // unless they used the mute toggle themselves.
  useEffect(() => {
    const unlockAudio = (event: Event) => {
      if (!audioUnlockNeededRef.current) return;
      if (
        (event.target as HTMLElement | null)?.closest?.(
          "[data-mute-toggle]",
        )
      ) {
        audioUnlockNeededRef.current = false;
        return;
      }
      audioUnlockNeededRef.current = false;
      audioUnlockAtRef.current = Date.now();
      const video = videoRefs.current[activeIndexRef.current];
      if (video) {
        video.muted = false;
        startPlayback(activeIndexRef.current);
      }
      setMuted(false);
      setPaused(false);
    };
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("wheel", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("wheel", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (showOnboardingRef.current) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (contextMenuOpenRef.current) {
        if (event.key === "Escape") setOptionsMenu(null);
        return;
      }
      if (shareOpenRef.current) {
        if (event.key === "Escape") {
          closeShare();
        }
        return;
      }
      if (commentPanelOpenRef.current) {
        if (event.key === "Escape") {
          closeComments();
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        goNext();
        playActiveImmediately();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        goPrev();
        playActiveImmediately();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goNext, goPrev, playActiveImmediately]);

  // Wheel navigation (native listener so we can preventDefault)
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (contextMenuOpenRef.current) {
        setOptionsMenu(null);
        return;
      }
      if (commentPanelOpenRef.current) return;
      if (shareOpenRef.current) return;
      if (pixies.length <= 1) return;
      if (event.ctrlKey) return;
      if (
        (event.target as HTMLElement | null)?.closest?.(
          "[data-scrollable-caption]",
        )
      ) {
        return;
      }
      event.preventDefault();
      const now = Date.now();
      if (now - lastWheelNavRef.current < WHEEL_COOLDOWN_MS) {
        // Still cooling down from the last nav — drop these deltas instead of
        // letting trailing trackpad momentum pile up and instantly trip a
        // second navigation the moment the cooldown ends.
        wheelAccumRef.current = 0;
        return;
      }
      wheelAccumRef.current += event.deltaY;
      if (Math.abs(wheelAccumRef.current) < WHEEL_THRESHOLD_PX) return;
      if (wheelAccumRef.current > 0) {
        goNext();
      } else {
        goPrev();
      }
      playActiveImmediately();
      wheelAccumRef.current = 0;
      lastWheelNavRef.current = now;
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [pixies.length, goNext, goPrev, playActiveImmediately]);

  const handleTouchStart = (event: React.TouchEvent) => {
    if (contextMenuOpenRef.current) return;
    if (commentPanelOpenRef.current) return;
    if (shareOpenRef.current) return;
    if (scrubbingRef.current) return;
    if (
      (event.target as HTMLElement | null)?.closest?.(
        "[data-scrollable-caption], [data-progress-bar]",
      )
    ) {
      return;
    }
    touchStartRef.current = { y: event.touches[0].clientY };
    setIsDragging(true);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (
      contextMenuOpenRef.current ||
      commentPanelOpenRef.current ||
      shareOpenRef.current ||
      !touchStartRef.current
    ) {
      return;
    }
    const offset = event.touches[0].clientY - touchStartRef.current.y;
    setDragOffset(offset);
  };

  const handleTouchEnd = () => {
    if (
      contextMenuOpenRef.current ||
      commentPanelOpenRef.current ||
      shareOpenRef.current
    ) {
      return;
    }
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) {
      setIsDragging(false);
      return;
    }

    if (Math.abs(dragOffset) < SWIPE_THRESHOLD_PX) {
      setDragOffset(0);
      setIsDragging(false);
      return;
    }

    if (dragOffset < 0) {
      goTo(activeIndexRef.current + 1);
    } else {
      goTo(activeIndexRef.current - 1);
    }
    playActiveImmediately();
    setDragOffset(0);
    setIsDragging(false);
  };

  const togglePlayPause = () => {
    const video = videoRefs.current[activeIndexRef.current];
    if (!video) return;
    // Ignore the click that just unlocked audio playback.
    if (Date.now() - audioUnlockAtRef.current < 600) {
      audioUnlockAtRef.current = 0;
      return;
    }
    if (video.paused) {
      startPlayback(activeIndexRef.current, () => setPaused(true));
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
  };

  // ── Scrub bar: drag the bottom progress bar to seek ──────────────────────
  const seekToClientX = (clientX: number) => {
    const track = progressTrackRef.current;
    const video = videoRefs.current[activeIndexRef.current];
    if (!track || !video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width),
    );
    video.currentTime = fraction * duration;
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${fraction * 100}%`;
    }
  };

  const handleScrubStart = (event: React.PointerEvent<HTMLDivElement>) => {
    const video = videoRefs.current[activeIndexRef.current];
    if (!video || !video.duration) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; move/up still work without it.
    }
    scrubbingRef.current = true;
    resumeAfterScrubRef.current = !video.paused;
    video.pause();
    setIsScrubbing(true);
    seekToClientX(event.clientX);
  };

  const handleScrubMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    seekToClientX(event.clientX);
  };

  const handleScrubEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    setIsScrubbing(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
    if (resumeAfterScrubRef.current) {
      resumeAfterScrubRef.current = false;
      startPlayback(activeIndexRef.current, () => setPaused(true));
      setPaused(false);
    }
  };

  // ── Right-click / long-press options menu ────────────────────────────────
  const openAnchoredMenu = (clientX: number, clientY: number) => {
    const MENU_W = 300;
    const MENU_H = 320;
    setOptionsMenu({
      mode: "anchored",
      x: Math.max(8, Math.min(clientX, window.innerWidth - MENU_W - 8)),
      y: Math.max(8, Math.min(clientY, window.innerHeight - MENU_H - 8)),
    });
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  };

  const handleVideoContextMenu = (event: React.MouseEvent<HTMLVideoElement>) => {
    // Always suppress the browser's native long-press / right-click menu,
    // image-save popup, and text selection on the video.
    event.preventDefault();
    // Android fires `contextmenu` on a long press too — keep that as the
    // bottom sheet, not the desktop-style anchored popover.
    if (lastPointerTypeRef.current === "touch") {
      clearLongPress();
      longPressFiredRef.current = true;
      setOptionsMenu({ mode: "sheet" });
      return;
    }
    openAnchoredMenu(event.clientX, event.clientY);
  };

  const handleVideoPointerDown = (
    event: React.PointerEvent<HTMLVideoElement>,
  ) => {
    lastPointerTypeRef.current = event.pointerType;
    // Mouse right-click is covered by onContextMenu; only arm the timer for
    // touch / pen so a long press opens the menu on mobile.
    if (event.pointerType === "mouse") return;
    longPressFiredRef.current = false;
    clearLongPress();
    longPressStartRef.current = { x: event.clientX, y: event.clientY };
    const pointerType = event.pointerType;
    const startX = event.clientX;
    const startY = event.clientY;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      // Drop any text selection the long press started before the menu opens.
      try {
        window.getSelection()?.removeAllRanges();
      } catch {
        // no-op
      }
      // Touch → slide-up sheet (like the comments panel); pen → anchored.
      if (pointerType === "touch") {
        setOptionsMenu({ mode: "sheet" });
      } else {
        openAnchoredMenu(
          longPressStartRef.current?.x ?? startX,
          longPressStartRef.current?.y ?? startY,
        );
      }
    }, 480);
  };

  const handleVideoPointerMove = (
    event: React.PointerEvent<HTMLVideoElement>,
  ) => {
    const start = longPressStartRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Moved too far — this is a swipe/scrub, not a long press.
    if (dx * dx + dy * dy > 100) clearLongPress();
  };

  const handleTap = (
    event: React.PointerEvent<HTMLVideoElement>,
  ) => {
    // Right-click / middle-click: leave playback alone, that's the options menu.
    if (event.button !== 0) return;
    clearLongPress();
    // The long-press menu already opened on this gesture — swallow the tap.
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (contextMenuOpenRef.current) {
      setOptionsMenu(null);
      return;
    }
    // In clear-display mode the first tap just brings the overlays back.
    if (clearDisplay) {
      setClearDisplay(false);
      return;
    }
    const now = Date.now();
    const delta = now - lastTapRef.current;

    if (delta > 0 && delta < 300) {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      // Double tap — like (never unlike)
      const pixie = pixies[activeIndex];
      if (pixie) {
        if (!likeStateFor(pixie).liked) {
          handleLike(pixie);
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        // Monotonic id, not Date.now(): two double-taps in the same ms would
        // otherwise share a React key and one heart never animates out.
        const id = (heartIdRef.current += 1);
        setHearts((current) => [...current, { id, x, y }]);
        setTimeout(() => {
          setHearts((current) => current.filter((h) => h.id !== id));
          // Matches the `floatUp 0.8s` CSS animation below.
        }, 800);
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      tapTimeoutRef.current = window.setTimeout(() => {
        tapTimeoutRef.current = null;
        // Skip the tap that just unlocked audio so it doesn't pause the video.
        if (now - audioUnlockAtRef.current < 600) {
          audioUnlockAtRef.current = 0;
          return;
        }
        // Single tap — toggle play/pause
        togglePlayPause();
      }, 300);
    }
  };

  const handleTimeUpdate = (
    event: React.SyntheticEvent<HTMLVideoElement>,
  ) => {
    // While the user is dragging the scrub bar, its handlers own the width.
    if (scrubbingRef.current) return;
    const video = event.currentTarget;
    if (video.duration && progressBarRef.current) {
      progressBarRef.current.style.width = `${(video.currentTime / video.duration) * 100}%`;
    }
  };

  const handleToggleMute = () => {
    // Use the ref, not the state index — every other gesture handler does, so
    // the mute toggle and its playback-blocked fallback act on the same video
    // even if an `activeIndex` state update is still pending.
    const video = videoRefs.current[activeIndexRef.current];
    const next = !muted;
    audioUnlockNeededRef.current = false;
    if (video) {
      video.muted = next;
      if (!next) {
        startPlayback(activeIndexRef.current, () => {
          video.muted = true;
          setMuted(true);
        });
      }
    }
    setMuted(next);
  };

  const handleLike = async (pixie: Pixie) => {
    if (!auth?.user) {
      navigate("/login");
      return;
    }
    const previous = likeStateFor(pixie);
    const optimistic: LikeState = {
      liked: !previous.liked,
      count: previous.count + (previous.liked ? -1 : 1),
    };
    setLikeOverrides((current) => ({ ...current, [pixie.id]: optimistic }));
    try {
      const result = await togglePixieLike(pixie.id);
      setLikeOverrides((current) => ({
        ...current,
        [pixie.id]: { liked: result.liked, count: result.likesCount },
      }));
    } catch {
      setLikeOverrides((current) => ({ ...current, [pixie.id]: previous }));
      showToast("Could not update like");
    }
  };

  const shareUrlFor = (pixie: Pixie) => `${SITE_ORIGIN}/pixies/${pixie.id}`;

  const closeShare = useCallback(() => {
    shareOpenRef.current = false;
    setShareTarget(null);
  }, []);

  const handleShare = (pixie: Pixie) => {
    shareOpenRef.current = true;
    setShareTarget(pixie);
  };

  const copyShareLink = async () => {
    if (!shareTarget) return;
    try {
      await navigator.clipboard.writeText(shareUrlFor(shareTarget));
      showToast("Pixie link copied to clipboard!");
    } catch {
      showToast("Failed to copy link");
    }
  };

  const copyPixieLink = async (pixie: Pixie) => {
    try {
      await navigator.clipboard.writeText(shareUrlFor(pixie));
      showToast("Pixie link copied to clipboard!");
    } catch {
      showToast("Failed to copy link");
    }
  };

  const openComments = async (pixie: Pixie) => {
    if (!auth?.user) {
      navigate("/login");
      return;
    }
    setCommentPanelOpen(true);
    commentPanelOpenRef.current = true;
    setCommentsLoading(true);
    setComments([]);
    setCommentLikeOverrides({});
    setReplyingTo(null);
    setExpandedThreads(new Set());
    try {
      const loaded = await fetchPixieComments(pixie.id);
      if (commentPanelOpenRef.current) setComments(loaded);
    } catch {
      showToast("Could not load comments");
    } finally {
      setCommentsLoading(false);
    }
  };

  const closeComments = useCallback(() => {
    setCommentPanelOpen(false);
    commentPanelOpenRef.current = false;
    setComments([]);
    setCommentText("");
    setCommentLikeOverrides({});
    setReplyingTo(null);
    setExpandedThreads(new Set());
  }, []);

  const handleSubmitComment = async (pixie: Pixie) => {
    const content = commentText.trim();
    if (!content || commentSubmitting) return;
    const parentId = replyingTo?.id ?? null;
    setCommentSubmitting(true);
    try {
      const comment = await postPixieComment(pixie.id, content, parentId);
      setComments((current) =>
        comment.parentId
          ? [...current, comment]
          : [comment, ...current],
      );
      setCommentCountDeltas((current) => ({
        ...current,
        [pixie.id]: (current[pixie.id] ?? 0) + 1,
      }));
      if (comment.parentId) {
        setExpandedThreads((current) => {
          const next = new Set(current);
          next.add(comment.parentId as string);
          return next;
        });
      }
      setCommentText("");
      setReplyingTo(null);
    } catch {
      showToast("Could not post comment");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const commentLikeStateFor = (comment: PixieComment): LikeState =>
    commentLikeOverrides[comment.id] ?? {
      liked: comment.likedByMe,
      count: comment.likesCount,
    };

  const handleToggleCommentLike = async (pixie: Pixie, comment: PixieComment) => {
    if (!auth?.user) {
      navigate("/login");
      return;
    }
    const previous = commentLikeStateFor(comment);
    const optimistic: LikeState = {
      liked: !previous.liked,
      count: previous.count + (previous.liked ? -1 : 1),
    };
    setCommentLikeOverrides((current) => ({
      ...current,
      [comment.id]: optimistic,
    }));
    try {
      const result = await togglePixieCommentLike(pixie.id, comment.id);
      setCommentLikeOverrides((current) => ({
        ...current,
        [comment.id]: { liked: result.liked, count: result.likesCount },
      }));
    } catch {
      setCommentLikeOverrides((current) => ({
        ...current,
        [comment.id]: previous,
      }));
      showToast("Could not update like");
    }
  };

  const startReply = (rootId: string, username: string) => {
    if (!auth?.user) {
      navigate("/login");
      return;
    }
    setReplyingTo({ id: rootId, username });
    setExpandedThreads((current) => {
      const next = new Set(current);
      next.add(rootId);
      return next;
    });
    setCommentText((current) => {
      const mention = `@${username} `;
      return current.startsWith(mention) ? current : mention;
    });
    window.setTimeout(() => commentInputRef.current?.focus(), 30);
  };

  const toggleThread = (rootId: string) => {
    setExpandedThreads((current) => {
      const next = new Set(current);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };

  const renderCommentRow = (
    pixie: Pixie,
    comment: PixieComment,
    { isReply }: { isReply: boolean },
  ) => {
    const commentAvatar = resolveAvatarUrl(comment.author?.avatar);
    const username = comment.author?.username ?? "unknown";
    const canDelete =
      auth?.user?.id === comment.author?.id ||
      auth?.user?.id === pixie.author?.id ||
      canAccessAdminPanel(auth?.user);
    const likeState = commentLikeStateFor(comment);
    const rootId = comment.parentId ?? comment.id;
    return (
      <div key={comment.id} className={`flex gap-3 ${isReply ? "mt-3" : ""}`}>
        <Link
          to={`/profile/${comment.author?.username ?? ""}`}
          className={`mt-0.5 flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-500 ${
            isReply ? "h-7 w-7" : "h-9 w-9"
          }`}
        >
          <AvatarImage src={commentAvatar} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <Link
              to={`/profile/${comment.author?.username ?? ""}`}
              className="font-bold hover:underline"
            >
              {username}
            </Link>
            {comment.author?.verified && (
              <VerifiedBadge className="ml-1" size={12} />
            )}
            <span className="ml-2 text-xs text-white/50">
              {new Date(comment.createdAt).toLocaleDateString()}
            </span>
          </p>
          <p className="mt-0.5 break-words text-sm text-white/90">
            <MentionText text={comment.content} />
          </p>
          <div className="mt-1 flex items-center gap-4 text-xs font-semibold text-white/50">
            <button
              type="button"
              onClick={() => void handleToggleCommentLike(pixie, comment)}
              aria-label={likeState.liked ? "Unlike comment" : "Like comment"}
              className={`flex items-center gap-1 transition hover:text-white ${
                likeState.liked ? "text-pink-500" : ""
              }`}
            >
              <HeartIcon filled={likeState.liked} size={14} />
              {likeState.count > 0 && <span>{likeState.count}</span>}
            </button>
            <button
              type="button"
              onClick={() => startReply(rootId, username)}
              className="transition hover:text-white"
            >
              Reply
            </button>
          </div>
        </div>
        {canDelete && (
          <button
            onClick={() => void handleDeleteComment(pixie, comment.id)}
            aria-label="Delete comment"
            className="flex-shrink-0 self-start rounded-full px-2 py-1 text-xs font-bold text-white/40 transition hover:bg-red-600 hover:text-white"
            type="button"
          >
            ✕
          </button>
        )}
      </div>
    );
  };

  const handleDeletePixie = async (pixie: Pixie) => {
    try {
      await deletePixie(pixie.id);
      const removedIndex = pixies.findIndex((entry) => entry.id === pixie.id);
      const next = pixies.filter((entry) => entry.id !== pixie.id);
      // Keep videoRefs index-aligned with `pixies`: drop the removed slot and
      // trim any trailing stragglers so stale <video> elements can't be read.
      if (removedIndex >= 0) videoRefs.current.splice(removedIndex, 1);
      videoRefs.current.length = next.length;
      if (next.length === 0) {
        activeIndexRef.current = 0;
      } else if (activeIndexRef.current >= next.length) {
        activeIndexRef.current = next.length - 1;
      }
      setActiveIndex(activeIndexRef.current);
      setPixies(next);
      showToast("Video deleted");
    } catch {
      showToast("Could not delete video");
    }
  };

  const handleDeleteComment = async (pixie: Pixie, commentId: string) => {
    const target = comments.find((comment) => comment.id === commentId);
    const removedIds = new Set<string>([commentId]);
    if (target && !target.parentId) {
      for (const comment of comments) {
        if (comment.parentId === commentId) removedIds.add(comment.id);
      }
    }
    try {
      await deletePixieComment(pixie.id, commentId);
      setComments((current) =>
        current.filter((comment) => !removedIds.has(comment.id)),
      );
      setCommentCountDeltas((current) => ({
        ...current,
        [pixie.id]: (current[pixie.id] ?? 0) - removedIds.size,
      }));
    } catch {
      showToast("Could not delete comment");
    }
  };

  const commentCountFor = (pixie: Pixie) =>
    pixie.commentsCount + (commentCountDeltas[pixie.id] ?? 0);

  // Split the flat comment list into top-level comments (newest first) and
  // their replies (oldest first), TikTok-style.
  const { topComments, repliesByParent } = useMemo(() => {
    const top: PixieComment[] = [];
    const byParent = new Map<string, PixieComment[]>();
    for (const comment of comments) {
      if (comment.parentId) {
        const bucket = byParent.get(comment.parentId) ?? [];
        bucket.push(comment);
        byParent.set(comment.parentId, bucket);
      } else {
        top.push(comment);
      }
    }
    top.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    for (const bucket of byParent.values()) {
      bucket.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    }
    return { topComments: top, repliesByParent: byParent };
  }, [comments]);

  const visibleIndexes = useMemo(() => {
    if (pixies.length === 0) return [];
    const start = Math.max(0, activeIndex - RENDER_WINDOW_BEFORE);
    const end = Math.min(pixies.length - 1, activeIndex + RENDER_WINDOW_AFTER);
    const indexes: number[] = [];
    for (let index = start; index <= end; index += 1) {
      indexes.push(index);
    }
    return indexes;
  }, [activeIndex, pixies.length]);

  const likeStateFor = (pixie: Pixie): LikeState =>
    likeOverrides[pixie.id] ?? {
      liked: pixie.likedByMe,
      count: pixie.likesCount,
    };

  const preloadFor = (index: number) => {
    const distance = index - activeIndex;
    return distance >= 0 && distance <= PRELOAD_WINDOW_AHEAD
      ? "auto"
      : "metadata";
  };

  const isExpanded = (id: string) => expandedIds.has(id);

  const toggleExpand = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCaptionOverflow = useCallback(
    (id: string, overflows: boolean) => {
      setOverflowCaptions((current) => {
        const has = current.has(id);
        if (has === overflows) return current;
        const next = new Set(current);
        if (overflows) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [],
  );

  const selectTab = useCallback((next: PixieTab) => {
    setTab((prev) => (prev === next ? prev : next));
  }, []);

  // Signing out while on the "Following" tab drops the viewer back to For You.
  useEffect(() => {
    if (tab === "following" && !auth?.user) setTab("fyp");
  }, [tab, auth?.user]);

  // Recompute which edges of the tab strip still have off-screen content.
  const recomputeTabEdges = useCallback(() => {
    const el = tabStripRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft < maxScroll - 1;
    setTabEdges((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );
  }, []);

  useEffect(() => {
    recomputeTabEdges();
    const el = tabStripRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(recomputeTabEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [recomputeTabEdges, auth?.user, tab]);

  // Fade only the edge(s) that still have tabs scrolled out of view.
  const tabStripMask = `linear-gradient(to right, ${
    tabEdges.start ? "transparent" : "#000"
  }, #000 1.25rem, #000 calc(100% - 1.25rem), ${
    tabEdges.end ? "transparent" : "#000"
  })`;

  // Shared body for the video options menu — rendered inside the anchored
  // popover (right-click) or the bottom sheet (long-press).
  const menuPixie = pixies[activeIndex] ?? null;
  const optionsMenuBody = menuPixie ? (
    <div className="py-1.5">
      {/* Speed */}
      <div className="flex items-center gap-3.5 px-4 py-2.5">
        <SpeedIcon />
        <span className="text-[15px] font-semibold text-white">Speed</span>
        <div className="ml-auto flex items-center gap-0.5 rounded-full bg-white/10 p-0.5">
          {SPEED_OPTIONS.map((rate) => (
            <button
              key={rate}
              type="button"
              aria-pressed={speedRate === rate}
              onClick={() => setSpeedRate(rate)}
              className={`min-w-[2.25rem] rounded-full px-1.5 py-1 text-xs font-bold transition ${
                speedRate === rate
                  ? "bg-white text-neutral-900"
                  : "text-white/70 hover:text-white"
              }`}
            >
              {Number.isInteger(rate) ? rate.toFixed(1) : String(rate)}
            </button>
          ))}
        </div>
      </div>

      {/* Clear display */}
      <button
        type="button"
        onClick={() => setClearDisplay((value) => !value)}
        className="flex w-full items-center gap-3.5 px-4 py-2.5 text-left transition hover:bg-white/5"
      >
        <EyeSlashIcon off={clearDisplay} />
        <span className="text-[15px] font-semibold text-white">
          Clear display
        </span>
        <span
          className={`ml-auto flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition ${
            clearDisplay ? "bg-pink-500" : "bg-white/20"
          }`}
        >
          <span
            className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
              clearDisplay ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </span>
      </button>

      <div className="my-1.5 h-px bg-white/10" />

      {/* Download */}
      <a
        href={resolveVideoUrl(menuPixie.url)}
        download
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setOptionsMenu(null)}
        className="flex w-full items-center gap-3.5 px-4 py-2.5 text-left transition hover:bg-white/5"
      >
        <DownloadIcon />
        <span className="text-[15px] font-semibold text-white">
          Download video
        </span>
      </a>

      {/* Share */}
      <button
        type="button"
        onClick={() => {
          setOptionsMenu(null);
          handleShare(menuPixie);
        }}
        className="flex w-full items-center gap-3.5 px-4 py-2.5 text-left transition hover:bg-white/5"
      >
        <ShareArrowIcon />
        <span className="text-[15px] font-semibold text-white">Share</span>
      </button>

      {/* Copy link */}
      <button
        type="button"
        onClick={() => {
          setOptionsMenu(null);
          void copyPixieLink(menuPixie);
        }}
        className="flex w-full items-center gap-3.5 px-4 py-2.5 text-left transition hover:bg-white/5"
      >
        <LinkIcon />
        <span className="text-[15px] font-semibold text-white">Copy link</span>
      </button>
    </div>
  ) : null;

  // Focus the search field when the viewer opens the Search tab.
  useEffect(() => {
    if (tab !== "search") return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [tab]);

  // First run: show the onboarding modal (unless the viewer arrived via a
  // shared link — that should drop straight into the clip).
  useEffect(() => {
    if (sharedVideoId) return;
    if (!hasOnboardedPixies()) setShowOnboarding(true);
  }, [sharedVideoId]);

  // Hold playback while onboarding is open (re-run when the video set
  // populates so a freshly mounted clip doesn't start behind the modal).
  useEffect(() => {
    showOnboardingRef.current = showOnboarding;
    if (!showOnboarding) return;
    videoRefs.current[activeIndexRef.current]?.pause();
    setPaused(true);
  }, [showOnboarding, pixies, loading]);

  const handleOnboardingDone = useCallback(
    (chosen: string[]) => {
      setShowOnboarding(false);
      setInterests((current) => {
        const same =
          current.length === chosen.length &&
          current.every((tag, index) => tag === chosen[index]);
        return same ? current : chosen;
      });
      setPaused(false);
      startPlayback(activeIndexRef.current, () => setPaused(true));
    },
    [startPlayback],
  );

  return (
    <>
      <style>{`
        @keyframes floatUp {
          0% { transform: scale(0.5); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.85; }
          100% { transform: scale(1.8) translateY(-40px); opacity: 0; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        /* Full-screen media viewer: no tap highlight, no long-press callout,
           and no selection tint anywhere except the text fields. */
        .pixies-root,
        .pixies-root * {
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
        }
        .pixies-root *:not(input):not(textarea) {
          -webkit-user-select: none;
          user-select: none;
        }
        .pixies-root ::selection {
          background-color: transparent;
        }
        .pixies-root ::-moz-selection {
          background-color: transparent;
        }
        .pixies-root input,
        .pixies-root textarea {
          -webkit-user-select: text;
          user-select: text;
        }
        .pixies-root input::selection,
        .pixies-root textarea::selection {
          background-color: rgba(236, 72, 153, 0.45);
        }
        .pixies-root input::-moz-selection,
        .pixies-root textarea::-moz-selection {
          background-color: rgba(236, 72, 153, 0.45);
        }
      `}</style>
      <div
        className="pixies-root fixed inset-0 z-40 overflow-hidden overscroll-none select-none bg-black text-white [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(event) => event.preventDefault()}
      >
      {/* Top bar — hidden while "clear display" is on */}
      {!clearDisplay && (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 bg-gradient-to-b from-black/80 via-black/45 to-transparent px-4 pb-12 pt-4">
        {/* Section tabs: close · For You / Search / Popular · Upload */}
        <div
          aria-label="Pixies sections"
          className="pointer-events-auto flex items-center gap-2"
        >
          <Link
            to="/"
            aria-label="Close pixies"
            className="group flex h-9 w-9 flex-shrink-0 items-center justify-center text-white/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] transition duration-200 ease-out hover:text-white active:scale-90"
          >
            <span className="transition-transform duration-300 ease-out group-hover:rotate-90">
              <CloseIcon size={18} />
            </span>
          </Link>
          {/* Its own flex track between the close and inbox buttons: the tabs
              scroll horizontally inside it and never overlap either button. */}
          <div
            ref={tabStripRef}
            onScroll={recomputeTabEdges}
            style={{
              maskImage: tabStripMask,
              WebkitMaskImage: tabStripMask,
            }}
            className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onTouchStart={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
          >
            <div className="mx-auto flex w-max items-center gap-6 px-2">
              {PIXIE_TABS.filter(
                (entry) => !entry.authOnly || Boolean(auth?.user),
              ).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={tab === entry.id}
                  onClick={() => selectTab(entry.id)}
                  className={`relative flex-shrink-0 whitespace-nowrap pb-2 text-sm font-bold tracking-wide transition ${
                    tab === entry.id
                      ? "text-white"
                      : "text-white/55 hover:text-white/85"
                  }`}
                >
                  {entry.label}
                  {tab === entry.id && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 mx-auto h-[3px] w-8 rounded-full bg-pink-500 shadow-[0_0_10px_2px_rgba(236,72,153,0.55)]"
                    />
                  )}
                </button>
              ))}
              <Link
                to={auth?.user ? "/pixies/upload" : "/login"}
                className="relative flex-shrink-0 whitespace-nowrap pb-2 text-sm font-bold tracking-wide text-white/55 transition hover:text-white/85"
              >
                Upload
              </Link>
            </div>
          </div>
          <PixiesInbox className="flex-shrink-0" />
        </div>

        {/* Search field (Search tab only) */}
        {tab === "search" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSubmittedQuery(searchInput.trim());
              searchInputRef.current?.blur();
            }}
            className="pointer-events-auto mx-auto flex w-full max-w-md items-center gap-2 rounded-full bg-white/15 px-4 py-2 backdrop-blur-sm"
          >
            <span className="flex-shrink-0 text-white/60">
              <SearchIcon />
            </span>
            <input
              ref={searchInputRef}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search caption, #tag or @user"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/45 outline-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSubmittedQuery("");
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="flex-shrink-0 text-white/60 transition hover:text-white"
              >
                <CloseIcon />
              </button>
            )}
          </form>
        )}

        {/* Trend window (Popular tab only) */}
        {tab === "popular" && (
          <div className="pointer-events-auto mx-auto flex items-center gap-1 rounded-full bg-white/10 p-1 backdrop-blur-sm">
            {POPULAR_WINDOW_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={popularWindow === option.value}
                onClick={() => setPopularWindow(option.value)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  popularWindow === option.value
                    ? "bg-pink-500 text-white"
                    : "text-white/75 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {loading ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        </div>
      ) : error ? (
        <div className="flex h-full items-center justify-center p-6">
          <div className="rounded-2xl bg-white/10 p-8 text-center">
            <p className="mb-4 text-lg font-bold">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-full bg-pink-500 px-6 py-2 font-bold transition hover:bg-pink-600"
              type="button"
            >
              Retry
            </button>
          </div>
        </div>
      ) : pixies.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-xs rounded-2xl bg-white/10 p-8 text-center">
            {tab === "search" ? (
              !submittedQuery ? (
                <>
                  <div className="mb-3 text-5xl">🔎</div>
                  <h2 className="mb-2 text-xl font-bold">Search pixies</h2>
                  <p className="text-sm text-white/70">
                    Find clips by caption, #tag, or @username.
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-3 text-5xl">🙈</div>
                  <h2 className="mb-2 text-xl font-bold">No matches</h2>
                  <p className="text-sm text-white/70">
                    Nothing found for “{submittedQuery}”.
                  </p>
                </>
              )
            ) : tab === "following" ? (
              !auth?.user ? (
                <>
                  <div className="mb-3 text-5xl">👤</div>
                  <h2 className="mb-2 text-xl font-bold">Following</h2>
                  <p className="mb-5 text-sm text-white/70">
                    Log in to see clips from the creators you follow.
                  </p>
                  <Link
                    to="/login"
                    className="inline-block rounded-full bg-pink-500 px-6 py-2 font-bold transition hover:bg-pink-600"
                  >
                    Login
                  </Link>
                </>
              ) : (
                <>
                  <div className="mb-3 text-5xl">🫂</div>
                  <h2 className="mb-2 text-xl font-bold">
                    Nothing from your follows yet
                  </h2>
                  <p className="mb-5 text-sm text-white/70">
                    Follow creators and their newest clips will land here.
                  </p>
                  <button
                    type="button"
                    onClick={() => selectTab("fyp")}
                    className="inline-block rounded-full bg-pink-500 px-6 py-2 font-bold transition hover:bg-pink-600"
                  >
                    Browse For You
                  </button>
                </>
              )
            ) : tab === "popular" ? (
              <>
                <div className="mb-3 text-5xl">📈</div>
                <h2 className="mb-2 text-xl font-bold">Nothing trending yet</h2>
                <p className="text-sm text-white/70">
                  No pixies in this window. Try a longer range.
                </p>
              </>
            ) : (
              <>
                <div className="mb-3 text-5xl">🎬</div>
                <h2 className="mb-2 text-xl font-bold">No pixies yet</h2>
                <p className="mb-5 text-sm text-white/70">
                  Be the first to share a video clip!
                </p>
                <Link
                  to={auth?.user ? "/pixies/upload" : "/login"}
                  className="inline-block rounded-full bg-pink-500 px-6 py-2 font-bold transition hover:bg-pink-600"
                >
                  {auth?.user ? "Upload a video" : "Login to upload"}
                </Link>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          {visibleIndexes.map((index) => {
            const pixie = pixies[index];
            const isActive = index === activeIndex;
            const likeState = likeStateFor(pixie);
            const author = pixie.author;
            const authorAvatar = resolveAvatarUrl(author?.avatar);
            const isOwnPixie = Boolean(
              auth?.user && author?.id && author.id === auth.user.id,
            );
            const isFollowingAuthor = author?.id
              ? Boolean(followState[author.id])
              : false;
            return (
              <div
                key={pixie.id}
                className="absolute inset-0 will-change-transform"
                style={{
                  transform: isDragging
                    ? `translateY(calc(${(index - activeIndex) * 100}% + ${dragOffset}px))`
                    : `translateY(${(index - activeIndex) * 100}%)`,
                  transition: isDragging
                    ? "none"
                    : "transform 420ms cubic-bezier(0.25, 0.8, 0.25, 1)",
                }}
              >
                <video
                  ref={(element) => {
                    videoRefs.current[index] = element;
                  }}
                  src={resolveVideoUrl(pixie.url)}
                  className="h-full w-full cursor-pointer select-none object-contain [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]"
                  playsInline
                  loop
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  preload={preloadFor(index)}
                  onPlay={(event) => {
                    // Keep the control visibility in sync with the real
                    // playback state of the active video.
                    if (index !== activeIndexRef.current) return;
                    event.currentTarget.playbackRate = speedRateRef.current;
                    setPaused(false);
                  }}
                  onPause={() => {
                    if (index !== activeIndexRef.current) return;
                    setPaused(true);
                  }}
                  onContextMenu={handleVideoContextMenu}
                  onPointerDown={handleVideoPointerDown}
                  onPointerMove={handleVideoPointerMove}
                  onPointerCancel={clearLongPress}
                  onPointerUp={handleTap}
                  onTimeUpdate={handleTimeUpdate}
                />

                {/* Bottom gradient for legibility */}
                {!clearDisplay && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 to-transparent" />
                )}

                {/* Paused indicator */}
                {isActive && paused && !isScrubbing && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <PlayIcon />
                  </div>
                )}

                {/* Caption + author */}
                {!clearDisplay && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-6 pr-24 sm:pr-28">
                  <Link
                    to={`/profile/${pixie.author?.username ?? ""}`}
                    className="pointer-events-auto mb-2 flex items-center gap-2 font-bold drop-shadow"
                  >
                    <span className="truncate">
                      @{pixie.author?.username ?? "unknown"}
                    </span>
                    {pixie.author?.verified && <VerifiedBadge size={15} />}
                  </Link>
                  {pixie.title && (
                    <div
                      className={`pointer-events-auto transition-colors ${
                        isExpanded(pixie.id)
                          ? "rounded-xl bg-black/45 px-3 py-2.5 backdrop-blur-sm"
                          : ""
                      }`}
                      data-scrollable-caption={
                        isExpanded(pixie.id) ? "true" : undefined
                      }
                    >
                      <PixieCaptionText
                        id={pixie.id}
                        title={pixie.title}
                        expanded={isExpanded(pixie.id)}
                        onOverflowChange={handleCaptionOverflow}
                      />
                    </div>
                  )}
                  {pixie.tags && pixie.tags.length > 0 && (
                    <div className="pointer-events-auto mt-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {(isExpanded(pixie.id)
                          ? pixie.tags
                          : pixie.tags.slice(0, 3)
                        ).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white/90 backdrop-blur-sm"
                          >
                            #{tag}
                          </span>
                        ))}
                        {!isExpanded(pixie.id) && pixie.tags.length > 3 && (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/60">
                            +{pixie.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {(isExpanded(pixie.id) ||
                    overflowCaptions.has(pixie.id) ||
                    pixie.tags.length > 3) && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(pixie.id)}
                      className="pointer-events-auto mt-1 text-xs font-semibold text-white/70 transition hover:text-white"
                    >
                      {isExpanded(pixie.id) ? "Show less" : "See more..."}
                    </button>
                  )}
                </div>
                )}

                {/* Action rail */}
                {!clearDisplay && (
                <div className="absolute top-[calc(50%+4rem)] right-3 z-10 flex -translate-y-1/2 flex-col items-center gap-5 md:right-5">
                  {author?.username && (
                    <div className="mb-1 flex flex-col items-center">
                      <Link
                        to={`/profile/${author.username}`}
                        aria-label={`View @${author.username}'s profile`}
                        className="block h-11 w-11 overflow-hidden rounded-full border-2 border-white bg-pink-500 transition hover:scale-110"
                      >
                        <AvatarImage src={authorAvatar} />
                      </Link>
                      {auth?.user && !isOwnPixie && !isFollowingAuthor && (
                        <button
                          type="button"
                          onClick={() => void handleFollow(pixie)}
                          disabled={
                            author.id ? followBusy.has(author.id) : false
                          }
                          aria-label={`Follow @${author.username}`}
                          className="relative z-30 -mt-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-white shadow-md transition hover:bg-pink-600 disabled:opacity-60"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="12"
                            height="12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            aria-hidden="true"
                          >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => handleLike(pixie)}
                    aria-label="Like"
                    className={`group flex flex-col items-center gap-1 transition hover:scale-110 ${
                      likeState.liked ? "text-pink-500" : "text-white"
                    }`}
                    type="button"
                  >
                    <HeartIcon filled={likeState.liked} />
                    <span className="text-xs font-bold drop-shadow">
                      {likeState.count}
                    </span>
                  </button>
                  <button
                    onClick={() => void openComments(pixie)}
                    aria-label="Comments"
                    className="flex flex-col items-center gap-1 text-white transition hover:scale-110"
                    type="button"
                  >
                    <CommentIcon />
                    <span className="text-xs font-bold drop-shadow">
                      {commentCountFor(pixie)}
                    </span>
                  </button>
                  <button
                    onClick={() => handleShare(pixie)}
                    aria-label="Share"
                    className="flex flex-col items-center gap-1 text-white transition hover:scale-110"
                    type="button"
                  >
                    <ShareIcon />
                    <span className="text-xs font-bold drop-shadow">share</span>
                  </button>
                  {isActive && canAccessAdminPanel(auth?.user) && (
                    <button
                      onClick={() => void handleDeletePixie(pixie)}
                      aria-label="Delete"
                      className="flex flex-col items-center gap-1 text-white/80 transition hover:scale-110 hover:text-red-400"
                      type="button"
                    >
                      <TrashIcon />
                      <span className="text-xs font-bold drop-shadow">
                        delete
                      </span>
                    </button>
                  )}
                </div>
                )}

                {/* Double-tap hearts */}
                {hearts.map((heart) => (
                  <div
                    key={heart.id}
                    className="pointer-events-none absolute"
                    style={{
                      left: heart.x - 40,
                      top: heart.y - 40,
                      animation: "floatUp 0.8s ease-out forwards",
                    }}
                  >
                    <svg
                      viewBox="0 0 100 100"
                      width="80"
                      height="80"
                      fill="#ec4899"
                      aria-hidden="true"
                    >
                      <path d="M50 88C25 68 8 50 8 32 8 18 18 8 32 8c9 0 15 5 18 10 3-5 9-10 18-10 14 0 24 10 24 24 0 18-17 36-42 56z" />
                    </svg>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Mute toggle */}
          {!clearDisplay && (
          <button
            onClick={handleToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            data-mute-toggle
            className="absolute bottom-5 right-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/90 transition hover:bg-black/60"
            type="button"
          >
            {muted ? <VolumeOffIcon size={18} /> : <VolumeOnIcon size={18} />}
          </button>
          )}

          {/* Playback progress — drag anywhere along it to seek */}
          {!clearDisplay && (
          <div
            data-progress-bar
            className="absolute inset-x-0 bottom-0 z-30 flex touch-none select-none items-end pt-3 cursor-pointer"
            onPointerDown={handleScrubStart}
            onPointerMove={handleScrubMove}
            onPointerUp={handleScrubEnd}
            onPointerCancel={handleScrubEnd}
          >
            <div
              ref={progressTrackRef}
              className={`relative w-full bg-white/25 transition-[height] duration-150 ${
                isScrubbing ? "h-1" : "h-0.5"
              }`}
            >
              <div
                ref={progressBarRef}
                className="relative h-full bg-pink-500"
                style={{ width: "0%" }}
              >
                {isScrubbing && (
                  <span className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1/2 rounded-full bg-pink-500 shadow-[0_0_0_4px_rgba(0,0,0,0.25)]" />
                )}
              </div>
            </div>
          </div>
          )}

          {/* Comments panel */}
          {commentPanelOpen && pixies[activeIndex] && (
            <>
              <div
                className="absolute inset-0 z-20"
                onClick={closeComments}
                aria-hidden="true"
              />
              <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[70%] flex-col rounded-t-2xl border-t border-sky-300/20 bg-blue-950/60 backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <span className="font-bold">
                    Comments ({commentCountFor(pixies[activeIndex])})
                  </span>
                  <button
                    onClick={closeComments}
                    aria-label="Close comments"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/25"
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {commentsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-white" />
                    </div>
                  ) : topComments.length === 0 ? (
                    <p className="py-8 text-center text-sm text-white/60">
                      No comments yet. Be the first to say something!
                    </p>
                  ) : (
                    <ul className="space-y-4">
                      {topComments.map((comment) => {
                        const replies =
                          repliesByParent.get(comment.id) ?? [];
                        const expanded = expandedThreads.has(comment.id);
                        return (
                          <li key={comment.id}>
                            {renderCommentRow(pixies[activeIndex], comment, {
                              isReply: false,
                            })}
                            {replies.length > 0 && (
                              <div className="ml-12 mt-1">
                                <button
                                  type="button"
                                  onClick={() => toggleThread(comment.id)}
                                  className="flex items-center gap-2 text-xs font-semibold text-white/50 transition hover:text-white/80"
                                >
                                  <span className="h-px w-6 bg-white/25" />
                                  {expanded
                                    ? "Hide replies"
                                    : `View ${replies.length} ${
                                        replies.length === 1
                                          ? "reply"
                                          : "replies"
                                      }`}
                                </button>
                                {expanded && (
                                  <div className="mt-1">
                                    {replies.map((reply) =>
                                      renderCommentRow(
                                        pixies[activeIndex],
                                        reply,
                                        { isReply: true },
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSubmitComment(pixies[activeIndex]);
                  }}
                  className="border-t border-white/10 p-3"
                >
                  {replyingTo && (
                    <div className="mb-2 flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60">
                      <span>
                        Replying to{" "}
                        <span className="font-semibold text-white/85">
                          @{replyingTo.username}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(null);
                          setCommentText("");
                        }}
                        aria-label="Cancel reply"
                        className="px-1.5 text-white/50 transition hover:text-white"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      ref={commentInputRef}
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      placeholder={
                        replyingTo
                          ? `Reply to @${replyingTo.username}...`
                          : "Add a comment..."
                      }
                      maxLength={500}
                      className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 outline-none focus:bg-white/15"
                    />
                    <button
                      type="submit"
                      disabled={!commentText.trim() || commentSubmitting}
                      className="rounded-full bg-pink-500 px-4 py-2 text-sm font-bold transition hover:bg-pink-600 disabled:opacity-50"
                    >
                      {commentSubmitting
                        ? "..."
                        : replyingTo
                          ? "reply"
                          : "post"}
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

          {/* Share popup */}
          {shareTarget && (
            <>
              <div
                className="absolute inset-0 z-40 bg-black/60"
                onClick={closeShare}
                aria-hidden="true"
              />
              <div className="absolute inset-x-0 bottom-0 z-50 rounded-t-2xl bg-neutral-900/95 backdrop-blur sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <span className="font-bold">Share pixie</span>
                  <button
                    onClick={closeShare}
                    aria-label="Close share popup"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/25"
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div className="p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-500">
                      <AvatarImage
                        src={resolveAvatarUrl(shareTarget.author?.avatar)}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        @{shareTarget.author?.username ?? "unknown"}
                        {shareTarget.author?.verified && (
                          <VerifiedBadge className="ml-1" size={13} />
                        )}
                      </p>
                      <p className="truncate text-xs text-white/60">
                        {shareTarget.title || "Untitled pixie"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={shareUrlFor(shareTarget)}
                      onFocus={(event) => event.currentTarget.select()}
                      aria-label="Share link"
                      className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 outline-none focus:bg-white/15"
                    />
                    <button
                      type="button"
                      onClick={() => void copyShareLink()}
                      className="rounded-full bg-pink-500 px-4 py-2 text-sm font-bold transition hover:bg-pink-600"
                    >
                      copy
                    </button>
                  </div>
                  <p className="mt-2 text-center text-xs text-white/50">
                    Anyone with the link can watch this pixie.
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Video options — anchored popover on right-click */}
      {optionsMenu?.mode === "anchored" && optionsMenuBody && (
        <>
          <div
            className="fixed inset-0 z-[55]"
            onClick={() => setOptionsMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setOptionsMenu(null);
            }}
            aria-hidden="true"
          />
          <div
            role="menu"
            aria-label="Video options"
            className="fixed z-[60] w-[300px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-sky-300/20 bg-blue-950/60 text-white shadow-2xl backdrop-blur-xl"
            style={{ top: optionsMenu.y, left: optionsMenu.x }}
          >
            {optionsMenuBody}
          </div>
        </>
      )}

      {/* Video options — bottom sheet on mobile long-press */}
      {optionsMenu?.mode === "sheet" && optionsMenuBody && (
        <>
          <div
            className="absolute inset-0 z-[55]"
            onClick={() => setOptionsMenu(null)}
            aria-hidden="true"
          />
          <div
            role="menu"
            aria-label="Video options"
            className="absolute inset-x-0 bottom-0 z-[60] max-h-[75%] overflow-y-auto rounded-t-2xl border-t border-sky-300/20 bg-blue-950/60 pb-[env(safe-area-inset-bottom)] text-white backdrop-blur-xl [animation:slideUp_0.22s_ease-out]"
            onTouchStart={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-1 mt-2.5 h-1 w-10 rounded-full bg-white/25" />
            {optionsMenuBody}
          </div>
        </>
      )}

      {showOnboarding && <PixiesOnboarding onDone={handleOnboardingDone} />}
    </div>
    </>
  );
};

export default Pixies;
