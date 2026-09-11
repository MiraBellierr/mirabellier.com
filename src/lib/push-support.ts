// Browser-facing Web Push helpers shared by every "notify me" feature
// (Twitch live, new blog post, new QOTD, followed-user Pixie uploads) —
// none of this is feature-specific.

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Chromium's own message when PushManager.subscribe() can't reach the push
// service — most often Brave, which disables Google's push backend by
// default (brave://settings/privacy > "Use Google services for push
// messaging"). Not something our app config can fix, so swap in guidance
// instead of the raw browser error.
export function describePushError(err: unknown): string {
  if (err instanceof Error && /push service error/i.test(err.message)) {
    return 'Your browser\'s push service is disabled. Brave users: turn on "Use Google services for push messaging" in brave://settings/privacy, then try again.';
  }
  return err instanceof Error ? err.message : "Failed to enable notifications";
}

export function supportsPushNotifications() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}
