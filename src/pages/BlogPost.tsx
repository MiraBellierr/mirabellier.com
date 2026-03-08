import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Post from "../parts/Post";
import kannaHappy from "@/assets/anime/kanna-happy.webp";
import { BlogCommentItem } from "@/components/BlogCommentItem";
import { addPostComment, fetchPost, togglePostLike } from "@/lib/blog-api";
import {
  extractTextFromContent,
  countNestedComments,
  insertNestedComment,
  resolveAsset,
  type Post as BlogPostRecord,
} from "@/lib/blog-utils";
import { useAuth } from "@/states/AuthContext";

const DEFAULT_SEO = {
  title: "Mirabellier | Cute thoughts & cozy corners",
  description:
    "Mirabellier - a tiny, cozy blog where I share cute thoughts, fuzzy photos, and little projects.",
  url: "https://mirabellier.com/",
  image: "https://mirabellier.com/background.jpg",
};

function setMetaContent(selector: string, content: string) {
  const element = document.querySelector(selector) as HTMLMetaElement | null;
  if (element) {
    element.content = content;
  }
}

function getBlogSeoDescription(post: BlogPostRecord) {
  const summary = (post.shortDescription || "").trim();
  if (summary) return summary;

  const extracted = extractTextFromContent(post.content).trim();
  if (extracted) return extracted.slice(0, 160);

  return post.title;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 21s-6.716-4.35-9.193-8.228C.903 9.78 2.04 6 5.87 6c2.068 0 3.388 1.11 4.13 2.18C10.742 7.11 12.062 6 14.13 6 17.96 6 19.097 9.78 21.193 12.772 18.716 16.65 12 21 12 21Z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z" />
    </svg>
  );
}

