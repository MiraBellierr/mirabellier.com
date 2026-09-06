// Client for the "pixies" feature (short vertical videos, formerly "reels").
// Naming: `Pixie*` for the feature/domain types and calls; `Video*` is kept for
// the generic medium plumbing (upload jobs, tag helpers, platform enum). The
// JSON API is served at `/pixies` (with `/videos` retained as a legacy alias);
// raw video files stay under `/videos/<filename>` so they don't collide with
// the `/pixies/:id` share-link route — `resolveVideoUrl` handles those paths.
import { API_BASE } from "@/lib/config";

export interface PixieAuthor {
  id: string;
  username: string;
  avatar?: string | null;
  bio?: string | null;
  /** Placeholder author imported from a verified TikTok/Instagram account. */
  verified?: boolean;
}

export interface Pixie {
  id: string;
  title: string;
  tags: string[];
  url: string;
  /** First-frame still shown until the video paints; null if not generated. */
  poster: string | null;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  likesCount: number;
  likedByMe: boolean;
  commentsCount: number;
  createdAt: string;
  author: PixieAuthor | null;
}

export interface PixieComment {
  id: string;
  content: string;
  createdAt: string;
  parentId: string | null;
  likesCount: number;
  likedByMe: boolean;
  replyCount: number;
  author: {
    id: string;
    username: string;
    avatar?: string | null;
    verified?: boolean;
  } | null;
}

