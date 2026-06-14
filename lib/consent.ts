/**
 * Cookie-consent state. The choice itself is "strictly necessary" (we must
 * remember it), so storing it in localStorage needs no prior consent.
 *
 * Flow (Quebec Law 25 / GDPR — express opt-in before non-essential cookies):
 *  - null    → no choice yet → banner shows, no analytics cookies set
 *  - granted → PostHog runs with cookies (see components/PostHogInit.tsx)
 *  - denied  → no analytics cookies; PostHog stays off
 * Vercel Web Analytics is cookieless and runs regardless.
 */
export type Consent = "granted" | "denied";

const KEY = "tmd_cookie_consent";
export const CONSENT_EVENT = "tmd-consent";
export const CONSENT_REOPEN_EVENT = "tmd-consent-reopen";

export function getConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(choice: Consent) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* storage unavailable */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: choice }));
  }
}

/** Re-open the banner so a visitor can change their choice (from the footer). */
export function reopenConsent() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CONSENT_REOPEN_EVENT));
  }
}
