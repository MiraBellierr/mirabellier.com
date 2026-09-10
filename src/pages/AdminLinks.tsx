import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Divider from "../parts/Divider";
import kannaPolice from "@/assets/anime/kanna-police.webp";
import { usePageSeo } from "@/lib/seo";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import { useAuth } from "@/states/AuthContext";
import { DEFAULT_LINK_SECTIONS } from "@/lib/links";
import {
  EMPTY_WEBRING,
  fetchSiteLinks,
  updateSiteLinks,
  type SiteLinksDraft,
} from "@/lib/site-links-api";

// Keep in step with lib/site-links.js on the backend.
const MAX_SECTIONS = 8;
const MAX_ENTRIES_PER_SECTION = 30;

type DraftEntry = { name: string; url: string; blurb: string; feed: string };
type DraftSection = { title: string; note: string; entries: DraftEntry[] };
type DraftWebring = SiteLinksDraft["webring"];

const EMPTY_ENTRY: DraftEntry = { name: "", url: "", blurb: "", feed: "" };

function seedSections(): DraftSection[] {
  return DEFAULT_LINK_SECTIONS.map((section) => ({
    title: section.title,
    note: section.note,
    entries: section.entries.length
      ? section.entries.map((entry) => ({
          name: entry.name,
          url: entry.url,
          blurb: entry.blurb,
          feed: entry.feed,
        }))
      : [{ ...EMPTY_ENTRY }],
  }));
}

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

const inputClass =
  "w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-blue-50";