const BlogPost = () => {
  const { slug } = useParams();
  const auth = useAuth();
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const id = (() => {
    if (!slug) return undefined;
    const parts = slug.split("-");
    return parts.length ? parts[parts.length - 1] : slug;
  })();

  const [post, setPost] = useState<BlogPostRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [isLiking, setIsLiking] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);

  const loadPost = async (postId: string) => {
    const found = await fetchPost(postId);
    setPost(found);
    return found;
  };

  useEffect(() => {
    if (slug) {
      const canonicalLink = document.querySelector(
        'link[rel="canonical"]',
      ) as HTMLLinkElement;
      if (canonicalLink) {
        canonicalLink.href = `https://mirabellier.com/blog/${slug}`;
      }
    }

    return () => {
      const canonicalLink = document.querySelector(
        'link[rel="canonical"]',
      ) as HTMLLinkElement;
      if (canonicalLink) {
        canonicalLink.href = "https://mirabellier.com/";
      }
    };
  }, [slug]);

  useEffect(() => {
    if (post && slug) {
      const postUrl = `https://mirabellier.com/blog/${slug}`;
      const description = getBlogSeoDescription(post);
      const imageUrl = resolveAsset(post.thumbnail) || DEFAULT_SEO.image;
      const authorProfileUrl = post.userId
        ? `https://mirabellier.com/profile/${encodeURIComponent(post.author)}`
        : undefined;

      document.title = post.title;
      setMetaContent('meta[name="description"]', description);
      setMetaContent(
        'meta[name="robots"]',
        "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
      );
      setMetaContent('meta[property="og:type"]', "article");
      setMetaContent('meta[property="og:title"]', post.title);
      setMetaContent('meta[property="og:description"]', description);
      setMetaContent('meta[property="og:url"]', postUrl);
      setMetaContent('meta[property="og:image"]', imageUrl);
      setMetaContent('meta[name="twitter:title"]', post.title);
      setMetaContent('meta[name="twitter:description"]', description);
      setMetaContent('meta[name="twitter:image"]', imageUrl);

      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = "blogpost-structured-data";
      script.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        url: postUrl,
        mainEntityOfPage: postUrl,
        datePublished: post.createdAt,
        dateModified: post.updatedAt || post.createdAt,
        author: {
          "@type": "Person",
          name: post.author,
          ...(authorProfileUrl ? { url: authorProfileUrl } : {}),
        },
        publisher: {
          "@type": "Person",
          name: "Mirabellier",
        },
        description,
        ...(imageUrl ? { image: [imageUrl] } : {}),
        ...(post.tags && post.tags.length
          ? { keywords: post.tags.join(", ") }
          : {}),
      });
      document.head.appendChild(script);

      return () => {
        const oldScript = document.getElementById("blogpost-structured-data");
        if (oldScript) oldScript.remove();
        document.title = DEFAULT_SEO.title;
        setMetaContent('meta[name="description"]', DEFAULT_SEO.description);
        setMetaContent(
          'meta[name="robots"]',
          "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
        );
        setMetaContent('meta[property="og:type"]', "website");
        setMetaContent('meta[property="og:title"]', DEFAULT_SEO.title);
        setMetaContent(
          'meta[property="og:description"]',
          "A tiny, cozy blog sharing small joys: photos, videos, and short posts.",
        );
        setMetaContent('meta[property="og:url"]', DEFAULT_SEO.url);
        setMetaContent('meta[property="og:image"]', DEFAULT_SEO.image);
        setMetaContent('meta[name="twitter:title"]', DEFAULT_SEO.title);
        setMetaContent(
          'meta[name="twitter:description"]',
          "A tiny, cozy blog sharing small joys: photos, videos, and short posts.",
        );
        setMetaContent('meta[name="twitter:image"]', DEFAULT_SEO.image);
      };
    }
  }, [post, slug]);

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError("Post not found");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        await loadPost(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const likes = Array.isArray(post?.likes) ? post.likes : [];
  const comments = Array.isArray(post?.comments) ? post.comments : [];
  const commentCount = countNestedComments(comments);
  const liked =
    !!auth.user?.id && Array.isArray(post?.likes)
      ? post.likes.includes(auth.user.id)
      : false;

  const handleLike = async () => {
    if (!post) return;
    if (!auth.token) {
      setInteractionError("Log in to like or comment on this post.");
      return;
    }

    setInteractionError(null);
    setIsLiking(true);

    try {
      const response = await togglePostLike(
        post.id,
        auth.token,
        liked ? "unlike" : "like",
      );

      if (Array.isArray(response.likes)) {
        setPost((current) =>
          current
            ? {
                ...current,
                likes: response.likes,
              }
            : current,
        );
      }
      await loadPost(String(post.id));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update like";
      setInteractionError(message);
    } finally {
      setIsLiking(false);
    }
  };

  const handleReplyClick = (commentId: string, username: string) => {
    setReplyTo({ id: commentId, username });
    setInteractionError(null);
    commentInputRef.current?.focus();
  };

  const handleSubmitComment = async () => {
    if (!post) return;

    const normalizedText = commentText.trim();
    if (!normalizedText) return;

    if (!auth.token) {
      setInteractionError("Log in to like or comment on this post.");
      return;
    }

    setInteractionError(null);
    setIsCommenting(true);

    try {
      const created = await addPostComment(
        post.id,
        normalizedText,
        auth.token,
        replyTo?.id || null,
      );

      setPost((current) =>
        current
          ? {
              ...current,
              comments: insertNestedComment(current.comments || [], created),
            }
          : current,
      );
      await loadPost(String(post.id));
      setCommentText("");
      setReplyTo(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to post comment";
      setInteractionError(message);
    } finally {
      setIsCommenting(false);
    }
  };

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />
      <div
        className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
          <div className="flex-col space-y-4 lg:sticky lg:top-4 lg:self-start lg:w-[250px]">
            <Navigation />
            <div className="mt-3 mb-auto justify-center items-center flex">
              <img
                className="w-full rounded-lg border border-blue-400"
                src={kannaHappy}
                width="350"
                height="350"
                alt="kanna gif"
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>

          <main className="w-full lg:flex-1 px-2 py-4 sm:px-4 lg:px-8 xl:px-12">
            <div className="mx-auto w-full max-w-4xl space-y-4">
              {loading ? (
                <div className="card-border p-4 text-center sm:p-6">
                  <p>Loading post...</p>
                </div>
              ) : error ? (
                <div className="rounded-xl border border-red-400 bg-red-100 p-4 text-red-700 sm:p-6">
                  Error: {error}
                </div>
              ) : post ? (
                <>
                  <div className="card-border p-4 sm:p-6 lg:p-8">
                    <h2 className="mb-2 text-xl font-bold text-blue-700 sm:text-2xl">
                      {post.title}
                    </h2>
                    <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-blue-500">
                      {post.userId ? (
                        <Link
                          to={`/profile/${post.author}`}
                          className="flex items-center gap-2 transition-opacity hover:opacity-80"
                        >
                          {post.authorAvatar ? (
                            <img
                              src={resolveAsset(post.authorAvatar) || undefined}
                              className="h-6 w-6 rounded-full"
                              alt="author avatar"
                            />
                          ) : null}
                          <span>By {post.author}</span>
                        </Link>
                      ) : (
                        <>
                          {post.authorAvatar ? (
                            <img
                              src={resolveAsset(post.authorAvatar) || undefined}
                              className="h-6 w-6 rounded-full"
                              alt="author avatar"
                            />
                          ) : null}
                          <span>By {post.author}</span>
                        </>
                      )}
                      <span>
                        • {new Date(post.createdAt).toLocaleDateString()}
                      </span>
                    </p>

                    <div>
                      <Post html={post.content} />
                    </div>
                  </div>

                  <div className="card-border p-4 sm:p-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleLike}
                        disabled={isLiking}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          liked
                            ? "border-pink-300 bg-pink-100 text-pink-600"
                            : "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                        } disabled:cursor-not-allowed disabled:opacity-70`}
                      >
                        <HeartIcon filled={liked} />
                        <span>{liked ? "Liked" : "Like"}</span>
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs text-slate-600">
                          {likes.length}
                        </span>
                      </button>

                      <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600">
                        <CommentIcon />
                        <span>{commentCount} comments</span>
                      </div>
                    </div>

                    {!auth.token ? (
                      <p className="mt-4 text-sm text-blue-500">
                        <Link to="/login" className="font-semibold hover:underline">
                          Log in
                        </Link>{" "}
                        to like and comment on this post.
                      </p>
                    ) : null}

                    {interactionError ? (
                      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                        {interactionError}
                      </div>
                    ) : null}

                    <div className="mt-5 rounded-3xl border border-blue-200 bg-blue-50/80 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-blue-700">
                            Join the comments
                          </h3>
                          <p className="text-sm text-blue-500">
                            {replyTo
                              ? `Replying to @${replyTo.username}`
                              : "Share what you think about this post."}
                          </p>
                        </div>

                        {replyTo ? (
                          <button
                            type="button"
                            onClick={() => setReplyTo(null)}
                            className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-100"
                          >
                            Cancel reply
                          </button>
                        ) : null}
                      </div>

                      <textarea
                        ref={commentInputRef}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                            e.preventDefault();
                            handleSubmitComment();
                          }
                        }}
                        placeholder={
                          replyTo
                            ? `Reply to @${replyTo.username}...`
                            : "Write a comment..."
                        }
                        className="mt-4 min-h-28 w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
                      />

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-blue-400">
                          Press Ctrl+Enter to post quickly.
                        </p>

                        <button
                          type="button"
                          onClick={handleSubmitComment}
                          disabled={
                            isCommenting || !auth.token || !commentText.trim()
                          }
                          className="rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:bg-pink-300"
                        >
                          {isCommenting ? "Posting..." : "Post comment"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-6 space-y-4">
                      {comments.length === 0 ? (
                        <div className="rounded-2xl border border-blue-200 bg-white/80 px-4 py-5 text-sm text-blue-500">
                          No comments yet. Be the first one to start the thread.
                        </div>
                      ) : (
                        comments.map((comment) => (
                          <BlogCommentItem
                            key={comment.id}
                            comment={comment}
                            depth={0}
                            onReplyClick={handleReplyClick}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="card-border space-y-1 p-4 sm:p-6">
                  <h2 className="mb-2 text-center text-xl font-bold text-blue-700">
                    Post not found
                  </h2>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default BlogPost;
