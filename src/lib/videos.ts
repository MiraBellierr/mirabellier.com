import { API_BASE } from "@/lib/config";

export interface ReelAuthor {
  id: string;
  username: string;
  avatar?: string | null;
  bio?: string | null;
}

export interface Reel {
  id: string;
  title: string;
  tags: string[];
  url: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  likesCount: number;
  likedByMe: boolean;
  commentsCount: number;
  createdAt: string;
  author: ReelAuthor | null;
}

export interface ReelComment {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    avatar?: string | null;
  } | null;
}

export function resolveVideoUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = API_BASE.replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function resolveAvatarUrl(avatar?: string | null): string | null {
  if (!avatar) return null;
  if (avatar.startsWith("blob:") || /^https?:\/\//.test(avatar)) return avatar;
  const base = API_BASE.replace(/\/$/, "");
  return `${base}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
}

export async function fetchReelsFeed(
  includeId?: string,
  options?: { limit?: number; exclude?: string[] },
): Promise<Reel[]> {
  const params = new URLSearchParams();
  if (includeId) params.set("include", includeId);
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.exclude && options.exclude.length > 0) {
    params.set("exclude", options.exclude.join(","));
  }
  const query = params.toString();
  const res = await fetch(
    `${API_BASE}/videos/feed${query ? `?${query}` : ""}`,
    {
      credentials: "include",
    },
  );
  if (!res.ok) throw new Error("Failed to load reels");
  return res.json() as Promise<Reel[]>;
}

export async function markReelViewed(id: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/videos/${id}/view`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Best effort — viewing history should never block the feed.
  }
}

export async function fetchUserReels(userId: string): Promise<Reel[]> {
  const res = await fetch(`${API_BASE}/videos/user/${userId}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load reels");
  return res.json() as Promise<Reel[]>;
}

export interface UploadReelInput {
  file: File;
  title: string;
  tags: string[];
  durationSeconds?: number | null;
  onProgress?: (progress: number) => void;
}

export const MAX_VIDEO_TAGS = 10;
export const MAX_TAG_LENGTH = 20;
export const MAX_VIDEO_TITLE_LENGTH = 4000;

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

export async function fetchVideoTagSuggestions(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/videos/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data)
      ? data.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

export function uploadReel(input: UploadReelInput): Promise<Reel> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("video", input.file);
    if (input.title.trim()) formData.append("title", input.title.trim());
    formData.append("tags", JSON.stringify(input.tags));
    if (input.durationSeconds != null) {
      formData.append("durationSeconds", String(input.durationSeconds));
    }

    xhr.open("POST", `${API_BASE}/videos`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && input.onProgress) {
        input.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Reel);
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

export async function toggleReelLike(
  id: string,
): Promise<{ liked: boolean; likesCount: number }> {
  const res = await fetch(`${API_BASE}/videos/${id}/like`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to update like");
  return res.json() as Promise<{ liked: boolean; likesCount: number }>;
}

export async function deleteReel(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/videos/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete video");
}

export interface AdminUploadReelInput {
  file: File;
  title: string;
  tags: string[];
  username: string;
  avatarUrl: string;
  durationSeconds?: number | null;
  onProgress?: (progress: number) => void;
}

export function uploadAdminReel(input: AdminUploadReelInput): Promise<Reel> {
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

    xhr.open("POST", `${API_BASE}/videos/admin`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && input.onProgress) {
        input.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Reel);
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
  caption: string;
  hashtags: string[];
  durationSeconds: number | null;
  coverUrl: string | null;
}

function isTikTokUrl(url: string): boolean {
  try {
    return new URL(url)
      .hostname.replace(/^www\./, "")
      .endsWith("tiktok.com");
  } catch {
    return false;
  }
}

export async function resolveSocialVideo(url: string): Promise<ResolvedVideoInfo> {
  const res = await fetch(`${API_BASE}/videos/admin/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ url }),
  });
  const data = (await res.json().catch(() => null)) as
    | (ResolvedVideoInfo & { error?: string })
    | null;
  if (!res.ok || !data) {
    if (res.status === 404 && isTikTokUrl(url)) {
      const legacy = await fetch(`${API_BASE}/videos/admin/tiktok-resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url }),
      });
      const legacyData = (await legacy.json().catch(() => null)) as
        | (ResolvedVideoInfo & { error?: string })
        | null;
      if (!legacy.ok || !legacyData) {
        throw new Error(legacyData?.error || "Failed to resolve video");
      }
      return legacyData;
    }
    throw new Error(data?.error || "Failed to resolve video");
  }
  return data;
}

export interface ImportSocialReelInput {
  url: string;
  title: string;
  tags: string[];
  username: string;
  avatarUrl: string;
}

export interface SocialImportStatus {
  jobId: string;
  state: "queued" | "running" | "done" | "error";
  stage: string;
  message: string;
  progress: number;
  error?: string | null;
  reel?: Reel | null;
}

export interface VideoResolveResult {
  platform?: VideoPlatform;
  username: string;
  avatarUrl: string;
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
  reel?: Reel | null;
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
  return startVideoJob("/videos/admin/resolve", { url });
}

export function fetchVideoResolveStatus(
  jobId: string,
): Promise<VideoJobStatus> {
  return fetchVideoJobStatus(jobId, "/videos/admin/resolve/status");
}

export function startSocialImport(
  input: ImportSocialReelInput,
): Promise<{ jobId: string }> {
  return startVideoJob("/videos/admin/import", {
    url: input.url,
    title: input.title,
    tags: input.tags,
    username: input.username,
    avatarUrl: input.avatarUrl,
  });
}

export function fetchSocialImportStatus(
  jobId: string,
): Promise<VideoJobStatus> {
  return fetchVideoJobStatus(jobId, "/videos/admin/import/status");
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

export async function fetchReelComments(id: string): Promise<ReelComment[]> {
  const res = await fetch(`${API_BASE}/videos/${id}/comments`);
  if (!res.ok) throw new Error("Failed to load comments");
  return res.json() as Promise<ReelComment[]>;
}

export async function postReelComment(
  id: string,
  content: string,
): Promise<ReelComment> {
  const res = await fetch(`${API_BASE}/videos/${id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed to post comment");
  return res.json() as Promise<ReelComment>;
}

export async function deleteReelComment(
  videoId: string,
  commentId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/videos/${videoId}/comments/${commentId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete comment");
}
