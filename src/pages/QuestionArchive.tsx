import { useMemo, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Divider from "../parts/Divider";
import kannaRight from "@/assets/anime/kanna-right.webp";
import AsyncStateCard from "@/components/AsyncStateCard";
import { getFriendlyFetchMessage } from "@/lib/friendly-fetch-message";
import { usePageSeo } from "@/lib/seo";
import {
  fetchQuestionOfTheDayArchive,
  type QuestionOfTheDayArchiveEntry,
} from "@/lib/question-of-the-day-api";
import { formatQuestionRecordedDate } from "@/lib/question-of-the-day-ui";

const QuestionArchive = () => {
  const [entries, setEntries] = useState<QuestionOfTheDayArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  usePageSeo({
    canonical: "https://mirabellier.com/question-of-the-day/archive",
    structuredDataId: "question-archive-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Mirabellier Question of the Day Archive",
      description:
        "Browse previous question-of-the-day prompts and all public answers.",
      url: "https://mirabellier.com/question-of-the-day/archive",
    },
  });

  useEffect(() => {
    let cancelled = false;

    const loadArchive = async () => {
      setLoading(true);

      try {
        const data = await fetchQuestionOfTheDayArchive();
        if (!cancelled) {
          setEntries(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load archive",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadArchive();

    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const archiveLoadErrorMessage = useMemo(
    () => getFriendlyFetchMessage("Question archive", error),
    [error],
  );

  const retryLoadArchive = () => {
    setReloadTick((value) => value + 1);
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
                src={kannaRight}
                width="320"
                height="427"
                alt="kanna facing right"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <section className="card-border space-y-4 p-4 bg-white/55">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-blue-700">
                    question archive
                  </h2>
                  <p className="text-sm text-blue-500">
                    Every archived day keeps its answer and public answers.
                  </p>
                </div>

                <Link
                  to="/question-of-the-day"
                  className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                >
                  back to today
                </Link>
              </div>

              {loading ? (
                <AsyncStateCard
                  variant="loading"
                  title="Loading archive..."
                  message="Collecting previously answered question days."
                />
              ) : error ? (
                <AsyncStateCard
                  variant="error"
                  title={archiveLoadErrorMessage.title}
                  message={archiveLoadErrorMessage.message}
                  detail={archiveLoadErrorMessage.detail}
                  actionLabel="Retry"
                  onAction={retryLoadArchive}
                />
              ) : entries.length === 0 ? (
                <AsyncStateCard
                  variant="empty"
                  title="No archived questions yet."
                  message="Once a past UTC day has answered prompts, it will appear here."
                  actionLabel="Check again"
                  onAction={retryLoadArchive}
                />
              ) : (
                <div className="space-y-4">
                  {entries.map((entry) => (
                    <Link
                      key={entry.recordedDate}
                      to={`/question-of-the-day/archive/${entry.recordedDate}`}
                      className="block rounded-xl border border-blue-100/90 px-4 py-4 transition-transform duration-200 ease-out hover:scale-[1.01] motion-reduce:transform-none"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-blue-500">
                            {formatQuestionRecordedDate(entry.recordedDate)}
                          </p>
                          <h3 className="mt-1 text-lg font-bold text-blue-700">
                            {entry.prompt}
                          </h3>
                        </div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
                          {entry.answerCount} answer
                          {entry.answerCount === 1 ? "" : "s"}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <Divider />
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  archive mood
                </h2>
                <p>Newest archived days appear first.</p>
                <p>Each entry opens a page with the full question and answers.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default QuestionArchive;
