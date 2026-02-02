import { useState, useCallback } from "react";
import { fetchTikTokVideo } from "@/lib/tiktok-utils";
import { uploadVideo } from "@/lib/video-upload-utils";

export interface UseVideoUploadParams {
  uploadType: "upload" | "tiktok";
  videoFile: File | null;
  tiktokUrl: string;
  title: string;
  description: string;
  userId?: string;
  token?: string;
}

export interface UseVideoUploadReturn {
  isSubmitting: boolean;
  handleSubmit: () => Promise<{
    success: boolean;
    error?: string;
  }>;
}

/**
 * Custom hook for handling video uploads (both file and TikTok)
 */
export function useVideoUpload(
  params: UseVideoUploadParams,
  onProgress?: (message: string) => void,
): UseVideoUploadReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const {
      uploadType,
      videoFile,
      tiktokUrl,
      title,
      description,
      userId,
      token,
    } = params;

    // Validation
    if (uploadType === "upload" && !videoFile) {
      return { success: false, error: "Please select a video file to upload" };
    }

    if (uploadType === "tiktok" && !tiktokUrl) {
      return { success: false, error: "Please enter a TikTok URL" };
    }

    setIsSubmitting(true);

    try {
      let videoBlob: Blob;
      let fileName: string;
      let finalTitle = title;
      let finalDescription = description;

      if (uploadType === "upload") {
        videoBlob = videoFile as Blob;
        fileName = videoFile!.name;
      } else {
        // Process TikTok URL
        const tiktokResult = await fetchTikTokVideo(tiktokUrl, onProgress);
        videoBlob = tiktokResult.videoBlob;
        fileName = "tiktok_video.mp4";

        // Use TikTok metadata if custom values not provided
        if (!title && tiktokResult.title) {
          finalTitle = tiktokResult.title;
        }
        if (!description && tiktokResult.title) {
          finalDescription = tiktokResult.title;
        }
      }

      // Upload video
      const result = await uploadVideo(
        {
          videoBlob,
          fileName,
          title: finalTitle,
          description: finalDescription,
          userId,
          token,
        },
        onProgress,
      );

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Video upload failed!",
      };
    } finally {
      setIsSubmitting(false);
    }
  }, [params, onProgress]);

  return {
    isSubmitting,
    handleSubmit,
  };
}
