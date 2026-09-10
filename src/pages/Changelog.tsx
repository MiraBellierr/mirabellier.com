import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import AsyncStateCard from "@/components/AsyncStateCard";
import { usePageSeo } from "@/lib/seo";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import { fetchChangelog, type ChangelogEntry } from "@/lib/site-changelog-api";

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

  usePageSeo({
    canonical: "https://mirabellier.com/changelog",
    structuredDataId: "changelog-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Changelog — Mirabellier",
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
        if (!cancelled) setEntries(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load the changelog");
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
            <section className="card-border space-y-4 p-4 bg-white/55">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-blue-700">changelog</h2>
                  <p className="text-sm text-blue-500">
                    Notable changes and new features shipped to the site.
                  </p>
                </div>

                {isOwner ? (
                  <Link
                    to="/admin/changelog"
                    className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                  >
                    edit
                  </Link>
                ) : null}
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
                <ol className="space-y-6">
                  {entries.map((entry, index) => (
                    <li
                      key={entry.id}
                      className={index > 0 ? "border-t border-blue-100 pt-6" : ""}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
                        <time dateTime={entry.entryDate}>
                          {formatEntryDate(entry.entryDate)}
                        </time>
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-blue-700">
                        {entry.title}
                      </h3>
                      <EntryBody body={entry.body} />
                    </li>
                  ))}
                </ol>
              )}
            </section>
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
                <p>
                  Arena has its own update log at{" "}
                  <Link
                    to="/arena/archive"
                    className="underline underline-offset-2 hover:text-pink-600"
                  >
                    /arena/archive
                  </Link>
                  .
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

export default Changelog;
