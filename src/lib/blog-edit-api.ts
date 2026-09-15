import { API_BASE } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";

export const fetchTagSuggestions = async () => {
  try {
    const res = await fetch(`${API_BASE}/tags`, {
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.filter(Boolean).slice(0, 100) : [];
  } catch {
    return [];
  }
};

export const fetchPostForEdit = async (id: string) => {
  const res = await fetch(`${API_BASE}/posts/${id}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to load post: ${res.status} ${errorText}`);
  }
  return await res.json();
};

export const savePost = async (
  postId: string | null,
  blogData: Record<string, unknown>,
  token?: string,
) => {
  const method = postId ? "PUT" : "POST";
  const url = postId ? `${API_BASE}/posts/${postId}` : `${API_BASE}/posts`;

  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(blogData),
  });

  if (!response.ok) {
    // The backend answers JSON errors, but a proxy can still send HTML (or an
    // empty body), so the text is read defensively and the status is kept:
    // without it a 413 is indistinguishable from a 500 in the toast.
    const body = await response
      .json()
      .catch(() => null as { error?: string } | null);
    const detail = body?.error || response.statusText || "Unknown error";

    if (response.status === 413) {
      throw new Error(
        "This post is too large to save. Remove some inline images or shorten it, then try again.",
      );
    }

    throw new Error(`Failed to save post (${response.status}): ${detail}`);
  }

  return await response.json();
};

// Uploads one image for a post and returns its public URL. Lives here (not in
// `tiptap-utils`) so the editor-agnostic save path in BlogEdit can use it
// without statically importing the tiptap module graph.
export const uploadPostImage = async (
  file: File,
  abortSignal?: AbortSignal,
): Promise<string> => {
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(`${API_BASE}/posts-img`, {
    method: "POST",
    credentials: "include",
    body: formData,
    signal: abortSignal,
  });

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => null as { error?: string } | null);
    const detail = body?.error || response.statusText || "Upload failed";
    throw new Error(`Image upload failed (${response.status}): ${detail}`);
  }

  const result = await response.json();
  return `${API_BASE}${result.path}`;
};

export const uploadPostAudio = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("audio", file);

  const response = await fetch(`${API_BASE}/posts-audio`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error || "Failed to upload audio");
  }

  const result = await response.json();
  return result.path as string;
};

export const validateTags = (tags: (string | unknown)[]) => {
  return tags
    .map((t) =>
      String(t || "")
        .trim()
        .replace(/[^A-Za-z0-9_-]/g, "")
        .slice(0, 20),
    )
    .filter(Boolean);
};

export const normalizeTags = (data: Record<string, unknown>) => {
  const loadedTags = Array.isArray(data.tags)
    ? data.tags
    : data.tags
      ? typeof data.tags === "string"
        ? JSON.parse(data.tags as string)
        : []
      : [];
  return validateTags(loadedTags);
};
