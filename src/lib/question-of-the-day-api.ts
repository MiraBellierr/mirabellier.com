import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";

export type QuestionOfTheDayUser = {
  id?: string;
  username?: string;
  avatar?: string | null;
} | null;

export type QuestionOfTheDayQuestion = {
  recordedDate: string;
  prompt: string;
  lockedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuestionOfTheDayAnswer = {
  id: string;
  recordedDate: string;
  answer: string;
  createdAt: string;
  guestName: string | null;
  user: QuestionOfTheDayUser;
};

export type QuestionOfTheDayCurrentPayload = {
  currentRecordedDate: string;
  question: QuestionOfTheDayQuestion | null;
  answers: QuestionOfTheDayAnswer[];
  canAnswer: boolean;
  hasAnswered: boolean;
  viewerMode: "user" | "guest";
};

export type QuestionOfTheDayArchiveEntry = {
  recordedDate: string;
  prompt: string;
  answerCount: number;
  createdAt: string;
  updatedAt: string;
};

export type QuestionOfTheDayArchiveDayPayload = {
  recordedDate: string;
  question: QuestionOfTheDayQuestion | null;
  answers: QuestionOfTheDayAnswer[];
  answerCount: number;
};

export type QuestionOfTheDayAdminQuestion = QuestionOfTheDayQuestion & {
  answerCount: number;
  isCurrent: boolean;
};

export type QuestionOfTheDayAdminQueuePayload = {
  currentRecordedDate: string;
  page: number;
  pageSize: number;
  totalQuestions: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  questions: QuestionOfTheDayAdminQuestion[];
};

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUser(value: unknown): QuestionOfTheDayUser {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;

  return {
    id: source.id ? String(source.id) : undefined,
    username:
      typeof source.username === "string" ? String(source.username) : undefined,
    avatar:
      typeof source.avatar === "string" ? String(source.avatar) : source.avatar === null
        ? null
        : null,
  };
}

function normalizeQuestion(value: unknown): QuestionOfTheDayQuestion | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;

  return {
    recordedDate: readString(source.recordedDate),
    prompt: readString(source.prompt),
    lockedAt:
      typeof source.lockedAt === "string" ? String(source.lockedAt) : null,
    archivedAt:
      typeof source.archivedAt === "string" ? String(source.archivedAt) : null,
    createdAt: readString(source.createdAt, new Date().toISOString()),
    updatedAt: readString(source.updatedAt, new Date().toISOString()),
  };
}

function normalizeAnswer(value: unknown): QuestionOfTheDayAnswer {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    id: readString(source.id),
    recordedDate: readString(source.recordedDate),
    answer: readString(source.answer),
    createdAt: readString(source.createdAt, new Date().toISOString()),
    guestName:
      typeof source.guestName === "string" ? String(source.guestName) : null,
    user: normalizeUser(source.user),
  };
}

function normalizeArchiveEntry(value: unknown): QuestionOfTheDayArchiveEntry {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    recordedDate: readString(source.recordedDate),
    prompt: readString(source.prompt),
    answerCount: Number.isFinite(Number(source.answerCount))
      ? Number(source.answerCount)
      : 0,
    createdAt: readString(source.createdAt, new Date().toISOString()),
    updatedAt: readString(source.updatedAt, new Date().toISOString()),
  };
}

function normalizeAdminQuestion(value: unknown): QuestionOfTheDayAdminQuestion {
  const question = normalizeQuestion(value) ?? {
    recordedDate: "",
    prompt: "",
    lockedAt: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    ...question,
    answerCount: Number.isFinite(Number(source.answerCount))
      ? Number(source.answerCount)
      : 0,
    isCurrent: Boolean(source.isCurrent),
  };
}

async function readErrorText(response: Response) {
  try {
    const data = await response.json();
    return typeof data?.error === "string" ? data.error : "";
  } catch {
    return "";
  }
}

