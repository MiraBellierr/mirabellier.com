import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Divider from "../parts/Divider";
import kannaPolice from "@/assets/anime/kanna-police.webp";
import { usePageSeo } from "@/lib/seo";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import { useAuth } from "@/states/AuthContext";
import { useConfirm } from "@/states/ConfirmContext";
import {
  createChangelogEntry,
  deleteChangelogEntry,
  fetchChangelog,
  updateChangelogEntry,
  type ChangelogEntry,
} from "@/lib/site-changelog-api";

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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const emptyDraft = () => ({ entryDate: todayIso(), title: "", body: "" });

const AdminChangelog = () => {
  const auth = useAuth();
  const { confirm } = useConfirm();
  const isOwner = canAccessAdminPanel(auth.user);

  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  usePageSeo({
    canonical: "https://mirabellier.com/admin/changelog",
    structuredDataId: "admin-changelog-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Admin Changelog",
      description: "Owner-only editor for the public /changelog page.",
      url: "https://mirabellier.com/admin/changelog",
    },
  });

  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchChangelog();
        if (!cancelled) setEntries(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
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
  }, [isOwner, reloadTick]);

  const editingEntry = useMemo(
    () => entries.find((entry) => entry.id === editingId) ?? null,
    [entries, editingId],
  );

  if (!auth.user) {
    return (
      <AdminMessageCard
        title="Please log in"
        body="You need to log in with the owner account before editing the changelog."
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
        actionTo="/changelog"
      />
    );
  }

  const resetForm = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setFormError(null);
  };

  const startEdit = (entry: ChangelogEntry) => {
    setEditingId(entry.id);
    setDraft({ entryDate: entry.entryDate, title: entry.title, body: entry.body });
    setFormError(null);
    setFormSuccess(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!draft.title.trim() || !draft.body.trim()) {
      setFormError("A title and a body are both required.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateChangelogEntry(editingId, draft, auth.token);
        setFormSuccess("Entry updated.");
      } else {
        await createChangelogEntry(draft, auth.token);
        setFormSuccess("Entry added.");
      }
      resetForm();
      setReloadTick((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: ChangelogEntry) => {
    const ok = await confirm({
      title: "Delete this entry?",
      message: `"${entry.title}" will be removed from the public changelog.`,
      confirmLabel: "Delete",
      cancelLabel: "Keep",
    });
    if (!ok) return;

    setBusyId(entry.id);
    try {
      await deleteChangelogEntry(entry.id, auth.token);
      if (editingId === entry.id) resetForm();
      setReloadTick((value) => value + 1);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusyId(null);
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
                    changelog editor
                  </h2>
                  <p className="text-sm text-blue-500">
                    Public entries for <span className="font-semibold">/changelog</span>,
                    newest first.
                  </p>
                </div>

                <Link
                  to="/changelog"
                  className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                >
                  open public page
                </Link>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <p className="text-sm font-bold text-blue-700">
                  {editingId
                    ? `Editing entry from ${editingEntry?.entryDate ?? ""}`
                    : "New entry"}
                </p>

                <div className="flex flex-wrap gap-4">
                  <label className="space-y-1 text-sm">
                    <span className="font-semibold text-blue-600">date</span>
                    <input
                      type="date"
                      value={draft.entryDate}
                      onChange={(event) =>
                        setDraft((d) => ({ ...d, entryDate: event.target.value }))
                      }
                      disabled={saving}
                      className="block rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-blue-50"
                    />
                  </label>

                  <label className="flex-1 space-y-1 text-sm min-w-[12rem]">
                    <span className="font-semibold text-blue-600">title</span>
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(event) =>
                        setDraft((d) => ({ ...d, title: event.target.value }))
                      }
                      disabled={saving}
                      className="block w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-blue-50"
                      placeholder="What changed"
                    />
                  </label>
                </div>

                <label className="space-y-1 text-sm block">
                  <span className="font-semibold text-blue-600">body</span>
                  <textarea
                    value={draft.body}
                    onChange={(event) =>
                      setDraft((d) => ({ ...d, body: event.target.value }))
                    }
                    disabled={saving}
                    rows={5}
                    className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-blue-50"
                    placeholder={"A short summary.\n- lines starting with a dash render as bullets\n- keep it to the visible, user-facing changes"}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:bg-pink-300"
                  >
                    {saving
                      ? "Saving..."
                      : editingId
                        ? "Save changes"
                        : "Add entry"}
                  </button>
                  {editingId ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      disabled={saving}
                      className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>

                {formSuccess ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    {formSuccess}
                  </div>
                ) : null}
                {formError ? (
                  <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                    {formError}
                  </div>
                ) : null}
              </form>
            </section>

            <Divider />

            <section className="card-border space-y-4 p-4 bg-white/55">
              <h3 className="text-lg font-bold text-blue-700">entries</h3>

              {loadError ? (
                <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                  {loadError}
                </div>
              ) : null}

              {loading ? (
                <p className="text-sm text-blue-500">Loading entries...</p>
              ) : entries.length === 0 ? (
                <p className="text-sm text-blue-500">No entries yet.</p>
              ) : (
                <div className="space-y-4">
                  {entries.map((entry, index) => (
                    <article
                      key={entry.id}
                      className={index > 0 ? "border-t border-blue-100 pt-4" : ""}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                            {entry.entryDate}
                          </p>
                          <p className="font-semibold text-blue-700">
                            {entry.title}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
                            disabled={busyId === entry.id}
                            className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(entry)}
                            disabled={busyId === entry.id}
                            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busyId === entry.id ? "..." : "delete"}
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                        {entry.body}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  changelog note
                </h2>
                <p>Owner-authored, no deploy needed.</p>
                <p>Dash-prefixed lines in the body render as bullets on the public page.</p>
                <p>Keep entries to visible, user-facing changes.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default AdminChangelog;
