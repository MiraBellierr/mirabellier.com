import { API_BASE } from "./config";

export interface VideoUploadParams {
  videoBlob: Blob;
  fileName: string;
  title?: string;
  description?: string;
  userId?: string;
  token?: string;
}

export interface VideoUploadResponse {
  success: boolean;
  error?: string;
}

/**
 * Uploads a video to the server
 * @param params - Upload parameters
 * @param onProgress - Optional callback for progress updates
 * @returns Promise with upload result
 */
export async function uploadVideo(
  params: VideoUploadParams,
  onProgress?: (message: string) => void,
): Promise<VideoUploadResponse> {
  try {
    onProgress?.("Uploading to server...");

    const formData = new FormData();
    formData.append("video", params.videoBlob, params.fileName);

    if (params.title) {
      formData.append("customTitle", params.title);
    }
    if (params.description) {
      formData.append("description", params.description);
    }
    if (params.userId) {
      formData.append("userId", params.userId);
    }

    const res = await fetch(`${API_BASE}/upload-video`, {
      method: "POST",
      body: formData,
      headers: {
        ...(params.token ? { Authorization: `Bearer ${params.token}` } : {}),
      },
    });

    if (res.ok) {
      return { success: true };
    } else {
      const errorData = await res.json();
      return {
        success: false,
        error: errorData.error || "Video upload failed!",
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Video upload failed!",
    };
  }
}
