import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/states/AuthContext";
import { useToast } from "@/states/ToastContext";
import { usePageSeo } from "@/lib/seo";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import { API_BASE } from "@/lib/config";
import {
  cancelPixieImport,
  clearFinishedPixieImports,
  enqueuePixieImport,
  fetchPixieImportQueue,
  fetchVideoResolveStatus,
  MAX_AUTHOR_USERNAME_LENGTH,
  MAX_VIDEO_TITLE_LENGTH,
  newImportKey,
  normalizeVideoTags,
  pollVideoJob,
  readVideoDuration,
  resolveAvatarUrl,
  retryPixieImport,
  startVideoResolve,
  truncateCodePoints,
  uploadAdminPixie,
  type PixieImportQueueItem,
  type ResolvedVideoInfo,
} from "@/lib/pixies";
import AuthGateShell from "../parts/AuthGateShell";
import AvatarImage from "../parts/AvatarImage";
import VerifiedBadge from "../parts/VerifiedBadge";
import TagInput from "../parts/TagInput";
import { useVideoTagInput } from "../parts/useVideoTagInput";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Navigation from "../parts/Navigation";
import kannaPolice from "@/assets/anime/kanna-police.webp";

type JobView = {
  progress: number;
  message: string;
  state: string;
  stage: string;
};

const STAGE_TIPS: Record<string, string[]> = {
  queued: ["Starting up…", "Queuing the request…"],
  resolve: [
    "Looking up the video and its author…",
    "Fetching username, caption and avatar…",
    "Platforms throttle scrapes in waves — retrying automatically…",
  ],
  download: [
    "Streaming the video down to the server…",
    "Rate limits may slow the download down — hanging tight…",
    "Grabbing the best quality available…",
  ],
  process: [
    "Converting the video so iPhones and iPads can play it…",
    "Re-encoding to H.264 for maximum device support…",
    "Polishing the video container…",
  ],
  done: ["All done!", "Ready!"],
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ProgressBlock({ job }: { job: JobView | null }) {
  const [tick, setTick] = useState(0);
  // Depend on whether a job is active, not on the job object itself: a fresh
  // object literal arrives on every poll (~700 ms), which is faster than the
  // 1000 ms interval, so keying the effect on `job` tore the timer down before
  // it could ever fire — freezing both the elapsed clock and the rotating tips.
  const active = Boolean(job);
  useEffect(() => {
    if (!active) {
      setTick(0);
      return;
    }
    const interval = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(interval);
  }, [active]);
  if (!job) return null;

  const tips = STAGE_TIPS[job.stage] || STAGE_TIPS.queued;
  const liveDescription = tips[tick % tips.length];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs text-blue-600 dark:text-purple-300">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="inline-block h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-pink-500 border-t-transparent"
            aria-hidden
          />
          <span className="truncate">{job.message}</span>
        </span>
        <span className="flex-shrink-0 font-bold tabular-nums">
          {Math.round(job.progress)}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-purple-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-pink-400 to-pink-600 transition-all duration-500 ease-linear"
          style={{ width: `${job.progress}%` }}
        />
      </div>
      <p className="text-xs text-blue-400 dark:text-purple-400">
        {liveDescription} ({formatElapsed(tick)})
      </p>
    </div>
  );
}

const QUEUE_ACTIVE_STATES = new Set(["queued", "running"]);

