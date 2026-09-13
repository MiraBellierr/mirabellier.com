import { API_BASE } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import { swrJson } from "@/lib/api-cache";
import {
  normalizeComments,
  normalizePost,
  normalizePostSummary,
  type BlogComment,
  type Post,
  type PostSummary,
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

// Full documents (tiptap `content`, comment bodies). The app renders from
// `fetchPostSummaries`; this stays for callers that need whole posts.
export const fetchPosts = (signal?: AbortSignal): Promise<Post[]> =>
  swrJson(
    `${API_BASE}/posts`,
    (json) => (Array.isArray(json) ? json.map(normalizePost) : []),
    {
      init: { credentials: "include" },
      signal,
      errorFrom: () => new Error("Failed to fetch posts"),
    },
  );

// The lightweight list projection (`?view=list`): ~8 kB for the whole archive
// instead of the full tiptap documents. Use this wherever only list metadata
// is rendered.
export const fetchPostSummaries = (signal?: AbortSignal): Promise<PostSummary[]> =>
  swrJson(
    `${API_BASE}/posts?view=list`,
    (json) => (Array.isArray(json) ? json.map(normalizePostSummary) : []),
    {
      init: { credentials: "include" },
      signal,
      errorFrom: () => new Error("Failed to fetch posts"),
    },
  );

export const fetchPost = async (
  id: string | number,
  signal?: AbortSignal,
): Promise<Post> => {
  const response = await fetch(`${API_BASE}/posts/${id}`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });
  if (!response.ok) {
    throw new Error("Failed to fetch post");
  }
  return normalizePost(await response.json());
};

export const togglePostLike = async (
  id: string | number,
  options: {
    action: LikeAction;
    token?: string;
    clientId?: string | null;
    anonymousId?: string | null;
  },
) => {
  const response = await fetch(`${API_BASE}/posts/${id}/like`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(shouldSendBearerToken(options.token)
        ? { Authorization: `Bearer ${options.token}` }
        : {}),
      ...(options.clientId
        ? { "X-Like-Client-Id": options.clientId }
        : {}),
      ...(options.anonymousId
        ? { "X-Like-Anonymous-Id": options.anonymousId }
        : {}),
    },
    body: JSON.stringify({ action: options.action }),
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
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : {}),
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
    credentials: "include",
    headers: {
      ...(shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || "Failed to delete post");
  }

  return resp;
};
