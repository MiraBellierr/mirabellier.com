import { useMemo, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Divider from "../parts/Divider";
import kannaHappy from "@/assets/anime/kanna-happy.webp";
import AsyncStateCard from "@/components/AsyncStateCard";
import TurnstileWidget from "@/components/TurnstileWidget";
import { resolveAsset } from "@/lib/blog-utils";
import { getFriendlyFetchMessage } from "@/lib/friendly-fetch-message";
import { useWebSocketEvent } from "@/hooks/use-websocket";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { usePageSeo } from "@/lib/seo";
import {
  deleteQuestionOfTheDayAnswer,
  fetchCurrentQuestionOfTheDay,
  fetchQuestionOfTheDayArchive,
  submitQuestionOfTheDayAnswer,
  type QuestionOfTheDayArchiveEntry,
  type QuestionOfTheDayCurrentPayload,
} from "@/lib/question-of-the-day-api";
import { ensureQuestionGuestToken } from "@/lib/question-of-the-day-session";
import {
  formatQuestionAnswerTime,
  formatQuestionHeadingDate,
  formatQuestionRecordedDate,
  getQuestionAnswerDisplayName,
} from "@/lib/question-of-the-day-ui";
import { canModerateQuestionOfTheDay } from "@/lib/user-permissions";
import { useConfirm } from "@/states/ConfirmContext";

const QUESTION_DESCRIPTION =
  "Answer one public question each UTC day, then browse the archive of past prompts and answers.";

function getQuestionAnswerTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const QuestionOfTheDay = () => {
  const auth = useOptionalAuth();
  const { confirm } = useConfirm();
  const [currentData, setCurrentData] =
    useState<QuestionOfTheDayCurrentPayload | null>(null);
  const [archivePreview, setArchivePreview] = useState<
    QuestionOfTheDayArchiveEntry[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingAnswerId, setDeletingAnswerId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [answer, setAnswer] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const isOwner = canModerateQuestionOfTheDay(auth?.user);
  const isLoggedIn = !!auth?.user;

  usePageSeo({
    canonical: "https://mirabellier.com/question-of-the-day",
    structuredDataId: "question-of-the-day-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Mirabellier Question of the Day",
      description: QUESTION_DESCRIPTION,
      url: "https://mirabellier.com/question-of-the-day",
    },
  });

  useWebSocketEvent("qotd:new-day", () => {
    setRefreshTick((t) => t + 1);
  });

  useEffect(() => {
    let cancelled = false;

    const loadPageData = async () => {
      setLoading(true);

      try {
        const guestToken = isLoggedIn ? null : ensureQuestionGuestToken();
        const [current, archive] = await Promise.all([
          fetchCurrentQuestionOfTheDay({
            token: auth?.token ?? null,
            guestToken,
          }),
          fetchQuestionOfTheDayArchive(),
        ]);

        if (cancelled) return;

        setCurrentData(current);
        setArchivePreview(archive.slice(0, 3));
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load question of the day",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, [auth?.token, isLoggedIn, refreshTick]);

  const remainingCharacters = 500 - answer.length;
  const activeQuestionRecordedDate =
    currentData?.question?.recordedDate || currentData?.currentRecordedDate;
  const headingDate = formatQuestionHeadingDate(
    activeQuestionRecordedDate || new Date().toISOString().slice(0, 10),
  );
  const isCarriedOverQuestion = Boolean(
    currentData?.question &&
      currentData.question.recordedDate !== currentData.currentRecordedDate,
  );
  const sortedAnswers = [...(currentData?.answers ?? [])].sort(
    (left, right) =>
      getQuestionAnswerTimestamp(right.createdAt) -
      getQuestionAnswerTimestamp(left.createdAt),
  );
  const questionLoadErrorMessage = useMemo(
    () => getFriendlyFetchMessage("Question page", error),
    [error],
  );

  const retryPageLoad = () => {
    setRefreshTick((value) => value + 1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!currentData?.question) {
      setSubmitError("There is no active question to answer yet.");
      return;
    }

    if (!answer.trim()) {
      setSubmitError("Please write an answer first.");
      return;
    }

    if (!auth?.user && !guestName.trim()) {
      setSubmitError("Please add your name first.");
      return;
    }

    if (!turnstileToken) {
      setSubmitError("Please complete the human verification.");
      return;
    }

    setSubmitting(true);

    try {
      const guestToken = auth?.user ? null : ensureQuestionGuestToken();

      await submitQuestionOfTheDayAnswer({
        answer,
        name: auth?.user ? undefined : guestName,
        token: auth?.token ?? null,
        guestToken,
        turnstileToken,
      });

      const refreshed = await fetchCurrentQuestionOfTheDay({
        token: auth?.token ?? null,
        guestToken,
      });

      setCurrentData(refreshed);
      setAnswer("");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit answer",
      );
    } finally {
      setSubmitting(false);
      setTurnstileToken(null);
      setTurnstileResetKey((value) => value + 1);
    }
  };

  const handleDeleteAnswer = async (answerId: string) => {
    if (!auth?.token || !isOwner) {
      setError("You need an owner session to delete answers.");
      return;
    }

    const shouldDelete = await confirm({
      title: "Delete answer?",
      message: "Delete this public answer from the question page and archive?",
      confirmLabel: "Delete answer",
      cancelLabel: "Keep answer",
    });

    if (!shouldDelete) {
      return;
    }

    setDeletingAnswerId(answerId);
    setError(null);

    try {
      await deleteQuestionOfTheDayAnswer(answerId, auth.token);
      setRefreshTick((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete answer",
      );
    } finally {
      setDeletingAnswerId(null);
    }
  };

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />

            <div className="mt-3 mb-auto hidden justify-center items-center lg:flex">
              <img
                className="w-full max-w-[320px] border border-blue-700 shadow-md rounded-2xl"
                src={kannaHappy}
                width="320"
                height="427"
                alt="kanna looking happy"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <section className="card-border space-y-4 p-4 bg-white/55">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-blue-700">
                  Question of the day {headingDate ? `(${headingDate}) ₊˚⊹⋆` : ""}
                </h2>
              </div>

              {loading && !currentData ? (
                <AsyncStateCard
                  variant="loading"
                  title="Loading today's question..."
                  message="Finding the current prompt and recent archive."
                />
              ) : error && !currentData ? (
                <AsyncStateCard
                  variant="error"
                  title={questionLoadErrorMessage.title}
                  message={questionLoadErrorMessage.message}
                  detail={questionLoadErrorMessage.detail}
                  actionLabel="Retry"
                  onAction={retryPageLoad}
                />
              ) : (
                <>
                  {error ? (
                    <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}

                  {currentData?.question ? (
                    <div className="space-y-4">
                      {isCarriedOverQuestion ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                          This question is still active because it has not
                          received an answer yet.
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <p className="text-sm font-bold text-blue-700">
                          Question:
                        </p>
                        <p className="text-slate-700 leading-relaxed">
                          {currentData.question.prompt} ^-^
                        </p>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm text-blue-500">
                          {auth?.user
                            ? `Signed in as ${auth.user.username}.`
                            : "Guests can answer too. Add a name first."}
                        </p>
                      </div>

                      {currentData.hasAnswered ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                          You already answered this question.
                        </div>
                      ) : (
                        <form className="space-y-4" onSubmit={handleSubmit}>
                          {!auth?.user ? (
                            <label className="space-y-1 text-sm">
                              <span className="font-semibold text-blue-600">
                                your name
                              </span>
                              <input
                                value={guestName}
                                onChange={(event) =>
                                  setGuestName(event.target.value.slice(0, 40))
                                }
                                className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
                                placeholder="enter your name"
                              />
                            </label>
                          ) : null}

                          <label className="space-y-1 text-sm">
                            <span className="font-semibold text-blue-600">
                              your answer
                            </span>
                            <textarea
                              value={answer}
                              onChange={(event) =>
                                setAnswer(event.target.value.slice(0, 500))
                              }
                              className="min-h-36 w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
                              placeholder="leave a tiny thought for today..."
                            />
                          </label>

                          <TurnstileWidget
                            action="question_of_the_day"
                            onTokenChange={setTurnstileToken}
                            resetKey={turnstileResetKey}
                          />

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-blue-400">
                              {remainingCharacters} characters left
                            </p>

                            <button
                              type="submit"
                              disabled={submitting || !turnstileToken}
                              className="rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:bg-pink-300"
                            >
                              {submitting ? "Posting..." : "Post answer"}
                            </button>
                          </div>

                          {submitError ? (
                            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                              {submitError}
                            </div>
                          ) : null}
                        </form>
                      )}
                    </div>
                  ) : (
                    <AsyncStateCard
                      variant="empty"
                      title="No active question yet."
                      message="There is no live prompt right now. The answer form opens again as soon as a new question is available."
                      actionLabel="Check again"
                      onAction={retryPageLoad}
                    />
                  )}
                </>
              )}
            </section>

            <Divider />

            <section className="card-border space-y-4 p-4 bg-white/55">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-blue-700">
                  answers so far ⤵︎
                </h3>
              </div>

              {sortedAnswers.length ? (
                <div className="space-y-4">
                  {sortedAnswers.map((entry, index) => {
                    const avatar = resolveAsset(entry.user?.avatar);
                    const displayName = getQuestionAnswerDisplayName(entry);

                    return (
                      <article
                        key={entry.id}
                        className={`${index > 0 ? "border-t border-blue-100 pt-4" : ""}`}
                      >
                        <div className="flex items-start gap-3">
                          {avatar ? (
                            <img
                              src={avatar}
                              alt={displayName}
                              className="h-11 w-11 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-xs font-bold uppercase text-blue-600">
                              {displayName.slice(0, 2)}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {entry.user?.username ? (
                                <Link
                                  to={`/profile/${entry.user.username}`}
                                  className="font-semibold text-blue-700 hover:underline"
                                >
                                  {displayName}
                                </Link>
                              ) : (
                                <span className="font-semibold text-blue-700">
                                  {displayName}
                                </span>
                              )}
                            </div>

                            <p className="mt-1 text-xs text-blue-400">
                              {formatQuestionAnswerTime(entry.createdAt)}
                            </p>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                              {entry.answer}
                            </p>
                          </div>

                          {isOwner ? (
                            <button
                              type="button"
                              onClick={() => void handleDeleteAnswer(entry.id)}
                              disabled={deletingAnswerId === entry.id}
                              className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingAnswerId === entry.id
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <AsyncStateCard
                  variant="empty"
                  title="No answers yet."
                  message="Be the first one to leave a little note for today."
                />
              )}
            </section>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  recent archive
                </h2>
                <div className="space-y-3">
                  {archivePreview.length ? (
                    <>
                      {archivePreview.map((entry, index) => (
                        <Link
                          key={entry.recordedDate}
                          to={`/question-of-the-day/archive/${entry.recordedDate}`}
                          className={`block ${index > 0 ? "border-t border-blue-200 pt-3" : ""}`}
                        >
                          <p className="font-semibold text-blue-700">
                            {formatQuestionRecordedDate(entry.recordedDate)}
                          </p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-blue-400">
                            {entry.answerCount} answer
                            {entry.answerCount === 1 ? "" : "s"}
                          </p>
                          <p className="mt-2 text-sm text-blue-600">
                            {entry.prompt}
                          </p>
                        </Link>
                      ))}
                      <Link
                        to="/question-of-the-day/archive"
                        className="block pt-1 text-sm font-semibold text-pink-500 hover:underline"
                      >
                        view full archive
                      </Link>
                    </>
                  ) : (
                    <p>
                      The archive will start filling up after questions begin
                      receiving answers.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  little archive note
                </h2>
                <p>
                  Unanswered questions stay live. Once a question gets an
                  answer, it can move into the archive later.
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

export default QuestionOfTheDay;
