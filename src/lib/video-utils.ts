import { API_BASE } from "@/lib/config";

export interface Video {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  description?: string;
  likes?: number;
  comments?: string[];
  userId?: string;
  author?: string;
  authorAvatar?: string | null;
}

export interface LikeMap {
  [key: string]: { count: number; liked: boolean };
}

export interface CommentsMap {
  [key: string]: string[];
}

export const resolveAsset = (asset?: string | null) => {
  if (!asset) return `${API_BASE}/images/default-avatar.png`;
  if (/^https?:\/\//.test(asset)) return asset;
  if (asset.startsWith("/")) return `${API_BASE}${asset}`;
  if (asset.includes("/")) return `${API_BASE}/${asset}`;
  return `${API_BASE}/images/${asset}`;
};

export const insertNestedComment = (arr: any[], comment: any) => {
  if (!comment.parentId) return [...arr, comment];
  const clone = arr.map((a) => ({
    ...a,
    children: a.children ? [...a.children] : [],
  }));
  const walker = (nodes: any[]): boolean => {
    for (const n of nodes) {
      if (n.id === comment.parentId) {
        n.children = n.children || [];
        n.children.push(comment);
        return true;
      }
      if (n.children && n.children.length) {
        if (walker(n.children)) return true;
      }
    }
    return false;
  };
  const found = walker(clone);
  if (found) return clone;
  return [...clone, comment];
};

export const shareVideo = async (video: Video) => {
  const url = `${API_BASE}${video.url}`;
  try {
    if ((navigator as any).share) {
      await (navigator as any).share({ title: video.name, url });
    } else {
      await navigator.clipboard.writeText(url);
      alert("Video link copied to clipboard");
    }
  } catch (e) {
    console.warn("share failed", e);
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