const AdminLinks = () => {
  const auth = useAuth();
  const isOwner = canAccessAdminPanel(auth.user);

  const [sections, setSections] = useState<DraftSection[]>([]);
  const [webring, setWebring] = useState<DraftWebring>({ ...EMPTY_WEBRING });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/admin/links",
    structuredDataId: "admin-links-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Admin Links Page",
      description: "Owner-only editor for the /links blogroll and webring.",
      url: "https://mirabellier.com/admin/links",
    },
  });

  useEffect(() => {
    if (!isOwner || !auth.token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchSiteLinks();
        if (cancelled) return;

        const hasSaved =
          data &&
          (data.sections.some((section) => section.entries.length > 0) ||
            Boolean(data.webring.name));

        if (hasSaved && data) {
          setSections(
            data.sections.map((section) => ({
              title: section.title,
              note: section.note,
              entries: section.entries.length
                ? section.entries.map((entry) => ({
                    name: entry.name,
                    url: entry.url,
                    blurb: entry.blurb,
                    feed: entry.feed,
                  }))
                : [{ ...EMPTY_ENTRY }],
            })),
          );
          setWebring({ ...EMPTY_WEBRING, ...data.webring });
        } else {
          setSections(seedSections());
          setWebring({ ...EMPTY_WEBRING });
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load the links page",
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
  }, [auth.token, isOwner]);

  if (!auth.user) {
    return (
      <AdminMessageCard
        title="Please log in"
        body="You need to log in with the owner account before editing the links page."
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
        actionTo="/links"
      />
    );
  }

  const updateSection = (index: number, patch: Partial<DraftSection>) => {
    setSections((current) =>
      current.map((section, i) =>
        i === index ? { ...section, ...patch } : section,
      ),
    );
  };

  const removeSection = (index: number) => {
    setSections((current) => current.filter((_, i) => i !== index));
  };

  const addSection = () => {
    setSections((current) =>
      current.length >= MAX_SECTIONS
        ? current
        : [...current, { title: "", note: "", entries: [{ ...EMPTY_ENTRY }] }],
    );
  };

  const updateEntry = (
    sectionIndex: number,
    entryIndex: number,
    patch: Partial<DraftEntry>,
  ) => {
    setSections((current) =>
      current.map((section, i) =>
        i !== sectionIndex
          ? section
          : {
              ...section,
              entries: section.entries.map((entry, j) =>
                j === entryIndex ? { ...entry, ...patch } : entry,
              ),
            },
      ),
    );
  };

  const removeEntry = (sectionIndex: number, entryIndex: number) => {
    setSections((current) =>
      current.map((section, i) =>
        i !== sectionIndex
          ? section
          : {
              ...section,
              entries: section.entries.filter((_, j) => j !== entryIndex),
            },
      ),
    );
  };

  const addEntry = (sectionIndex: number) => {
    setSections((current) =>
      current.map((section, i) =>
        i !== sectionIndex || section.entries.length >= MAX_ENTRIES_PER_SECTION
          ? section
          : { ...section, entries: [...section.entries, { ...EMPTY_ENTRY }] },
      ),
    );
  };

  const updateWebring = (patch: Partial<DraftWebring>) => {
    setWebring((current) => ({ ...current, ...patch }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    if (!auth.token) {
      setSaveError("You need an active session to save.");
      return;
    }

    const draftSections = sections
      .map((section) => ({
        title: section.title.trim(),
        note: section.note.trim(),
        entries: section.entries
          .map((entry) => ({
            name: entry.name.trim(),
            url: entry.url.trim(),
            blurb: entry.blurb.trim(),
            feed: entry.feed.trim(),
          }))
          .filter((entry) => entry.name && entry.url),
      }))
      .filter((section) => section.title || section.entries.length > 0);

    const draftWebring: DraftWebring = {
      enabled: webring.enabled,
      name: webring.name.trim(),
      hubUrl: webring.hubUrl.trim(),
      prevUrl: webring.prevUrl.trim(),
      nextUrl: webring.nextUrl.trim(),
      randomUrl: webring.randomUrl.trim(),
    };

    const hasLinks = draftSections.some(
      (section) => section.entries.length > 0,
    );
    if (!hasLinks && !draftWebring.name) {
      setSaveError("Add at least one link, or fill in the webring name.");
      return;
    }

    setSaving(true);
    try {
      const saved = await updateSiteLinks(
        { sections: draftSections, webring: draftWebring },
        auth.token,
      );
      if (saved) {
        setSections(
          saved.sections.map((section) => ({
            title: section.title,
            note: section.note,
            entries: section.entries.length
              ? section.entries.map((entry) => ({
                  name: entry.name,
                  url: entry.url,
                  blurb: entry.blurb,
                  feed: entry.feed,
                }))
              : [{ ...EMPTY_ENTRY }],
          })),
        );
        setWebring({ ...EMPTY_WEBRING, ...saved.webring });
      }
      setSaveSuccess("Saved. The /links page is updated.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
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
                    links page editor
                  </h2>
                  <p className="text-sm text-blue-500">
                    The blogroll sections and the webring on{" "}
                    <span className="font-semibold">/links</span>. No deploy
                    needed; saving updates the live page.
                  </p>
                </div>

                <Link
                  to="/links"
                  className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                >
                  open public page
                </Link>
              </div>

              {loading ? (
                <p className="text-blue-500">Loading current content...</p>
              ) : loadError ? (
                <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
                  {loadError}
                </div>
              ) : (
                <form className="space-y-6" onSubmit={handleSubmit}>
                  {/* --- Sections --- */}
                  <div className="space-y-4">
                    {sections.map((section, sectionIndex) => (
                      <div
                        key={sectionIndex}
                        className="space-y-3 rounded-2xl border border-blue-100 bg-white/70 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={section.title}
                            onChange={(event) =>
                              updateSection(sectionIndex, {
                                title: event.target.value,
                              })
                            }
                            disabled={saving}
                            className={`${inputClass} font-semibold`}
                            placeholder="Section title (e.g. small-web corners)"
                          />
                          <button
                            type="button"
                            onClick={() => removeSection(sectionIndex)}
                            disabled={saving}
                            className="rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-500 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            remove section
                          </button>
                        </div>

                        <input
                          type="text"
                          value={section.note}
                          onChange={(event) =>
                            updateSection(sectionIndex, {
                              note: event.target.value,
                            })
                          }
                          disabled={saving}
                          className={inputClass}
                          placeholder="Optional one-line note under the heading"
                        />

                        <div className="space-y-2">
                          {section.entries.map((entry, entryIndex) => (
                            <div
                              key={entryIndex}
                              className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-2"
                            >
                              <div className="flex flex-wrap gap-2">
                                <input
                                  type="text"
                                  value={entry.name}
                                  onChange={(event) =>
                                    updateEntry(sectionIndex, entryIndex, {
                                      name: event.target.value,
                                    })
                                  }
                                  disabled={saving}
                                  className={`${inputClass} sm:flex-1`}
                                  placeholder="Site name"
                                />
                                <input
                                  type="url"
                                  value={entry.url}
                                  onChange={(event) =>
                                    updateEntry(sectionIndex, entryIndex, {
                                      url: event.target.value,
                                    })
                                  }
                                  disabled={saving}
                                  className={`${inputClass} sm:flex-1`}
                                  placeholder="https://site.example"
                                />
                              </div>
                              <input
                                type="text"
                                value={entry.blurb}
                                onChange={(event) =>
                                  updateEntry(sectionIndex, entryIndex, {
                                    blurb: event.target.value,
                                  })
                                }
                                disabled={saving}
                                className={inputClass}
                                placeholder="One line on why it's worth a click"
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="url"
                                  value={entry.feed}
                                  onChange={(event) =>
                                    updateEntry(sectionIndex, entryIndex, {
                                      feed: event.target.value,
                                    })
                                  }
                                  disabled={saving}
                                  className={`${inputClass} sm:flex-1`}
                                  placeholder="Optional feed URL (adds an 'rss' link)"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeEntry(sectionIndex, entryIndex)
                                  }
                                  disabled={saving}
                                  className="rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-500 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  remove
                                </button>
                              </div>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={() => addEntry(sectionIndex)}
                            disabled={
                              saving ||
                              section.entries.length >= MAX_ENTRIES_PER_SECTION
                            }
                            className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {section.entries.length >= MAX_ENTRIES_PER_SECTION
                              ? `Max ${MAX_ENTRIES_PER_SECTION} links`
                              : "Add link"}
                          </button>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={addSection}
                      disabled={saving || sections.length >= MAX_SECTIONS}
                      className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {sections.length >= MAX_SECTIONS
                        ? `Max ${MAX_SECTIONS} sections`
                        : "Add section"}
                    </button>
                  </div>

                  <Divider variant="line" />

                  {/* --- Webring --- */}
                  <fieldset className="space-y-3 rounded-2xl border border-blue-100 bg-white/70 p-3">
                    <legend className="px-1 text-sm font-semibold text-blue-600">
                      webring
                    </legend>
                    <p className="text-xs text-blue-400">
                      Fill these from the ring&apos;s hub when you join. The
                      footer widget only shows once &ldquo;enabled&rdquo; is on
                      and the hub + prev + next URLs are all set.
                    </p>

                    <label className="flex items-center gap-2 text-sm font-semibold text-blue-600">
                      <input
                        type="checkbox"
                        checked={webring.enabled}
                        onChange={(event) =>
                          updateWebring({ enabled: event.target.checked })
                        }
                        disabled={saving}
                        className="h-4 w-4"
                      />
                      Show the webring widget in the footer
                    </label>

                    <input
                      type="text"
                      value={webring.name}
                      onChange={(event) =>
                        updateWebring({ name: event.target.value })
                      }
                      disabled={saving}
                      className={inputClass}
                      placeholder="Ring name (e.g. The Hotline Webring)"
                    />
                    <input
                      type="url"
                      value={webring.hubUrl}
                      onChange={(event) =>
                        updateWebring({ hubUrl: event.target.value })
                      }
                      disabled={saving}
                      className={inputClass}
                      placeholder="Hub / member list URL"
                    />
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="url"
                        value={webring.prevUrl}
                        onChange={(event) =>
                          updateWebring({ prevUrl: event.target.value })
                        }
                        disabled={saving}
                        className={`${inputClass} sm:flex-1`}
                        placeholder="Previous-site URL"
                      />
                      <input
                        type="url"
                        value={webring.nextUrl}
                        onChange={(event) =>
                          updateWebring({ nextUrl: event.target.value })
                        }
                        disabled={saving}
                        className={`${inputClass} sm:flex-1`}
                        placeholder="Next-site URL"
                      />
                    </div>
                    <input
                      type="url"
                      value={webring.randomUrl}
                      onChange={(event) =>
                        updateWebring({ randomUrl: event.target.value })
                      }
                      disabled={saving}
                      className={inputClass}
                      placeholder="Random-site URL (optional)"
                    />
                  </fieldset>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-blue-400">
                      Empty sections and links without a name + URL are dropped on
                      save.
                    </p>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:bg-pink-300"
                    >
                      {saving ? "Saving..." : "Save links page"}
                    </button>
                  </div>

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
              )}
            </section>

            <Divider />

            <section className="card-border space-y-2 p-4 bg-white/55 text-sm text-slate-700">
              <h3 className="text-lg font-bold text-blue-700">tips</h3>
              <p>• Bare hostnames are upgraded to https:// on save.</p>
              <p>
                • A link needs both a name and a URL to be kept — everything else
                is optional.
              </p>
              <p>
                • The webring URLs come from the ring&apos;s hub page when you
                join.
              </p>
            </section>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  links note
                </h2>
                <p>One row of content, owner-edited.</p>
                <p>
                  Until you save once, the public page shows a small built-in
                  default list.
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

export default AdminLinks;
