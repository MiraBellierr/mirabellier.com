import React, { type ComponentType } from "react";
import type { Video, VideoComment } from "@/lib/video-utils";
import { resolveAsset } from "@/lib/video-utils";
import { API_BASE } from "@/lib/config";

type UserSummary = {
  id?: string;
  username?: string;
  avatar?: string | null;
};

type IconComponent = ComponentType<{ size?: number }>;
type IconSet = {
  Like?: IconComponent;
  Comment?: IconComponent;
  Share?: IconComponent;
  Volume?: IconComponent;
  VolumeOff?: IconComponent;
};

interface VideoPlayerProps {
  currentVideo: Video | undefined;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoLoading: boolean;
  videoError: string | null;
  isMuted: boolean;
  onToggleMute: (muted: boolean) => void;
  onError: () => void;
  onCanPlay: () => void;
  onEnded: () => void;
  currentVideoIndex: number;
  totalVideos: number;
  expandedMap: Record<string, boolean>;
  userCache: Record<string, UserSummary>;
  onToggleExpand: (id: string) => void;
  Icons: IconSet | null;
  onRetry: () => void;
  onLike: (id: string) => void;
  onShowComments: (id: string) => void;
  onShare: (video: Video) => void;
  likesMap: Record<string, { count: number; liked: boolean }>;
  commentsMap: Record<string, VideoComment[]>;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  currentVideo,
  videoRef,
  videoLoading,
  videoError,
  isMuted,
  onToggleMute,
  onError,
  onCanPlay,
  onEnded,
  currentVideoIndex,
  totalVideos,
  expandedMap,
  userCache,
  onToggleExpand,
  Icons,
  onRetry,
  onLike,
  onShowComments,
  onShare,
  likesMap,
  commentsMap,
}) => {
  const VolumeOffIcon = Icons?.VolumeOff;
  const VolumeOnIcon = Icons?.Volume;
  const LikeIcon = Icons?.Like;
  const CommentIcon = Icons?.Comment;
  const ShareIcon = Icons?.Share;

  return (
    <div className="w-full flex flex-col items-center">
      <div className="relative bg-black/50 p-4 rounded-xl overflow-hidden">
        <video
          key={currentVideo?.id}
          ref={videoRef}
          className="max-h-[70vh] w-auto max-w-full rounded-lg shadow-lg bg-black object-contain mx-auto"
          autoPlay
          playsInline
          loop
          muted={isMuted}
          preload="auto"
          onError={onError}
          onCanPlay={onCanPlay}
          onEnded={onEnded}
          style={{
            visibility: videoLoading ? "hidden" : "visible",
            display: "block",
          }}
        >
          <source src={`${API_BASE}${currentVideo?.url}`} type="video/mp4" />
        </video>

        {videoLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="p-4 bg-black/60 rounded-lg text-white">
              Loading video...
            </div>
          </div>
        )}

        {videoError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={onRetry}
              className="p-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        )}

        <button
          onClick={() => onToggleMute(!isMuted)}
          className="absolute left-3 top-3 z-50 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            VolumeOffIcon ? (
              <VolumeOffIcon size={18} />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M16.5 12c0-1.77-.77-3.29-1.98-4.32l1.42-1.42A8 8 0 0119.5 12a8 8 0 01-3.56 6.74l-1.42-1.42A5.99 5.99 0 0016.5 12zM5 9v6h4l5 5V4L9 9H5z" />
              </svg>
            )
          ) : VolumeOnIcon ? (
            <VolumeOnIcon size={18} />
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M7 9v6h4l5 5V4l-5 5H7z" />
            </svg>
          )}
        </button>

        <div className="absolute left-4 bottom-4 bg-black/50 text-white p-3 rounded-md max-w-[70%]">
          <div className="font-semibold">
            {(currentVideo?.userId &&
              (userCache[currentVideo.userId]?.username ||
                currentVideo.author)) ||
              currentVideo?.author ||
              "Unknown"}
          </div>
          {currentVideo?.description && (
            <div className="text-sm mt-1 leading-snug">
              {(() => {
                const MAX = 20;
                const desc = currentVideo.description || "";
                const expanded = expandedMap[currentVideo.id];
                if (desc.length > MAX && !expanded) {
                  return (
                    <>
                      {desc.slice(0, MAX)}...{" "}
                      <button
                        onClick={() => onToggleExpand(currentVideo.id)}
                        className="underline ml-1"
                      >
                        more
                      </button>
                    </>
                  );
                }
                if (desc.length > MAX && expanded) {
                  return (
                    <>
                      {desc}{" "}
                      <button
                        onClick={() => onToggleExpand(currentVideo.id)}
                        className="underline ml-1"
                      >
                        less
                      </button>
                    </>
                  );
                }
                return desc;
              })()}
            </div>
          )}
        </div>

        <div className="absolute left-0 right-0 bottom-3 flex justify-center">
          <div className="bg-black/40 text-white text-sm px-3 py-1 rounded-md">
            {totalVideos > 0
              ? `${currentVideoIndex + 1} / ${totalVideos}`
              : "0 / 0"}
          </div>
        </div>

        <div className="absolute right-4 bottom-8 flex flex-col items-center space-y-4">
          <a
            href={`/profile/${userCache[currentVideo?.userId || ""]?.username || currentVideo?.author || "#"}`}
            className="block"
          >
            <img
              src={resolveAsset(
                (currentVideo?.userId &&
                  userCache[currentVideo.userId]?.avatar) ||
                  currentVideo?.authorAvatar ||
                  "/images/default-avatar.png",
              )}
              alt={`${(currentVideo?.userId && userCache[currentVideo.userId]?.username) || "author"} avatar`}
              className="w-12 h-12 rounded-full border-2 border-white shadow-md object-cover hover:opacity-80 transition-opacity"
              loading="eager"
              fetchPriority="high"
              width="48"
              height="48"
            />
          </a>

          <button
            onClick={() => currentVideo && onLike(currentVideo.id)}
            className="flex flex-col items-center text-white"
          >
            <div
              className={`p-3 rounded-full bg-white/10 hover:bg-white/20 ${likesMap[currentVideo?.id || ""]?.liked ? "text-pink-400" : "text-white"}`}
            >
              {LikeIcon ? (
                <LikeIcon size={24} />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 21s-7-4.35-9.5-7.07C-0.02 10.01 3 6 6.5 6c1.74 0 3.04.99 3.5 2.09C10.46 6.99 11.76 6 13.5 6 17 6 20.02 10.01 21.5 13.93 19 16.65 12 21 12 21z" />
                </svg>
              )}
            </div>
            <span className="text-sm mt-1 text-white">
              {likesMap[currentVideo?.id || ""]?.count || 0}
            </span>
          </button>

          <button
            onClick={() => currentVideo && onShowComments(currentVideo.id)}
            className="flex flex-col items-center text-white"
          >
            <div className="p-3 rounded-full bg-white/10 hover:bg-white/20">
              {CommentIcon ? (
                <CommentIcon size={22} />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M21 6h-18v12h4v4l4-4h10z" />
                </svg>
              )}
            </div>
            <span className="text-sm mt-1 text-white">
              {(commentsMap[currentVideo?.id || ""] || []).length}
            </span>
          </button>

          <button
            onClick={() => currentVideo && onShare(currentVideo)}
            className="flex flex-col items-center text-white"
          >
            <div className="p-3 rounded-full bg-white/10 hover:bg-white/20">
              {ShareIcon ? (
                <ShareIcon size={20} />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18 8.59L16.59 7 12 11.59 7.41 7 6 8.59 10.59 13 6 17.41 7.41 19 12 14.41 16.59 19 18 17.41 13.41 13z" />
                </svg>
              )}
            </div>
            <span className="text-sm mt-1 text-white">Share</span>
          </button>
        </div>
      </div>
    </div>
  );
};
