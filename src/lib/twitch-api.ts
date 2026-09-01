import { joinApi } from "@/lib/config";

export type TwitchChannelSummary = {
  id: number;
  login: string;
  displayName: string;
  profileImageUrl: string | null;
  addedAt: string;
  isLive: boolean;
  live: { startedAt: string } | null;
  lastGameName: string | null;
  lastViewerCount: number | null;
};

export type TwitchCurvePoint = {
  atMs: number;
  p: number;
};

export type TwitchPrediction = {
  nextStartAt: number | null;
  windowMinutes: number;
  confidence: number | null;
  curve: TwitchCurvePoint[];
  heatmap: number[];
  avgStreamsPerWeek: number;
  medianGapHours: number;
  medianDurationMinutes: number | null;
  sampleCount: number;
  lastStreamAt: number | null;
  reason: string | null;
};

export type TwitchPredictionPayload = {
  channel: TwitchChannelSummary;
  isLive: boolean;
  live: { startedAt: string; predictedEndAt: string | null } | null;
  prediction: TwitchPrediction;
  fetchedAt: string;
};

export type TwitchAccuracy = {
  channel: TwitchChannelSummary | null;
  evaluatedPredictions: number;
  meanAbsoluteErrorMinutes: number | null;
};

export type TwitchScheduleSegment = {
  id: string;
  title: string;
  categoryName: string;
  startAt: string;
  endAt: string;
  isRecurring: boolean;
  isVacation: boolean;
};

export type TwitchClip = {
  id: string;
  title: string;
  viewCount: number;
  durationSeconds: number | null;
  createdAt: string;
  thumbnailUrl: string;
  url: string;
};

export type TwitchProfileUser = {
  broadcasterId: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
  description: string;
  offlineImageUrl: string;
  viewCount: number | null;
  broadcasterType: string;
  createdAt: string;
};

export type TwitchProfileLive = {
  title: string;
  gameId: string;
  gameName: string;
  viewerCount: number;
  startedAt: string;
  thumbnailUrl: string;
};

export type TwitchProfileGame = {
  id: string;
  name: string;
  boxArtUrl: string;
};

export type TwitchChannelProfile = {
  fetchedAt: string;
  stale?: boolean;
  user: TwitchProfileUser | null;
  followers: number | null;
  channelInfo: { title: string; gameName: string; language: string } | null;
  schedule: {
    segments: TwitchScheduleSegment[];
    vacation: { startAt: string; endAt: string } | null;
  };
  clips: TwitchClip[];
  live: TwitchProfileLive | null;
  game: TwitchProfileGame | null;
};

export type TwitchChannelStats = {
  totalStreams: number;
  totalHours: number;
  avgDurationMin: number | null;
  longestDurationMin: number | null;
  streamsLast30Days: number;
  hoursLast30Days: number;
  byDayOfWeek: number[];
  byHourOfDay: number[];
  byMonth: Array<{ month: string; count: number }>;
  durationHistogram: Array<{
    label: string;
    min: number;
    max: number;
    count: number;
  }>;
};

export type TwitchProfilePayload = {
  channel: TwitchChannelSummary;
  profile: TwitchChannelProfile | null;
  profileError: string | null;
  stats: TwitchChannelStats;
  fetchedAt: string;
};

export class TwitchApiError extends Error {
  code: string | null;
  status: number;

  constructor(message: string, input?: { code?: string | null; status?: number }) {
    super(message);
    this.name = "TwitchApiError";
    this.code = input?.code ?? null;
    this.status = Number.isFinite(input?.status) ? Number(input?.status) : 500;
  }
}

async function readApiError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as Record<string, unknown>;
    return {
      code: typeof data.code === "string" ? data.code : null,
      message: typeof data.error === "string" && data.error ? data.error : fallback,
    };
  } catch {
    return { code: null, message: fallback };
  }
}

export async function fetchTwitchChannels() {
  const response = await fetch(joinApi("/twitch/channels"), { cache: "no-store" });

  if (!response.ok) {
    const error = await readApiError(response, "Failed to load Twitch channels");
    throw new TwitchApiError(error.message, {
      code: error.code,
      status: response.status,
    });
  }

  const data = (await response.json()) as { channels: unknown[] };
  return (Array.isArray(data.channels) ? data.channels : []) as TwitchChannelSummary[];
}

export async function fetchTwitchPrediction(login: string) {
  const response = await fetch(joinApi(`/twitch/channels/${encodeURIComponent(login)}/prediction`), {
    cache: "no-store",
  });

  if (!response.ok) {
    const error = await readApiError(response, "Failed to load Twitch prediction");
    throw new TwitchApiError(error.message, {
      code: error.code,
      status: response.status,
    });
  }

  return (await response.json()) as TwitchPredictionPayload;
}

export async function addTwitchChannel(login: string) {
  const response = await fetch(joinApi("/twitch/channels"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ login }),
  });

  if (!response.ok) {
    const error = await readApiError(response, "Failed to add Twitch channel");
    throw new TwitchApiError(error.message, {
      code: error.code,
      status: response.status,
    });
  }

  return (await response.json()) as { channel: TwitchChannelSummary };
}

export async function removeTwitchChannel(login: string) {
  const response = await fetch(joinApi(`/twitch/channels/${encodeURIComponent(login)}`), {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await readApiError(response, "Failed to remove Twitch channel");
    throw new TwitchApiError(error.message, {
      code: error.code,
      status: response.status,
    });
  }
}

export async function backfillTwitchChannel(login: string) {
  const response = await fetch(
    joinApi(`/twitch/channels/${encodeURIComponent(login)}/backfill`),
    {
      method: "POST",
      credentials: "include",
    },
  );

  if (!response.ok) {
    const error = await readApiError(response, "Failed to backfill Twitch history");
    throw new TwitchApiError(error.message, {
      code: error.code,
      status: response.status,
    });
  }

  return (await response.json()) as { ok: boolean; inserted?: number };
}

export async function fetchTwitchAccuracy(login: string) {
  const response = await fetch(joinApi(`/twitch/channels/${encodeURIComponent(login)}/accuracy`), {
    cache: "no-store",
  });

  if (!response.ok) {
    const error = await readApiError(response, "Failed to load Twitch accuracy");
    throw new TwitchApiError(error.message, {
      code: error.code,
      status: response.status,
    });
  }

  return (await response.json()) as TwitchAccuracy;
}

export async function fetchTwitchProfile(login: string) {
  const response = await fetch(joinApi(`/twitch/channels/${encodeURIComponent(login)}/profile`), {
    cache: "no-store",
  });

  if (!response.ok) {
    const error = await readApiError(response, "Failed to load Twitch channel profile");
    throw new TwitchApiError(error.message, {
      code: error.code,
      status: response.status,
    });
  }

  return (await response.json()) as TwitchProfilePayload;
}
