import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/config";
import { fetchVideoTagSuggestions } from "@/lib/pixies";
import {
  readStoredInterests,
  rememberOnboardingResumeStep,
  saveOnboardingResult,
  shouldResumeAtInterests,
} from "@/lib/pixies-prefs";

const MAX_CATEGORIES = 15;

const DiscordLogo = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 71 55"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"
      fill="currentColor"
    />
  </svg>
);

/**
 * First-run onboarding for the pixies feed. Two steps:
 *  1. Sign in with Discord (or skip)
 *  2. Pick interest categories to personalize the feed
 * Persists its flags via `@/lib/pixies-prefs` and calls `onDone` with the
 * chosen interest tags so the feed can refetch personalized.
 */
export const PixiesOnboarding = ({
  onDone,
}: {
  onDone: (interests: string[]) => void;
}) => {
  const [step, setStep] = useState<1 | 2>(() =>
    shouldResumeAtInterests() ? 2 : 1,
  );
  const [tags, setTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(readStoredInterests()),
  );

  useEffect(() => {
    let cancelled = false;
    fetchVideoTagSuggestions()
      .then((all) => {
        if (!cancelled) setTags(all.slice(0, MAX_CATEGORIES));
      })
      .finally(() => {
        if (!cancelled) setTagsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = (interests?: string[]) => {
    const chosen = interests ?? Array.from(selected);
    saveOnboardingResult(chosen);
    onDone(chosen);
  };

  const handleDiscord = () => {
    // Come back to the interests step after the OAuth round-trip.
    rememberOnboardingResumeStep();
    const params = new URLSearchParams({
      redirect_origin: window.location.origin,
    });
    window.location.href = `${API_BASE}/auth/discord?${params.toString()}`;
  };

  const handleSkipSignIn = () => {
    rememberOnboardingResumeStep();
    setStep(2);
  };

  const toggleTag = (tag: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm dark:bg-black/55"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to pixies"
        className="relative w-full max-w-sm rounded-3xl bg-neutral-900/60 p-6 text-white shadow-[0_24px_70px_-15px_rgba(0,0,0,0.75)] ring-1 ring-white/10 backdrop-blur-2xl"
      >
        <div className="mb-5 flex justify-center gap-1.5" aria-hidden="true">
          <span
            className={`h-1.5 w-6 rounded-full transition-colors ${
              step === 1 ? "bg-pink-500" : "bg-white/25"
            }`}
          />
          <span
            className={`h-1.5 w-6 rounded-full transition-colors ${
              step === 2 ? "bg-pink-500" : "bg-white/25"
            }`}
          />
        </div>

        {step === 1 ? (
          <>
            <div className="text-center">
              <h2 className="text-xl font-bold">Welcome to pixies</h2>
              <p className="mt-1 text-sm text-white/70">
                Sign in to like, comment and get a feed tuned to you, or jump
                straight in.
              </p>
            </div>
            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                onClick={handleDiscord}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#5865F2] px-6 py-3 font-semibold text-white transition hover:bg-[#4752C4]"
              >
                <DiscordLogo />
                Continue with Discord
              </button>
              <button
                type="button"
                onClick={handleSkipSignIn}
                className="w-full rounded-xl bg-white/5 px-6 py-2.5 text-sm font-semibold text-white/80 ring-1 ring-inset ring-white/15 transition hover:bg-white/10 hover:text-white"
              >
                Skip for now
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center">
              <h2 className="text-xl font-bold">What are you into?</h2>
              <p className="mt-1 text-sm text-white/70">
                Pick a few to shape your feed. You can change this later.
              </p>
            </div>
            <div className="mt-5 min-h-[7rem]">
              {tagsLoading ? (
                <div className="flex justify-center py-8">
                  <svg
                    className="h-7 w-7 animate-spin text-white/70"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeOpacity="0.25"
                      strokeWidth="4"
                    />
                    <path
                      d="M12 2a10 10 0 0 1 10 10"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              ) : tags.length === 0 ? (
                <p className="py-6 text-center text-sm text-white/60">
                  No categories yet. We’ll learn from what you watch.
                </p>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  {tags.map((tag) => {
                    const on = selected.has(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleTag(tag)}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${
                          on
                            ? "bg-pink-500 text-white ring-pink-400"
                            : "bg-white/5 text-white/80 ring-white/15 hover:bg-white/10"
                        }`}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                onClick={() => finish()}
                className="w-full rounded-xl bg-pink-500 px-6 py-3 font-semibold text-white transition hover:bg-pink-600"
              >
                {selected.size > 0
                  ? `Start watching (${selected.size})`
                  : "Start watching"}
              </button>
              <button
                type="button"
                onClick={() => finish([])}
                className="w-full text-center text-xs font-semibold text-white/50 transition hover:text-white/80"
              >
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PixiesOnboarding;
