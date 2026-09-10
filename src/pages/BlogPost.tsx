import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useParams, Link } from "react-router-dom";
import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Post from "../parts/Post";
import kannaHappy from "@/assets/anime/kanna-happy.webp";
import { BlogTagList } from "@/components/BlogTagList";
import { BlogCommentItem } from "@/components/BlogCommentItem";
import { useIsDarkMode } from "@/hooks/use-is-dark-mode";
import {
  addPostComment,
  fetchPost,
  fetchPosts,
  togglePostLike,
} from "@/lib/blog-api";
import {
  extractHeadings,
  extractTextFromContent,
  countNestedComments,
  formatReadingTime,
  insertNestedComment,
  readingTimeMinutes,
  resolveAsset,
  slugify,
  type Post as BlogPostRecord,
  type TocHeading,
} from "@/lib/blog-utils";
import {
  getPostNeighbors,
  getSeriesContext,
  type SeriesContext,
} from "@/lib/blog-navigation";
import {
  ensureAnonymousLikeId,
  readAnonymousLikeId,
} from "@/lib/post-like-session";
import { usePageSeo } from "@/lib/seo";
import { useAuth } from "@/states/AuthContext";
import "@/styles/blog.css";
import { imageWidthSrcSet } from "@/lib/image-srcset";

const BLOG_POST_FALLBACK_TITLE = "Mirabellier ⭐ — Cute thoughts & cozy corners";
const BLOG_POST_FALLBACK_DESCRIPTION =
  "A tiny, cozy blog sharing small joys, photos, and short posts.";
const BLOG_POST_FALLBACK_IMAGE = "https://mirabellier.com/background.jpg";

// Mirrors `buildPostOgVersion` in mirabellier-backend/lib/post-og-image.js so the
// SPA and the crawler HTML request the exact same generated-card URL.
function getPostOgVersion(post: BlogPostRecord) {
  return String(post.updatedAt || post.createdAt || "")
    .replace(/[^0-9a-z]/gi, "")
    .slice(0, 24);
}

