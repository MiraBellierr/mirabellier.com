// Local, per-device preferences for the pixies feed, written by the
// first-run onboarding flow (see `@/parts/PixiesOnboarding`).

export const PIXIES_ONBOARDED_KEY = "pixies:onboarded";
export const PIXIES_ONBOARD_STEP_KEY = "pixies:onboardStep";
export const PIXIES_INTERESTS_KEY = "pixies:interests";

export function readStoredInterests(): string[] {
  try {
    const raw = localStorage.getItem(PIXIES_INTERESTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

export function hasOnboardedPixies(): boolean {
  try {
    return localStorage.getItem(PIXIES_ONBOARDED_KEY) === "1";
  } catch {
    // Storage unavailable (private mode, etc.); don't nag on every visit.
    return true;
  }
}

export function saveOnboardingResult(interests: string[]): void {
  try {
    localStorage.setItem(PIXIES_INTERESTS_KEY, JSON.stringify(interests));
    localStorage.setItem(PIXIES_ONBOARDED_KEY, "1");
    localStorage.removeItem(PIXIES_ONBOARD_STEP_KEY);
  } catch {
    // ignore; the flow still completes for this session
  }
}

export function rememberOnboardingResumeStep(): void {
  try {
    localStorage.setItem(PIXIES_ONBOARD_STEP_KEY, "interests");
  } catch {
    // ignore
  }
}

export function shouldResumeAtInterests(): boolean {
  try {
    return localStorage.getItem(PIXIES_ONBOARD_STEP_KEY) === "interests";
  } catch {
    return false;
  }
}
