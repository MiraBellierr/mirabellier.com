import { API_BASE } from "@/lib/config";

export interface VideoComment {
  id: string;
  text?: string;
  parentId?: string | null;
  userId?: string;
  createdAt?: string;
  children?: VideoComment[];
  user?: {
    id?: string;
    username?: string;
    avatar?: string | null;
  } | null;
}

export interface Video {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  description?: string;
  likes?: string[] | number;
  comments?: VideoComment[];
  userId?: string;
  author?: string;
  authorAvatar?: string | null;
}

export interface LikeMap {
  [key: string]: { count: number; liked: boolean };
}

export interface CommentsMap {
  [key: string]: VideoComment[];
}

type ShareCapableNavigator = Navigator & {
  share?: (data: {
    title?: string;
    text?: string;
    url?: string;
  }) => Promise<void>;
};

export const resolveAsset = (asset?: string | null) => {
  if (!asset) return `${API_BASE}/images/default-avatar.png`;
  if (/^https?:\/\//.test(asset)) return asset;
  if (asset.startsWith("/")) return `${API_BASE}${asset}`;
  if (asset.includes("/")) return `${API_BASE}/${asset}`;
  return `${API_BASE}/images/${asset}`;
};

function cloneCommentTree(comments: VideoComment[]): VideoComment[] {
  return comments.map((comment) => ({
    ...comment,
    children: comment.children ? cloneCommentTree(comment.children) : [],
  }));
}

function insertCommentIntoTree(
  nodes: VideoComment[],
  comment: VideoComment,
): boolean {
  for (const node of nodes) {
    if (node.id === comment.parentId) {
      node.children = node.children || [];
      node.children.push(comment);
      return true;
    }

    if (node.children && node.children.length > 0) {
      const inserted = insertCommentIntoTree(node.children, comment);
      if (inserted) return true;
    }
  }
  return false;
}

export const insertNestedComment = (
  comments: VideoComment[],
  comment: VideoComment,
) => {
  if (!comment.parentId) return [...comments, comment];

  const cloned = cloneCommentTree(comments);
  const inserted = insertCommentIntoTree(cloned, comment);
  if (inserted) return cloned;

  return [...cloned, comment];
};

export const shareVideo = async (video: Video) => {
  const shareUrl = `${API_BASE}${video.url}`;

  try {
    const shareNavigator = navigator as ShareCapableNavigator;
    if (typeof shareNavigator.share === "function") {
      await shareNavigator.share({ title: video.name, url: shareUrl });
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    alert("Video link copied to clipboard");
  } catch {
    // Intentionally ignore share cancellation and clipboard failures.
  }
};

export const isMobileDevice = (): boolean => {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
};
