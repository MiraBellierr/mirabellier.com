import { API_BASE } from "@/lib/config";
import type { LikeMap, CommentsMap, VideoComment } from "@/lib/video-utils";
import { insertNestedComment } from "@/lib/video-utils";

type UserSummary = {
  id?: string;
  username?: string;
  avatar?: string | null;
  [key: string]: unknown;
};

type UserCache = Record<string, UserSummary>;
type SetUserCache = (fn: (prev: UserCache) => UserCache) => void;
type SetLikesMap = (fn: (prev: LikeMap) => LikeMap) => void;
type SetCommentsMap = (fn: (prev: CommentsMap) => CommentsMap) => void;

type LikeAction = "like" | "unlike";

type LikeApiResponse = {
  likes?: string[];
};

type CommentApiResponse = VideoComment;

function buildLikeState(likesCount: number, liked: boolean) {
  return { count: likesCount, liked };
}

function invertLikeState(state: { count: number; liked: boolean }) {
  return buildLikeState(
    state.liked ? Math.max(0, state.count - 1) : state.count + 1,
    !state.liked,
  );
}

function getLikeState(likesMap: LikeMap, videoId: string) {
  return likesMap[videoId] || buildLikeState(0, false);
}

function rollbackLike(videoId: string, setLikesMap: SetLikesMap) {
  setLikesMap((prev) => {
    const current = getLikeState(prev, videoId);
    return { ...prev, [videoId]: invertLikeState(current) };
  });
}

function getLikeAction(liked: boolean): LikeAction {
  return liked ? "like" : "unlike";
}

async function readErrorText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function updateLikesFromServer(
  videoId: string,
  response: LikeApiResponse,
  user: UserSummary | null | undefined,
  optimisticLiked: boolean,
  setLikesMap: SetLikesMap,
) {
  const likesArray = Array.isArray(response.likes) ? response.likes : [];
  setLikesMap((prev) => ({
    ...prev,
    [videoId]: {
      count: likesArray.length,
      liked: user?.id ? likesArray.includes(user.id) : optimisticLiked,
    },
  }));
}

export const fetchAndCacheUser = async (
  id: string | null | undefined,
  userCache: UserCache,
  setUserCache: SetUserCache,
) => {
  if (!id) return null;
  if (userCache[id]) return userCache[id];

  try {
    const response = await fetch(`${API_BASE}/user/${id}`);
    if (!response.ok) return null;

    const data = (await response.json()) as UserSummary;
    setUserCache((prev) => ({ ...prev, [id]: data }));
    return data;
  } catch {
    return null;
  }
};

export const useFetchAndCacheUser = () => {
  return { fetchAndCacheUser };
};

export const toggleVideoLike = async (
  id: string,
  token: string | null | undefined,
  user: UserSummary | null | undefined,
  setLikesMap: SetLikesMap,
): Promise<void> => {
  let optimisticLiked = false;

  setLikesMap((prev) => {
    const current = getLikeState(prev, id);
    const next = invertLikeState(current);
    optimisticLiked = next.liked;
    return { ...prev, [id]: next };
  });

  try {
    const response = await fetch(`${API_BASE}/videos/${id}/like`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: getLikeAction(optimisticLiked) }),
    });

    if (!response.ok) {
      await readErrorText(response);
      rollbackLike(id, setLikesMap);
      return;
    }

    const data = (await response.json()) as LikeApiResponse;
    updateLikesFromServer(id, data, user, optimisticLiked, setLikesMap);
  } catch {
    rollbackLike(id, setLikesMap);
  }
};

export const addComment = async (
  videoId: string,
  text: string,
  token: string | null | undefined,
  parentId: string | null | undefined,
  setCommentsMap: SetCommentsMap,
  onSuccess: () => void,
): Promise<void> => {
  const normalizedText = text.trim();
  if (!normalizedText) return;

  if (!token) {
    alert("Please log in to comment");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/videos/${videoId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text: normalizedText, parentId }),
    });

    if (!response.ok) {
      const details = await readErrorText(response);
      alert(`Failed to post comment: ${response.status} ${details}`);
      return;
    }

    const created = (await response.json()) as CommentApiResponse;
    setCommentsMap((prev) => {
      const currentComments = prev[videoId] ? [...prev[videoId]] : [];
      return {
        ...prev,
        [videoId]: insertNestedComment(currentComments, created),
      };
    });

    onSuccess();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    alert(`Failed to post comment: ${message}`);
  }
};
