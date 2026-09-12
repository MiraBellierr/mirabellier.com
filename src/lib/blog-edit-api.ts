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

  if (!response.ok) throw new Error("Failed to save post");

  return await response.json();
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
