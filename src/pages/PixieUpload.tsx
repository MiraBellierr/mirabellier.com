import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/states/AuthContext";
import { useToast } from "@/states/ToastContext";
import { usePageSeo } from "@/lib/seo";
import {
  MAX_VIDEO_TAGS,
  MAX_VIDEO_TITLE_LENGTH,
  normalizeVideoTags,
  readVideoDuration,
  uploadPixie,
} from "@/lib/pixies";
import AuthGateShell from "../parts/AuthGateShell";
import TagInput from "../parts/TagInput";
import { useVideoTagInput } from "../parts/useVideoTagInput";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Navigation from "../parts/Navigation";
import kannaPolice from "@/assets/anime/kanna-police.webp";

const PixieUpload = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tagField = useVideoTagInput({ onMessage: setMessage });
  const { tags, setTags, tagInput, setTagInput } = tagField;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) return;
    const normalizedTags = normalizeVideoTags([...tags, tagInput]);
    setIsUploading(true);
    setUploadProgress(0);
    setMessage(null);
    try {
      const durationSeconds = await readVideoDuration(videoFile);
      await uploadPixie({
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

  if (!auth.user) {
    return (
      <AuthGateShell
        icon="🔒"
        title="Please log in"
        message="You need to log in to upload videos."
        action={{ to: "/login", label: "Login" }}
      />
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
                height="280"
                alt="Kanna police"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 flex items-center justify-center p-4">
            <div className="w-full max-w-lg min-w-0 backdrop-blur-sm card-border rounded-2xl p-4 sm:p-6 shadow-lg bg-white/90 dark:bg-purple-900/80">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-purple-200 flex items-center gap-2">
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
                    className="mt-2 block w-full max-w-full text-sm text-blue-600 dark:text-purple-300"
                  />
                  {videoFile && (
                    <p className="mt-1 break-words text-xs text-blue-500 dark:text-purple-400">
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

                <TagInput
                  field={tagField}
                  label="Tags"
                  emptyPlaceholder="Add a tag (optional), e.g. gaming, anime..."
                  helpText={`Optional — up to ${MAX_VIDEO_TAGS} tags, press enter or comma to add.`}
                />

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
                  disabled={!videoFile || isUploading}
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
              <li>• Tags help others discover your video (optional).</li>
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

export default PixieUpload;
