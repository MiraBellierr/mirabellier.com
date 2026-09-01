import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/states/AuthContext";
import { useToast } from "@/states/ToastContext";
import { usePageSeo } from "@/lib/seo";
import {
  fetchVideoTagSuggestions,
  MAX_VIDEO_TAGS,
  MAX_VIDEO_TITLE_LENGTH,
  normalizeVideoTags,
  uploadReel,
} from "@/lib/videos";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Navigation from "../parts/Navigation";
import kannaPolice from "@/assets/anime/kanna-police.webp";

const ReelUpload = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagInputFocused, setTagInputFocused] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/pixies/upload",
    structuredDataId: "pixies-upload-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Upload a Pixie",
      description: "Share a short video clip with the Mirabellier community",
      url: "https://mirabellier.com/pixies/upload",
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
      setMessage("Add at least one tag so people can find your video");
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    setMessage(null);
    try {
      const durationSeconds = await readVideoDuration(videoFile);
      await uploadReel({
        file: videoFile,
        title: videoTitle,
        tags: normalizedTags,
        durationSeconds,
        onProgress: setUploadProgress,
      });
      setVideoFile(null);
      setVideoTitle("");
      setTags([]);
      setTagInput("");
      showToast("Video uploaded!");
      navigate("/pixies");
    } catch {
      setMessage("Video upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const filteredSuggestions = tagSuggestions
    .filter(
      (suggestion) =>
        suggestion.includes(tagInput.trim().toLowerCase()) &&
        !tags.includes(suggestion),
    )
    .slice(0, 8);

  if (!auth.user) {
    return (
      <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
        <Header />
        <div
          className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
          style={{ backgroundImage: "var(--page-bg)" }}
        >
          <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
            <div className="left-side-rail flex-grow flex-col">
              <Navigation />
            </div>
            <main className="w-full lg:w-3/5 flex items-center justify-center p-4">
              <div className="card-border rounded-2xl p-8 text-center bg-white/90 dark:bg-purple-900/80">
                <div className="text-4xl mb-4">🔒</div>
                <h2 className="text-2xl font-bold text-blue-700 dark:text-purple-200 mb-2">
                  Please log in
                </h2>
                <p className="text-blue-500 dark:text-purple-300 mb-4">
                  You need to log in to upload videos.
                </p>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 bg-pink-500 text-white px-4 py-2 rounded-full hover:bg-pink-600 transition-colors"
                >
                  Login
                </Link>
              </div>
            </main>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />

            <div className=" mt-3 mb-auto justify-center items-center flex lg:w-[339px]">
              <img
                className="w-full border border-blue-700 shadow-md rounded-2xl"
                src={kannaPolice}
                width="498"
                height="498"
                alt="kanna police gif"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 flex items-center justify-center p-4">
            <div className="w-full max-w-lg backdrop-blur-sm card-border rounded-2xl p-6 shadow-lg bg-white/90 dark:bg-purple-900/80">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-2xl font-bold text-blue-700 dark:text-purple-200 flex items-center gap-2">
                  <span>🎬</span>
                  <span>Upload a Pixie</span>
                </h2>
                <Link
                  to="/pixies"
                  className="text-sm font-bold text-pink-500 hover:underline"
                >
                  ← back to pixies
                </Link>
              </div>
              <p className="mt-1 text-sm text-blue-500 dark:text-purple-300">
                Your video will appear on your profile and in the pixies feed.
              </p>

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
                  <p className="mt-1 text-xs text-blue-500 dark:text-purple-400">
                    At least one tag is required — up to {MAX_VIDEO_TAGS}, press
                    enter or comma to add.
                  </p>
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
          </main>

          <aside className="right-side-panel w-full lg:w-1/5 mb-auto bg-blue-50 dark:bg-purple-950/30 border border-blue-200 dark:border-purple-500/30 rounded-xl shadow-sm p-4 hidden lg:block">
            <h3 className="text-blue-700 dark:text-purple-200 font-bold text-lg text-center mb-2">
              Pixie Tips
            </h3>
            <ul className="text-sm text-blue-600 dark:text-purple-300 space-y-2">
              <li>• Short clips work best — up to a few minutes.</li>
              <li>• Supported formats: mp4, webm, mov.</li>
              <li>• Add a caption so people know what they're watching.</li>
              <li>• Tags help others discover your video — at least one required.</li>
              <li>• Your videos show up on your profile page too.</li>
            </ul>
            <div className="mt-4 text-xs text-blue-400 dark:text-purple-400 text-center">
              Lights, camera, upload! 🎥
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default ReelUpload;
