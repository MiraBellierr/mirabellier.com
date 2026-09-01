import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { useToast } from "@/states/ToastContext";
import { usePageSeo } from "@/lib/seo";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import {
  deleteReel,
  deleteReelComment,
  fetchReelComments,
  fetchReelsFeed,
  markReelViewed,
  postReelComment,
  resolveAvatarUrl,
  resolveVideoUrl,
  toggleReelLike,
  type Reel,
  type ReelComment,
} from "@/lib/videos";

const PRELOAD_WINDOW_AHEAD = 2;
const RENDER_WINDOW_BEFORE = 2;
const RENDER_WINDOW_AFTER = 4;
const SWIPE_THRESHOLD_PX = 60;
const WHEEL_THRESHOLD_PX = 60;
const WHEEL_COOLDOWN_MS = 650;
const FEED_BATCH_SIZE = 10;
const FEED_FETCH_AHEAD = 2;

interface LikeState {
  liked: boolean;
  count: number;
}

const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width="30"
    height="30"
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

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
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

const UploadIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="12" y1="19" x2="12" y2="9" />
    <polyline points="7 14 12 9 17 14" />
    <path d="M22 17v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2" />
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

const PauseIcon = ({ size = 64 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="rgba(255,255,255,0.85)"
    stroke="none"
    aria-hidden="true"
  >
    <rect x="5" y="3" width="5" height="18" rx="1" />
    <rect x="14" y="3" width="5" height="18" rx="1" />
  </svg>
);

const SeekBackIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="26"
    height="26"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    <text
      x="11"
      y="16.5"
      textAnchor="middle"
      fontSize="8"
      fontWeight="700"
      fill="currentColor"
      stroke="none"
    >
      5
    </text>
  </svg>
);

const SeekForwardIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="26"
    height="26"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    <text
      x="13"
      y="16.5"
      textAnchor="middle"
      fontSize="8"
      fontWeight="700"
      fill="currentColor"
      stroke="none"
    >
      5
    </text>
  </svg>
);

const ReelCaptionText = ({
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
      {title}
    </p>
  );
};

