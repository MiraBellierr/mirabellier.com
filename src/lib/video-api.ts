import { API_BASE } from "@/lib/config";
import type { LikeMap, CommentsMap } from "./video-utils";
import { insertNestedComment } from "./video-utils";

export const fetchAndCacheUser = async (
  id: string | null | undefined,
  userCache: Record<string, any>,
  setUserCache: (fn: (prev: Record<string, any>) => Record<string, any>) => void,
) => {
  if (!id) return null;
  if (userCache[id]) return userCache[id];
  try {
    const res = await fetch(`${API_BASE}/user/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    setUserCache((prev) => ({ ...prev, [id]: data }));
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const useFetchAndCacheUser = () => {
  return { fetchAndCacheUser };
};

export const toggleVideoLike = async (
  id: string,
  token: string | null | undefined,
  user: any,
  setLikesMap: (fn: (prev: LikeMap) => LikeMap) => void,
): Promise<void> => {
  let nextLiked = false;
  setLikesMap((prev) => {
    const cur = prev[id] || { count: 0, liked: false };
    const next = {
      count: cur.liked ? Math.max(0, cur.count - 1) : cur.count + 1,
      liked: !cur.liked,
    };
    nextLiked = next.liked;
    return { ...prev, [id]: next };
  });

  try {
    const action = nextLiked ? "like" : "unlike";
    const res = await fetch(`${API_BASE}/videos/${id}/like`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("like API error", res.status, text);
      setLikesMap((prev) => {
        const cur = prev[id] || { count: 0, liked: false };
        const rollback = {
          count: cur.liked ? Math.max(0, cur.count - 1) : cur.count + 1,
          liked: !cur.liked,
        };
        return { ...prev, [id]: rollback };
      });
      return;
    }
    const data = await res.json();
    const likesArr: string[] = Array.isArray(data.likes) ? data.likes : [];
    setLikesMap((prev) => ({
      ...prev,
      [id]: {
        count: likesArr.length,
        liked: user ? likesArr.includes(user.id) : nextLiked,
      },
    }));
  } catch (e) {
    console.error("like request failed", e);
    setLikesMap((prev) => {
      const cur = prev[id] || { count: 0, liked: false };
      const rollback = {
        count: cur.liked ? Math.max(0, cur.count - 1) : cur.count + 1,
        liked: !cur.liked,
      };
      return { ...prev, [id]: rollback };
    });
  }
};

export const addComment = async (
  videoId: string,
  text: string,
  token: string | null | undefined,
  parentId: string | null | undefined,
  setCommentsMap: (fn: (prev: CommentsMap) => CommentsMap) => void,
  onSuccess: () => void,
): Promise<void> => {
  if (!text.trim()) return;
  if (!token) {
    alert("Please log in to comment");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/videos/${videoId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, parentId }),
    });

    if (!res.ok) {
      let details = "";
      try {
        details = await res.text();
      } catch (error) {
        details = String(error);
      }
      console.error("Failed to post comment", res.status, details);
      alert(`Failed to post comment: ${res.status} ${details}`);
      return;
    }

    const created = await res.json();

    setCommentsMap((prev) => {
      const cur = prev[videoId] ? [...prev[videoId]] : [];
      const updated = insertNestedComment(cur, created);
      return { ...prev, [videoId]: updated };
    });

    onSuccess();
  } catch (e) {
    console.error("post comment error", e);
    alert("Failed to post comment: " + (e as any).message);
  }
};