export function resolveVideoUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = API_BASE.replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function resolvePosterUrl(poster?: string | null): string | undefined {
  if (!poster) return undefined;
  if (/^https?:\/\//.test(poster)) return poster;
  const base = API_BASE.replace(/\/$/, "");
  return `${base}${poster.startsWith("/") ? "" : "/"}${poster}`;
}

export function resolveAvatarUrl(avatar?: string | null): string | null {
  if (!avatar) return null;
  if (avatar.startsWith("blob:") || /^https?:\/\//.test(avatar)) return avatar;
  const base = API_BASE.replace(/\/$/, "");
  return `${base}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
}

export async function fetchPixiesFeed(
  includeId?: string,
  options?: { limit?: number; offset?: number; interests?: string[] },
): Promise<Pixie[]> {
  const params = new URLSearchParams();
  if (includeId) params.set("include", includeId);
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  if (options?.interests && options.interests.length > 0) {
    params.set("interests", options.interests.join(","));
  }
  const query = params.toString();
  const res = await fetch(
    `${API_BASE}/pixies/feed${query ? `?${query}` : ""}`,
    {
      credentials: "include",
    },
  );
  if (!res.ok) throw new Error("Failed to load pixies");
  return res.json() as Promise<Pixie[]>;
}

export async function searchPixies(
  query: string,
  options?: { limit?: number; offset?: number },
): Promise<Pixie[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const params = new URLSearchParams();
  params.set("q", trimmed);
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const res = await fetch(`${API_BASE}/pixies/search?${params.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to search pixies");
  return res.json() as Promise<Pixie[]>;
}

export type PopularWindow = "24h" | "7d" | "30d" | "all";

export async function fetchPopularPixies(
  options?: { window?: PopularWindow; limit?: number; offset?: number },
): Promise<Pixie[]> {
  const params = new URLSearchParams();
  if (options?.window) params.set("window", options.window);
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const query = params.toString();
  const res = await fetch(
    `${API_BASE}/pixies/popular${query ? `?${query}` : ""}`,
    {
      credentials: "include",
    },
  );
  if (!res.ok) throw new Error("Failed to load popular pixies");
  return res.json() as Promise<Pixie[]>;
}

/** Newest clips from accounts the signed-in viewer follows. */
export async function fetchFollowingPixies(
  options?: { limit?: number; offset?: number },
): Promise<Pixie[]> {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const query = params.toString();
  const res = await fetch(
    `${API_BASE}/pixies/following${query ? `?${query}` : ""}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error("Failed to load following feed");
  return res.json() as Promise<Pixie[]>;
}

export async function markPixieViewed(id: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/pixies/${id}/view`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Best effort — viewing history should never block the feed.
  }
}

export async function fetchUserPixies(userId: string): Promise<Pixie[]> {
  const res = await fetch(`${API_BASE}/pixies/user/${userId}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load pixies");
  return res.json() as Promise<Pixie[]>;
}

export interface UploadPixieInput {
  file: File;
  title: string;
  tags: string[];
  durationSeconds?: number | null;
  onProgress?: (progress: number) => void;
}

export const MAX_VIDEO_TAGS = 10;
export const MAX_TAG_LENGTH = 20;
export const MAX_VIDEO_TITLE_LENGTH = 4000;
// Matches the backend's `MAX_AUTHOR_USERNAME_LENGTH` — both count Unicode code
// points (via `Array.from`), not UTF-16 code units.
export const MAX_AUTHOR_USERNAME_LENGTH = 32;

/** Clamp a string to `maxLength` Unicode code points (astral-safe). */
export function truncateCodePoints(value: string, maxLength: number): string {
  const chars = Array.from(value);
  return chars.length <= maxLength ? value : chars.slice(0, maxLength).join("");
}

export function normalizeVideoTags(values: Array<string | unknown>): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    const tag = String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, MAX_TAG_LENGTH);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= MAX_VIDEO_TAGS) break;
  }
  return tags;
}

/** Read a local video file's duration (seconds) via a throwaway <video>. */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

export async function fetchVideoTagSuggestions(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/pixies/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data)
      ? data.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

export function uploadPixie(input: UploadPixieInput): Promise<Pixie> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("video", input.file);
    if (input.title.trim()) formData.append("title", input.title.trim());
    formData.append("tags", JSON.stringify(input.tags));
    if (input.durationSeconds != null) {
      formData.append("durationSeconds", String(input.durationSeconds));
    }

    xhr.open("POST", `${API_BASE}/pixies`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && input.onProgress) {
        input.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Pixie);
        } catch {
          reject(new Error("Upload failed"));
        }
      } else {
        reject(new Error("Upload failed"));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.send(formData);
  });
}

export async function togglePixieLike(
  id: string,
): Promise<{ liked: boolean; likesCount: number }> {
  const res = await fetch(`${API_BASE}/pixies/${id}/like`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to update like");
  return res.json() as Promise<{ liked: boolean; likesCount: number }>;
}

export async function deletePixie(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/pixies/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete video");
}

export interface AdminUploadPixieInput {
  file: File;
  title: string;
  tags: string[];
  username: string;
  avatarUrl: string;
  durationSeconds?: number | null;
  verified?: boolean;
  onProgress?: (progress: number) => void;
}

export function uploadAdminPixie(input: AdminUploadPixieInput): Promise<Pixie> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("video", input.file);
    formData.append("username", input.username.trim());
    if (input.avatarUrl.trim()) {
      formData.append("avatarUrl", input.avatarUrl.trim());
    }
    if (input.title.trim()) formData.append("title", input.title.trim());
    formData.append("tags", JSON.stringify(input.tags));
    if (input.durationSeconds != null) {
      formData.append("durationSeconds", String(input.durationSeconds));
    }
    if (input.verified) formData.append("verified", "true");

    xhr.open("POST", `${API_BASE}/pixies/admin`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && input.onProgress) {
        input.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Pixie);
        } catch {
          reject(new Error("Upload failed"));
        }
      } else {
        let message = "Upload failed";
        try {
          const parsed = JSON.parse(xhr.responseText) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // keep default message
        }
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.send(formData);
  });
}

export type VideoPlatform = "tiktok" | "instagram" | "youtube";

export interface ResolvedVideoInfo {
  platform?: VideoPlatform;
  username: string;
  avatarUrl: string;
  /**
   * Best-effort: `true` only when the source TikTok/Instagram account's
   * verified badge was positively detected in the scrape. Unknown → `false`.
   */
  verified?: boolean;
  caption: string;
  hashtags: string[];
  durationSeconds: number | null;
  coverUrl: string | null;
}

export interface ImportSocialPixieInput {
  url: string;
  title: string;
  tags: string[];
  username: string;
  avatarUrl: string;
  // Stable across the whole import attempt (including automatic restarts after
  // a backend reload). The server records it on the inserted row and, if it
  // sees the same key again, returns the already-imported video instead of
  // downloading and inserting a second copy.
  importKey?: string;
  // The resolved source account carries a verified badge — flag the placeholder
  // author so the checkmark shows in the feed.
  verified?: boolean;
}

/** A fresh idempotency key for one social-import attempt. */
export function newImportKey(): string {
  const cryptoObj =
    typeof crypto !== "undefined" ? (crypto as Crypto) : undefined;
  if (cryptoObj?.randomUUID) return `imp_${cryptoObj.randomUUID()}`;
  return `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export type PixieImportStatus =
  | "queued"
  | "running"
  | "done"
  | "error"
  | "canceled";

/** One row of the durable admin "download & import" queue. */
export interface PixieImportQueueItem {
  id: string;
  url: string;
  platform: VideoPlatform | null;
  title: string;
  username: string;
  avatarUrl: string;
  status: PixieImportStatus;
  stage: string;
  message: string;
  progress: number;
  error: string | null;
  /** `user_videos.id` of the imported clip once `status === "done"`. */
  videoId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoResolveResult {
  platform?: VideoPlatform;
  username: string;
  avatarUrl: string;
  verified?: boolean;
  caption: string;
  hashtags: string[];
  durationSeconds: number | null;
  coverUrl: string;
}

export interface VideoJobStatus {
  jobId: string;
  state: "queued" | "running" | "done" | "error";
  stage: string;
  message: string;
  progress: number;
  error?: string | null;
  result?: VideoResolveResult | null;
  pixie?: Pixie | null;
}

async function startVideoJob(
  endpoint: string,
  body: unknown,
): Promise<{ jobId: string }> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    | ({ jobId?: string } & { error?: string })
    | null;
  if (!res.ok || !data || typeof data.jobId !== "string") {
    throw new Error(data?.error || "Failed to start job");
  }
  return { jobId: data.jobId };
}

async function fetchVideoJobStatus(
  jobId: string,
  endpoint: string,
): Promise<VideoJobStatus> {
  const res = await fetch(`${API_BASE}${endpoint}/${jobId}`, {
    credentials: "include",
  });
  const data = (await res.json().catch(() => null)) as
    | (VideoJobStatus & { error?: string })
    | null;
  if (!res.ok || !data) {
    throw new Error(data?.error || "Failed to load job status");
  }
  return data;
}

export function startVideoResolve(url: string): Promise<{ jobId: string }> {
  return startVideoJob("/pixies/admin/resolve", { url });
}

export function fetchVideoResolveStatus(
  jobId: string,
): Promise<VideoJobStatus> {
  return fetchVideoJobStatus(jobId, "/pixies/admin/resolve/status");
}

async function importQueueRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok || !data) {
    throw new Error(
      (data as { error?: string } | null)?.error ||
        "Import queue request failed",
    );
  }
  return data as T;
}

/** Add a link to the durable server-side import queue. */
export async function enqueuePixieImport(
  input: ImportSocialPixieInput,
): Promise<PixieImportQueueItem> {
  const data = await importQueueRequest<{ item: PixieImportQueueItem }>(
    "/pixies/admin/import/queue",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: input.url,
        title: input.title,
        tags: input.tags,
        username: input.username,
        avatarUrl: input.avatarUrl,
        importKey: input.importKey,
        verified: input.verified ?? false,
      }),
    },
  );
  return data.item;
}

