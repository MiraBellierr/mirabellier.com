import { useEffect, useState } from "react";

import {
  describePushError,
  supportsPushNotifications,
  urlBase64ToUint8Array,
} from "@/lib/push-support";
import {
  fetchTopicStatus,
  fetchVapidPublicKey,
  subscribeToTopic,
  unsubscribeFromTopic,
} from "@/lib/push-api";

type NotifyToggleProps = {
  topic: string;
  idleLabel: string;
  title?: string;
  className?: string;
};

// Generic "notify me" toggle for any push topic (new blog post, new QOTD,
// people-you-follow Pixie uploads). Mirrors src/pages/Twitch.tsx's
// `NotifyButton` — that one stays Twitch-specific (its own table/endpoints,
// see mirabellier-backend/lib/twitch-push.js), this one drives the generic
// /push/* endpoints for everything else.
const NotifyToggle = ({ topic, idleLabel, title, className }: NotifyToggleProps) => {
  const [permission, setPermission] = useState<string>(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (permission === "unsupported" || permission !== "granted") return;

    const controller = new AbortController();
    const restore = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        const status = await fetchTopicStatus(
          topic,
          subscription.endpoint,
          controller.signal,
        );
        if (!controller.signal.aborted) setSubscribed(status.subscribed);
      } catch {
        // Ignore restore failures; the button still works.
      }
    };
    void restore();
    return () => controller.abort();
  }, [topic, permission]);

  if (!supportsPushNotifications()) return null;

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      await navigator.serviceWorker.register("/sw.js");
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const publicKey = await fetchVapidPublicKey();
        if (!publicKey) {
          setError("Notifications are not configured on the server yet.");
          return;
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      await subscribeToTopic(topic, subscription.toJSON());
      setSubscribed(true);
    } catch (err) {
      setError(describePushError(err));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeFromTopic(topic, subscription.endpoint).catch(
          () => undefined,
        );
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  };

  if (permission === "denied") {
    return (
      <span
        title="Notifications are blocked for this site. Allow them in your browser settings."
        className={`text-xs font-medium text-gray-400 ${className || ""}`}
      >
        notifications blocked in browser settings
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className || ""}`}>
      <button
        type="button"
        onClick={subscribed ? disable : enable}
        disabled={busy}
        title={title}
        className="underline underline-offset-2 hover:text-pink-600 disabled:opacity-60"
      >
        {busy ? "please wait..." : subscribed ? "notifications on — tap to stop" : idleLabel}
      </button>
      {error ? (
        <span className="text-xs font-semibold text-red-500">{error}</span>
      ) : null}
    </span>
  );
};

export default NotifyToggle;
