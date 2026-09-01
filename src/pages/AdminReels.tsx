import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/states/AuthContext";
import { useToast } from "@/states/ToastContext";
import { usePageSeo } from "@/lib/seo";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import {
  fetchVideoTagSuggestions,
  MAX_VIDEO_TAGS,
  MAX_VIDEO_TITLE_LENGTH,
  normalizeVideoTags,
  resolveTikTokVideo,
  uploadAdminReel,
  type TikTokVideoInfo,
} from "@/lib/videos";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Navigation from "../parts/Navigation";
import kannaPolice from "@/assets/anime/kanna-police.webp";

const AdminReels = () => {
  const auth = useAuth();
  const { showToast } = useToast();
  const isOwner = canAccessAdminPanel(auth.user);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagInputFocused, setTagInputFocused] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastUpload, setLastUpload] = useState<string | null>(null);
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [isFetchingTikTok, setIsFetchingTikTok] = useState(false);
  const [fetchedInfo, setFetchedInfo] = useState<TikTokVideoInfo | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/admin/pixies",
    structuredDataId: "admin-pixies-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Admin Pixies",
      description: "Upload pixies on behalf of any username.",
      url: "https://mirabellier.com/admin/pixies",
    },
  });

  useEffect(() => {
    let cancelled = false;
    fetchVideoTagSuggestions().then((suggestions) => {
      if (!cancelled) setTagSuggestions(suggestions);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const addTag = (raw: string) => {
    const normalized = normalizeVideoTags([raw]);
    if (normalized.length === 0) return;
    const tag = normalized[0];
    if (tags.includes(tag)) {
      setTagInput("");
      return;
    }
    if (tags.length >= MAX_VIDEO_TAGS) {
      setMessage(`You can add up to ${MAX_VIDEO_TAGS} tags`);
      setTagInput("");
      return;
    }
    setTags((current) => [...current, tag]);
    setTagInput("");
    setMessage(null);
  };

  const handleTagKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagInput);
    } else if (event.key === "Backspace" && !tagInput && tags.length > 0) {
      setTags((current) => current.slice(0, -1));
    }
  };

  const readVideoDuration = (file: File): Promise<number | null> =>
    new Promise((resolve) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(video.duration) ? video.duration : null);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      video.src = url;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) return;
    const normalizedTags = normalizeVideoTags([...tags, tagInput]);
    if (normalizedTags.length === 0) {
      setMessage("Add at least one tag so people can find this video");
      return;
    }
    if (!/^[^\s/\\]{3,32}$/u.test(username.trim())) {
      setMessage("Username must be 3-32 characters without spaces or slashes");
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    setMessage(null);
    try {
      const durationSeconds = await readVideoDuration(videoFile);
      await uploadAdminReel({
        file: videoFile,
        title: videoTitle,
        tags: normalizedTags,
        username,
        avatarUrl,
        durationSeconds,
        onProgress: setUploadProgress,
      });
      setVideoFile(null);
      setVideoTitle("");
      setTags([]);
      setTagInput("");
      setLastUpload(username.trim());
      showToast("Video uploaded!");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Video upload failed",
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleTikTokFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tiktokUrl.trim();
    if (!trimmed || isFetchingTikTok) return;
    setIsFetchingTikTok(true);
    setFetchError(null);
    setFetchedInfo(null);
    try {
      const resolved = await resolveTikTokVideo(trimmed);
      setFetchedInfo(resolved);
      setUsername(resolved.username);
      setAvatarUrl(resolved.avatarUrl || "");
      setVideoTitle(resolved.caption || "");
      setTags(normalizeVideoTags(resolved.hashtags));
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Failed to fetch TikTok info",
      );
    } finally {
      setIsFetchingTikTok(false);
    }
  };

  if (!auth.user || !isOwner) {
    return (
      <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
        <Header />
        <div
          className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
          style={{ backgroundImage: "var(--page-bg)" }}
        >
          <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
            <div className="left-side-rail flex-grow flex-col">
              <Navigation />
            </div>
            <main className="w-full lg:w-3/5 p-4">
              <section className="card-border p-6 bg-white/55 text-center">
                <h2 className="text-2xl font-bold text-blue-700">
                  {!auth.user ? "Please log in" : "Not authorized"}
                </h2>
                <p className="mt-3 text-blue-500">
                  {!auth.user
                    ? "You need to log in with the owner account before using the admin pages."
                    : "This page is only available to the site owner account."}
                </p>
                <Link
                  to={!auth.user ? "/login" : "/"}
                  className="mt-5 inline-flex rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600"
                >
                  {!auth.user ? "Go to login" : "Back to home"}
                </Link>
              </section>
            </main>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const filteredSuggestions = tagSuggestions
    .filter(
      (suggestion) =>
        suggestion.includes(tagInput.trim().toLowerCase()) &&
        !tags.includes(suggestion),
    )
    .slice(0, 8);

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />

            <div className="mt-3 mb-auto hidden justify-center items-center lg:flex">
              <img
                className="w-full max-w-[320px] border border-blue-700 shadow-md rounded-2xl"
                src={kannaPolice}
                width="320"
                height="427"
                alt="kanna police"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 p-4">
            <div className="space-y-6">
              <div className="card-border rounded-2xl p-6 shadow-lg bg-white/90 dark:bg-purple-900/80">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-2xl font-bold text-blue-700 dark:text-purple-200 flex items-center gap-2">
                  <span>🎬</span>
                  <span>Upload as anyone</span>
                </h2>
                <Link
                  to="/pixies"
                  className="text-sm font-bold text-pink-500 hover:underline"
                >
                  view pixies →
                </Link>
              </div>
              <p className="mt-1 text-sm text-blue-500 dark:text-purple-300">
                Paste a TikTok link to auto-fill the details below, or fill
                them manually. Download the video with{" "}
                <a
                  href="https://snaptik.app/en3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-pink-500 hover:underline"
                >
                  snaptik
                </a>
                , then choose the file below. New usernames get the avatar URL
                you provide; existing users keep their own avatar.
              </p>

              <form
                onSubmit={handleTikTokFetch}
                className="mt-4 flex gap-2"
              >
                <input
                  value={tiktokUrl}
                  onChange={(e) => setTiktokUrl(e.target.value)}
                  placeholder="https://www.tiktok.com/@user/video/123..."
                  type="url"
                  className="flex-1 p-3 border border-blue-200 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-blue-200"
                />
                <button
                  type="submit"
                  disabled={!tiktokUrl.trim() || isFetchingTikTok}
                  className="shrink-0 bg-pink-500 text-white px-4 py-2 rounded-full shadow-sm hover:scale-105 transform transition disabled:opacity-50 disabled:hover:scale-100"
                >
                  {isFetchingTikTok ? "Fetching..." : "Fetch info"}
                </button>
              </form>

              {fetchError && (
                <div className="mt-2 text-red-600 dark:text-pink-300">
                  {fetchError}
                </div>
              )}

              {fetchedInfo && !fetchError && (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-blue-200 dark:border-purple-600 bg-blue-50/60 dark:bg-purple-800/40 p-3">
                  {fetchedInfo.coverUrl && (
                    <img
                      src={fetchedInfo.coverUrl}
                      alt="video cover"
                      className="h-14 w-21 rounded-lg border border-blue-200 dark:border-purple-600 object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-blue-700 dark:text-purple-200 truncate">
                      @{fetchedInfo.username}
                      {fetchedInfo.durationSeconds != null
                        ? ` · ${Math.round(fetchedInfo.durationSeconds)}s`
                        : ""}
                    </p>
                    <p className="text-xs text-blue-500 dark:text-purple-300">
                      Details filled in below — attach the downloaded file to
                      upload.
                    </p>
                    {!fetchedInfo.avatarUrl && (
                      <p className="text-xs text-amber-600 dark:text-amber-300">
                        No avatar found — paste the avatar URL below if you
                        have one.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-blue-600 dark:text-purple-300">
                    Video file
                  </label>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) =>
                      setVideoFile(e.target.files?.[0] || null)
                    }
                    className="mt-2"
                  />
                  {videoFile && (
                    <p className="mt-1 text-xs text-blue-500 dark:text-purple-400">
                      {videoFile.name} (
                      {(videoFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-blue-600 dark:text-purple-300">
                      Author username <span className="text-pink-500">*</span>
                    </label>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. mira"
                      maxLength={32}
                      className="w-full p-3 border border-blue-200 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-600 dark:text-purple-300">
                      Avatar URL
                    </label>
                    <input
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://.../avatar.png"
                      type="url"
                      className="w-full p-3 border border-blue-200 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                </div>

                {avatarUrl.trim() && /^https?:\/\//.test(avatarUrl.trim()) && (
                  <div className="flex items-center gap-3">
                    <img
                      src={avatarUrl.trim()}
                      alt="avatar preview"
                      className="h-10 w-10 rounded-full border border-blue-200 dark:border-purple-600 object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    <p className="text-xs text-blue-500 dark:text-purple-400">
                      Avatar preview
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-blue-600 dark:text-purple-300">
                    Caption
                  </label>
                  <textarea
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    placeholder="Say something about this video..."
                    rows={4}
                    maxLength={MAX_VIDEO_TITLE_LENGTH}
                    className="w-full p-3 border border-blue-200 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-blue-200 resize-y"
                  />
                  <p className="mt-1 text-xs text-blue-500 dark:text-purple-400">
                    {videoTitle.length}/{MAX_VIDEO_TITLE_LENGTH} — press enter
                    for a new line.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-600 dark:text-purple-300">
                    Tags <span className="text-pink-500">*</span>
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-pink-100 dark:bg-purple-700/60 px-3 py-1 text-sm font-medium text-pink-700 dark:text-purple-100"
                      >
                        #{tag}
                        <button
                          type="button"
                          aria-label={`Remove tag ${tag}`}
                          onClick={() =>
                            setTags((current) =>
                              current.filter((entry) => entry !== tag),
                            )
                          }
                          className="font-bold text-pink-500 dark:text-purple-300 hover:text-pink-700 dark:hover:text-purple-100"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="relative mt-2">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onFocus={() => setTagInputFocused(true)}
                      onBlur={() => {
                        setTagInputFocused(false);
                        if (tagInput.trim()) addTag(tagInput);
                      }}
                      placeholder={
                        tags.length === 0
                          ? "Add at least one tag, e.g. gaming, anime..."
                          : "Add another tag..."
                      }
                      maxLength={20}
                      className="w-full p-3 border border-blue-200 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-blue-200"
                    />
                    {tagInputFocused && filteredSuggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-lg border border-blue-200 dark:border-purple-600 bg-white dark:bg-purple-900 shadow-md">
                        {filteredSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => addTag(suggestion)}
                            className="block w-full px-3 py-2 text-left text-sm text-blue-700 dark:text-purple-200 hover:bg-blue-50 dark:hover:bg-purple-800"
                          >
                            #{suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {uploadProgress !== null && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-purple-800">
                    <div
                      className="h-full bg-pink-500 transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}

                {message && (
                  <div className="text-red-600 dark:text-pink-300">
                    {message}
                  </div>
                )}

                {lastUpload && !message && (
                  <div className="text-green-600 dark:text-green-400">
                    Uploaded as {lastUpload}! 🎉
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    !videoFile ||
                    isUploading ||
                    (tags.length === 0 && !tagInput.trim())
                  }
                  className="inline-flex items-center gap-2 bg-pink-500 text-white px-4 py-2 rounded-full shadow-sm hover:scale-105 transform transition disabled:opacity-50 disabled:hover:scale-100"
                >
                  {isUploading ? "Uploading..." : "Upload video"}
                </button>
              </form>
            </div>
            </div>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 dark:border-purple-500/30 bg-blue-100 dark:bg-purple-950/30 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600 dark:text-purple-300">
                <h2 className="text-center text-lg font-bold text-blue-700 dark:text-purple-200">
                  admin notes
                </h2>
                <p>
                  • Videos are attributed to the username you enter — if it
                  doesn't exist yet, a new author is created with your avatar
                  URL.
                </p>
                <p>
                  • Existing usernames keep their current profile avatar.
                </p>
                <p>• Tags are required so the video can appear in feeds.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default AdminReels;
