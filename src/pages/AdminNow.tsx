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
import {
  fetchNow,
  updateNow,
  type NowSection,
} from "@/lib/site-now-api";

const MAX_SECTIONS = 12;
const SECTION_LABEL_SUGGESTIONS = ["Reading", "Watching", "Building", "Listening"];

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

const AdminNow = () => {
  const auth = useAuth();
  const isOwner = canAccessAdminPanel(auth.user);

  const [intro, setIntro] = useState("");
  const [sections, setSections] = useState<NowSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/admin/now",
    structuredDataId: "admin-now-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Admin Now Page",
      description: "Owner-only editor for the /now page.",
      url: "https://mirabellier.com/admin/now",
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
        const data = await fetchNow();
        if (cancelled) return;
        setIntro(data?.intro ?? "");
        setSections(
          data?.sections.length
            ? data.sections.map((section) => ({ ...section }))
            : SECTION_LABEL_SUGGESTIONS.map((label) => ({ label, body: "" })),
        );
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load the now page",
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
        body="You need to log in with the owner account before editing the now page."
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
        actionTo="/now"
      />
    );
  }

  const updateSection = (index: number, patch: Partial<NowSection>) => {
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
        : [...current, { label: "", body: "" }],
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    if (!auth.token) {
      setSaveError("You need an active session to save.");
      return;
    }

    const trimmedSections = sections
      .map((section) => ({
        label: section.label.trim(),
        body: section.body.trim(),
      }))
      .filter((section) => section.label || section.body);

    if (!intro.trim() && trimmedSections.length === 0) {
      setSaveError("Add an intro or at least one section before saving.");
      return;
    }

    setSaving(true);
    try {
      const saved = await updateNow(
        { intro: intro.trim(), sections: trimmedSections },
        auth.token,
      );
      setIntro(saved?.intro ?? "");
      setSections(
        saved?.sections.length
          ? saved.sections.map((section) => ({ ...section }))
          : [],
      );
      setSaveSuccess("Saved. The /now page is updated.");
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
                    now page editor
                  </h2>
                  <p className="text-sm text-blue-500">
                    Hand-edited copy for <span className="font-semibold">/now</span>.
                    The latest post, anime, and pixie fill themselves in.
                  </p>
                </div>

                <Link
                  to="/now"
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
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <label className="space-y-1 text-sm block">
                    <span className="font-semibold text-blue-600">intro</span>
                    <textarea
                      value={intro}
                      onChange={(event) => setIntro(event.target.value)}
                      disabled={saving}
                      rows={3}
                      className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-blue-50"
                      placeholder="A line or two on where your head is at right now."
                    />
                  </label>

                  <div className="space-y-4">
                    {sections.map((section, index) => (
                      <div
                        key={index}
                        className="space-y-2 rounded-2xl border border-blue-100 bg-white/70 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={section.label}
                            onChange={(event) =>
                              updateSection(index, { label: event.target.value })
                            }
                            disabled={saving}
                            list="now-section-labels"
                            className="flex-1 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-blue-50"
                            placeholder="Section label (e.g. Reading)"
                          />
                          <button
                            type="button"
                            onClick={() => removeSection(index)}
                            disabled={saving}
                            className="rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-500 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            remove
                          </button>
                        </div>
                        <textarea
                          value={section.body}
                          onChange={(event) =>
                            updateSection(index, { body: event.target.value })
                          }
                          disabled={saving}
                          rows={3}
                          className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-blue-50"
                          placeholder="What's going on in this part of life."
                        />
                      </div>
                    ))}

                    <datalist id="now-section-labels">
                      {SECTION_LABEL_SUGGESTIONS.map((label) => (
                        <option key={label} value={label} />
                      ))}
                    </datalist>

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

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-blue-400">
                      Empty sections are dropped on save.
                    </p>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:bg-pink-300"
                    >
                      {saving ? "Saving..." : "Save now page"}
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
              <p>• Line breaks are kept, so you can use short lists inside a section.</p>
              <p>• Keep it present tense — this is &ldquo;now&rdquo;, not a changelog.</p>
              <p>• No deploy needed; saving updates the live page immediately.</p>
            </section>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  now note
                </h2>
                <p>One row of content, owner-edited.</p>
                <p>Sections are free-form — rename or reorder as life changes.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default AdminNow;
