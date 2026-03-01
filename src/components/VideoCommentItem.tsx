import React, { type ComponentType } from "react";
import { API_BASE } from "@/lib/config";
import type { VideoComment } from "@/lib/video-utils";

type UserSummary = {
  id?: string;
  username?: string;
  avatar?: string | null;
};

type IconComponent = ComponentType<{ size?: number }>;
type IconSet = {
  Like?: IconComponent;
};

interface CommentItemProps {
  comment: VideoComment;
  videoId: string;
  depth: number;
  userCache: Record<string, UserSummary>;
  Icons: IconSet | null;
  onReplyClick: (commentId: string, username: string) => void;
}

const resolveAsset = (asset?: string | null) => {
  if (!asset) return `${API_BASE}/images/default-avatar.png`;
  if (/^https?:\/\//.test(asset)) return asset;
  if (asset.startsWith("/")) return `${API_BASE}${asset}`;
  if (asset.includes("/")) return `${API_BASE}/${asset}`;
  return `${API_BASE}/images/${asset}`;
};

export const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  videoId: _videoId,
  depth,
  userCache,
  Icons,
  onReplyClick,
}) => {
  const author = comment.userId
    ? userCache[comment.userId] || comment.user
    : comment.user || null;
  const MAX_COMMENT_DEPTH = 3;

  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <div className="p-3 rounded-lg bg-white shadow-sm border border-pink-50">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <img
              src={resolveAsset(author?.avatar || "/images/default-avatar.png")}
              alt={`${author?.username || "user"} avatar`}
              className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
              loading="eager"
              width="40"
              height="40"
            />
            <div>
              <div className="flex items-center space-x-2">
                <div className="font-semibold text-sm text-pink-600">
                  {author?.username || "Unknown"}
                </div>
                <div className="text-xs text-gray-400">
                  @{(author?.username || "user").toLowerCase()}
                </div>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(comment.createdAt || Date.now()).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end space-y-2">
            <button
              onClick={() => {}}
              className="text-pink-500 p-1 rounded-full hover:bg-pink-50"
            >
              {Icons && Icons.Like ? <Icons.Like size={18} /> : "❤"}
            </button>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-800">{comment.text}</div>
        {depth < MAX_COMMENT_DEPTH && (
          <div className="mt-3 flex items-center space-x-3">
            <button
              onClick={() => {
                onReplyClick(comment.id, author?.username || "user");
              }}
              className="text-pink-600 text-sm hover:underline"
            >
              Reply ✨
            </button>
          </div>
        )}
      </div>
      {comment.children &&
        comment.children.length > 0 &&
        depth < MAX_COMMENT_DEPTH && (
          <div className="mt-3 space-y-3">
            {comment.children.map((ch) => (
              <CommentItem
                key={ch.id}
                comment={ch}
                videoId={_videoId}
                depth={depth + 1}
                userCache={userCache}
                Icons={Icons}
                onReplyClick={onReplyClick}
              />
            ))}
          </div>
        )}
      {comment.children &&
        comment.children.length > 0 &&
        depth >= MAX_COMMENT_DEPTH && (
          <div className="mt-2 text-xs text-pink-500 italic">
            + {comment.children.length} more repl
            {comment.children.length === 1 ? "y" : "ies"}
          </div>
        )}
    </div>
  );
};