function ImportQueuePanel({ refreshKey }: { refreshKey: number }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<PixieImportQueueItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchPixieImportQueue());
    } catch {
      // Transient — the next poll retries.
    } finally {
      setLoaded(true);
    }
  }, []);

  // Immediate load on mount and whenever the parent enqueues something.
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Poll while the panel is open: briskly when work is in flight, lazily
  // when the queue is idle. Leaving/refreshing the page just stops the timer;
  // remounting reloads the true state from the server.
  const hasActive = items.some((item) => QUEUE_ACTIVE_STATES.has(item.status));
  useEffect(() => {
    const interval = window.setInterval(() => void load(), hasActive ? 2000 : 8000);
    return () => window.clearInterval(interval);
  }, [load, hasActive]);

  const act = async (
    id: string,
    fn: (id: string) => Promise<unknown>,
    failMessage: string,
  ) => {
    setBusyId(id);
    try {
      await fn(id);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : failMessage);
    } finally {
      setBusyId(null);
    }
  };

  const clearFinished = async () => {
    try {
      await clearFinishedPixieImports();
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not clear the queue");
    }
  };

  if (!loaded && items.length === 0) return null;

  const finishedCount = items.filter(
    (item) => !QUEUE_ACTIVE_STATES.has(item.status),
  ).length;

  return (
    <div className="card-border rounded-2xl p-4 sm:p-6 shadow-lg bg-white/90 dark:bg-purple-900/80">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h2 className="text-lg sm:text-xl font-bold text-blue-700 dark:text-purple-200 flex items-center gap-2">
          <span>📥</span>
          <span>Import queue</span>
          {hasActive && (
            <span
              className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-pink-500"
              aria-label="processing"
            />
          )}
        </h2>
        {finishedCount > 0 && (
          <button
            type="button"
            onClick={clearFinished}
            className="text-xs font-bold text-blue-500 hover:text-pink-500 dark:text-purple-300"
          >
            clear finished ({finishedCount})
          </button>
        )}
      </div>

      <p className="mt-1 text-xs text-blue-500 dark:text-purple-300">
        Imports run one at a time on the server — you can close or refresh this
        page and they'll keep going.
      </p>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-blue-400 dark:text-purple-400">
          Nothing queued right now.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onCancel={() =>
                act(item.id, cancelPixieImport, "Could not cancel")
              }
              onRetry={() => act(item.id, retryPixieImport, "Could not retry")}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueRow({
  item,
  busy,
  onCancel,
  onRetry,
}: {
  item: PixieImportQueueItem;
  busy: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const badge: Record<PixieImportQueueItem["status"], string> = {
    queued: "text-blue-500 dark:text-purple-300",
    running: "text-pink-600 dark:text-pink-300",
    done: "text-green-600 dark:text-green-300",
    error: "text-red-600 dark:text-pink-300",
    canceled: "text-blue-400 dark:text-purple-400",
  };
  const label = item.username ? `@${item.username}` : "resolving…";
  const secondary = item.title.trim() || item.url;

  return (
    <li className="rounded-xl border border-blue-200 dark:border-purple-600 bg-blue-50/60 dark:bg-purple-800/40 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-blue-700 dark:text-purple-200">
            {label}
            {item.platform ? (
              <span className="ml-1 font-normal text-blue-400 dark:text-purple-400">
                · {item.platform}
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-blue-500 dark:text-purple-300">
            {secondary}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className={`text-xs font-bold capitalize ${badge[item.status]}`}>
            {item.status}
          </span>
          {item.status === "queued" && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-full px-2 py-0.5 text-xs font-bold text-blue-500 hover:bg-red-500 hover:text-white disabled:opacity-50 dark:text-purple-300"
            >
              cancel
            </button>
          )}
          {(item.status === "error" || item.status === "canceled") && (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="rounded-full bg-pink-500 px-2 py-0.5 text-xs font-bold text-white hover:bg-pink-600 disabled:opacity-50"
            >
              retry
            </button>
          )}
          {item.status === "done" && item.videoId && (
            <Link
              to={`/pixies/${item.videoId}`}
              className="rounded-full px-2 py-0.5 text-xs font-bold text-pink-500 hover:underline"
            >
              view
            </Link>
          )}
        </div>
      </div>

      {item.status === "running" && (
        <div className="mt-2 space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-purple-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-pink-400 to-pink-600 transition-all duration-500 ease-linear"
              style={{ width: `${Math.round(item.progress)}%` }}
            />
          </div>
          <p className="text-xs text-blue-400 dark:text-purple-400">
            {item.message} ({Math.round(item.progress)}%)
          </p>
        </div>
      )}
      {item.status === "error" && item.error && (
        <p className="mt-2 text-xs text-red-600 dark:text-pink-300">
          {item.error}
        </p>
      )}
    </li>
  );
}

const AdminPixies = () => {
  const auth = useAuth();
  const { showToast } = useToast();
  const isOwner = canAccessAdminPanel(auth.user);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedInfo, setResolvedInfo] = useState<ResolvedVideoInfo | null>(
    null,
  );
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveJob, setResolveJob] = useState<JobView | null>(null);
  const [resolveNotice, setResolveNotice] = useState<string | null>(null);
  // Bumped after a successful enqueue so the queue panel reloads immediately.
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);

  const tagField = useVideoTagInput({ onMessage: setMessage });
  const { tags, setTags, tagInput, setTagInput } = tagField;

  usePageSeo({
    canonical: "https://mirabellier.com/admin/pixies",
    structuredDataId: "admin-pixies-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Admin Pixies",
      description: "Upload pixies on behalf of any username.",
      url: "https://mirabellier.com/admin/pixies",
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile && !(resolvedUrl && resolvedInfo)) return;
    const normalizedTags = normalizeVideoTags([...tags, tagInput]);
    if (!username.trim()) {
      setMessage("Username cannot be empty");
      return;
    }
    if (
      Array.from(username.trim()).length > MAX_AUTHOR_USERNAME_LENGTH
    ) {
      setMessage(
        `Username must be ${MAX_AUTHOR_USERNAME_LENGTH} characters or fewer`,
      );
      return;
    }
    setIsUploading(true);
    setUploadProgress(videoFile ? 0 : null);
    setMessage(null);
    const authorVerified = resolvedInfo?.verified === true;
    try {
      if (videoFile) {
        const durationSeconds = await readVideoDuration(videoFile);
        await uploadAdminPixie({
          file: videoFile,
          title: videoTitle,
          tags: normalizedTags,
          username,
          avatarUrl,
          durationSeconds,
          verified: authorVerified,
          onProgress: setUploadProgress,
        });
        setVideoFile(null);
        showToast(`Uploaded as ${username.trim()}! 🎉`);
      } else {
        // Hand the link to the durable server-side queue and return right
        // away — the import runs in the background and survives the admin
        // leaving or refreshing this page. `importKey` keeps a retry from
        // inserting a second copy.
        await enqueuePixieImport({
          url: resolvedUrl,
          title: videoTitle,
          tags: normalizedTags,
          username: username.trim(),
          avatarUrl,
          importKey: newImportKey(),
          verified: authorVerified,
        });
        setQueueRefreshKey((n) => n + 1);
        showToast(`Added @${username.trim()}'s clip to the import queue 📥`);
      }
      setVideoTitle("");
      setTags([]);
      setTagInput("");
      setSourceUrl("");
      setResolvedUrl("");
      setResolvedInfo(null);
      setResolveError(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Video upload failed",
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sourceUrl.trim();
    if (!trimmed || isResolving || isUploading) return;
    setIsResolving(true);
    setResolveError(null);
    setResolveNotice(null);
    setResolvedInfo(null);
    setResolveJob(null);
    setResolvedUrl("");
    try {
      const status = await pollVideoJob(
        () => startVideoResolve(trimmed),
        fetchVideoResolveStatus,
        (current) =>
          setResolveJob({
            progress: current.progress,
            message: current.message,
            state: current.state,
            stage: current.stage,
          }),
        {
          onRestart: () => {
            // The backend restarted mid-fetch and the job vanished — restart
            // it transparently (pollVideoJob starts a new job).
            setResolveJob(null);
            setResolveNotice(
              "The server restarted while fetching — retrying automatically…",
            );
          },
        },
      );
      const resolved = status.result;
      if (!resolved) throw new Error("No details returned");
      setResolvedUrl(trimmed);
      setResolvedInfo(resolved);
      setUsername(
        truncateCodePoints(resolved.username, MAX_AUTHOR_USERNAME_LENGTH),
      );
      setAvatarUrl(resolved.avatarUrl || "");
      setVideoTitle(resolved.caption || "");
      setTags(normalizeVideoTags(resolved.hashtags));
    } catch (err) {
      setResolveError(
        err instanceof Error ? err.message : "Failed to fetch video info",
      );
    } finally {
      setIsResolving(false);
      setResolveJob(null);
      setResolveNotice(null);
    }
  };

  if (!auth.user || !isOwner) {
    return (
      <AuthGateShell
        icon={!auth.user ? "🔒" : "🚫"}
        title={!auth.user ? "Please log in" : "Not authorized"}
        message={
          !auth.user
            ? "You need to log in with the owner account before using the admin pages."
            : "This page is only available to the site owner account."
        }
        action={
          !auth.user
            ? { to: "/login", label: "Go to login" }
            : { to: "/", label: "Back to home" }
        }
      />
    );
  }

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

            <div className="mt-3 mb-auto hidden justify-center items-center lg:flex">
              <img
                className="w-full max-w-[320px] border border-blue-700 shadow-md rounded-2xl"
                src={kannaPolice}
                width="498"
                height="280"
                alt="Kanna police"
              />
            </div>
          </div>

          <main className="w-full min-w-0 lg:w-3/5 p-4">
            <div className="space-y-6">
              <div className="card-border rounded-2xl p-4 sm:p-6 shadow-lg bg-white/90 dark:bg-purple-900/80">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-purple-200 flex items-center gap-2">
                  <span>🎬</span>
                  <span>Upload as anyone</span>
                </h2>
                <Link
                  to="/pixies"
                  className="text-sm font-bold text-pink-500 hover:underline"
                >
                  view pixies →
                </Link>
              </div>
              <p className="mt-1 text-sm text-blue-500 dark:text-purple-300">
                Paste a TikTok, Instagram pixie, or YouTube Shorts link to
                auto-fill the details below — the video downloads and imports
                automatically when you submit. You can also fill the form
                manually and upload a file instead. The avatar URL updates the
                author's avatar when they're a placeholder author; real
                registered accounts always keep their own avatar.
              </p>

              <form onSubmit={handleResolve} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="TikTok / Instagram pixie / YouTube Shorts link..."
                  type="url"
                  className="min-w-0 flex-1 p-3 border border-blue-200 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-blue-200"
                />
                <button
                  type="submit"
                  disabled={!sourceUrl.trim() || isResolving || isUploading}
                  className="shrink-0 bg-pink-500 text-white px-4 py-2 rounded-full shadow-sm hover:scale-105 transform transition disabled:opacity-50 disabled:hover:scale-100"
                >
                  {isResolving ? "Fetching..." : "Fetch info"}
                </button>
              </form>

              {resolveJob && uploadProgress === null && (
                <div className="mt-3">
                  <ProgressBlock job={resolveJob} />
                </div>
              )}

              {resolveError && (
                <div className="mt-2 text-red-600 dark:text-pink-300">
                  {resolveError}
                </div>
              )}

              {!resolveError && resolveNotice && (
                <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                  {resolveNotice}
                </div>
              )}

              {resolvedInfo && !resolveError && (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-blue-200 dark:border-purple-600 bg-blue-50/60 dark:bg-purple-800/40 p-3">
                  {resolvedInfo.coverUrl && (
                    <img
                      src={resolvedInfo.coverUrl}
                      alt="video cover"
                      className="h-14 w-24 rounded-lg border border-blue-200 dark:border-purple-600 object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-blue-700 dark:text-purple-200 truncate">
                      @{resolvedInfo.username}
                      {resolvedInfo.verified && (
                        <VerifiedBadge
                          className="ml-1"
                          title={`Verified on ${resolvedInfo.platform ?? "the source platform"}`}
                        />
                      )}
                      {resolvedInfo.durationSeconds != null
                        ? ` · ${Math.round(resolvedInfo.durationSeconds)}s`
                        : ""}
                      {resolvedInfo.platform
                        ? ` · ${resolvedInfo.platform}`
                        : ""}
                    </p>
                    <p className="text-xs text-blue-500 dark:text-purple-300">
                      Details filled in below — submitting downloads and
                      imports the video automatically.
                    </p>
                    {!resolvedInfo.avatarUrl && (
                      <p className="text-xs text-amber-600 dark:text-amber-300">
                        No avatar found — paste the avatar URL below if you
                        have one.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-blue-600 dark:text-purple-300">
                    Video file{" "}
                    {!resolvedUrl && (
                      <span className="text-pink-500">*</span>
                    )}
                  </label>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) =>
                      setVideoFile(e.target.files?.[0] || null)
                    }
                    className="mt-2 block w-full max-w-full text-sm text-blue-600 dark:text-purple-300"
                  />
                  {resolvedUrl && !videoFile && (
                    <p className="mt-1 text-xs text-blue-500 dark:text-purple-400">
                      Leave empty to download the video from the link above.
                    </p>
                  )}
                  {videoFile && (
                    <p className="mt-1 break-words text-xs text-blue-500 dark:text-purple-400">
                      {videoFile.name} (
                      {(videoFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-blue-600 dark:text-purple-300">
                      Author username <span className="text-pink-500">*</span>
                    </label>
                    <input
                      value={username}
                      onChange={(e) =>
                        setUsername(
                          truncateCodePoints(
                            e.target.value,
                            MAX_AUTHOR_USERNAME_LENGTH,
                          ),
                        )
                      }
                      placeholder="e.g. mira"
                      className="w-full p-3 border border-blue-200 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-600 dark:text-purple-300">
                      Avatar URL
                    </label>
                    <input
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://.../avatar.png"
                      type="url"
                      className="w-full p-3 border border-blue-200 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                </div>

                {avatarUrl.trim() &&
                  /^(\/images\/|https?:\/\/)/.test(avatarUrl.trim()) && (
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-blue-200 dark:border-purple-600 bg-pink-500">
                        <AvatarImage
                          src={
                            avatarUrl.trim().startsWith("/")
                              ? resolveAvatarUrl(avatarUrl.trim())
                              : `${API_BASE}/pixies/admin/avatar-proxy?url=${encodeURIComponent(avatarUrl.trim())}`
                          }
                          alt="avatar preview"
                        />
                      </span>
                      <p className="text-xs text-blue-500 dark:text-purple-400">
                        Avatar preview
                      </p>
                    </div>
                  )}

                <div>
                  <label className="block text-sm font-medium text-blue-600 dark:text-purple-300">
                    Caption
                  </label>
                  <textarea
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    placeholder="Say something about this video..."
                    rows={4}
                    maxLength={MAX_VIDEO_TITLE_LENGTH}
                    className="w-full p-3 border border-blue-200 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-blue-200 resize-y"
                  />
                  <p className="mt-1 text-xs text-blue-500 dark:text-purple-400">
                    {videoTitle.length}/{MAX_VIDEO_TITLE_LENGTH} — press enter
                    for a new line.
                  </p>
                </div>

                <TagInput
                  field={tagField}
                  label="Tags"
                  emptyPlaceholder="Add a tag (optional), e.g. gaming, anime..."
                />

                {uploadProgress !== null && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-purple-800">
                    <div
                      className="h-full bg-pink-500 transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}

                {message && (
                  <div className="text-red-600 dark:text-pink-300">
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    (!videoFile && !(resolvedUrl && resolvedInfo)) ||
                    isUploading ||
                    isResolving
                  }
                  className="inline-flex items-center gap-2 bg-pink-500 text-white px-4 py-2 rounded-full shadow-sm hover:scale-105 transform transition disabled:opacity-50 disabled:hover:scale-100"
                >
                  {isUploading
                    ? videoFile
                      ? "Uploading..."
                      : "Adding to queue..."
                    : videoFile
                      ? "Upload video"
                      : "Add to import queue"}
                </button>
              </form>
            </div>

            <ImportQueuePanel refreshKey={queueRefreshKey} />
            </div>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 dark:border-purple-500/30 bg-blue-100 dark:bg-purple-950/30 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600 dark:text-purple-300">
                <h2 className="text-center text-lg font-bold text-blue-700 dark:text-purple-200">
                  admin notes
                </h2>
                <p>
                  • Paste a TikTok / Instagram pixie / YouTube Shorts link and
                  press "Add to import queue" — downloads run one at a time on
                  the server, so you can queue several and leave the page.
                </p>
                <p>
                  • The queue below survives a refresh or a restart. Failed
                  imports can be retried from there.
                </p>
                <p>
                  • If automatic download is blocked, download the video
                  manually and upload it as a file instead.
                </p>
                <p>
                  • Videos are attributed to the username you enter — if it
                  doesn't exist yet, a new author is created with your avatar
                  URL.
                </p>
                <p>
                  • Placeholder authors (no registered account) get their
                  avatar refreshed on every new upload; real registered
                  accounts always keep their own avatar.
                </p>
                <p>
                  • Tags are optional — hashtags from the link are removed
                  from the caption and offered as tag suggestions instead.
                </p>
                <p>
                  • Resolved avatars are converted to PNG and hosted
                  locally.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default AdminPixies;
