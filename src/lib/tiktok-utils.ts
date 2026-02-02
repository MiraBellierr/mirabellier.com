/**
 * TikTok video processing utilities
 */

export interface TikTokVideoData {
  code: number;
  data?: {
    play?: string;
    title?: string;
  };
}

export interface TikTokVideoResult {
  videoBlob: Blob;
  title?: string;
}

/**
 * Fetches TikTok video without watermark using tikwm.com API
 * @param tiktokUrl - The TikTok video URL
 * @param onProgress - Optional callback for progress updates
 * @returns Promise with video blob and metadata
 */
export async function fetchTikTokVideo(
  tiktokUrl: string,
  onProgress?: (message: string) => void,
): Promise<TikTokVideoResult> {
  try {
    // Fetch metadata from tikwm.com API
    onProgress?.("Fetching TikTok video...");

    const apiResponse = await fetch(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`,
    );
    const apiData: TikTokVideoData = await apiResponse.json();

    if (apiData.code !== 0 || !apiData.data || !apiData.data.play) {
      throw new Error("Failed to get video URL from TikTok API.");
    }

    const videoUrl = apiData.data.play; // Direct MP4 URL without watermark

    // Download video
    onProgress?.("Downloading video...");

    const videoResponse = await fetch(videoUrl);
    const videoBlob = await videoResponse.blob();

    return {
      videoBlob,
      title: apiData.data.title,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to fetch TikTok video");
  }
}

/**
 * Validates if a string is a valid TikTok URL
 * @param url - The URL to validate
 * @returns true if valid TikTok URL
 */
export function isValidTikTokUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname.includes("tiktok.com") ||
      urlObj.hostname.includes("vm.tiktok.com")
    );
  } catch {
    return false;
  }
}
