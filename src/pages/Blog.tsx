import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AsyncStateCard from "@/components/AsyncStateCard";
import { BlogTagList } from "@/components/BlogTagList";
import { useAuth } from "@/states/AuthContext";
import { useConfirm } from "@/states/ConfirmContext";
import { useToast } from "@/states/ToastContext";
import { useDebounce } from "@/hooks/use-debounce";
import { useIsDarkMode } from "@/hooks/use-is-dark-mode";
import { getFriendlyFetchMessage } from "@/lib/friendly-fetch-message";
import kannaHappy from "@/assets/anime/kanna-happy.webp";
import kannaEating from "@/assets/anime/kanna-eating.webp";
import kannaSmile from "@/assets/anime/kanna-smile.webp";
import {
  extractTextFromContent,
  slugify,
  resolveAsset,
  countNestedComments,
  type Post as PostType,
} from "@/lib/blog-utils";
import { fetchPosts, deletePost } from "@/lib/blog-api";

const POST_MENU_WIDTH = 144;
const POST_MENU_HEIGHT = 88;
const POST_MENU_GAP = 8;
const POST_MENU_VIEWPORT_PADDING = 8;

const Blog = () => {
  const [posts, setPosts] = useState<PostType[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<PostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const postsPerPage = 4;

  // Debounce search to reduce filtering operations on main thread
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [openMenuId, setOpenMenuId] = useState<string | number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    // Update canonical URL to point to the Blog page
    const canonicalLink = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement;
    if (canonicalLink) {
      canonicalLink.href = "https://mirabellier.com/blog";
    }

    // Add structured data for rich results
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "blog-structured-data";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Mirabellier Blog",
      description: "Personal blog with thoughts, stories, and updates",
      url: "https://mirabellier.com/blog",
      author: {
        "@type": "Person",
        name: "Mirabellier",
      },
    });
    document.head.appendChild(script);

    return () => {
      const canonicalLink = document.querySelector(
        'link[rel="canonical"]',
      ) as HTMLLinkElement;
      if (canonicalLink) {
        canonicalLink.href = "https://mirabellier.com/";
      }
      const oldScript = document.getElementById("blog-structured-data");
      if (oldScript) oldScript.remove();
    };
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (
        target.closest("[data-post-menu]") ||
        target.closest("[data-post-menu-button]")
      )
        return;
      setOpenMenuId(null);
      setMenuPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenMenuId(null);
        setMenuPos(null);
      }
    };
    const onScroll = () => {
      setOpenMenuId(null);
      setMenuPos(null);
    };
    const onResize = () => {
      setOpenMenuId(null);
      setMenuPos(null);
    };

    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const toggleMenu = (
    id: string | number,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const target = e.currentTarget as HTMLButtonElement | null;
    setOpenMenuId((prev) => {
      const next = prev === id ? null : id;
      if (next) {
        if (!target) return prev; // safety guard
        const rect = target.getBoundingClientRect();
        const left = Math.min(
          Math.max(
            rect.right - POST_MENU_WIDTH,
            POST_MENU_VIEWPORT_PADDING,
          ),
          window.innerWidth - POST_MENU_WIDTH - POST_MENU_VIEWPORT_PADDING,
        );
        const hasRoomBelow =
          rect.bottom + POST_MENU_GAP + POST_MENU_HEIGHT <= window.innerHeight;
        const top = hasRoomBelow
          ? rect.bottom + POST_MENU_GAP
          : Math.max(
              rect.top - POST_MENU_HEIGHT - POST_MENU_GAP,
              POST_MENU_VIEWPORT_PADDING,
            );
        setMenuPos({ top, left });
      } else {
        setMenuPos(null);
      }
      return next;
    });
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const urlSearchTerm = searchParams.get("search") || "";
    setSearchTerm(urlSearchTerm);
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) {
      params.set("search", searchTerm);
    } else {
      params.delete("search");
    }
    navigate({ search: params.toString() }, { replace: true });
  }, [searchTerm, navigate]);

  const loadPosts = useCallback(async () => {
    setLoading(true);

    try {
      const data = await fetchPosts();
      setPosts(data);
      setFilteredPosts(data);
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred while loading posts");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const handleDelete = async (id: string | number) => {
    const shouldDelete = await confirm({
      title: "Delete blog post?",
      message: "Delete this post? This cannot be undone.",
      confirmLabel: "Delete post",
      cancelLabel: "Keep post",
    });
    if (!shouldDelete) return;

    try {
      await deletePost(id, auth?.token || undefined);

      setPosts((prev) => prev.filter((p) => p.id !== id));
      setFilteredPosts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      showToast("Failed to delete post");
    }
  };

  useEffect(() => {
    if (!debouncedSearchTerm) {
      setFilteredPosts(posts);
      setCurrentPage(1);
    } else {
      // Defer filtering to prevent blocking main thread during typing
      const term = debouncedSearchTerm.toLowerCase();
      requestAnimationFrame(() => {
        const filtered = posts.filter(
          (post) =>
            post.title.toLowerCase().includes(term) ||
            post.author.toLowerCase().includes(term) ||
            extractTextFromContent(post.content).toLowerCase().includes(term),
        );
        setFilteredPosts(filtered);
        setCurrentPage(1);
      });
    }
  }, [debouncedSearchTerm, posts]);
  const indexOfLastPost = currentPage * postsPerPage;
  const indexOfFirstPost = indexOfLastPost - postsPerPage;
  const currentPosts = filteredPosts.slice(indexOfFirstPost, indexOfLastPost);
  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
  const hasFilteredPosts = filteredPosts.length > 0;
  const displayStart = hasFilteredPosts ? indexOfFirstPost + 1 : 0;
  const displayEnd = hasFilteredPosts
    ? Math.min(indexOfLastPost, filteredPosts.length)
    : 0;
  const blogErrorMessage = useMemo(
    () => getFriendlyFetchMessage("Blog posts", error),
    [error],
  );

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const isDark = useIsDarkMode();

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col blog-page">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          <div className="left-side-rail flex-grow flex-col space-y-4">
            <Navigation />
            <div className="h-101 border rounded-lg p-4 bg-blue-100 border-blue-300 shadow-md opacity-90">
              <h3 className="font-bold text-blue-600 mb-2">
                search posts here
              </h3>
              <input
                type="text"
                placeholder="Search..."
                className="w-full p-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <p className="mt-2 text-sm text-blue-600">
                  {filteredPosts.length} post
                  {filteredPosts.length !== 1 ? "s" : ""} found
                </p>
              )}
            </div>
            <div className="flex justify-center">
              <img
                className="w-[350px] rounded-lg border border-blue-400"
                src={kannaHappy}
                width="350"
                height="350"
                alt="kanna gif"
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-4 p-4">
            {loading ? (
              <AsyncStateCard
                variant="loading"
                title="Gathering blog posts..."
                message="Getting the cozy reading shelf ready."
              />
            ) : error ? (
              <AsyncStateCard
                variant="error"
                title={blogErrorMessage.title}
                message={blogErrorMessage.message}
                detail={blogErrorMessage.detail}
                actionLabel="Retry"
                onAction={() => void loadPosts()}
              />
            ) : filteredPosts.length === 0 ? (
              <div className="space-y-1 p-2 card-border">
                <AsyncStateCard
                  variant="empty"
                  title={
                    searchTerm ? "No matching posts found yet." : "No posts yet."
                  }
                  message={
                    searchTerm
                      ? "Try a shorter phrase or clear the search filter."
                      : "The page is ready whenever the first story is posted."
                  }
                  actionLabel={searchTerm ? "Clear search" : undefined}
                  onAction={searchTerm ? () => setSearchTerm("") : undefined}
                />
                <img
                  src={kannaEating}
                  alt="No posts"
                  className="mx-auto"
                  width="498"
                  height="498"
                />
              </div>
            ) : (
              <>
                {currentPosts.map((post, index) => {
                  const previewText = (
                    post.shortDescription || extractTextFromContent(post.content)
                  ).trim();

                  return (
                    <div
                      key={post.id}
                      className="relative z-[1]"
                      style={{
                        zIndex: openMenuId === post.id ? 13000 : undefined,
                      }}
                    >
                      <div className="card-border p-2">
                        <div className="flex items-start gap-4">
                          <Link
                            to={`/blog/${slugify(post.title)}-${post.id}`}
                            className="blog-card-link flex-1 no-underline"
                          >
                            <div className="blog-card-layout">
                              <div className="blog-card-media">
                                {post.thumbnail ? (
                                  <img
                                    src={resolveAsset(post.thumbnail) ?? undefined}
                                    alt={post.title || "thumbnail"}
                                    className="h-full w-full object-cover"
                                    loading={index < 2 ? "eager" : "lazy"}
                                    fetchPriority={
                                      index === 0 ? "high" : undefined
                                    }
                                    width="144"
                                    height="112"
                                  />
                                ) : (
                                  <div className="h-full w-full rounded-md bg-blue-50" />
                                )}
                              </div>

                              <div className="blog-card-content">
                                <div className="blog-card-copy">
                                  <h2 className="blog-card-title text-lg font-bold text-blue-700">
                                    {post.title}
                                  </h2>
                                  <p className="blog-card-meta text-sm text-blue-500">
                                    By{" "}
                                    {(post as any).userId ? (
                                      <Link
                                        to={`/profile/${post.author}`}
                                        className="hover:underline font-medium"
                                      >
                                        {post.author}
                                      </Link>
                                    ) : (
                                      <span>{post.author}</span>
                                    )}{" "}
                                    •{" "}
                                    {new Date(post.createdAt).toLocaleDateString()}
                                  </p>
                                  {previewText ? (
                                    <p className="blog-card-summary text-sm text-blue-600">
                                      {previewText}
                                    </p>
                                  ) : (
                                    <div
                                      className="blog-card-summary"
                                      aria-hidden="true"
                                    />
                                  )}
                                </div>

                                <div className="blog-card-footer">
                                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-blue-400">
                                    <span>
                                      {Array.isArray(post.likes)
                                        ? post.likes.length
                                        : 0}{" "}
                                      likes
                                    </span>
                                    <span>
                                      {countNestedComments(post.comments || [])}{" "}
                                      comments
                                    </span>
                                  </div>

                                  {post.tags && post.tags.length > 0 ? (
                                    <BlogTagList
                                      tags={post.tags}
                                      isDark={isDark}
                                      limit={8}
                                      className="blog-card-tags"
                                    />
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </Link>

                          {auth?.user?.id &&
                          String(auth.user.id) === String((post as any).userId) ? (
                            <div className="relative ml-2">
                              <button
                                onClick={(e) => toggleMenu(post.id, e)}
                                className={`p-1 rounded ${isDark ? "hover:bg-gray-700" : "hover:bg-blue-100"}`}
                                aria-haspopup="menu"
                                aria-expanded={openMenuId === post.id}
                                data-post-menu-button
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className={`h-5 w-5 ${isDark ? "text-blue-300" : "text-blue-600"}`}
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </button>

                              {openMenuId === post.id &&
                                menuPos &&
                                createPortal(
                                  <div
                                    data-post-menu
                                    className={`fixed w-36 rounded z-[200000] text-sm ${isDark ? "bg-gray-800 border border-gray-700 text-white shadow-lg" : "bg-white border shadow"} transition-opacity duration-150 ease-in-out transform`}
                                    style={{
                                      top: menuPos.top,
                                      left: menuPos.left,
                                      pointerEvents: "auto",
                                    }}
                                  >
                                    <Link
                                      to={`/blog/edit?id=${post.id}`}
                                      className={`block px-3 py-2 transition-colors duration-150 ease-in-out ${isDark ? "hover:bg-gray-700" : "hover:bg-blue-50"}`}
                                    >
                                      Edit
                                    </Link>
                                    <button
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        setMenuPos(null);
                                        handleDelete(post.id);
                                      }}
                                      className={`w-full text-left px-3 py-2 transition-colors duration-150 ease-in-out ${isDark ? "hover:bg-red-700 text-red-200" : "hover:bg-red-50 text-red-700"}`}
                                    >
                                      Delete
                                    </button>
                                  </div>,
                                  document.body,
                                )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </main>

          <div className="flex-col">
            <div className="mt-3 mb-auto lg:w-[200px] space-y-4">
              <aside className="right-side-panel w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4">
                <div className="space-y-2 text-sm text-center font-bold">
                  <h2 className="text-blue-600 font-bold text-lg pb-2">
                    Create 📒
                  </h2>
                  <Link to="/blog/edit" aria-label="Create a new blog post">
                    <div className="border border-blue-300 rounded-2xl bg-blue-200 p-1 hover:bg-blue-300 hover:animate-wiggle">
                      Create new post
                    </div>
                  </Link>
                </div>
              </aside>
              <aside className="right-side-panel w-full lg:w-[200px] mb-auto bg-blue-50 border border-blue-200 rounded-xl shadow-md p-4 hidden lg:block">
                <h3 className="text-blue-700 font-bold text-lg text-center mb-2">
                  Blog Tips
                </h3>
                <ul className="text-sm text-blue-600 space-y-2">
                  <li>• Use short, clear titles (≤60 chars).</li>
                  <li>• Split content into short paragraphs.</li>
                  <li>• Upload images to illustrate points.</li>
                  <li>• Preview posts before publishing.</li>
                </ul>
                <div className="mt-4 text-xs text-blue-400 text-center">
                  Write kindly and credit sources 💖
                </div>
              </aside>
              <div className="flex justify-center">
                <img
                  className="border border-blue-400 rounded-lg"
                  src={kannaSmile}
                  width="498"
                  height="498"
                  alt="kanna gif"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col flex-grow p-3 max-w-7xl mx-auto w-full justify-center">
          {}
          {totalPages > 1 && (
            <div className="flex justify-center items-center mt-6 space-x-2 opacity-90">
              <button
                onClick={() => paginate(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-4 py-2 rounded-lg border ${currentPage === 1 ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-200 text-blue-700 hover:bg-blue-300"}`}
              >
                Previous
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (number) => (
                  <button
                    key={number}
                    onClick={() => paginate(number)}
                    className={`px-4 py-2 rounded-lg border ${currentPage === number ? "bg-blue-500 text-white" : "bg-blue-200 text-blue-700 hover:bg-blue-300"}`}
                  >
                    {number}
                  </button>
                ),
              )}

              <button
                onClick={() => paginate(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-4 py-2 rounded-lg border ${currentPage === totalPages ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-200 text-blue-700 hover:bg-blue-300"}`}
              >
                Next
              </button>
            </div>
          )}

          <div className="text-center text-sm text-blue-600 mt-2 mb-4">
            Showing posts {displayStart} to {displayEnd} of {filteredPosts.length}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Blog;
