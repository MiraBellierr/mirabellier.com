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

export interface TikTokVideoInfo {
  username: string;
  avatarUrl: string;
  caption: string;
  hashtags: string[];
  durationSeconds: number | null;
  coverUrl: string | null;
}

export async function resolveTikTokVideo(url: string): Promise<TikTokVideoInfo> {
  const res = await fetch(`${API_BASE}/videos/admin/tiktok-resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ url }),
  });
  const data = (await res.json().catch(() => null)) as
    | (TikTokVideoInfo & { error?: string })
    | null;
  if (!res.ok || !data) {
    throw new Error(data?.error || "Failed to resolve TikTok video");
  }
  return data;
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
