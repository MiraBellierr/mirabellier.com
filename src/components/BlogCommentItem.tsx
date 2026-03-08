import { Link } from "react-router-dom";
import { resolveAsset, type BlogComment } from "@/lib/blog-utils";

const MAX_COMMENT_DEPTH = 3;

type BlogCommentItemProps = {
  comment: BlogComment;
  depth: number;
  onReplyClick: (commentId: string, username: string) => void;
};

export function BlogCommentItem({
  comment,
  depth,
  onReplyClick,
}: BlogCommentItemProps) {
  const author = comment.user || null;

  return (
    <div style={{ paddingLeft: depth * 14 }}>
      <div className="rounded-2xl border border-blue-200 bg-white/90 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <img
              src={resolveAsset(author?.avatar || "/images/default-avatar.png") || undefined}
              alt={`${author?.username || "user"} avatar`}
              className="h-10 w-10 rounded-full border border-blue-200 object-cover"
              width="40"
              height="40"
              loading="lazy"
            />
            <div>
              {author?.username ? (
                <Link
                  to={`/profile/${author.username}`}
                  className="font-semibold text-blue-700 hover:underline"
                >
                  {author.username}
                </Link>
              ) : (
                <div className="font-semibold text-blue-700">Unknown</div>
              )}
              <div className="text-xs text-blue-400">
                {new Date(comment.createdAt || Date.now()).toLocaleString()}
              </div>
            </div>
          </div>

          {depth < MAX_COMMENT_DEPTH ? (
            <button
              type="button"
              onClick={() =>
                onReplyClick(comment.id, author?.username || "user")
              }
              className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600 transition hover:bg-pink-100"
            >
              Reply
            </button>
          ) : null}
        </div>

        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {comment.text}
        </p>
      </div>

      {comment.children && comment.children.length > 0 ? (
        depth < MAX_COMMENT_DEPTH ? (
          <div className="mt-3 space-y-3">
            {comment.children.map((child) => (
              <BlogCommentItem
                key={child.id}
                comment={child}
                depth={depth + 1}
                onReplyClick={onReplyClick}
              />
            ))}
          </div>
        ) : (
          <div className="mt-2 text-xs text-blue-400">
            + {comment.children.length} more repl
            {comment.children.length === 1 ? "y" : "ies"}
          </div>
        )
      ) : null}
    </div>
  );
}
