import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import ArenaErrorNotice from "@/parts/ArenaErrorNotice";
import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import {
  ArenaApiError,
  type ArenaUpdate,
  createArenaUpdate,
  deleteArenaUpdate,
  fetchArenaUpdates,
} from "@/lib/arena-api";
import { usePageSeo } from "@/lib/seo";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import { useAuth } from "@/states/AuthContext";
import { useConfirm } from "@/states/ConfirmContext";

function normalizeError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Arena update request failed.";
}

const AdminArenaUpdates = () => {
  const auth = useAuth();
  const { confirm } = useConfirm();
  const isOwner = canAccessAdminPanel(auth.user);
  const [updates, setUpdates] = useState<ArenaUpdate[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageSeo({
    canonical: "https://mirabellier.com/admin/arena-updates",
    structuredDataId: "admin-arena-updates-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Arena Updates Admin",
      description: "Owner-only Arena update publishing tools.",
      url: "https://mirabellier.com/admin/arena-updates",
    },
  });

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    setLoading(true);
    fetchArenaUpdates(50)
      .then((payload) => {
        if (!cancelled) setUpdates(payload);
      })
      .catch((error) => {
        if (!cancelled) setErrorMessage(normalizeError(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  const handlePublish = async (event: FormEvent) => {
    event.preventDefault();
    if (!auth.token) return;
    setPublishing(true);
    setErrorMessage(null);
    try {
      const update = await createArenaUpdate(auth.token, { title, body });
      setUpdates((previous) => [update, ...previous]);
      setTitle("");
      setBody("");
    } catch (error) {
      setErrorMessage(normalizeError(error));
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async (update: ArenaUpdate) => {
    if (!auth.token) return;
    const approved = await confirm({
      title: "Delete Arena update?",
      message: `Delete "${update.title}"? This cannot be undone.`,
      confirmLabel: "Delete update",
    });
    if (!approved) return;
    setDeletingId(update.id);
    setErrorMessage(null);
    try {
      await deleteArenaUpdate(auth.token, update.id);
      setUpdates((previous) => previous.filter((item) => item.id !== update.id));
    } catch (error) {
      setErrorMessage(normalizeError(error));
    } finally {
      setDeletingId(null);
    }
  };

  if (!auth.user || !isOwner) {
    return (
      <div className="flex min-h-screen flex-col font-[sans-serif] text-blue-900">
        <Header />
        <main className="mx-auto w-full max-w-3xl flex-1 p-6">
          <section className="card-border bg-white/70 p-6 text-center">
            <h1 className="text-2xl font-bold text-blue-700">
              {!auth.user ? "Please log in" : "Not authorized"}
            </h1>
            <Link
              to={!auth.user ? "/login" : "/"}
              className="mt-4 inline-block font-bold text-pink-500 underline"
            >
              {!auth.user ? "Go to login" : "Back to home"}
            </Link>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col font-[sans-serif] text-blue-900">
      <Header />
      <div
        className="flex flex-1 flex-col bg-cover bg-scroll bg-no-repeat"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-4 p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>
          <main className="w-full space-y-4 p-4 lg:w-3/5">
            <section className="card-border space-y-5 bg-white/60 p-4">
              <div>
                <Link to="/admin" className="text-sm font-bold text-pink-500 underline">
                  ← admin home
                </Link>
                <h1 className="mt-2 text-3xl font-bold text-blue-700">
                  Arena Updates
                </h1>
                <p className="text-sm text-blue-500">
                  Publish notices shown in the Arena home right-side panel.
                </p>
              </div>

              <form
                onSubmit={(event) => void handlePublish(event)}
                className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4"
              >
                <label className="block text-sm font-bold text-blue-700">
                  Title
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={100}
                    required
                    className="mt-1 block w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-slate-700"
                  />
                </label>
                <label className="block text-sm font-bold text-blue-700">
                  Message
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    maxLength={1000}
                    required
                    rows={5}
                    className="mt-1 block w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-slate-700"
                  />
                </label>
                <button
                  type="submit"
                  disabled={publishing}
                  className="arena-redraw-button hover:animate-wiggle disabled:opacity-50"
                >
                  {publishing ? "[ publishing... ]" : "[ publish update ]"}
                </button>
              </form>

              {errorMessage ? <ArenaErrorNotice message={errorMessage} /> : null}

              <div className="space-y-3">
                <h2 className="text-xl font-bold text-blue-700">Published updates</h2>
                {loading ? (
                  <p className="text-sm text-blue-500">Loading updates...</p>
                ) : updates.length ? (
                  <ol className="space-y-3">
                    {updates.map((update) => (
                      <li
                        key={update.id}
                        className="rounded-xl border border-blue-100 bg-white/70 p-4"
                      >
                        <h3 className="font-bold text-blue-700">{update.title}</h3>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                          {update.body}
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleDelete(update)}
                          disabled={deletingId === update.id}
                          className="mt-2 text-xs font-bold text-red-500 hover:underline"
                        >
                          {deletingId === update.id ? "deleting..." : "delete"}
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-blue-500">No Arena updates yet.</p>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default AdminArenaUpdates;
