import { useMemo, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Divider from "../parts/Divider";
import kannaSmile from "@/assets/anime/kanna-smile.webp";
import AsyncStateCard from "@/components/AsyncStateCard";
import { resolveAsset } from "@/lib/blog-utils";
import { getFriendlyFetchMessage } from "@/lib/friendly-fetch-message";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import {
  deleteQuestionOfTheDayAnswer,
  fetchQuestionOfTheDayArchiveDay,
  type QuestionOfTheDayArchiveDayPayload,
} from "@/lib/question-of-the-day-api";
import { usePageSeo } from "@/lib/seo";
import {
  formatQuestionAnswerTime,
  formatQuestionRecordedDate,
  getQuestionAnswerDisplayName,
} from "@/lib/question-of-the-day-ui";
import { canModerateQuestionOfTheDay } from "@/lib/user-permissions";
import { useConfirm } from "@/states/ConfirmContext";

const QuestionArchiveDay = () => {
  const auth = useOptionalAuth();
  const { confirm } = useConfirm();
  const { recordedDate = "" } = useParams<{ recordedDate: string }>();
  const [data, setData] = useState<QuestionOfTheDayArchiveDayPayload | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingAnswerId, setDeletingAnswerId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const isOwner = canModerateQuestionOfTheDay(auth?.user);
  const archiveDayLoadErrorMessage = useMemo(
    () => getFriendlyFetchMessage("Archived question day", error),
    [error],
  );

  const retryLoadDay = () => {
    setReloadTick((value) => value + 1);
  };

  usePageSeo({
    canonical: `https://mirabellier.com/question-of-the-day/archive/${recordedDate}`,
    structuredDataId: "question-archive-day-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Question of the Day Archive - ${recordedDate}`,
      description: "An archived question of the day with public answers.",
      url: `https://mirabellier.com/question-of-the-day/archive/${recordedDate}`,
    },
  });

  useEffect(() => {
    let cancelled = false;

    const loadDay = async () => {
      setLoading(true);

      try {
        const nextData = await fetchQuestionOfTheDayArchiveDay(recordedDate);
        if (!cancelled) {
          setData(nextData);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load archived question",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDay();

    return () => {
      cancelled = true;
    };
  }, [recordedDate, reloadTick]);

  const handleDeleteAnswer = async (answerId: string) => {
    if (!auth?.token || !isOwner) {
      setError("You need an owner session to delete answers.");
      return;
    }

    const shouldDelete = await confirm({
      title: "Delete answer?",
      message: "Delete this public answer from the archive page?",
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
      setReloadTick((value) => value + 1);
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
                src={kannaSmile}
                width="320"
                height="427"
                alt="kanna smiling"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <section className="card-border space-y-4 p-4 bg-white/55">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-blue-700">
                    {formatQuestionRecordedDate(recordedDate)}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/question-of-the-day"
                    className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                  >
                    today&apos;s page
                  </Link>
                  <Link
                    to="/question-of-the-day/archive"
                    className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                  >
                    all archive
                  </Link>
                </div>
              </div>

              {loading && !data ? (
                <AsyncStateCard
                  variant="loading"
                  title="Loading archived day..."
                  message="Bringing this archived prompt and answers into view."
                />
              ) : error && !data?.question ? (
                <AsyncStateCard
                  variant="error"
                  title={archiveDayLoadErrorMessage.title}
                  message={archiveDayLoadErrorMessage.message}
                  detail={archiveDayLoadErrorMessage.detail}
                  actionLabel="Retry"
                  onAction={retryLoadDay}
                />
              ) : !data?.question ? (
                <AsyncStateCard
                  variant="empty"
                  title="Archived question not found."
                  message="This day may not be archived yet, or the link is outdated."
                  actionLabel="Check again"
                  onAction={retryLoadDay}
                />
              ) : (
                <>
                  {error ? (
                    <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <p className="text-sm font-bold text-blue-700">
                      archived question
                    </p>
                    <p className="text-slate-700 leading-relaxed">
                      {data.question.prompt}
                    </p>
                    <p className="text-xs uppercase tracking-[0.18em] text-blue-400">
                      {data.answerCount} answer
                      {data.answerCount === 1 ? "" : "s"}
                    </p>
                  </div>

                  {data.answers.length ? (
                    <div className="space-y-4">
                      {data.answers.map((entry, index) => {
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
                                  onClick={() =>
                                    void handleDeleteAnswer(entry.id)
                                  }
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
                      title="No answers saved for this archived day."
                      message="When answers are submitted on that day, they appear here."
                    />
                  )}
                </>
              )}
            </section>

            <Divider />
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  archive note
                </h2>
                <p>This is an archived question of the day.</p>
                {isOwner ? <p>You can still remove answers from here.</p> : null}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default QuestionArchiveDay;
