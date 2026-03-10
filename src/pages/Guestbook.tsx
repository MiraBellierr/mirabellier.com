import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Link } from "react-router-dom";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Navigation from "../parts/Navigation";
import kannaShy from "@/assets/anime/kanna-shy.webp";
import { resolveAsset } from "@/lib/blog-utils";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { useConfirm } from "@/states/ConfirmContext";
import {
  deleteGuestbookEntry,
  fetchGuestbookEntries,
  updateGuestbookEntryPosition,
  type GuestbookEntry,
} from "@/lib/guestbook-api";
import {
  guestbookMoodMeta,
  GUESTBOOK_BOARD_HEIGHT,
  GUESTBOOK_BOARD_WIDTH,
  GUESTBOOK_NOTE_SIZE,
} from "@/lib/guestbook-ui";

const BOARD_INITIAL_SCROLL = { left: 0, top: 0 };
const OWNER_DISCORD_ID = "548050617889980426";
const BOARD_ZOOM_MIN = 0.7;
const BOARD_ZOOM_MAX = 1.8;
const BOARD_ZOOM_STEP = 0.15;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getNoteRotation(id: string, index: number) {
  let seed = index;
  for (let i = 0; i < id.length; i += 1) {
    seed += id.charCodeAt(i);
  }

  return ((seed % 7) - 3) * 0.7;
}

