import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import { useAuth } from "@/states/AuthContext";
import { canManageShrines } from "@/lib/user-permissions";
import {
  createShrinePage,
  fetchShrinePage,
  fetchShrinePages,
  updateShrinePage,
  type ShrineMutationInput,
  type ShrinePageRecord,
} from "@/lib/shrine-api";

type FormState = {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  image: string;
  imageAlt: string;
  schemaType: string;
  about: string;
  keywords: string;
  priority: string;
  changefreq: string;
  ctaLabel: string;
  payloadText: string;
};

const DEFAULT_SHRINE_PAYLOAD = {
  canonical: "https://mirabellier.com/shrine/new-shrine",
  structuredDataId: "new-shrine-structured-data",
  structuredData: {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "New Shrine",
    description: "A long-form shrine page.",
    url: "https://mirabellier.com/shrine/new-shrine",
    about: {
      "@type": "Thing",
      name: "Character Name",
      alternateName: "Nickname",
    },
  },
  hero: {
    name: "Character Name",
    subtitle: "My Shrine Subtitle",
    intro: "Write your intro here.",
    supportingImages: [
      {
        src: "/example-support-1.jpg",
        alt: "Supporting image 1",
        caption: "",
      },
      {
        src: "/example-support-2.jpg",
        alt: "Supporting image 2",
        caption: "",
      },
    ],
  },
  welcome: ["Welcome paragraph 1.", "Welcome paragraph 2."],
  profile: [
    { label: "Full Name", value: "Character Name" },
    { label: "Origin", value: "Series / Game / Anime" },
  ],
  appearance: [{ title: "Design", text: "Appearance notes." }],
  personality: [{ title: "Core traits", text: "Personality notes." }],
  lore: {
    spoilerFree: ["Spoiler-free lore note."],
    spoilers: ["Spoiler lore note."],
    hidden: ["Hidden lore note."],
  },
  abilities: {
    items: [{ title: "Main ability", text: "Ability details." }],
  },
  relationships: [{ title: "Important character", text: "Relationship notes." }],
  quotes: [
    {
      theme: "favorite lines",
      items: [{ line: "\"Quote here\"" }],
    },
  ],
  gallery: [
    {
      title: "Official art",
      note: "Group note",
      items: [{ src: "/gallery-1.jpg", alt: "Gallery image", caption: "" }],
    },
  ],
  personal: ["Why this character matters to you."],
  extras: [{ title: "playlist", items: ["Track 1", "Track 2"] }],
  railImage: {
    src: "/rail.jpg",
    alt: "Rail image alt text",
    caption: "Rail image caption",
  },
  sideImage: {
    src: "/side.jpg",
    alt: "Side image alt text",
    caption: "Side image caption",
  },
};

function toFormState(entry?: ShrinePageRecord): FormState {
  return {
    slug: entry?.slug || "",
    title: entry?.title || "",
    description: entry?.description || "",
    excerpt: entry?.excerpt || "",
    image: entry?.image || "",
    imageAlt: entry?.imageAlt || "",
    schemaType: entry?.schemaType || "CollectionPage",
    about: (entry?.about || []).join("\n"),
    keywords: (entry?.keywords || []).join("\n"),
    priority: entry?.priority || "0.7",
    changefreq: entry?.changefreq || "monthly",
    ctaLabel: entry?.ctaLabel || "Open shrine page",
    payloadText: JSON.stringify(entry?.payload || DEFAULT_SHRINE_PAYLOAD, null, 2),
  };
}