/** Current queue: running + waiting first, then recently finished. */
export async function fetchPixieImportQueue(): Promise<PixieImportQueueItem[]> {
  const data = await importQueueRequest<{ items: PixieImportQueueItem[] }>(
    "/pixies/admin/import/queue",
  );
  return data.items;
}

export function cancelPixieImport(id: string): Promise<unknown> {
  return importQueueRequest(
    `/pixies/admin/import/queue/${encodeURIComponent(id)}/cancel`,
    { method: "POST" },
  );
}

export function retryPixieImport(id: string): Promise<unknown> {
  return importQueueRequest(
    `/pixies/admin/import/queue/${encodeURIComponent(id)}/retry`,
    { method: "POST" },
  );
}

export function clearFinishedPixieImports(): Promise<{ removed: number }> {
  return importQueueRequest<{ removed: number }>(
    "/pixies/admin/import/queue/clear",
    { method: "POST" },
  );
}

// Message the backend returns when the job map no longer knows the job id
// (it was pruned after 15 minutes — or, more often, the server restarted
// between "start job" and "poll job", since jobs are in-memory only).
export const VIDEO_JOB_LOST_MESSAGE = "Job not found";

function isVideoJobLostError(err: unknown): boolean {
  return err instanceof Error && err.message === VIDEO_JOB_LOST_MESSAGE;
}