const Reels = () => {
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { videoId: sharedVideoId } = useParams<{ videoId?: string }>();

  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [likeOverrides, setLikeOverrides] = useState<Record<string, LikeState>>(
    {},
  );
  const [commentPanelOpen, setCommentPanelOpen] = useState(false);
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentCountDeltas, setCommentCountDeltas] = useState<
    Record<string, number>
  >({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [overflowCaptions, setOverflowCaptions] = useState<Set<string>>(
    new Set(),
  );
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [hearts, setHearts] = useState<
    Array<{ id: number; x: number; y: number }>
  >([]);
  const [shareTarget, setShareTarget] = useState<Reel | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef(0);
  const lastActiveIndexRef = useRef(-1);
  const commentPanelOpenRef = useRef(false);
  const shareOpenRef = useRef(false);
  const touchStartRef = useRef<{ y: number } | null>(null);
  const wheelAccumRef = useRef(0);
  const lastWheelNavRef = useRef(0);
  const lastTapRef = useRef(0);
  const tapTimeoutRef = useRef<number | null>(null);
  const audioUnlockNeededRef = useRef(false);
  const audioUnlockAtRef = useRef(0);
  const fetchingMoreRef = useRef(false);
  const forceUnmuteOnActivateRef = useRef(true);
  const mutedRef = useRef(false);
  const preplayedIndexRef = useRef(-1);

  const sharePageUrl = sharedVideoId
    ? `https://mirabellier.com/pixies/${sharedVideoId}`
    : "https://mirabellier.com/pixies";

  usePageSeo({
    canonical: sharePageUrl,
    structuredDataId: "pixies-structured-data",
    structuredData: {
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
    forceUnmuteOnActivateRef.current = true;
    lastActiveIndexRef.current = -1;
    fetchReelsFeed(sharedVideoId, { limit: FEED_BATCH_SIZE })
      .then((data) => {
        if (cancelled) return;
        setReels(data);
        setHasMore(data.length >= FEED_BATCH_SIZE);
        if (sharedVideoId) {
          const index = data.findIndex((reel) => reel.id === sharedVideoId);
          if (index >= 0) {
            activeIndexRef.current = index;
            setActiveIndex(index);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load pixies");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sharedVideoId]);

  // Fetch the next batch in real time once we get within 2 videos of the end.
  useEffect(() => {
    if (loading) return;
    if (!hasMore) return;
    if (reels.length - activeIndex > FEED_FETCH_AHEAD) return;
    if (fetchingMoreRef.current) return;
    fetchingMoreRef.current = true;
    const excludeIds = reels.map((reel) => reel.id);
    fetchReelsFeed(undefined, { limit: FEED_BATCH_SIZE, exclude: excludeIds })
      .then((data) => {
        setHasMore(data.length >= FEED_BATCH_SIZE);
        setReels((current) => {
          const known = new Set(current.map((reel) => reel.id));
          const fresh = data.filter((reel) => !known.has(reel.id));
          return fresh.length > 0 ? [...current, ...fresh] : current;
        });
      })
      .catch(() => {
        // Keep hasMore so the next scroll retries the fetch.
      })
      .finally(() => {
        fetchingMoreRef.current = false;
      });
  }, [activeIndex, reels, hasMore, loading]);

  // Mark the active pixie as watched so unwatched pixies come first in future feeds.
  const markedViewedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const reel = reels[activeIndex];
    if (!reel || !auth?.user) return;
    if (markedViewedRef.current.has(reel.id)) return;
    markedViewedRef.current.add(reel.id);
    void markReelViewed(reel.id);
  }, [activeIndex, reels, auth?.user]);

  const clampIndex = useCallback(
    (index: number) => Math.max(0, Math.min(reels.length - 1, index)),
    [reels.length],
  );

  const goTo = useCallback(
    (target: number) => {
      if (reels.length === 0) return;
      const next = clampIndex(target);
      activeIndexRef.current = next;
      setActiveIndex(next);
      setPaused(false);
      setExpandedIds(new Set());
      if (progressBarRef.current) progressBarRef.current.style.width = "0%";
    },
    [clampIndex, reels.length],
  );  const goNext = useCallback(() => {
    goTo(activeIndexRef.current + 1);
  }, [goTo]);

  const goPrev = useCallback(() => {
    goTo(activeIndexRef.current - 1);
  }, [goTo]);

  // Start the newly active video synchronously inside the navigation gesture.
  // Browsers (especially iOS) only allow unmuted playback tied to a user gesture.
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
    void video.play().catch(() => {
      audioUnlockNeededRef.current = true;
      setPaused(true);
    });
  }, []);

  // Keep mutedRef in sync so gesture handlers never read a stale mute state.
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

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
        void video.play().catch(() => {
          // Playback was blocked; wait for the next user gesture to resume.
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
  }, [activeIndex, reels]);

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
        void video.play().catch(() => {});
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
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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
      if (commentPanelOpenRef.current) return;
      if (shareOpenRef.current) return;
      if (reels.length <= 1) return;
      if (event.ctrlKey) return;
      if (
        (event.target as HTMLElement | null)?.closest?.(
          "[data-scrollable-caption]",
        )
      ) {
        return;
      }
      event.preventDefault();
      wheelAccumRef.current += event.deltaY;
      const now = Date.now();
      if (now - lastWheelNavRef.current < WHEEL_COOLDOWN_MS) return;
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
  }, [reels.length, goNext, goPrev, playActiveImmediately]);

  const handleTouchStart = (event: React.TouchEvent) => {
    if (commentPanelOpenRef.current) return;
    if (shareOpenRef.current) return;
    if (
      (event.target as HTMLElement | null)?.closest?.(
        "[data-scrollable-caption]",
      )
    ) {
      return;
    }
    touchStartRef.current = { y: event.touches[0].clientY };
    setIsDragging(true);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (
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
    if (commentPanelOpenRef.current || shareOpenRef.current) return;
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
      void video.play().catch(() => {});
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
  };

  const seekBy = (seconds: number) => {
    const video = videoRefs.current[activeIndexRef.current];
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    video.currentTime = Math.max(0, Math.min(duration, current + seconds));
  };

  const handleTap = (
    event: React.PointerEvent<HTMLVideoElement>,
  ) => {
    const now = Date.now();
    const delta = now - lastTapRef.current;

    if (delta > 0 && delta < 300) {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      // Double tap — like (never unlike)
      const reel = reels[activeIndex];
      if (reel) {
        if (!likeStateFor(reel).liked) {
          handleLike(reel);
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const id = now;
        setHearts((current) => [...current, { id, x, y }]);
        setTimeout(() => {
          setHearts((current) => current.filter((h) => h.id !== id));
        }, 900);
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
    const video = event.currentTarget;
    if (video.duration && progressBarRef.current) {
      progressBarRef.current.style.width = `${(video.currentTime / video.duration) * 100}%`;
    }
  };

  const handleToggleMute = () => {
    const video = videoRefs.current[activeIndex];
    const next = !muted;
    audioUnlockNeededRef.current = false;
    if (video) {
      video.muted = next;
      if (!next) {
        void video.play().catch(() => {
          video.muted = true;
          setMuted(true);
        });
      }
    }
    setMuted(next);
  };

  const handleLike = async (reel: Reel) => {
    if (!auth?.user) {
      navigate("/login");
      return;
    }
    const previous = likeStateFor(reel);
    const optimistic: LikeState = {
      liked: !previous.liked,
      count: previous.count + (previous.liked ? -1 : 1),
    };
    setLikeOverrides((current) => ({ ...current, [reel.id]: optimistic }));
    try {
      const result = await toggleReelLike(reel.id);
      setLikeOverrides((current) => ({
        ...current,
        [reel.id]: { liked: result.liked, count: result.likesCount },
      }));
    } catch {
      setLikeOverrides((current) => ({ ...current, [reel.id]: previous }));
      showToast("Could not update like");
    }
  };

  const shareUrlFor = (reel: Reel) =>
    `${window.location.origin}/pixies/${reel.id}`;

  const closeShare = useCallback(() => {
    shareOpenRef.current = false;
    setShareTarget(null);
  }, []);

  const handleShare = (reel: Reel) => {
    shareOpenRef.current = true;
    setShareTarget(reel);
  };

  const copyShareLink = async () => {
    if (!shareTarget) return;
    try {
      await navigator.clipboard.writeText(shareUrlFor(shareTarget));
      showToast("Pixies link copied to clipboard!");
    } catch {
      showToast("Failed to copy link");
    }
  };

  const openComments = async (reel: Reel) => {
    if (!auth?.user) {
      navigate("/login");
      return;
    }
    setCommentPanelOpen(true);
    commentPanelOpenRef.current = true;
    setCommentsLoading(true);
    setComments([]);
    try {
      const loaded = await fetchReelComments(reel.id);
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
  }, []);

  const handleSubmitComment = async (reel: Reel) => {
    const content = commentText.trim();
    if (!content || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const comment = await postReelComment(reel.id, content);
      setComments((current) => [comment, ...current]);
      setCommentCountDeltas((current) => ({
        ...current,
        [reel.id]: (current[reel.id] ?? 0) + 1,
      }));
      setCommentText("");
    } catch {
      showToast("Could not post comment");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteReel = async (reel: Reel) => {
    try {
      await deleteReel(reel.id);
      const next = reels.filter((entry) => entry.id !== reel.id);
      if (next.length === 0) {
        activeIndexRef.current = 0;
      } else if (activeIndexRef.current >= next.length) {
        activeIndexRef.current = next.length - 1;
      }
      setActiveIndex(activeIndexRef.current);
      setReels(next);
      showToast("Video deleted");
    } catch {
      showToast("Could not delete video");
    }
  };

  const handleDeleteComment = async (reel: Reel, commentId: string) => {
    try {
      await deleteReelComment(reel.id, commentId);
      setComments((current) =>
        current.filter((comment) => comment.id !== commentId),
      );
      setCommentCountDeltas((current) => ({
        ...current,
        [reel.id]: (current[reel.id] ?? 0) - 1,
      }));
    } catch {
      showToast("Could not delete comment");
    }
  };

  const commentCountFor = (reel: Reel) =>
    reel.commentsCount + (commentCountDeltas[reel.id] ?? 0);

  const visibleIndexes = useMemo(() => {
    if (reels.length === 0) return [];
    const start = Math.max(0, activeIndex - RENDER_WINDOW_BEFORE);
    const end = Math.min(reels.length - 1, activeIndex + RENDER_WINDOW_AFTER);
    const indexes: number[] = [];
    for (let index = start; index <= end; index += 1) {
      indexes.push(index);
    }
    return indexes;
  }, [activeIndex, reels.length]);

  const likeStateFor = (reel: Reel): LikeState =>
    likeOverrides[reel.id] ?? {
      liked: reel.likedByMe,
      count: reel.likesCount,
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

  return (
    <>
      <style>{`
        @keyframes floatUp {
          0% { transform: scale(0.5); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.85; }
          100% { transform: scale(1.8) translateY(-40px); opacity: 0; }
        }
      `}</style>
      <div
        className="fixed inset-0 z-40 overflow-hidden overscroll-none bg-black text-white"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-10 pt-4">
        <Link
          to="/"
          aria-label="Close pixies"
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/25"
        >
          <CloseIcon />
        </Link>
        <span className="text-lg font-bold tracking-widest drop-shadow">
          pixies
        </span>
        <Link
          to={auth?.user ? "/pixies/upload" : "/login"}
          aria-label="Upload a video"
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/25"
        >
          <UploadIcon />
        </Link>
      </div>

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
      ) : reels.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <div className="rounded-2xl bg-white/10 p-8 text-center">
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
          </div>
        </div>
      ) : (
        <>
          {visibleIndexes.map((index) => {
            const reel = reels[index];
            const isActive = index === activeIndex;
            const likeState = likeStateFor(reel);
            const authorAvatar = resolveAvatarUrl(reel.author?.avatar);
            return (
              <div
                key={reel.id}
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
                  src={resolveVideoUrl(reel.url)}
                  className="h-full w-full cursor-pointer object-contain"
                  playsInline
                  muted={muted}
                  loop
                  preload={preloadFor(index)}
                  onPointerUp={handleTap}
                  onTimeUpdate={handleTimeUpdate}
                />

                {/* Bottom gradient for legibility */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 to-transparent" />

                {/* Paused indicator */}
                {isActive && paused && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <PlayIcon />
                  </div>
                )}

                {/* Caption + author */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-6 pr-24 sm:pr-28">
                  <Link
                    to={`/profile/${reel.author?.username ?? ""}`}
                    className="pointer-events-auto mb-2 flex items-center gap-2 font-bold drop-shadow"
                  >
                    <span className="h-6 w-6 flex-shrink-0 overflow-hidden rounded-full bg-pink-500 text-center text-xs leading-6">
                      {authorAvatar ? (
                        <img
                          src={authorAvatar}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        "😺"
                      )}
                    </span>
                    <span className="truncate">
                      @{reel.author?.username ?? "unknown"}
                    </span>
                  </Link>
                  {reel.title && (
                    <div
                      className="pointer-events-auto"
                      data-scrollable-caption={
                        isExpanded(reel.id) ? "true" : undefined
                      }
                    >
                      <ReelCaptionText
                        id={reel.id}
                        title={reel.title}
                        expanded={isExpanded(reel.id)}
                        onOverflowChange={handleCaptionOverflow}
                      />
                    </div>
                  )}
                  {reel.tags && reel.tags.length > 0 && (
                    <div className="pointer-events-auto mt-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {(isExpanded(reel.id)
                          ? reel.tags
                          : reel.tags.slice(0, 3)
                        ).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white/90 backdrop-blur-sm"
                          >
                            #{tag}
                          </span>
                        ))}
                        {!isExpanded(reel.id) && reel.tags.length > 3 && (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/60">
                            +{reel.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {(isExpanded(reel.id) ||
                    overflowCaptions.has(reel.id) ||
                    reel.tags.length > 3) && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(reel.id)}
                      className="pointer-events-auto mt-1 text-xs font-semibold text-white/70 transition hover:text-white"
                    >
                      {isExpanded(reel.id) ? "Show less" : "See more..."}
                    </button>
                  )}
                </div>

                {/* Action rail */}
                <div className="absolute top-1/2 right-3 z-10 flex -translate-y-1/2 flex-col items-center gap-5 md:right-5">
                  <button
                    onClick={() => handleLike(reel)}
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
                    onClick={() => void openComments(reel)}
                    aria-label="Comments"
                    className="flex flex-col items-center gap-1 text-white transition hover:scale-110"
                    type="button"
                  >
                    <CommentIcon />
                    <span className="text-xs font-bold drop-shadow">
                      {commentCountFor(reel)}
                    </span>
                  </button>
                  <button
                    onClick={() => handleShare(reel)}
                    aria-label="Share"
                    className="flex flex-col items-center gap-1 text-white transition hover:scale-110"
                    type="button"
                  >
                    <ShareIcon />
                    <span className="text-xs font-bold drop-shadow">share</span>
                  </button>
                  {isActive && canAccessAdminPanel(auth?.user) && (
                    <button
                      onClick={() => void handleDeleteReel(reel)}
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
          <button
            onClick={handleToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            data-mute-toggle
            className="absolute bottom-5 right-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/90 transition hover:bg-black/60"
            type="button"
          >
            {muted ? <VolumeOffIcon size={18} /> : <VolumeOnIcon size={18} />}
          </button>

          {/* Playback controls: back 5s / play-pause / forward 5s */}
          {paused && (
            <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3">
              <button
                onClick={() => seekBy(-5)}
                aria-label="Back 5 seconds"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/90 transition hover:bg-black/60"
                type="button"
              >
                <SeekBackIcon />
              </button>
              <button
                onClick={togglePlayPause}
                aria-label={paused ? "Play" : "Pause"}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60"
                type="button"
              >
                {paused ? <PlayIcon size={30} /> : <PauseIcon size={30} />}
              </button>
              <button
                onClick={() => seekBy(5)}
                aria-label="Forward 5 seconds"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/90 transition hover:bg-black/60"
                type="button"
              >
                <SeekForwardIcon />
              </button>
            </div>
          )}

          {/* Playback progress */}
          <div className="absolute inset-x-0 bottom-0 z-20 h-0.5 bg-white/25">
            <div
              ref={progressBarRef}
              className="h-full bg-pink-500"
              style={{ width: "0%" }}
            />
          </div>

          {/* Comments panel */}
          {commentPanelOpen && reels[activeIndex] && (
            <>
              <div
                className="absolute inset-0 z-20 bg-black/40"
                onClick={closeComments}
                aria-hidden="true"
              />
              <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[70%] flex-col rounded-t-2xl bg-neutral-900/95 backdrop-blur">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <span className="font-bold">
                    Comments ({commentCountFor(reels[activeIndex])})
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
                  ) : comments.length === 0 ? (
                    <p className="py-8 text-center text-sm text-white/60">
                      No comments yet. Be the first to say something!
                    </p>
                  ) : (
                    comments.map((comment) => {
                      const commentAvatar = resolveAvatarUrl(
                        comment.author?.avatar,
                      );
                      const canDelete =
                        auth?.user?.id === comment.author?.id ||
                        auth?.user?.id === reels[activeIndex].author?.id ||
                        canAccessAdminPanel(auth?.user);
                      return (
                        <div key={comment.id} className="mb-4 flex gap-3">
                          <Link
                            to={`/profile/${comment.author?.username ?? ""}`}
                            className="mt-0.5 h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-pink-500 text-center text-base leading-9"
                          >
                            {commentAvatar ? (
                              <img
                                src={commentAvatar}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              "😺"
                            )}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">
                              <span className="font-bold">
                                {comment.author?.username ?? "unknown"}
                              </span>
                              <span className="ml-2 text-xs text-white/50">
                                {new Date(comment.createdAt).toLocaleString()}
                              </span>
                            </p>
                            <p className="mt-0.5 break-words text-sm text-white/90">
                              {comment.content}
                            </p>
                          </div>
                          {canDelete && (
                            <button
                              onClick={() =>
                                void handleDeleteComment(
                                  reels[activeIndex],
                                  comment.id,
                                )
                              }
                              aria-label="Delete comment"
                              className="flex-shrink-0 self-start rounded-full px-2 py-1 text-xs font-bold text-white/40 transition hover:bg-red-600 hover:text-white"
                              type="button"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSubmitComment(reels[activeIndex]);
                  }}
                  className="flex gap-2 border-t border-white/10 p-3"
                >
                  <input
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder="Add a comment..."
                    maxLength={500}
                    className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 outline-none focus:bg-white/15"
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim() || commentSubmitting}
                    className="rounded-full bg-pink-500 px-4 py-2 text-sm font-bold transition hover:bg-pink-600 disabled:opacity-50"
                  >
                    {commentSubmitting ? "..." : "post"}
                  </button>
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
                    <span className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-pink-500 text-center text-lg leading-10">
                      {resolveAvatarUrl(shareTarget.author?.avatar) ? (
                        <img
                          src={
                            resolveAvatarUrl(shareTarget.author?.avatar) ?? ""
                          }
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        "😺"
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        @{shareTarget.author?.username ?? "unknown"}
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
    </div>
    </>
  );
};

export default Reels;
