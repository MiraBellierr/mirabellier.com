import { API_BASE } from "@/lib/config";
import {
  normalizeComments,
  normalizePost,
  type BlogComment,
  type Post,
} from "@/lib/blog-utils";

type LikeAction = "like" | "unlike";

type LikeApiResponse = {
  likes?: string[];
  liked?: boolean;
};

async function readErrorText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export const fetchPosts = async (): Promise<Post[]> => {
  const response = await fetch(`${API_BASE}/posts`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch posts");
  }
  const data = (await response.json()) as unknown[];
  return Array.isArray(data) ? data.map(normalizePost) : [];
};

export const fetchPost = async (id: string | number): Promise<Post> => {
  const response = await fetch(`${API_BASE}/posts/${id}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch post");
  }
  return normalizePost(await response.json());
};

export const togglePostLike = async (
  id: string | number,
  token: string,
  action: LikeAction,
) => {
  const response = await fetch(`${API_BASE}/posts/${id}/like`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action }),
  });

  if (!response.ok) {
    const details = await readErrorText(response);
    throw new Error(details || "Failed to update like");
  }

  return (await response.json()) as LikeApiResponse;
};

export const addPostComment = async (
  id: string | number,
  text: string,
  token: string,
  parentId?: string | null,
): Promise<BlogComment> => {
  const response = await fetch(`${API_BASE}/posts/${id}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text, parentId }),
  });

  if (!response.ok) {
    const details = await readErrorText(response);
    throw new Error(details || "Failed to add comment");
  }

  const [comment] = normalizeComments([await response.json()]);
  if (!comment) {
    throw new Error("Failed to parse created comment");
  }
  return comment;
};

export const deletePost = async (
  id: string | number,
  token: string | undefined,
) => {
  const resp = await fetch(`${API_BASE}/posts/${id}`, {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || "Failed to delete post");
  }

  return resp;
};
