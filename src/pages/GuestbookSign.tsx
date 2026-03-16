import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Navigation from "../parts/Navigation";
import kannaSmile from "@/assets/anime/kanna-smile.webp";
import { resolveAsset } from "@/lib/blog-utils";
import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { createGuestbookEntry, type GuestbookMood } from "@/lib/guestbook-api";
import { guestbookMoodMeta } from "@/lib/guestbook-ui";

const moodValues = Object.keys(guestbookMoodMeta) as GuestbookMood[];

const GuestbookSign = () => {
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const signedInUsername = auth?.user?.username || "";
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    website: "",
    message: "",
    mood: "sparkly" as GuestbookMood,
  });

  useEffect(() => {
    const canonicalLink = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement;
    if (canonicalLink) {
      canonicalLink.href = "https://mirabellier.com/guestbook/sign";
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "guestbook-sign-structured-data";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Sign the Mirabellier Guestbook",
      description: "Leave a note for the Mirabellier guestbook board.",
      url: "https://mirabellier.com/guestbook/sign",
    });
    document.head.appendChild(script);

    return () => {
      const restoredCanonical = document.querySelector(
        'link[rel="canonical"]',
      ) as HTMLLinkElement;
      if (restoredCanonical) {
        restoredCanonical.href = "https://mirabellier.com/";
      }
      const oldScript = document.getElementById(
        "guestbook-sign-structured-data",
      );
      if (oldScript) {
        oldScript.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (!signedInUsername) return;

    setForm((current) => {
      if (current.name) return current;
      return { ...current, name: signedInUsername };
    });
  }, [signedInUsername]);

  const remainingChars = 400 - form.message.length;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!form.message.trim()) {
      setSubmitError("Please write a message first.");
      return;
    }

    if (!auth?.user && !form.name.trim()) {
      setSubmitError("Please add a name first.");
      return;
    }

    setSubmitting(true);

    try {
      await createGuestbookEntry({
        name: auth?.user ? undefined : form.name,
        website: auth?.user ? undefined : form.website,
        message: form.message,
        mood: form.mood,
        token: auth?.token ?? null,
        x: 0,
        y: 0,
      });

      navigate("/guestbook");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to sign the guestbook",
      );
    } finally {
      setSubmitting(false);
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

            <div className="mt-3 mb-auto justify-center items-center hidden lg:flex">
              <img
                className="w-full max-w-[320px] border border-blue-700 shadow-md rounded-2xl"
                src={kannaSmile}
                width="320"
                height="427"
                alt="kanna smiling"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-4 p-4">
            <section className="card-border space-y-4 p-4">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-blue-700">
                  your note
                </h2>
                <p className="text-sm text-blue-500">
                  {auth?.user
                    ? `Signed in as ${auth.user.username}.`
                    : "No login needed. Just leave your name and message."}
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                {!auth?.user ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="font-semibold text-blue-600">name</span>
                      <input
                        value={form.name}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            name: event.target.value.slice(0, 40),
                          }))
                        }
                        className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
                        placeholder="your cute internet name"
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-semibold text-blue-600">
                        website
                      </span>
                      <input
                        value={form.website}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            website: event.target.value.slice(0, 200),
                          }))
                        }
                        className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
                        placeholder="optional link"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-blue-600">
                    <div className="flex items-center gap-3">
                      {auth.user.avatar ? (
                        <img
                          src={resolveAsset(auth.user.avatar) || undefined}
                          alt={auth.user.username}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-600">
                          {auth.user.username.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold">{auth.user.username}</p>
                        <p className="text-xs text-blue-500">
                          Your guestbook note will use your profile name.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-blue-600">
                    choose a mood
                  </span>
                  <select
                    value={form.mood}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        mood: event.target.value as GuestbookMood,
                      }))
                    }
                    className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
                  >
                    {moodValues.map((mood) => (
                      <option key={mood} value={mood}>
                        {guestbookMoodMeta[mood].label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-blue-600">message</span>
                  <textarea
                    value={form.message}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        message: event.target.value.slice(0, 400),
                      }))
                    }
                    className="min-h-40 w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
                    placeholder="say hi, leave a tiny blessing, or write a small note..."
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-blue-400">
                    {remainingChars} characters left
                  </p>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:bg-pink-300"
                  >
                    {submitting ? "Signing..." : "Pin my note"}
                  </button>
                </div>

                {submitError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {submitError}
                  </div>
                ) : null}
              </form>
            </section>
          </main>

          <aside className="right-side-panel w-full lg:w-1/5 mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
            <div className="space-y-3 text-sm text-blue-600">
              <h2 className="text-blue-700 font-bold text-lg text-center">
                little reminders
              </h2>
              <p>Keep your note kind, public, and short enough to fit nicely.</p>
              <p>Signed-in users post under their profile automatically.</p>
              <p>
                After you submit, your note appears on the board and can be
                moved around there.
              </p>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default GuestbookSign;
