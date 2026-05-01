import type { QuestionOfTheDayAnswer } from "@/lib/question-of-the-day-api";

export function formatQuestionRecordedDate(recordedDate: string) {
  if (!recordedDate) {
    return "Unknown day";
  }

  return new Date(`${recordedDate}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatQuestionHeadingDate(recordedDate: string) {
  if (!recordedDate) {
    return "";
  }

  return new Date(`${recordedDate}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  });
}

export function formatQuestionAnswerTime(createdAt: string) {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return "Just now";
  }

  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function getQuestionAnswerDisplayName(answer: QuestionOfTheDayAnswer) {
  return answer.user?.username || answer.guestName || "Anonymous";
}