export async function fetchCurrentQuestionOfTheDay(input?: {
  token?: string | null;
  guestToken?: string | null;
}) {
  const sessionToken = input?.token ?? null;
  const searchParams = new URLSearchParams();
  if (input?.guestToken) {
    searchParams.set("guestToken", input.guestToken);
  }

  const response = await fetch(
    joinApi(
      `/question-of-the-day/current${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    ),
    {
      cache: "no-store",
      credentials: "include",
      headers: shouldSendBearerToken(sessionToken)
        ? { Authorization: `Bearer ${sessionToken}` }
        : undefined,
    },
  );

  if (!response.ok) {
    throw new Error("Failed to load question of the day");
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    currentRecordedDate: readString(data.currentRecordedDate),
    question: normalizeQuestion(data.question),
    answers: Array.isArray(data.answers)
      ? data.answers.map(normalizeAnswer)
      : [],
    canAnswer: Boolean(data.canAnswer),
    hasAnswered: Boolean(data.hasAnswered),
    viewerMode: data.viewerMode === "user" ? "user" : "guest",
  } as QuestionOfTheDayCurrentPayload;
}

export async function submitQuestionOfTheDayAnswer(input: {
  answer: string;
  name?: string;
  token?: string | null;
  guestToken?: string | null;
  turnstileToken: string;
}) {
  const response = await fetch(joinApi("/question-of-the-day/current/answers"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(shouldSendBearerToken(input.token)
        ? { Authorization: `Bearer ${input.token}` }
        : {}),
    },
    body: JSON.stringify({
      answer: input.answer,
      name: input.name,
      guestToken: input.guestToken,
      turnstileToken: input.turnstileToken,
    }),
  });

  if (!response.ok) {
    const message = await readErrorText(response);
    throw new Error(message || "Failed to submit answer");
  }

  return normalizeAnswer(await response.json());
}

export async function fetchQuestionOfTheDayArchive() {
  const response = await fetch(joinApi("/question-of-the-day/archive"), {
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to load question archive");
  }

  const data = (await response.json()) as unknown[];
  return Array.isArray(data) ? data.map(normalizeArchiveEntry) : [];
}

export async function fetchQuestionOfTheDayArchiveDay(recordedDate: string) {
  const response = await fetch(
    joinApi(`/question-of-the-day/archive/${encodeURIComponent(recordedDate)}`),
    {
      cache: "no-store",
      credentials: "include",
    },
  );

  if (!response.ok) {
    const message = await readErrorText(response);
    throw new Error(message || "Failed to load archived question");
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    recordedDate: readString(data.recordedDate),
    question: normalizeQuestion(data.question),
    answers: Array.isArray(data.answers)
      ? data.answers.map(normalizeAnswer)
      : [],
    answerCount: Number.isFinite(Number(data.answerCount))
      ? Number(data.answerCount)
      : 0,
  } as QuestionOfTheDayArchiveDayPayload;
}

export async function fetchQuestionOfTheDayAdminQueue(
  token: string,
  input?: {
    page?: number;
    pageSize?: number;
  },
) {
  const searchParams = new URLSearchParams();

  if (Number.isFinite(input?.page) && Number(input?.page) > 0) {
    searchParams.set("page", String(Math.trunc(Number(input?.page))));
  }

  if (Number.isFinite(input?.pageSize) && Number(input?.pageSize) > 0) {
    searchParams.set("pageSize", String(Math.trunc(Number(input?.pageSize))));
  }

  const response = await fetch(
    joinApi(
      `/question-of-the-day/admin/questions${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    ),
    {
      cache: "no-store",
      credentials: "include",
      headers: shouldSendBearerToken(token)
        ? { Authorization: `Bearer ${token}` }
        : undefined,
    },
  );

  if (!response.ok) {
    const message = await readErrorText(response);
    throw new Error(message || "Failed to load scheduled questions");
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    currentRecordedDate: readString(data.currentRecordedDate),
    page: readNumber(data.page, 1),
    pageSize: readNumber(data.pageSize, 5),
    totalQuestions: readNumber(data.totalQuestions, 0),
    totalPages: readNumber(data.totalPages, 0),
    hasPreviousPage: Boolean(data.hasPreviousPage),
    hasNextPage: Boolean(data.hasNextPage),
    questions: Array.isArray(data.questions)
      ? data.questions.map(normalizeAdminQuestion)
      : [],
  } as QuestionOfTheDayAdminQueuePayload;
}

export async function queueQuestionOfTheDayPrompts(
  prompts: string[],
  token: string,
) {
  const response = await fetch(joinApi("/question-of-the-day/admin/questions"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ prompts }),
  });

  if (!response.ok) {
    const message = await readErrorText(response);
    throw new Error(message || "Failed to queue questions");
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    currentRecordedDate: readString(data.currentRecordedDate),
    questions: Array.isArray(data.questions)
      ? data.questions.map(normalizeAdminQuestion)
      : [],
    addedCount: Number.isFinite(Number(data.addedCount))
      ? Number(data.addedCount)
      : 0,
  };
}

export async function forceArchiveCurrentQuestionOfTheDay(token: string) {
  const response = await fetch(
    joinApi("/question-of-the-day/admin/current/force-archive"),
    {
      method: "POST",
      credentials: "include",
      headers: shouldSendBearerToken(token)
        ? { Authorization: `Bearer ${token}` }
        : undefined,
    },
  );

  if (!response.ok) {
    const message = await readErrorText(response);
    throw new Error(message || "Failed to archive question");
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    archivedQuestion: normalizeQuestion(data.archivedQuestion),
    question: normalizeQuestion(data.question),
    currentRecordedDate: readString(data.currentRecordedDate),
    questions: Array.isArray(data.questions)
      ? data.questions.map(normalizeAdminQuestion)
      : [],
  };
}

export async function saveCurrentQuestionOfTheDay(
  prompt: string,
  token: string,
) {
  const response = await fetch(joinApi("/question-of-the-day/current"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const message = await readErrorText(response);
    throw new Error(message || "Failed to save question");
  }

  const data = (await response.json()) as Record<string, unknown>;
  return normalizeQuestion(data.question);
}

export async function deleteQuestionOfTheDayAnswer(id: string, token: string) {
  const response = await fetch(
    joinApi(`/question-of-the-day/answers/${encodeURIComponent(id)}`),
    {
      method: "DELETE",
      credentials: "include",
      headers: shouldSendBearerToken(token)
        ? { Authorization: `Bearer ${token}` }
        : undefined,
    },
  );

  if (!response.ok) {
    const message = await readErrorText(response);
    throw new Error(message || "Failed to delete answer");
  }
}