/**
 * Starts a background video job and polls it until it reaches a terminal
 * state. If the backend restarts mid-job (dev servers reload on file
 * changes, deployments restart the process), the in-memory job disappears
 * and every poll answers "Job not found" — this helper then transparently
 * starts the job again instead of failing the whole action.
 */
export async function pollVideoJob(
  start: () => Promise<{ jobId: string }>,
  fetchStatus: (jobId: string) => Promise<VideoJobStatus>,
  onUpdate?: (status: VideoJobStatus) => void,
  options?: { onRestart?: () => void; maxRestarts?: number },
): Promise<VideoJobStatus> {
  const maxRestarts = Math.max(0, options?.maxRestarts ?? 2);
  for (let attempt = 0; ; attempt += 1) {
    const { jobId } = await start();
    try {
      for (;;) {
        const status = await fetchStatus(jobId);
        onUpdate?.(status);
        if (status.state === "done") return status;
        if (status.state === "error") {
          throw new Error(status.error || "The task failed");
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    } catch (err) {
      if (!isVideoJobLostError(err) || attempt >= maxRestarts) throw err;
      options?.onRestart?.();
      // Outer loop restarts the job with fresh inputs.
    }
  }
}

export async function fetchPixieComments(id: string): Promise<PixieComment[]> {
  const res = await fetch(`${API_BASE}/pixies/${id}/comments`);
  if (!res.ok) throw new Error("Failed to load comments");
  return res.json() as Promise<PixieComment[]>;
}

export async function postPixieComment(
  id: string,
  content: string,
  parentId?: string | null,
): Promise<PixieComment> {
  const res = await fetch(`${API_BASE}/pixies/${id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content, parentId: parentId ?? undefined }),
  });
  if (!res.ok) throw new Error("Failed to post comment");
  return res.json() as Promise<PixieComment>;
}

export async function togglePixieCommentLike(
  videoId: string,
  commentId: string,
): Promise<{ liked: boolean; likesCount: number }> {
  const res = await fetch(
    `${API_BASE}/pixies/${videoId}/comments/${commentId}/like`,
    {
      method: "POST",
      credentials: "include",
    },
  );
  if (!res.ok) throw new Error("Failed to update comment like");
  return res.json() as Promise<{ liked: boolean; likesCount: number }>;
}

export async function deletePixieComment(
  videoId: string,
  commentId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/pixies/${videoId}/comments/${commentId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete comment");
}

// ── @mention resolution ──
// Linkify "@name" tokens in captions and comments, but only when the name
// belongs to a real account. Results are memoised process-wide so a caption
// scrolling in and out of view never re-hits the API.
const mentionResolveCache = new Map<string, boolean>();
const mentionResolveInflight = new Map<string, Promise<boolean>>();

export function peekResolvedUsername(username: string): boolean | undefined {
  return mentionResolveCache.get(username.toLowerCase());
}

export function resolveUsername(username: string): Promise<boolean> {
  const key = username.toLowerCase();
  const cached = mentionResolveCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = mentionResolveInflight.get(key);
  if (pending) return pending;
  const request = fetch(
    `${API_BASE}/user/by-username/${encodeURIComponent(username)}`,
  )
    .then((res) => {
      const ok = res.ok;
      mentionResolveCache.set(key, ok);
      return ok;
    })
    .catch(() => {
      mentionResolveCache.set(key, false);
      return false;
    })
    .finally(() => {
      mentionResolveInflight.delete(key);
    });
  mentionResolveInflight.set(key, request);
  return request;
}