const AdminShrines = () => {
  const auth = useAuth();
  const isOwner = canManageShrines(auth.user);
  const [entries, setEntries] = useState<ShrinePageRecord[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [form, setForm] = useState<FormState>(toFormState());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(selectedSlug);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.slug === selectedSlug) || null,
    [entries, selectedSlug],
  );
  const slugPreview = useMemo(
    () =>
      String(form.slug || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, ""),
    [form.slug],
  );
  const shrinePathPreview = slugPreview ? `/shrine/${slugPreview}` : "/shrine/<slug>";

  useEffect(() => {
    if (!isOwner) return;
    setLoading(true);
    fetchShrinePages()
      .then((data) => setEntries(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [isOwner]);

  const loadEntry = async (slug: string) => {
    setError(null);
    setMessage(null);
    try {
      const data = await fetchShrinePage(slug);
      setSelectedSlug(slug);
      setForm(toFormState(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shrine");
    }
  };

  const resetForCreate = () => {
    setSelectedSlug("");
    setError(null);
    setMessage(null);
    setForm(toFormState());
  };

  const handleSave = async () => {
    if (!auth.token) {
      setError("You need to be logged in.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const payload = JSON.parse(form.payloadText);
      const body: ShrineMutationInput = {
        slug: form.slug.trim().toLowerCase(),
        title: form.title.trim(),
        description: form.description.trim(),
        excerpt: form.excerpt.trim(),
        image: form.image.trim(),
        imageAlt: form.imageAlt.trim(),
        schemaType: form.schemaType.trim(),
        about: form.about
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
        keywords: form.keywords
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
        priority: form.priority.trim(),
        changefreq: form.changefreq.trim(),
        ctaLabel: form.ctaLabel.trim(),
        payload,
      };

      if (!isEditing) {
        const created = await createShrinePage(body, auth.token);
        setEntries((prev) => [...prev.filter((x) => x.slug !== created.slug), created]);
        setSelectedSlug(created.slug);
        setForm(toFormState(created));
        setMessage("Shrine created.");
      } else {
        const updated = await updateShrinePage(selectedSlug, body, auth.token);
        setEntries((prev) => prev.map((x) => (x.slug === updated.slug ? updated : x)));
        setForm(toFormState(updated));
        setMessage("Shrine updated.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save shrine");
    } finally {
      setSaving(false);
    }
  };

  const openPreviewPage = () => {
    try {
      const parsedPayload = JSON.parse(form.payloadText);
      localStorage.setItem(
        "adminShrinePreviewPayload",
        JSON.stringify(parsedPayload),
      );
      window.open("/admin/shrines/preview", "_blank", "noopener,noreferrer");
    } catch {
      setError("Payload JSON is invalid. Fix it before previewing.");
      setMessage(null);
    }
  };

  if (!auth.user) {
    return <div className="p-6 text-sm text-blue-600">Please log in first.</div>;
  }
  if (!isOwner) {
    return <div className="p-6 text-sm text-red-600">Not authorized.</div>;
  }

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
          <main className="w-full lg:w-3/5 space-y-4 p-4">
            <section className="card-border p-4 bg-white/55 space-y-3">
              <h2 className="text-2xl font-bold text-blue-700">shrine admin</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={resetForCreate}
                  className="rounded-full bg-pink-500 px-4 py-2 text-sm font-semibold text-white"
                >
                  New shrine
                </button>
                {loading ? <p className="text-sm text-blue-500">Loading...</p> : null}
              </div>
              <div className="space-y-2">
                {entries.map((entry) => (
                  <button
                    type="button"
                    key={entry.slug}
                    onClick={() => void loadEntry(entry.slug)}
                    className="block w-full rounded-lg border border-blue-100 bg-white px-3 py-2 text-left text-sm hover:bg-blue-50"
                  >
                    {entry.title} ({entry.slug})
                  </button>
                ))}
              </div>
            </section>

            <section className="card-border p-4 bg-white/55 space-y-3">
              <h3 className="text-lg font-bold text-blue-700">
                {isEditing ? `editing ${selectedSlug}` : "create shrine"}
              </h3>
              <div className="grid gap-2">
                <input className="rounded border p-2" placeholder="slug" value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} />
                <input className="rounded border p-2" placeholder="title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
                <input className="rounded border p-2" placeholder="description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
                <input className="rounded border p-2" placeholder="excerpt" value={form.excerpt} onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))} />
                <input className="rounded border p-2" placeholder="image" value={form.image} onChange={(e) => setForm((p) => ({ ...p, image: e.target.value }))} />
                <input className="rounded border p-2" placeholder="image alt" value={form.imageAlt} onChange={(e) => setForm((p) => ({ ...p, imageAlt: e.target.value }))} />
                <input className="rounded border p-2" placeholder="schema type" value={form.schemaType} onChange={(e) => setForm((p) => ({ ...p, schemaType: e.target.value }))} />
                <textarea className="rounded border p-2 min-h-16" placeholder="about (one per line)" value={form.about} onChange={(e) => setForm((p) => ({ ...p, about: e.target.value }))} />
                <textarea className="rounded border p-2 min-h-16" placeholder="keywords (one per line)" value={form.keywords} onChange={(e) => setForm((p) => ({ ...p, keywords: e.target.value }))} />
                <input className="rounded border p-2" placeholder="priority" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} />
                <input className="rounded border p-2" placeholder="changefreq" value={form.changefreq} onChange={(e) => setForm((p) => ({ ...p, changefreq: e.target.value }))} />
                <input className="rounded border p-2" placeholder="cta label" value={form.ctaLabel} onChange={(e) => setForm((p) => ({ ...p, ctaLabel: e.target.value }))} />
                <textarea className="rounded border p-2 min-h-80 font-mono text-xs" placeholder="payload JSON (CharacterShrineData)" value={form.payloadText} onChange={(e) => setForm((p) => ({ ...p, payloadText: e.target.value }))} />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Saving..." : isEditing ? "Save changes" : "Create shrine"}
                </button>
                <button
                  type="button"
                  onClick={openPreviewPage}
                  className="rounded-full border border-blue-300 bg-white px-5 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                >
                  Open preview tab
                </button>
                {selectedEntry ? (
                  <Link to={selectedEntry.path} className="text-sm text-pink-500 underline">
                    Open public page
                  </Link>
                ) : null}
              </div>
            </section>
          </main>
          <aside className="w-full lg:w-[380px] mb-auto space-y-4 lg:sticky lg:top-4 self-start overflow-visible">
            <section className="bg-transparent p-0 overflow-visible">
              <h3 className="text-sm font-bold text-blue-700">directory-style preview</h3>
              <p className="mt-2 text-xs text-blue-500">Route: {shrinePathPreview}</p>

              <article className="mt-3 overflow-visible rounded-xl border border-blue-100 bg-white/90 p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  {form.image ? (
                    <img
                      src={form.image}
                      alt={form.imageAlt || "Shrine preview image"}
                      className="h-20 w-14 shrink-0 rounded-lg border border-blue-100 object-cover shadow-sm"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-blue-200 bg-blue-50 text-[10px] text-blue-400">
                      no image
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="break-words font-bold text-blue-700">
                      1. {form.title || "Untitled Shrine"}{" "}
                      <span className="break-all text-sm font-normal text-blue-600 underline">
                        (Open shrine)
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {form.description || "Description preview goes here."}
                    </p>
                    <p className="mt-1 text-sm text-blue-500">
                      {form.excerpt || "Excerpt preview goes here."}
                    </p>
                    <p className="mt-2 break-all text-[11px] text-blue-400">
                      image: {form.image || "-"}
                    </p>
                    <p className="mt-1 text-[11px] text-blue-400">
                      image alt: {form.imageAlt || "-"}
                    </p>
                  </div>
                </div>
              </article>
            </section>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default AdminShrines;
