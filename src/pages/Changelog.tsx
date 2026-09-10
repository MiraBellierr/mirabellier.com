import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";
import AsyncStateCard from "@/components/AsyncStateCard";
import { usePageSeo } from "@/lib/seo";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import { fetchChangelog, type ChangelogEntry } from "@/lib/site-changelog-api";
import anime2Gif from "@/assets/anime/anime2.webp";

const PAGE_SIZE = 5;

function formatEntryDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Render a plain-text body: lines that begin with "- " or "* " become a
 * bullet list, everything else stays as paragraphs. No markdown dependency.
 */
function EntryBody({ body }: { body: string }) {
  const blocks: Array<
    { kind: "list"; items: string[] } | { kind: "para"; text: string }
  > = [];

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "list") last.items.push(bullet[1]);
      else blocks.push({ kind: "list", items: [bullet[1]] });
      continue;
    }
    if (!line.trim()) continue;
    blocks.push({ kind: "para", text: line });
  }

  if (blocks.length === 0) return null;

  return (
    <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">
      {blocks.map((block, index) =>
        block.kind === "list" ? (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{block.text}</p>
        ),
      )}
    </div>
  );
}

const Changelog = () => {
  const auth = useOptionalAuth();
  const isOwner = canAccessAdminPanel(auth?.user);

  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [page, setPage] = useState(1);

  usePageSeo({
    canonical: "https://mirabellier.com/changelog",
    structuredDataId: "changelog-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Changelog | Mirabellier",
      description: "Notable changes and new features shipped to mirabellier.com.",
      url: "https://mirabellier.com/changelog",
    },
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchChangelog();
        if (!cancelled) {
          setEntries(data);
          setPage(1);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load the changelog",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageEntries = useMemo(
    () => entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [entries, currentPage],
  );
  const rangeStart = entries.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, entries.length);

  const hasEntries = !loading && !error && entries.length > 0;

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

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <div className="relative">
              <img
                className="pointer-events-none absolute h-14 w-14 object-contain"
                src="/flower.webp"
                width="56"
                height="56"
                alt=""
                aria-hidden="true"
                style={{
                  top: "-18px",
                  right: "-10px",
                  zIndex: 2,
                }}
              />

              <section className="card-border space-y-4 p-4 bg-white/55">
                <div>
                  <h2 className="text-2xl font-bold text-blue-700">changelog</h2>
                  <p className="text-sm text-blue-500">
                    Notable changes and new features shipped to the site.
                  </p>
                </div>

                {loading ? (
                  <AsyncStateCard
                    variant="loading"
                    title="Loading the changelog..."
                    message="Gathering the recent updates."
                  />
                ) : error ? (
                  <AsyncStateCard
                    variant="error"
                    title="Couldn't load the changelog"
                    message={error}
                    actionLabel="Retry"
                    onAction={() => setReloadTick((value) => value + 1)}
                  />
                ) : entries.length === 0 ? (
                  <AsyncStateCard
                    variant="empty"
                    title="No entries yet"
                    message={
                      isOwner
                        ? "Use the edit button above to add the first entry."
                        : "Nothing logged here yet. Check back soon."
                    }
                  />
                ) : (
                  <p className="text-xs font-medium text-blue-400">
                    {entries.length} entr{entries.length === 1 ? "y" : "ies"} ·
                    newest first
                  </p>
                )}
              </section>
            </div>

            {hasEntries
              ? pageEntries.map((entry) => (
                  <div key={entry.id}>
                    <Divider />
                    <section className="card-border space-y-2 p-4 bg-white/55">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
                        <time dateTime={entry.entryDate}>
                          {formatEntryDate(entry.entryDate)}
                        </time>
                      </p>
                      <h3 className="text-lg font-bold text-blue-700">
                        {entry.title}
                      </h3>
                      <EntryBody body={entry.body} />
                    </section>
                  </div>
                ))
              : null}

            {hasEntries && totalPages > 1 ? (
              <>
                <Divider />
                <section className="card-border p-4 bg-white/55">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-blue-400">
                      Showing {rangeStart}-{rangeEnd} of {entries.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Previous
                      </button>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={currentPage >= totalPages}
                        className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  about
                </h2>
                <p>
                  The bigger visible changes, newest first. Small fixes and
                  behind-the-scenes work usually don&apos;t make the list.
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <img
                className="w-full max-w-[220px] rounded-xl"
                src={anime2Gif}
                width="480"
                height="270"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
            </div>

            {isOwner ? (
              <Link
                to="/admin/changelog"
                className="block rounded-full border border-blue-200 bg-white px-4 py-2 text-center text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
              >
                edit
              </Link>
            ) : null}
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Changelog;