function getGeneratedOgImage(slug: string | undefined, post: BlogPostRecord | null) {
  if (!slug) return BLOG_POST_FALLBACK_IMAGE;
  const version = post ? getPostOgVersion(post) : "";
  const query = version ? `?v=${encodeURIComponent(version)}` : "";
  return `https://mirabellier.com/og/post/${encodeURIComponent(slug)}.png${query}`;
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

const MIN_TOC_HEADINGS = 2;

function TableOfContents({
  headings,
  activeId,
  onNavigate,
}: {
  headings: TocHeading[];
  activeId: string | null;
  onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>, id: string) => void;
}) {
  return (
    <nav aria-label="Table of contents" className="text-sm">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-500 dark:text-purple-300">
        On this page
      </p>
      <ul className="space-y-1">
        {headings.map((heading) => (
          <li
            key={heading.id}
            style={{ paddingInlineStart: `${(heading.level - 2) * 0.75}rem` }}
          >
            <a
              href={`#${heading.id}`}
              onClick={(event) => onNavigate(event, heading.id)}
              aria-current={activeId === heading.id ? "location" : undefined}
              className={`block rounded py-0.5 transition-colors hover:text-pink-600 ${
                activeId === heading.id
                  ? "font-semibold text-pink-600"
                  : "text-blue-600 dark:text-purple-200"
              }`}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function blogPath(post: Pick<BlogPostRecord, "id" | "title">) {
  return `/blog/${slugify(post.title)}-${post.id}`;
}

function FlowLink({
  direction,
  label,
  post,
}: {
  direction: "prev" | "next";
  label: string;
  post: BlogPostRecord | null;
}) {
  if (!post) {
    // Keep the empty grid cell so the sibling link holds its side.
    return <span aria-hidden="true" className="hidden sm:block" />;
  }

  return (
    <Link
      to={blogPath(post)}
      className={`flex flex-col rounded-xl border border-blue-200 bg-blue-50/60 p-3 transition hover:border-pink-300 hover:bg-pink-50/60 dark:border-purple-500/30 dark:bg-purple-900/20 ${
        direction === "next" ? "sm:items-end sm:text-right" : ""
      }`}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-blue-400">
        {direction === "prev" ? "← " : ""}
        {label}
        {direction === "next" ? " →" : ""}
      </span>
      <span className="mt-1 line-clamp-2 font-semibold text-blue-800 dark:text-purple-200">
        {post.title}
      </span>
    </Link>
  );
}

function PostFlowNav({
  series,
  older,
  newer,
}: {
  series: SeriesContext<BlogPostRecord> | null;
  older: BlogPostRecord | null;
  newer: BlogPostRecord | null;
}) {
  // Inside a series, part-to-part links replace the date-based older/newer.
  const prev = series ? series.previous : older;
  const next = series ? series.next : newer;

  if (!series && !prev && !next) return null;

  return (
    <nav aria-label="Keep reading" className="card-border space-y-4 p-4 sm:p-6">
      {series ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-500 dark:text-purple-300">
            Part {series.index + 1} of {series.parts.length}
          </p>
          <p className="text-lg font-bold text-blue-800 dark:text-purple-200">
            {series.name}
          </p>
          <ol className="mt-3 space-y-1 text-sm">
            {series.parts.map((part, index) => (
              <li key={part.id} className="flex gap-2">
                <span className="w-5 shrink-0 text-right tabular-nums text-blue-400">
                  {index + 1}.
                </span>
                {index === series.index ? (
                  <span
                    aria-current="page"
                    className="font-semibold text-pink-600"
                  >
                    {part.title}
                  </span>
                ) : (
                  <Link
                    to={blogPath(part)}
                    className="text-blue-600 hover:underline dark:text-purple-200"
                  >
                    {part.title}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {prev || next ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FlowLink
            direction="prev"
            label={series ? "Previous part" : "Older post"}
            post={prev}
          />
          <FlowLink
            direction="next"
            label={series ? "Next part" : "Newer post"}
            post={next}
          />
        </div>
      ) : null}
    </nav>
  );
}

const BlogPost = () => {
  const { slug } = useParams();
  const auth = useAuth();
  const isDark = useIsDarkMode();
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const articleRef = useRef<HTMLDivElement | null>(null);
  const id = (() => {
    if (!slug) return undefined;
    const parts = slug.split("-");
    return parts.length ? parts[parts.length - 1] : slug;
  })();

  const [post, setPost] = useState<BlogPostRecord | null>(null);
  const [allPosts, setAllPosts] = useState<BlogPostRecord[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
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
  const postUrl = slug
    ? `https://mirabellier.com/blog/${slug}`
    : "https://mirabellier.com/blog";
  const postSeoDescription = post
    ? getBlogSeoDescription(post)
    : BLOG_POST_FALLBACK_DESCRIPTION;
  const postSeoImage = post
    ? resolveAsset(post.thumbnail) || getGeneratedOgImage(slug, post)
    : BLOG_POST_FALLBACK_IMAGE;
  const authorProfileUrl =
    post && post.userId
      ? `https://mirabellier.com/profile/${encodeURIComponent(post.author)}`
      : undefined;
  const blogPostStructuredData =
    post && slug
      ? {
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
          description: postSeoDescription,
          ...(postSeoImage ? { image: [postSeoImage] } : {}),
          ...(post.tags && post.tags.length
            ? { keywords: post.tags.join(", ") }
            : {}),
        }
      : null;

  usePageSeo({
    canonical: postUrl,
    structuredDataId: "blogpost-structured-data",
    structuredData: blogPostStructuredData,
    socialMeta: {
      title: post?.title || BLOG_POST_FALLBACK_TITLE,
      description: postSeoDescription,
      url: postUrl,
      image: postSeoImage,
      type: post ? "article" : "website",
    },
  });

  const headings = useMemo<TocHeading[]>(
    () => (post ? extractHeadings(post.content) : []),
    [post],
  );
  const readMinutes = post ? readingTimeMinutes(post.content) : 0;
  const showToc = headings.length >= MIN_TOC_HEADINGS;

  // The whole archive, for prev/next and series grouping. This reuses the
  // cached `/posts` SWR fetch, so arriving from /blog usually costs nothing.
  useEffect(() => {
    const controller = new AbortController();
    fetchPosts(controller.signal)
      .then(setAllPosts)
      .catch(() => {
        /* prev/next is a bonus — silently skip it if the archive won't load */
      });
    return () => controller.abort();
  }, []);

  const neighbors = useMemo(
    () =>
      post
        ? getPostNeighbors(allPosts, post.id)
        : { older: null, newer: null },
    [allPosts, post],
  );
  const seriesContext = useMemo(
    () => (post ? getSeriesContext(allPosts, post.id) : null),
    [allPosts, post],
  );

  // Give the rendered <h2>–<h4> elements the same ids `extractHeadings` derived
  // (matched by document order, skipping any empty headings), and track which
  // one the reader has scrolled past for the sticky TOC. The Tiptap editor
  // mounts asynchronously and can re-mount when table support loads, so re-sync
  // on any subtree change.
  useEffect(() => {
    const container = articleRef.current;
    if (!container || headings.length === 0) {
      setActiveHeadingId(null);
      return;
    }

    // The heading text sits ~120px below the anchor line we consider "current".
    const ACTIVE_OFFSET = 120;
    let frame = 0;

    const assignIds = () => {
      const rendered = Array.from(
        container.querySelectorAll<HTMLElement>("h2, h3, h4"),
      ).filter((element) => (element.textContent ?? "").trim().length > 0);

      rendered.forEach((element, index) => {
        const heading = headings[index];
        if (heading && element.id !== heading.id) element.id = heading.id;
      });
    };

    const updateActive = () => {
      let current: string | null = null;
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (!element) continue;
        if (element.getBoundingClientRect().top - ACTIVE_OFFSET <= 0) {
          current = heading.id;
        } else {
          break; // headings are in document order — nothing later can be past.
        }
      }
      setActiveHeadingId(current);
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        assignIds();
        updateActive();
      });
    };

    assignIds();
    updateActive();

    const mutations = new MutationObserver(schedule);
    mutations.observe(container, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, { passive: true });

    return () => {
      mutations.disconnect();
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, [headings]);

  const handleTocNavigate = (
    event: ReactMouseEvent<HTMLAnchorElement>,
    headingId: string,
  ) => {
    const target = document.getElementById(headingId);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${headingId}`);
    setActiveHeadingId(headingId);
  };

  const loadPost = async (postId: string) => {
    const found = await fetchPost(postId);
    setPost(found);
    return found;
  };

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
  const storedAnonymousLikeId = readAnonymousLikeId();
  const viewerLikeId = auth.user?.id
    ? String(auth.user.id)
    : storedAnonymousLikeId;
  const liked = !!viewerLikeId && likes.includes(viewerLikeId);

  const handleLike = async () => {
    if (!post) return;

    setInteractionError(null);
    setIsLiking(true);

    try {
      const response = await togglePostLike(
        post.id,
        {
          action: liked ? "unlike" : "like",
          token: auth.token || undefined,
          clientId: auth.token ? null : ensureAnonymousLikeId(),
          anonymousId: auth.token ? storedAnonymousLikeId : null,
        },
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
      setInteractionError("Log in to comment on this post.");
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
    <div className="blog-post-page min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header ownsPageHeading={false} />
      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
          <div className="left-side-rail flex-col space-y-4 lg:w-[250px]">
            <Navigation />
            <div className="mt-3 mb-auto justify-center items-center flex">
              <img
                className="w-full rounded-lg border border-blue-400"
                src={kannaHappy}
                width="350"
                height="350"
                alt="kanna gif"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>

          <main className="w-full lg:flex-1 px-2 py-4 sm:px-4 lg:px-8 xl:px-12">
            <div className="mx-auto w-full max-w-4xl space-y-4">
              {loading ? (
                <div className="card-border p-4 text-center sm:p-6">
                  <h1 className="sr-only">Blog post</h1>
                  <p>Loading post...</p>
                </div>
              ) : error ? (
                <div className="rounded-xl border border-red-400 bg-red-100 p-4 text-red-700 sm:p-6">
                  <h1 className="sr-only">Blog post</h1>
                  Error: {error}
                </div>
              ) : post ? (
                <>
                  <div className="card-border p-4 sm:p-6 lg:p-8">
                    <h1 className="mb-4 text-2xl font-bold leading-tight text-blue-800 sm:text-3xl dark:text-purple-200">
                      {post.title}
                    </h1>
                    <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-blue-500">
                      {post.userId ? (
                        <Link
                          to={`/profile/${post.author}`}
                          className="flex items-center gap-2 transition-opacity hover:opacity-80"
                        >
                          {post.authorAvatar ? (
                            <img
                              src={resolveAsset(post.authorAvatar) || undefined}
                              srcSet={
                                imageWidthSrcSet(
                                  resolveAsset(post.authorAvatar),
                                  [48, 96, 192],
                                ) || undefined
                              }
                              sizes="24px"
                              className="h-6 w-6 rounded-full"
                              alt="author avatar"
                              width="24"
                              height="24"
                            />
                          ) : null}
                          <span>By {post.author}</span>
                        </Link>
                      ) : (
                        <>
                          {post.authorAvatar ? (
                            <img
                              src={resolveAsset(post.authorAvatar) || undefined}
                              srcSet={
                                imageWidthSrcSet(
                                  resolveAsset(post.authorAvatar),
                                  [48, 96, 192],
                                ) || undefined
                              }
                              sizes="24px"
                              className="h-6 w-6 rounded-full"
                              alt="author avatar"
                              width="24"
                              height="24"
                            />
                          ) : null}
                          <span>By {post.author}</span>
                        </>
                      )}
                      <span>
                        • {new Date(post.createdAt).toLocaleDateString()}
                      </span>
                      {readMinutes ? (
                        <span>• {formatReadingTime(readMinutes)}</span>
                      ) : null}
                    </p>

                    {post.tags && post.tags.length > 0 ? (
                      <BlogTagList
                        tags={post.tags}
                        isDark={isDark}
                        className="mb-4"
                      />
                    ) : null}

                    {showToc ? (
                      <details className="mb-4 rounded-xl border border-blue-200 bg-blue-50/70 p-3 lg:hidden dark:border-purple-500/30 dark:bg-purple-900/20">
                        <summary className="cursor-pointer text-sm font-semibold text-blue-700 dark:text-purple-200">
                          Table of contents
                        </summary>
                        <div className="mt-3">
                          <TableOfContents
                            headings={headings}
                            activeId={activeHeadingId}
                            onNavigate={handleTocNavigate}
                          />
                        </div>
                      </details>
                    ) : null}

                    <div ref={articleRef}>
                      <Post html={post.content} />
                    </div>
                  </div>

                  <PostFlowNav
                    series={seriesContext}
                    older={neighbors.older}
                    newer={neighbors.newer}
                  />

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
                        <span className="blog-like-count rounded-full bg-white/80 px-2 py-0.5 text-xs text-slate-600">
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
                        Likes work without logging in.{" "}
                        <Link to="/login" className="font-semibold hover:underline">
                          Log in
                        </Link>{" "}
                        to comment on this post.
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
                          className="blog-comment-submit rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:bg-pink-300"
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
                  <h1 className="mb-2 text-center text-xl font-bold text-blue-700">
                    Post not found
                  </h1>
                </div>
              )}
            </div>
          </main>

          {post && showToc ? (
            <aside className="hidden shrink-0 lg:block lg:w-[220px]">
              <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-blue-200 bg-blue-50/80 p-4 dark:border-purple-500/30 dark:bg-purple-900/20">
                <TableOfContents
                  headings={headings}
                  activeId={activeHeadingId}
                  onNavigate={handleTocNavigate}
                />
              </div>
            </aside>
          ) : null}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default BlogPost;