const Guestbook = () => {
  const auth = useOptionalAuth();
  const { confirm } = useConfirm();
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExpandedFallback, setIsExpandedFallback] = useState(false);
  const [boardZoom, setBoardZoom] = useState(BOARD_ZOOM_MIN);

  const boardShellRef = useRef<HTMLDivElement | null>(null);
  const boardViewportRef = useRef<HTMLDivElement | null>(null);
  const boardCanvasRef = useRef<HTMLDivElement | null>(null);
  const boardZoomRef = useRef(BOARD_ZOOM_MIN);
  const didSetInitialScroll = useRef(false);
  const dragRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  useEffect(() => {
    boardZoomRef.current = boardZoom;
  }, [boardZoom]);

  useEffect(() => {
    const canonicalLink = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement;
    if (canonicalLink) {
      canonicalLink.href = "https://mirabellier.com/guestbook";
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "guestbook-board-structured-data";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Mirabellier Guestbook Board",
      description:
        "A draggable board full of pinned guestbook notes from visitors.",
      url: "https://mirabellier.com/guestbook",
    });
    document.head.appendChild(script);

    return () => {
      const restoredCanonical = document.querySelector(
        'link[rel="canonical"]',
      ) as HTMLLinkElement;
      if (restoredCanonical) {
        restoredCanonical.href = "https://mirabellier.com/";
      }
      const oldScript = document.getElementById(
        "guestbook-board-structured-data",
      );
      if (oldScript) {
        oldScript.remove();
      }
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchGuestbookEntries();
        setEntries(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load guestbook entries",
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    const viewport = boardViewportRef.current;
    if (!viewport || didSetInitialScroll.current) return;
    if (loading) return;

    viewport.scrollLeft = BOARD_INITIAL_SCROLL.left;
    viewport.scrollTop = BOARD_INITIAL_SCROLL.top;
    didSetInitialScroll.current = true;
  }, [loading]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === boardShellRef.current;
      setIsFullscreen(active);
      if (!active) {
        setIsExpandedFallback(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!draggingNoteId && !isPanning) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (dragRef.current && boardCanvasRef.current) {
        const canvasRect = boardCanvasRef.current.getBoundingClientRect();
        const nextX = clamp(
          (event.clientX - canvasRect.left) / boardZoomRef.current -
            dragRef.current.offsetX,
          0,
          GUESTBOOK_BOARD_WIDTH - GUESTBOOK_NOTE_SIZE,
        );
        const nextY = clamp(
          (event.clientY - canvasRect.top) / boardZoomRef.current -
            dragRef.current.offsetY,
          0,
          GUESTBOOK_BOARD_HEIGHT - GUESTBOOK_NOTE_SIZE,
        );

        dragRef.current.lastX = nextX;
        dragRef.current.lastY = nextY;

        setEntries((current) =>
          current.map((entry) =>
            entry.id === dragRef.current?.id
              ? { ...entry, x: nextX, y: nextY }
              : entry,
          ),
        );
        return;
      }

      if (panRef.current && boardViewportRef.current) {
        const viewport = boardViewportRef.current;
        viewport.scrollLeft =
          panRef.current.scrollLeft - (event.clientX - panRef.current.startX);
        viewport.scrollTop =
          panRef.current.scrollTop - (event.clientY - panRef.current.startY);
      }
    };

    const handleMouseUp = () => {
      if (dragRef.current) {
        const { id, lastX, lastY } = dragRef.current;
        dragRef.current = null;
        setDraggingNoteId(null);

        void updateGuestbookEntryPosition(id, lastX, lastY)
          .then((updated) => {
            setEntries((current) =>
              current.map((entry) =>
                entry.id === updated.id
                  ? { ...entry, x: updated.x, y: updated.y }
                  : entry,
              ),
            );
          })
          .catch((err) => {
            setError(
              err instanceof Error ? err.message : "Failed to save note position",
            );
          });
      }

      if (panRef.current) {
        panRef.current = null;
        setIsPanning(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingNoteId, isPanning]);

  const toggleFullscreen = async () => {
    const node = boardShellRef.current;
    if (!node) return;

    if (
      typeof node.requestFullscreen === "function" &&
      typeof document.exitFullscreen === "function"
    ) {
      try {
        if (document.fullscreenElement === node) {
          await document.exitFullscreen();
        } else {
          await node.requestFullscreen();
        }
        return;
      } catch {
        setIsExpandedFallback((current) => !current);
      }
    }

    setIsExpandedFallback((current) => !current);
  };

  const handleBoardMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 1 || !boardViewportRef.current) return;

    event.preventDefault();
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: boardViewportRef.current.scrollLeft,
      scrollTop: boardViewportRef.current.scrollTop,
    };
    setIsPanning(true);
  };

  const handleNoteMouseDown = (
    event: ReactMouseEvent<HTMLElement>,
    entry: GuestbookEntry,
  ) => {
    if (event.button !== 0 || !boardCanvasRef.current) return;
    if ((event.target as HTMLElement).closest("a, button")) return;

    event.preventDefault();

    const canvasRect = boardCanvasRef.current.getBoundingClientRect();
    dragRef.current = {
      id: entry.id,
      offsetX:
        (event.clientX - canvasRect.left) / boardZoomRef.current - entry.x,
      offsetY:
        (event.clientY - canvasRect.top) / boardZoomRef.current - entry.y,
      lastX: entry.x,
      lastY: entry.y,
    };
    setDraggingNoteId(entry.id);
  };

  const boardIsExpanded = isFullscreen || isExpandedFallback;
  const isAdmin = auth?.user?.discordId === OWNER_DISCORD_ID;

  const applyBoardZoom = (
    nextZoom: number,
    focusPoint?: { clientX: number; clientY: number },
  ) => {
    const viewport = boardViewportRef.current;
    const clampedZoom = clamp(nextZoom, BOARD_ZOOM_MIN, BOARD_ZOOM_MAX);

    if (!viewport) {
      setBoardZoom(clampedZoom);
      return;
    }

    const currentZoom = boardZoomRef.current;
    const viewportRect = viewport.getBoundingClientRect();
    const offsetX = focusPoint
      ? focusPoint.clientX - viewportRect.left
      : viewport.clientWidth / 2;
    const offsetY = focusPoint
      ? focusPoint.clientY - viewportRect.top
      : viewport.clientHeight / 2;
    const focusX = (viewport.scrollLeft + offsetX) / currentZoom;
    const focusY = (viewport.scrollTop + offsetY) / currentZoom;

    setBoardZoom(clampedZoom);

    requestAnimationFrame(() => {
      const currentViewport = boardViewportRef.current;
      if (!currentViewport) return;

      currentViewport.scrollLeft = focusX * clampedZoom - offsetX;
      currentViewport.scrollTop = focusY * clampedZoom - offsetY;
    });
  };

  useEffect(() => {
    const viewport = boardViewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;

      event.preventDefault();

      const direction = event.deltaY < 0 ? 1 : -1;
      applyBoardZoom(
        boardZoomRef.current + direction * BOARD_ZOOM_STEP,
        {
          clientX: event.clientX,
          clientY: event.clientY,
        },
      );
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const handleDeleteNote = async (entryId: string) => {
    if (!isAdmin || !auth?.token) {
      setError("Only the admin account can delete guestbook notes.");
      return;
    }

    const shouldDelete = await confirm({
      title: "Delete guestbook note?",
      message: "Delete this guestbook note?",
      confirmLabel: "Delete note",
      cancelLabel: "Keep note",
    });
    if (!shouldDelete) return;

    setError(null);
    setDeletingNoteId(entryId);

    try {
      await deleteGuestbookEntry(entryId, auth.token);
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete guestbook note",
      );
    } finally {
      setDeletingNoteId(null);
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
          <div className="flex-grow flex-col">
            <Navigation />

            <div className="mt-3 mb-auto justify-center items-center hidden lg:flex">
              <img
                className="w-full max-w-[320px] border border-blue-700 shadow-md rounded-2xl"
                src={kannaShy}
                width="320"
                height="427"
                alt="kanna shy"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-4 p-4">
            <section className="card-border space-y-4 p-4">
              <h2 className="text-xl font-bold text-blue-700 mb-2">
                (˶ᵔ ᵕ ᵔ˶) ‹𝟹 guestbook board
              </h2>
              <p>
                Write your own story here ^-^. Share your words and pin it in the board, it will stay forever! Since this is a public space, keep it nice and appropriate. ദ്ദി(ᵔᗜᵔ)
              </p>
              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              ) : null}

              <div
                ref={boardShellRef}
                className={`guestbook-board-shell ${boardIsExpanded ? "guestbook-board-shell--fullscreen" : ""}`}
              >
                <div className="guestbook-board-toolbar">
                  <span>middle mouse to pan</span>
                  <span>drag any note anywhere</span>
                  <span>{entries.length} notes pinned</span>
                </div>

                <div
                  ref={boardViewportRef}
                  className={`guestbook-board-viewport ${isPanning ? "is-panning" : ""}`}
                  onMouseDown={handleBoardMouseDown}
                  onAuxClick={(event) => {
                    if (event.button === 1) {
                      event.preventDefault();
                    }
                  }}
                >
                  <div
                    className="guestbook-board-stage"
                    style={{
                      width: `${GUESTBOOK_BOARD_WIDTH * boardZoom}px`,
                      height: `${GUESTBOOK_BOARD_HEIGHT * boardZoom}px`,
                    }}
                  >
                    <div
                      ref={boardCanvasRef}
                      className="guestbook-board-canvas"
                      style={{
                        width: `${GUESTBOOK_BOARD_WIDTH}px`,
                        height: `${GUESTBOOK_BOARD_HEIGHT}px`,
                        transform:
                          boardZoom === 1 ? undefined : `scale(${boardZoom})`,
                        transformOrigin:
                          boardZoom === 1 ? undefined : "top left",
                      }}
                    >
                      {loading ? (
                        <div className="guestbook-board-empty">
                          Loading the pinned notes...
                        </div>
                      ) : entries.length === 0 ? (
                        <div className="guestbook-board-empty">
                          No notes yet. Be the first one to pin a little hello.
                        </div>
                      ) : (
                        entries.map((entry, index) => {
                          const mood = guestbookMoodMeta[entry.mood];
                          const avatar = entry.user?.avatar
                            ? resolveAsset(entry.user.avatar)
                            : null;
                          const rotation = getNoteRotation(entry.id, index);

                          return (
                            <article
                              key={entry.id}
                              className={`board-note ${mood.noteClass} ${draggingNoteId === entry.id ? "is-dragging" : ""}`}
                              onMouseDown={(event) =>
                                handleNoteMouseDown(event, entry)
                              }
                              style={{
                                transform: `translate(${entry.x}px, ${entry.y}px) rotate(${rotation}deg)`,
                              }}
                            >
                              <span
                                className="board-note-pin"
                                aria-hidden="true"
                              ></span>

                              <div className="board-note-inner">
                                <div className="board-note-header">
                                  <div className="board-note-author">
                                    {avatar ? (
                                      <img
                                        src={avatar || undefined}
                                        alt={entry.author}
                                        className="board-note-avatar"
                                      />
                                    ) : (
                                      <div className="board-note-avatar board-note-avatar--fallback">
                                        {entry.author.slice(0, 2).toUpperCase()}
                                      </div>
                                    )}

                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-blue-700">
                                        {entry.user?.username ? (
                                          <Link
                                            to={`/profile/${entry.user.username}`}
                                            className="hover:underline"
                                          >
                                            {entry.author}
                                          </Link>
                                        ) : (
                                          entry.author
                                        )}
                                      </p>
                                      <p className="text-[11px] text-blue-400">
                                        {new Date(entry.createdAt).toLocaleDateString()}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <span className={mood.chipClass}>
                                    {mood.label}
                                  </span>
                                </div>

                                <div className="board-note-message">
                                  {entry.message}
                                </div>

                                <div className="board-note-footer">
                                  <div className="flex min-w-0 flex-1">
                                    {entry.website ? (
                                      <a
                                        href={entry.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="board-note-link"
                                      >
                                        visit website
                                      </a>
                                    ) : (
                                      <span className="board-note-link board-note-link--muted">
                                        no link
                                      </span>
                                    )}
                                  </div>

                                  {isAdmin ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteNote(entry.id)}
                                      disabled={deletingNoteId === entry.id}
                                      className="board-note-delete"
                                    >
                                      {deletingNoteId === entry.id
                                        ? "deleting..."
                                        : "delete note"}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  board actions
                </h2>
                <div className="flex flex-col gap-2">
                  <Link
                    to="/guestbook/sign"
                    className="rounded-full bg-pink-500 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-pink-600"
                  >
                    sign guestbook
                  </Link>
                  <button
                    type="button"
                    onClick={() => void toggleFullscreen()}
                    className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100"
                  >
                    {boardIsExpanded ? "shrink board" : "full screen board"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  board controls
                </h2>
                <p>Scroll both directions inside the board area.</p>
                <p>Use middle mouse to move around faster.</p>
                <p>Drag any pinned note to a new spot on the board.</p>
                <p>Hold Ctrl and scroll to zoom the board without zooming the page.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Guestbook;
