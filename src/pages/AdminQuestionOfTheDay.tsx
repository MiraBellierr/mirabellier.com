import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Divider from "../parts/Divider";
import kannaPolice from "@/assets/anime/kanna-police.webp";
import {
  fetchCurrentQuestionOfTheDay,
  fetchQuestionOfTheDayAdminQueue,
  fetchQuestionOfTheDayArchive,
  forceArchiveCurrentQuestionOfTheDay,
  queueQuestionOfTheDayPrompts,
  type QuestionOfTheDayAdminQueuePayload,
  type QuestionOfTheDayArchiveEntry,
  type QuestionOfTheDayCurrentPayload,
} from "@/lib/question-of-the-day-api";
import { usePageSeo } from "@/lib/seo";
import {
  formatQuestionRecordedDate,
  QUESTION_OWNER_DISCORD_ID,
} from "@/lib/question-of-the-day-ui";
import { useAuth } from "@/states/AuthContext";
import { useConfirm } from "@/states/ConfirmContext";

function AdminMessageCard({
  title,
  body,
  actionLabel,
  actionTo,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  actionTo?: string;
}) {
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
          </div>

          <main className="w-full lg:w-3/5 p-4">
            <section className="card-border p-6 bg-white/55">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-blue-700">{title}</h2>
                <p className="mt-3 text-blue-500">{body}</p>
                {actionLabel && actionTo ? (
                  <Link
                    to={actionTo}
                    className="mt-5 inline-flex rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600"
                  >
                    {actionLabel}
                  </Link>
                ) : null}
              </div>
            </section>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function parseQueuedPrompts(value: string) {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const AdminQuestionOfTheDay = () => {
  const auth = useAuth();
  const { confirm } = useConfirm();
  const [currentData, setCurrentData] =
    useState<QuestionOfTheDayCurrentPayload | null>(null);
  const [queueData, setQueueData] =
    useState<QuestionOfTheDayAdminQueuePayload | null>(null);
  const [archiveEntries, setArchiveEntries] = useState<
    QuestionOfTheDayArchiveEntry[]
  >([]);
  const [queueDraft, setQueueDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [forcingArchive, setForcingArchive] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const isOwner = auth.user?.discordId === QUESTION_OWNER_DISCORD_ID;

  usePageSeo({
    canonical: "https://mirabellier.com/admin/question-of-the-day",
    structuredDataId: "admin-question-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Admin Question of the Day",
      description: "Owner-only controls for the queued question list.",
      url: "https://mirabellier.com/admin/question-of-the-day",
    },
  });

  useEffect(() => {
    const token = auth.token;

    if (!isOwner || !token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadAdminData = async () => {
      setLoading(true);

      try {
        const [current, queue, archive] = await Promise.all([
          fetchCurrentQuestionOfTheDay({ token }),
          fetchQuestionOfTheDayAdminQueue(token),
          fetchQuestionOfTheDayArchive(),
        ]);

        if (cancelled) return;

        setCurrentData(current);
        setQueueData(queue);
        setArchiveEntries(archive.slice(0, 8));
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load admin page",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadAdminData();

    return () => {
      cancelled = true;
    };
  }, [auth.token, isOwner, reloadTick]);

  if (!auth.user) {
    return (
      <AdminMessageCard
        title="Please log in"
        body="You need to log in with the owner account before using the question admin page."
        actionLabel="Go to login"
        actionTo="/login"
      />
    );
  }

  if (!isOwner) {
    return (
      <AdminMessageCard
        title="Not authorized"
        body="This page is only available to the site owner account."
        actionLabel="View the public page"
        actionTo="/question-of-the-day"
      />
    );
  }

  const activeQuestion = currentData?.question ?? null;
  const activeAnswerCount = currentData?.answers.length ?? 0;
  const activeQuestionState = !activeQuestion
    ? "waiting for a prompt"
    : activeQuestion.recordedDate === currentData?.currentRecordedDate
      ? "current UTC day"
      : "carried forward until answered";
  const queuedPromptCount = parseQueuedPrompts(queueDraft).length;

  const handleQueueSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);
    setActionSuccess(null);

    if (!auth.token) {
      setSaveError("You need an active session to queue questions.");
      return;
    }

    const prompts = parseQueuedPrompts(queueDraft);
    if (!prompts.length) {
      setSaveError("Add at least one question first.");
      return;
    }

    setSaving(true);

    try {
      const result = await queueQuestionOfTheDayPrompts(prompts, auth.token);
      setQueueDraft("");
      setSaveSuccess(
        `Queued ${result.addedCount} question${result.addedCount === 1 ? "" : "s"} across the next open UTC day slots.`,
      );
      setReloadTick((value) => value + 1);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to queue questions",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleForceArchive = async () => {
    if (!auth.token || !activeQuestion) {
      setError("There is no active question to archive.");
      return;
    }

    const shouldArchive = await confirm({
      title: "Force archive this question?",
      message:
        "This is only for testing. The active question will disappear from the live page and show up in the archive immediately.",
      confirmLabel: "Force archive",
      cancelLabel: "Keep live",
    });

    if (!shouldArchive) {
      return;
    }

    setForcingArchive(true);
    setError(null);
    setActionSuccess(null);

    try {
      const result = await forceArchiveCurrentQuestionOfTheDay(auth.token);
      const archivedLabel = result.archivedQuestion
        ? formatQuestionRecordedDate(result.archivedQuestion.recordedDate)
        : "The active question";

      setActionSuccess(`${archivedLabel} was moved into the archive for testing.`);
      setReloadTick((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to archive question",
      );
    } finally {
      setForcingArchive(false);
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
                src={kannaPolice}
                width="320"
                height="427"
                alt="kanna police"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <section className="card-border space-y-4 p-4 bg-white/55">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-blue-700">
                    question of the day admin
                  </h2>
                </div>

                <Link
                  to="/question-of-the-day"
                  className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                >
                  open public page
                </Link>
              </div>

              {loading ? (
                <div className="text-blue-500">Loading admin data...</div>
              ) : (
                <>
                  {error ? (
                    <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <section className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.18em] text-blue-400">
                        current UTC day
                      </p>
                      <p className="font-semibold text-blue-700">
                        {formatQuestionRecordedDate(
                          currentData?.currentRecordedDate ||
                            queueData?.currentRecordedDate ||
                            "",
                        )}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.18em] text-blue-400">
                        active question
                      </p>
                      <p className="font-semibold text-blue-700">
                        {activeQuestion
                          ? formatQuestionRecordedDate(activeQuestion.recordedDate)
                          : "none"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.18em] text-blue-400">
                        active state
                      </p>
                      <p className="font-semibold text-blue-700">
                        {activeQuestionState}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.18em] text-blue-400">
                        active answers
                      </p>
                      <p className="font-semibold text-blue-700">
                        {activeAnswerCount}
                      </p>
                    </div>
                  </section>

                  {activeQuestion ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 pt-4">
                      <p className="text-xs text-blue-400">
                        Testing helper: force the live question into the archive
                        immediately.
                      </p>

                      <button
                        type="button"
                        onClick={() => void handleForceArchive()}
                        disabled={forcingArchive}
                        className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {forcingArchive
                          ? "Archiving..."
                          : "Force into archive"}
                      </button>
                    </div>
                  ) : null}

                  {actionSuccess ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                      {actionSuccess}
                    </div>
                  ) : null}
                </>
              )}
            </section>

            <Divider />

            <section className="card-border space-y-4 p-4 bg-white/55">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-blue-700">
                  queue questions
                </h3>
                <p className="text-sm text-blue-500">
                  Add one question per line.
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleQueueSubmit}>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-blue-600">
                    question list
                  </span>
                  <textarea
                    value={queueDraft}
                    onChange={(event) => setQueueDraft(event.target.value)}
                    disabled={saving}
                    className="min-h-48 w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-blue-50"
                    placeholder={
                      "What tiny thing made you smile today?\nWhat song has been stuck in your head lately?\nWhat is one small thing you want to do tomorrow?"
                    }
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-blue-400">
                    {queuedPromptCount} question
                    {queuedPromptCount === 1 ? "" : "s"} ready to queue
                  </p>

                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:bg-pink-300"
                  >
                    {saving ? "Queueing..." : "Add question list"}
                  </button>
                </div>

                <p className="text-xs text-blue-400">
                  If today does not have a prompt yet, the first question in the
                  list becomes today&apos;s question.
                </p>

                <p className="text-xs text-blue-400">
                  Unanswered questions stay live until someone answers them.
                </p>

                {saveSuccess ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    {saveSuccess}
                  </div>
                ) : null}

                {saveError ? (
                  <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                    {saveError}
                  </div>
                ) : null}
              </form>
            </section>

            <Divider />

            <section className="card-border space-y-4 p-4 bg-white/55">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-blue-700">
                  scheduled questions
                </h3>
                <p className="text-sm text-blue-500">
                  The live question plus everything still queued behind it.
                </p>
              </div>

              {queueData?.questions.length ? (
                <div className="space-y-4">
                  {queueData.questions.map((entry, index) => (
                    <article
                      key={entry.recordedDate}
                      className={`${index > 0 ? "border-t border-blue-100 pt-4" : ""}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-blue-700">
                            {formatQuestionRecordedDate(entry.recordedDate)}
                          </p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-blue-400">
                            {entry.isCurrent ? "live now" : "queued"} ·{" "}
                            {entry.lockedAt ? "locked" : "queued"} ·{" "}
                            {entry.answerCount} answer
                            {entry.answerCount === 1 ? "" : "s"}
                          </p>
                        </div>

                        {entry.isCurrent ? (
                          <Link
                            to="/question-of-the-day"
                            className="text-sm font-semibold text-pink-500 hover:underline"
                          >
                            open today&apos;s page
                          </Link>
                        ) : null}
                      </div>

                      <p className="mt-3 text-sm leading-relaxed text-slate-700">
                        {entry.prompt}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-blue-500">
                  No questions are scheduled yet.
                </p>
              )}
            </section>

            <Divider />

            <section className="card-border space-y-4 p-4 bg-white/55">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-blue-700">
                    recent archive
                  </h3>
                  <p className="text-sm text-blue-500">
                    Quick links to older UTC-day prompts.
                  </p>
                </div>

                <Link
                  to="/question-of-the-day/archive"
                  className="text-sm font-semibold text-pink-500 hover:underline"
                >
                  open full archive
                </Link>
              </div>

              {archiveEntries.length ? (
                <div className="space-y-4">
                  {archiveEntries.map((entry, index) => (
                    <Link
                      key={entry.recordedDate}
                      to={`/question-of-the-day/archive/${entry.recordedDate}`}
                      className={`block ${index > 0 ? "border-t border-blue-100 pt-4" : ""}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-blue-700">
                          {formatQuestionRecordedDate(entry.recordedDate)}
                        </p>
                        <p className="text-xs uppercase tracking-[0.18em] text-blue-400">
                          {entry.answerCount} answer
                          {entry.answerCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">
                        {entry.prompt}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-blue-500">No archived days yet.</p>
              )}
            </section>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  queue note
                </h2>
                <p>Each line becomes one UTC-day question.</p>
                <p>Unanswered questions stay active instead of rolling over.</p>
                <p>You can also force-archive the live question for testing.</p>
                <p>Answer deletion now happens on the public answer pages.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default AdminQuestionOfTheDay;
