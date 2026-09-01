import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Divider from "../parts/Divider";
import { usePageSeo } from "@/lib/seo";
import "@/styles/shrine.css";
import {
  TwitchApiError,
  fetchPushStatus,
  fetchTwitchChannels,
  fetchTwitchPrediction,
  fetchTwitchProfile,
  fetchVapidPublicKey,
  subscribeToLiveNotification,
  unsubscribeFromLiveNotification,
  type TwitchChannelProfile,
  type TwitchChannelStats,
  type TwitchChannelSummary,
  type TwitchPredictionPayload,
  type TwitchProfilePayload,
} from "@/lib/twitch-api";

const TWITCH_DESCRIPTION =
  "When will the streamers we follow go live? A small statistical model predicts the next Twitch stream from each channel's history.";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HEATMAP_COLUMNS = 96;

function formatDateTime(timestampMs: number) {
  return new Date(timestampMs).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(timestampMs: number) {
  return new Date(timestampMs).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCountdown(targetMs: number, nowMs: number) {
  const diff = Math.max(targetMs - nowMs, 0);
  const days = Math.floor(diff / (24 * HOUR_MS));
  const hours = Math.floor((diff % (24 * HOUR_MS)) / HOUR_MS);
  const minutes = Math.floor((diff % HOUR_MS) / MINUTE_MS);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

function formatDurationHours(hours: number) {
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${Math.max(Math.round(hours * 60), 1)}m`;
}

function formatViewers(count: number | null) {
  if (count == null) return "";
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function supportsPushNotifications() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function formatCompactNumber(value: number | null) {
  if (value == null) return "—";
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const thousands = value / 1000;
    return `${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1)}k`;
  }
  const millions = value / 1_000_000;
  return `${millions >= 100 ? Math.round(millions) : millions.toFixed(1)}M`;
}

function formatMinutes(minutes: number | null) {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatMonthKey(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const monthIndex = Number(match[2]) - 1;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[monthIndex] ?? ""} ${match[1].slice(2)}`;
}

function formatUptime(startedAtMs: number, nowMs: number) {
  const diff = Math.max(nowMs - startedAtMs, 0);
  const hours = Math.floor(diff / HOUR_MS);
  const minutes = Math.floor((diff % HOUR_MS) / MINUTE_MS);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function twitchEmbedParent() {
  if (typeof window === "undefined") return "mirabellier.com";
  return window.location.hostname || "mirabellier.com";
}

function liveEmbedUrl(login: string) {
  const parent = twitchEmbedParent();
  return `https://player.twitch.tv/?channel=${encodeURIComponent(login)}&parent=${encodeURIComponent(parent)}&muted=true&autoplay=true`;
}

function clipEmbedUrl(clipId: string) {
  const parent = twitchEmbedParent();
  return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(clipId)}&parent=${encodeURIComponent(parent)}&muted=false&autoplay=true`;
}

function resolveTwitchThumbnail(thumbnailUrl: string, width: number, height: number) {
  return thumbnailUrl
    .replace("{width}", String(width))
    .replace("{height}", String(height));
}

const TOTAL_SLOTS = 7 * HEATMAP_COLUMNS;
const WEEK_MINUTES = 7 * 24 * 60;

function browserTimezoneOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}

function shiftHeatmapToLocal(heatmap: number[]) {
  if (heatmap.length !== TOTAL_SLOTS) return heatmap;

  const offsetMinutes = browserTimezoneOffsetMinutes();
  const shifted = new Array<number>(TOTAL_SLOTS);
  for (let localSlot = 0; localSlot < TOTAL_SLOTS; localSlot += 1) {
    const utcWeekMinute =
      (((localSlot * 15 - offsetMinutes) % WEEK_MINUTES) + WEEK_MINUTES) %
      WEEK_MINUTES;
    shifted[localSlot] = heatmap[Math.floor(utcWeekMinute / 15)];
  }
  return shifted;
}

function buildLocalDistributions(starts: number[]) {
  const byDayOfWeek = new Array(7).fill(0);
  const byHourOfDay = new Array(24).fill(0);
  const byMonthMap = new Map<string, number>();

  for (const timestampMs of starts) {
    const date = new Date(timestampMs);
    byDayOfWeek[date.getDay()] += 1;
    byHourOfDay[date.getHours()] += 1;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    byMonthMap.set(key, (byMonthMap.get(key) || 0) + 1);
  }

  const monthLabels: string[] = [];
  const anchor = new Date();
  anchor.setDate(1);
  anchor.setHours(0, 0, 0, 0);
  for (let index = 11; index >= 0; index -= 1) {
    const month = new Date(anchor);
    month.setMonth(anchor.getMonth() - index);
    monthLabels.push(
      `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  return {
    byDayOfWeek,
    byHourOfDay,
    byMonth: monthLabels.map((month) => ({
      month,
      count: byMonthMap.get(month) || 0,
    })),
  };
}

function BarChart({
  title,
  values,
  labels,
  step = 1,
  unit = "",
}: {
  title: string;
  values: number[];
  labels: string[];
  step?: number;
  unit?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = values.reduce((top, value) => Math.max(top, value), 0) || 1;
  const tooltipLeft =
    hovered == null
      ? 0
      : Math.min(Math.max(((hovered + 0.5) / values.length) * 100, 10), 90);

  return (
    <div>
      <h4 className="mb-2 text-xs font-bold text-blue-600 dark:text-purple-200">
        {title}
      </h4>
      <div className="relative">
        <div className="flex h-20 items-end gap-px">
          {values.map((value, index) => (
            <div
              key={index}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              className={`flex-1 rounded-t transition-colors ${
                hovered === index
                  ? "bg-pink-500"
                  : value > 0
                    ? "bg-blue-400/70 dark:bg-purple-400/70"
                    : "bg-blue-200/50 dark:bg-purple-800/40"
              }`}
              style={{
                height: `${value > 0 ? Math.max((value / max) * 100, 4) : 2}%`,
              }}
            />
          ))}
        </div>
        {hovered != null ? (
          <div
            className="pointer-events-none absolute -top-9 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-blue-900/95 px-2 py-1 text-[10px] font-bold text-white shadow-md dark:bg-purple-950/95"
            style={{ left: `${tooltipLeft}%` }}
          >
            {labels[hovered]} — {values[hovered]}
            {unit ? ` ${unit}` : ""}
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex">
        {labels.map((label, index) => (
          <span
            key={index}
            className={`flex-1 overflow-hidden text-center text-[9px] font-semibold transition-colors ${
              hovered === index
                ? "text-pink-600 dark:text-pink-300"
                : "text-blue-400 dark:text-purple-300"
            }`}
          >
            {index % step === 0 ? label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionCard({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card-border space-y-4 p-4 scroll-mt-24">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="site-display text-2xl font-bold text-blue-700 lg:text-3xl">
          {title}
        </h2>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-slate-700">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function LiveSection({
  profile,
  channel,
  nowMs,
}: {
  profile: TwitchChannelProfile;
  channel: TwitchChannelSummary;
  nowMs: number;
}) {
  const live = profile.live;
  const [playing, setPlaying] = useState(false);

  if (!live) return null;

  const startedAtMs = Date.parse(live.startedAt);
  const boxArtUrl = profile.game?.boxArtUrl
    ? profile.game.boxArtUrl.replace("{width}", "144").replace("{height}", "192")
    : "";

  return (
    <SectionCard
      id="live"
      eyebrow="now"
      title="Live Right Now ⋆˚✿˖°"
      description=""
    >
      {playing ? (
        <iframe
          title={`${channel.displayName} live on Twitch`}
          src={liveEmbedUrl(channel.login)}
          className="aspect-video w-full rounded-lg border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group relative block w-full overflow-hidden rounded-lg"
          title="Watch live right here"
        >
          <img
            src={
              live.thumbnailUrl
                ? resolveTwitchThumbnail(live.thumbnailUrl, 1280, 720)
                : ""
            }
            alt=""
            className="aspect-video w-full object-cover transition group-hover:opacity-90"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-bold text-white shadow-lg transition group-hover:bg-pink-600">
              ▶ watch live here
            </span>
          </span>
        </button>
      )}

      <div className="flex items-start gap-3">
        {boxArtUrl ? (
          <img
            src={boxArtUrl}
            alt={profile.game?.name || ""}
            className="h-24 w-[72px] flex-shrink-0 rounded-lg shadow-sm"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-blue-700">{live.title}</p>
          <p className="mt-1 text-sm text-slate-700">
            playing <span className="font-bold">{live.gameName}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatChip label="viewers" value={formatCompactNumber(live.viewerCount)} />
            <StatChip
              label="uptime"
              value={Number.isFinite(startedAtMs) ? formatUptime(startedAtMs, nowMs) : "—"}
            />
            <StatChip
              label="started"
              value={Number.isFinite(startedAtMs) ? formatShortDate(startedAtMs) : "—"}
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function ProfileSection({
  profile,
  channel,
}: {
  profile: TwitchChannelProfile;
  channel: TwitchChannelSummary;
}) {
  const user = profile.user;
  const createdAtMs = user?.createdAt ? Date.parse(user.createdAt) : NaN;

  return (
    <SectionCard
      id="profile"
      eyebrow="the streamer"
      title="Channel Profile ⋆˚✿˖°"
      description=""
    >
      <div className="flex items-start gap-3">
        <img
          src={user?.profileImageUrl || channel.profileImageUrl || ""}
          alt=""
          className="h-14 w-14 flex-shrink-0 rounded-full shadow-sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-blue-700">
              {user?.displayName || channel.displayName}
            </span>
            {user?.broadcasterType ? (
              <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-purple-700">
                {user.broadcasterType}
              </span>
            ) : null}
          </div>
          <a
            href={`https://twitch.tv/${channel.login}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold text-blue-500 underline hover:text-blue-700"
          >
            twitch.tv/{channel.login}
          </a>
        </div>
      </div>

      {user?.description ? (
        <p className="whitespace-pre-line text-sm leading-6 text-slate-700">
          {user.description}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <StatChip label="followers" value={formatCompactNumber(profile.followers)} />
        <StatChip label="total views" value={formatCompactNumber(user?.viewCount ?? null)} />
        <StatChip
          label="on twitch since"
          value={
            Number.isFinite(createdAtMs)
              ? new Date(createdAtMs).toLocaleDateString(undefined, {
                  month: "short",
                  year: "numeric",
                })
              : "—"
          }
        />
      </div>
    </SectionCard>
  );
}

function ScheduleSection({ profile }: { profile: TwitchChannelProfile }) {
  const segments = profile.schedule?.segments ?? [];
  const vacation = profile.schedule?.vacation ?? null;

  return (
    <SectionCard
      id="schedule"
      eyebrow="planning"
      title="Official Schedule ⋆˚✿˖°"
      description=""
    >
      {vacation ? (
        <p className="text-sm text-slate-700">
          on vacation until {formatShortDate(Date.parse(vacation.endAt))}
        </p>
      ) : null}
      {segments.length === 0 ? (
        <p className="text-sm text-slate-700">no schedule segments published</p>
      ) : (
        <ul className="space-y-2">
          {segments.map((segment) => (
            <li
              key={segment.id}
              className="rounded-lg bg-white/70 px-3 py-2 text-sm shadow-sm dark:bg-purple-900/40"
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-bold text-blue-700">
                  {segment.title || segment.categoryName || "stream"}
                </span>
                {segment.isRecurring ? (
                  <span className="flex-shrink-0 rounded-full bg-blue-200/70 px-2 py-0.5 text-[9px] font-bold uppercase text-blue-600 dark:bg-purple-800 dark:text-purple-200">
                    weekly
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-blue-500">
                {formatShortDate(Date.parse(segment.startAt))} —{" "}
                {new Date(Date.parse(segment.endAt)).toLocaleString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {segment.categoryName ? ` · ${segment.categoryName}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function HistorySection({ stats }: { stats: TwitchChannelStats }) {
  const local = useMemo(
    () =>
      Array.isArray(stats.starts) && stats.starts.length > 0
        ? buildLocalDistributions(stats.starts)
        : null,
    [stats],
  );

  const dayValues = local?.byDayOfWeek ?? stats.byDayOfWeek;
  const hourValues = local?.byHourOfDay ?? stats.byHourOfDay;
  const monthValues = local?.byMonth ?? stats.byMonth;
  const durationValues = stats.durationHistogram;
  const timezoneLabel = local ? "local time" : "UTC";

  return (
    <SectionCard
      id="history"
      eyebrow="numbers"
      title="Stream History ⋆˚✿˖°"
      description=""
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="streams tracked" value={String(stats.totalStreams)} />
        <StatChip label="total hours" value={String(stats.totalHours)} />
        <StatChip label="avg stream" value={formatMinutes(stats.avgDurationMin)} />
        <StatChip label="longest" value={formatMinutes(stats.longestDurationMin)} />
        <StatChip label="last 30 days" value={String(stats.streamsLast30Days)} />
        <StatChip
          label="hours last 30d"
          value={String(stats.hoursLast30Days)}
        />
      </div>

      <div className="space-y-5 pt-2">
        <BarChart
          title={`streams by day of week (${timezoneLabel})`}
          values={dayValues}
          labels={DAY_LABELS}
          unit="streams"
        />
        <BarChart
          title={`streams by hour of day (${timezoneLabel})`}
          values={hourValues}
          labels={hourValues.map((_, hour) => `${hour}:00`)}
          step={3}
          unit="streams"
        />
        <BarChart
          title={`streams per month (${timezoneLabel})`}
          values={monthValues.map((entry) => entry.count)}
          labels={monthValues.map((entry) => formatMonthKey(entry.month))}
          step={2}
          unit="streams"
        />
        <BarChart
          title="stream length distribution"
          values={durationValues.map((entry) => entry.count)}
          labels={durationValues.map((entry) => entry.label)}
          unit="streams"
        />
      </div>
    </SectionCard>
  );
}

function ClipsSection({ profile }: { profile: TwitchChannelProfile }) {
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);

  const playingClip =
    profile.clips.find((clip) => clip.id === playingClipId) ?? null;

  useEffect(() => {
    if (!playingClip) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlayingClipId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playingClip]);

  if (profile.clips.length === 0) return null;

  return (
    <SectionCard
      id="clips"
      eyebrow="highlights"
      title="Top Clips ⋆˚✿˖°"
      description=""
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {profile.clips.map((clip) => (
          <div key={clip.id}>
            <button
              type="button"
              onClick={() => setPlayingClipId(clip.id)}
              className="group relative block w-full overflow-hidden rounded-lg"
              title={`Play clip: ${clip.title}`}
            >
              <img
                src={clip.thumbnailUrl}
                alt=""
                className="aspect-video w-full object-cover transition group-hover:opacity-85"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 pl-0.5 text-sm text-white shadow-lg transition group-hover:bg-pink-600">
                  ▶
                </span>
              </span>
            </button>
            <p className="mt-1 line-clamp-2 text-xs font-bold text-blue-700">
              {clip.title}
            </p>
            <p className="text-[10px] text-blue-400">
              {formatCompactNumber(clip.viewCount)} views
            </p>
          </div>
        ))}
      </div>

      {playingClip &&
        createPortal(
          <div
            className="fixed inset-0 z-[300000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            onClick={() => setPlayingClipId(null)}
            role="dialog"
            aria-modal="true"
            aria-label={playingClip.title}
          >
            <div
              className="w-full max-w-4xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-bold text-white">
                  {playingClip.title}
                </p>
                <button
                  type="button"
                  onClick={() => setPlayingClipId(null)}
                  aria-label="Close clip preview"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white transition hover:bg-red-600"
                >
                  ✕
                </button>
              </div>
              <iframe
                title={playingClip.title}
                src={clipEmbedUrl(playingClip.id)}
                className="aspect-video w-full rounded-xl border-0"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
              />
              <p className="mt-2 text-xs text-white/70">
                {formatCompactNumber(playingClip.viewCount)} views ·{" "}
                <a
                  href={playingClip.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  open on Twitch
                </a>
              </p>
            </div>
          </div>,
          document.body,
        )}
    </SectionCard>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2 text-center shadow-sm dark:bg-purple-900/40">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-400 dark:text-purple-300">
        {label}
      </div>
      <div className="text-sm font-bold text-blue-700 dark:text-purple-100">
        {value}
      </div>
    </div>
  );
}

function ChannelTab({
  channel,
  selected,
  onSelect,
  fullWidth = false,
}: {
  channel: TwitchChannelSummary;
  selected: boolean;
  onSelect: () => void;
  fullWidth?: boolean;
}) {
  const firstLetter = channel.displayName.slice(0, 1);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={`${channel.displayName} — ${channel.isLive ? "live now" : "offline"}`}
      className={`relative flex items-center gap-2.5 overflow-hidden rounded-lg border p-2 text-left shadow-sm transition ${
        fullWidth ? "w-full" : "w-44 flex-shrink-0"
      } ${
        selected
          ? "border-pink-500 bg-pink-200/90 shadow-[0_3px_6px_rgba(0,0,0,0.18)] dark:border-purple-400 dark:bg-purple-700/70 dark:shadow-[0_3px_6px_rgba(0,0,0,0.4)]"
          : "border-blue-200 bg-white/70 hover:border-pink-300 hover:bg-white dark:border-purple-300/20 dark:bg-purple-900/40 dark:hover:border-purple-400/50 dark:hover:bg-purple-900/60"
      }`}
    >
      {channel.profileImageUrl ? (
        <img
          src={channel.profileImageUrl}
          alt=""
          className="h-9 w-9 flex-shrink-0 rounded-full"
        />
      ) : (
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-200 text-sm font-bold uppercase text-blue-700 dark:bg-purple-800 dark:text-purple-100">
          {firstLetter}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${
              channel.isLive
                ? "animate-pulse bg-red-500"
                : "bg-gray-400 dark:bg-gray-500"
            }`}
          />
          <span
            className={`truncate text-sm font-bold ${
              selected
                ? "text-blue-900 dark:text-purple-50"
                : "text-blue-700 dark:text-purple-100"
            }`}
          >
            {channel.displayName}
          </span>
          {channel.isLive ? (
            <span
              className={`flex-shrink-0 text-xs font-semibold ${
                selected
                  ? "text-red-700 dark:text-pink-200"
                  : "text-red-600 dark:text-pink-300"
              }`}
            >
              {formatViewers(channel.lastViewerCount)}
            </span>
          ) : null}
        </span>
        <span
          className={`block truncate text-xs ${
            selected
              ? "text-blue-700 dark:text-purple-100"
              : "text-blue-500 dark:text-purple-200"
          }`}
        >
          {channel.isLive ? channel.lastGameName || "just chatting" : "offline"}
        </span>
      </span>
    </button>
  );
}

function NotifyButton({
  channelLogin,
  displayName,
}: {
  channelLogin: string;
  displayName: string;
}) {
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

    let cancelled = false;
    const restore = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        const status = await fetchPushStatus(channelLogin, subscription.endpoint);
        if (!cancelled) setSubscribed(status.subscribed);
      } catch {
        // Ignore restore failures; the button still works.
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [channelLogin, permission]);

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

      await subscribeToLiveNotification(channelLogin, subscription.toJSON());
      setSubscribed(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to enable notifications",
      );
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
        await unsubscribeFromLiveNotification(
          channelLogin,
          subscription.endpoint,
        ).catch(() => undefined);
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  };

  if (permission === "denied") {
    return (
      <button
        type="button"
        disabled
        title="Notifications are blocked for this site. Allow them in your browser settings."
        className="cursor-not-allowed rounded-full bg-gray-200 px-4 py-1.5 text-sm font-bold text-gray-500"
      >
        notifications blocked in browser settings
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={subscribed ? disable : enable}
        disabled={busy}
        title={`${displayName} — live notifications`}
        className={`rounded-full px-4 py-1.5 text-sm font-bold transition disabled:opacity-60 ${
          subscribed
            ? "bg-pink-500 text-white shadow-sm hover:bg-pink-600"
            : "border border-pink-400 bg-white/70 text-pink-600 hover:bg-pink-100 dark:bg-purple-900/40 dark:text-purple-200 dark:hover:bg-purple-900/60"
        }`}
      >
        {busy
          ? "please wait..."
          : subscribed
            ? "notifications on — tap to stop"
            : "notify me when live"}
      </button>
      {error ? (
        <span className="text-xs font-semibold text-red-500">{error}</span>
      ) : null}
    </div>
  );
}

function CurveChart({
  payload,
  nowMs,
}: {
  payload: TwitchPredictionPayload;
  nowMs: number;
}) {
  const bars = useMemo(() => {
    const { curve } = payload.prediction;
    if (!curve.length) return [];
    const startIndex = curve.findIndex((point) => point.atMs >= nowMs);
    if (startIndex === -1) return [];
    const window = curve.slice(startIndex, startIndex + 192);
    const step = 4; // 1h bars
    const merged: Array<{ atMs: number; p: number }> = [];
    for (let i = 0; i < window.length; i += step) {
      const chunk = window.slice(i, i + step);
      merged.push({
        atMs: chunk[0].atMs,
        p: chunk.reduce((sum, point) => sum + point.p, 0),
      });
    }
    return merged;
  }, [payload, nowMs]);

  const maxP = bars.reduce((max, bar) => Math.max(max, bar.p), 0) || 1;
  const predictedAt = payload.prediction.nextStartAt;
  const [hovered, setHovered] = useState<number | null>(null);
  const tooltipLeft =
    hovered == null
      ? 0
      : Math.min(Math.max(((hovered + 0.5) / bars.length) * 100, 8), 92);

  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-blue-600 dark:text-purple-200">
        next 48 hours — chance of going live
      </h3>
      <div className="relative">
        <div className="flex h-24 items-end gap-px">
          {bars.map((bar, index) => {
            const height = Math.max((bar.p / maxP) * 100, bar.p > 0 ? 3 : 1);
            const isPredicted =
              predictedAt != null &&
              bar.atMs <= predictedAt &&
              predictedAt < bar.atMs + HOUR_MS;
            return (
              <div
                key={bar.atMs}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                className={`flex-1 rounded-t transition-colors ${
                  hovered === index
                    ? "bg-pink-600"
                    : isPredicted
                      ? "bg-pink-500"
                      : "bg-blue-400/70 dark:bg-purple-400/70"
                }`}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>
        {hovered != null ? (
          <div
            className="pointer-events-none absolute -top-9 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-blue-900/95 px-2 py-1 text-[10px] font-bold text-white shadow-md dark:bg-purple-950/95"
            style={{ left: `${tooltipLeft}%` }}
          >
            {formatShortDate(bars[hovered].atMs)} —{" "}
            {(bars[hovered].p * 100).toFixed(1)}% chance
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-semibold text-blue-400 dark:text-purple-300">
        <span>now</span>
        <span>+24h</span>
        <span>+48h</span>
      </div>
    </div>
  );
}

function Heatmap({ heatmap }: { heatmap: number[] }) {
  const [hovered, setHovered] = useState<{ day: number; slot: number } | null>(
    null,
  );

  if (heatmap.length !== HEATMAP_COLUMNS * 7) {
    return null;
  }

  const hoveredValue =
    hovered == null
      ? 0
      : heatmap[hovered.day * HEATMAP_COLUMNS + hovered.slot];
  const tooltipLeft =
    hovered == null
      ? 0
      : Math.min(
          Math.max(((hovered.slot + 0.5) / HEATMAP_COLUMNS) * 100, 12),
          88,
        );

  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-blue-600 dark:text-purple-200">
        usual streaming hours (local time, all time)
      </h3>
      <div className="relative">
        {hovered != null ? (
          <div
            className="pointer-events-none absolute -top-9 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-blue-900/95 px-2 py-1 text-[10px] font-bold text-white shadow-md dark:bg-purple-950/95"
            style={{ left: `${tooltipLeft}%` }}
          >
            {DAY_LABELS[hovered.day]}{" "}
            {String(Math.floor((hovered.slot * 15) / 60)).padStart(2, "0")}:
            {String((hovered.slot * 15) % 60).padStart(2, "0")} —{" "}
            {Math.round(hoveredValue * 100)}%
          </div>
        ) : null}
        <div className="space-y-px">
          {DAY_LABELS.map((label, day) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`w-9 text-right text-[10px] font-bold transition-colors ${
                  hovered?.day === day
                    ? "text-pink-600 dark:text-pink-300"
                    : "text-blue-400 dark:text-purple-300"
                }`}
              >
                {label}
              </span>
              <div className="grid flex-1 gap-px" style={{ gridTemplateColumns: `repeat(${HEATMAP_COLUMNS}, minmax(0, 1fr))` }}>
                {heatmap.slice(day * HEATMAP_COLUMNS, (day + 1) * HEATMAP_COLUMNS).map((value, index) => {
                  const isHovered =
                    hovered?.day === day && hovered.slot === index;
                  return (
                    <div
                      key={index}
                      onMouseEnter={() => setHovered({ day, slot: index })}
                      onMouseLeave={() => setHovered(null)}
                      className={`h-3 rounded-[2px] transition-transform ${
                        isHovered ? "relative z-10 scale-y-125 ring-1 ring-pink-500" : ""
                      }`}
                      style={{
                        backgroundColor: `rgba(236, 72, 153, ${value > 0 ? 0.12 + value * 0.88 : 0.05})`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PredictionSection({
  payload,
  nowMs,
}: {
  payload: TwitchPredictionPayload;
  nowMs: number;
}) {
  const { prediction, isLive, live } = payload;
  const confidencePct =
    prediction.confidence == null ? null : Math.round(prediction.confidence * 100);

  return (
    <SectionCard
      id="prediction"
      eyebrow="the model"
      title="Next Stream Prediction ⋆˚✿˖°"
      description="A recency-weighted kernel density estimate over the channel's stream history. Times are shown in your local timezone."
    >
      {prediction.nextStartAt == null ? (
        <div>
          <p className="font-bold text-blue-700">No prediction yet</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {prediction.reason === "insufficient-data"
              ? "Not enough stream history yet. Predictions appear once we have recorded a few streams."
              : "The model could not find a reliable pattern in this channel's history."}
          </p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-semibold text-blue-500">
            next stream predicted around
          </p>
          <p className="mt-1 text-2xl font-extrabold text-pink-600 sm:text-3xl">
            {formatDateTime(prediction.nextStartAt)}
          </p>
          <p className="mt-1 text-sm text-slate-700">
            in {formatCountdown(prediction.nextStartAt, nowMs)} · ±
            {prediction.windowMinutes} min
          </p>
          {confidencePct != null ? (
            <p className="mt-2 inline-flex rounded-full bg-pink-100 px-3 py-1 text-sm font-bold text-pink-700 dark:bg-purple-900/60 dark:text-purple-200">
              {confidencePct}% confidence
            </p>
          ) : null}
          {isLive && live?.predictedEndAt ? (
            <p className="mt-3 text-sm leading-6 text-slate-700">
              live right now — usual streams run ~
              {prediction.medianDurationMinutes} minutes, so likely ending around{" "}
              {formatShortDate(Date.parse(live.predictedEndAt))}
            </p>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="streams" value={String(prediction.sampleCount)} />
        <StatChip
          label="per week"
          value={prediction.avgStreamsPerWeek.toFixed(1)}
        />
        <StatChip
          label="usual gap"
          value={`${prediction.medianGapHours.toFixed(0)}h`}
        />
        <StatChip
          label="usual length"
          value={
            prediction.medianDurationMinutes == null
              ? "—"
              : `${Math.round(prediction.medianDurationMinutes / 60 * 10) / 10}h`
          }
        />
      </div>

      <div className="space-y-5 pt-2">
        <CurveChart payload={payload} nowMs={nowMs} />
        <Heatmap heatmap={shiftHeatmapToLocal(prediction.heatmap)} />
      </div>
    </SectionCard>
  );
}

const Twitch = () => {
  const [channels, setChannels] = useState<TwitchChannelSummary[]>([]);
  const [selectedLogin, setSelectedLogin] = useState<string | null>(null);
  const [payload, setPayload] = useState<TwitchPredictionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [profilePayload, setProfilePayload] = useState<TwitchProfilePayload | null>(null);
  const selectedLoginRef = useRef<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/twitch",
    structuredDataId: "twitch-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Twitch Stream Predictions",
      description: TWITCH_DESCRIPTION,
      url: "https://mirabellier.com/twitch",
    },
  });

  useEffect(() => {
    let cancelled = false;

    fetchTwitchChannels()
      .then((list) => {
        if (cancelled) return;
        setChannels(list);
        setSelectedLogin((current) => current ?? (list[0]?.login ?? null));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load Twitch channels");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    selectedLoginRef.current = selectedLogin;
  }, [selectedLogin]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchTwitchChannels()
        .then((list) => {
          setChannels(list);
          setSelectedLogin((current) => current ?? (list[0]?.login ?? null));
        })
        .catch(() => undefined);

      const selected = selectedLoginRef.current;
      if (selected) {
        fetchTwitchPrediction(selected)
          .then((result) => {
            setPayload(result);
            setError(null);
          })
          .catch(() => undefined);
      }
    }, 15 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  const loadProfile = useCallback((login: string) => {
    fetchTwitchProfile(login)
      .then((result) => setProfilePayload(result))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (selectedLogin) {
      loadProfile(selectedLogin);
    }
  }, [selectedLogin, loadProfile]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const selected = selectedLoginRef.current;
      if (selected) {
        loadProfile(selected);
      }
    }, 10 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [loadProfile]);

  const loadPrediction = useCallback((login: string) => {
    setPayload(null);
    setError(null);
    setLoading(true);

    fetchTwitchPrediction(login)
      .then((result) => setPayload(result))
      .catch((err) => {
        setError(
          err instanceof TwitchApiError && err.code === "TWITCH_CONFIG_MISSING"
            ? "Twitch predictions are not set up on the server yet. Check back soon!"
            : err instanceof Error
              ? err.message
              : "Failed to load the prediction",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedLogin) {
      loadPrediction(selectedLogin);
    }
  }, [selectedLogin, loadPrediction]);

  const selectedChannel = channels.find(
    (channel) => channel.login === selectedLogin,
  );

  return (
    <div className="shrine-page min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>

          <main className="w-full space-y-4 p-4 lg:w-3/5">
            <section
              id="landing"
              className="card-border space-y-4 p-4 scroll-mt-24"
            >
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">
                  twitch stream predictions
                </p>
                <h1 className="site-display text-3xl font-bold text-blue-700 sm:text-4xl lg:text-5xl">
                  {selectedChannel?.displayName ?? "twitch predictions"}
                </h1>
                <p className="text-sm font-semibold leading-7 text-blue-500">
                  {selectedChannel ? (
                    <>
                      twitch.tv/{selectedChannel.login}
                      {selectedChannel.isLive ? (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-500/20">
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                          live now
                        </span>
                      ) : null}
                    </>
                  ) : (
                    "when will they go live?"
                  )}
                </p>
              </div>

              <p className="max-w-2xl text-[15px] leading-7 text-slate-700">
                {TWITCH_DESCRIPTION}
              </p>

              {channels.length === 0 && !loading ? (
                <p className="text-sm text-slate-700">
                  No Twitch channels are being tracked yet.
                </p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {channels.map((channel) => (
                    <ChannelTab
                      key={channel.id}
                      channel={channel}
                      selected={channel.login === selectedLogin}
                      onSelect={() => setSelectedLogin(channel.login)}
                    />
                  ))}
                </div>
              )}

              {selectedChannel ? (
                <div className="flex flex-wrap items-center gap-3">
                  <NotifyButton
                    channelLogin={selectedChannel.login}
                    displayName={selectedChannel.displayName}
                  />
                </div>
              ) : null}

              {loading ? (
                <p className="py-4 text-center text-sm text-blue-400">
                  loading predictions...
                </p>
              ) : error ? (
                <p className="py-4 text-center text-sm text-blue-500">{error}</p>
              ) : null}
            </section>

            {!loading && !error && payload ? (
              <>
                <PredictionSection payload={payload} nowMs={nowMs} />

                {profilePayload?.profile?.live ? (
                  <LiveSection
                    profile={profilePayload.profile}
                    channel={profilePayload.channel}
                    nowMs={nowMs}
                  />
                ) : null}
                {profilePayload?.profile ? (
                  <ProfileSection
                    profile={profilePayload.profile}
                    channel={profilePayload.channel}
                  />
                ) : null}
                {profilePayload?.profile?.schedule &&
                (profilePayload.profile.schedule.segments.length > 0 ||
                  profilePayload.profile.schedule.vacation) ? (
                  <ScheduleSection profile={profilePayload.profile} />
                ) : null}
                {profilePayload ? (
                  <HistorySection stats={profilePayload.stats} />
                ) : null}
                {profilePayload?.profile ? (
                  <ClipsSection profile={profilePayload.profile} />
                ) : null}
              </>
            ) : null}

            <Divider />
          </main>

          <aside className="mb-auto w-full space-y-4 lg:w-1/5">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md dark:border-purple-400/30 dark:bg-slate-800 dark:opacity-95">
              <h2 className="text-center text-lg font-bold text-blue-700 dark:text-purple-100">
                channels
              </h2>
              {channels.length === 0 ? (
                <p className="mt-3 text-center text-sm text-blue-500 dark:text-purple-200">
                  none tracked yet
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {channels.map((channel) => (
                    <li key={channel.id}>
                      <ChannelTab
                        channel={channel}
                        selected={channel.login === selectedLogin}
                        onSelect={() => setSelectedLogin(channel.login)}
                        fullWidth
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {payload ? (
              <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md dark:border-purple-400/30 dark:bg-slate-800 dark:opacity-95">
                <h2 className="text-center text-lg font-bold text-blue-700 dark:text-purple-100">
                  {payload.channel.displayName}
                </h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-blue-500 dark:text-purple-200">
                      streams tracked
                    </dt>
                    <dd className="font-bold text-blue-700 dark:text-purple-100">
                      {payload.prediction.sampleCount}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-blue-500 dark:text-purple-200">
                      avg per week
                    </dt>
                    <dd className="font-bold text-blue-700 dark:text-purple-100">
                      {payload.prediction.avgStreamsPerWeek.toFixed(1)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-blue-500 dark:text-purple-200">
                      usual gap
                    </dt>
                    <dd className="font-bold text-blue-700 dark:text-purple-100">
                      {formatDurationHours(payload.prediction.medianGapHours)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-blue-500 dark:text-purple-200">
                      usual length
                    </dt>
                    <dd className="font-bold text-blue-700 dark:text-purple-100">
                      {payload.prediction.medianDurationMinutes == null
                        ? "—"
                        : formatDurationHours(
                            payload.prediction.medianDurationMinutes / 60,
                          )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-blue-500 dark:text-purple-200">
                      last stream
                    </dt>
                    <dd className="font-bold text-blue-700 dark:text-purple-100">
                      {payload.prediction.lastStreamAt != null
                        ? formatShortDate(payload.prediction.lastStreamAt)
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}

            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md dark:border-purple-400/30 dark:bg-slate-800 dark:opacity-95">
              <div className="space-y-3 text-sm text-blue-600 dark:text-purple-200">
                <h2 className="text-center text-lg font-bold text-blue-700 dark:text-purple-100">
                  how it works
                </h2>
                <p>
                  Stream history is smoothed into a weekly schedule map and
                  weighted toward recent streams, then blended with how long it
                  has been since the last one.
                </p>
                <p>
                  Predictions get sharper as more streams are recorded, and the
                  model keeps track of its own accuracy.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Twitch;
