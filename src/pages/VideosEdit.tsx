import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Toast from "../parts/Toast";

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/states/AuthContext";
import { useVideoUpload } from "@/hooks/use-video-upload";

const VideosEdit = () => {
  const [uploadType, setUploadType] = useState<"upload" | "tiktok">("upload");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const navigate = useNavigate();
  const auth = useAuth();

  const { isSubmitting, handleSubmit: handleVideoUpload } = useVideoUpload(
    {
      uploadType,
      videoFile,
      tiktokUrl,
      title,
      description,
      userId: auth?.user?.id,
      token: auth?.token ?? undefined,
    },
    (message) => {
      setToastMessage(message);
      setShowToast(true);
    },
  );

  useEffect(() => {
    // Update canonical URL to point to the VideosEdit page
    const canonicalLink = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement;
    if (canonicalLink) {
      canonicalLink.href = "https://mirabellier.com/videos/edit";
    }

    // Add structured data for rich results
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "videosedit-structured-data";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Upload Video",
      description: "Upload a new video",
      url: "https://mirabellier.com/videos/edit",
    });
    document.head.appendChild(script);

    return () => {
      const canonicalLink = document.querySelector(
        'link[rel="canonical"]',
      ) as HTMLLinkElement;
      if (canonicalLink) {
        canonicalLink.href = "https://mirabellier.com/";
      }
      const oldScript = document.getElementById("videosedit-structured-data");
      if (oldScript) oldScript.remove();
    };
  }, []);

  useEffect(() => {
    if (!auth?.token) navigate("/login");
  }, [auth, navigate]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setDescription(e.target.value);
  };

  const handleUploadTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as "upload" | "tiktok";
    setUploadType(newType);
    // Reset fields when switching types
    setVideoFile(null);
    setVideoPreview(null);
    setTiktokUrl("");
  };

  const handleTiktokUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTiktokUrl(e.target.value);
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setVideoFile(file || null);
    if (file) {
      setVideoPreview(URL.createObjectURL(file));
    } else {
      setVideoPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = await handleVideoUpload();

    if (result.success) {
      setTitle("");
      setDescription("");
      setVideoFile(null);
      setVideoPreview(null);
      setTiktokUrl("");
      setToastMessage("🎉 Video uploaded successfully!");
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        setToastMessage("");
        navigate("/videos");
      }, 3000);
    } else {
      setToastMessage(`❌ ${result.error}`);
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        setToastMessage("");
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          <div className="flex-grow flex-col">
            <Navigation />
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <h2 className="font-bold text-2xl text-blue-600">Upload a video</h2>

            <form onSubmit={handleSubmit}>
              <div className="flex flex-col p-2 space-y-2">
                <label className="font-bold text-blue-600" htmlFor="uploadType">
                  Upload Type
                </label>
                <select
                  id="uploadType"
                  name="uploadType"
                  value={uploadType}
                  onChange={handleUploadTypeChange}
                  className="form-select border rounded-lg border-blue-300 p-2"
                >
                  <option value="upload">Upload Video File</option>
                  <option value="tiktok">TikTok Video Link</option>
                </select>
              </div>

              <div className="flex flex-col p-2 space-y-2">
                <label className="font-bold text-blue-600" htmlFor="title">
                  Title (optional)
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={title}
                  onChange={handleTitleChange}
                  className="form-input border rounded-lg border-blue-300 p-2"
                  placeholder="Enter a title for your video"
                />
              </div>

              <div className="flex flex-col p-2 space-y-2">
                <label
                  className="font-bold text-blue-600"
                  htmlFor="description"
                >
                  Description (optional)
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={description}
                  onChange={handleDescriptionChange}
                  className="form-textarea border rounded-lg border-blue-300 p-2"
                  placeholder="Add an optional description for your video"
                  rows={4}
                />
              </div>

              {uploadType === "upload" ? (
                <>
                  <div className="flex flex-col p-2 space-y-2">
                    <label className="font-bold text-blue-600" htmlFor="video">
                      Upload Video
                    </label>
                    <input
                      type="file"
                      id="video"
                      name="video"
                      accept="video/mp4,video/webm,video/ogg"
                      onChange={handleVideoChange}
                      className="form-input border rounded-lg border-blue-300 p-2"
                      required
                    />
                  </div>

                  {videoPreview && (
                    <div className="flex flex-col items-center p-2">
                      <span className="text-blue-500 mb-2">Preview:</span>
                      <video
                        src={videoPreview}
                        controls
                        className="w-64 rounded-lg shadow-lg"
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col p-2 space-y-2">
                  <label
                    className="font-bold text-blue-600"
                    htmlFor="tiktokUrl"
                  >
                    TikTok Video URL
                  </label>
                  <input
                    type="url"
                    id="tiktokUrl"
                    name="tiktokUrl"
                    value={tiktokUrl}
                    onChange={handleTiktokUrlChange}
                    className="form-input border rounded-lg border-blue-300 p-2"
                    placeholder="https://www.tiktok.com/@username/video/..."
                    required
                  />
                  <p className="text-sm text-blue-500">
                    Enter the full TikTok video URL
                  </p>
                </div>
              )}

              <div className="flex p-2">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg hover:animate-wiggle"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            </form>
          </main>

          <div className="flex-col">
            <aside className="w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4">
              <div className="space-y-2 text-sm font-bold">
                <h2 className="text-blue-600 font-bold text-lg">
                  Tips & Tricks
                </h2>
                <div className="border-t border-blue-300 pt-2">
                  <p className="text-blue-500">
                    1. Choose between uploading a file or adding a TikTok link.
                  </p>
                  <p className="text-blue-500">
                    2. Bigger size files may take time to upload.
                  </p>
                  <p className="text-blue-500">
                    3. Add a title to make your video more discoverable.
                  </p>
                </div>
              </div>
            </aside>
            <div className="mt-3 mb-auto lg:w-[200px]"></div>
          </div>
        </div>
      </div>

      {showToast && (
        <Toast
          message={toastMessage}
          onClose={() => {
            setShowToast(false);
            setToastMessage("");
            if (toastMessage.includes("success")) {
              navigate("/videos");
            }
          }}
        />
      )}
      <Footer />
    </div>
  );
};

export default VideosEdit;
