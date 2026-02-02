import { API_BASE } from "@/lib/config";

export const fetchPosts = async () => {
  const response = await fetch(`${API_BASE}/posts`);
  if (!response.ok) {
    throw new Error("Failed to fetch posts");
  }
  return await response.json();
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
