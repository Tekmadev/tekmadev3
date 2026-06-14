/**
 * Cookie-consent state. The choice itself is "strictly necessary" (we must
 * remember it), so storing it in localStorage needs no prior consent.
 *
 * Flow (Quebec Law 25 / GDPR, express opt-in before non-essential cookies):
 *  - null    : no choice yet, or a prior choice that has expired. Banner shows,
 *              no analytics cookies set.
 *  - granted : PostHog runs with cookies (see components/PostHogInit.tsx).
 *  - denied  : no analytics cookies; PostHog stays off.
 * Vercel Web Analytics is cookieless and runs regardless.
 *
 * The choice is stored with a timestamp and honored for CONSENT_TTL_DAYS. Within
 * that window the banner never reappears (a decline is remembered the whole
 * time). After it, we ask again so consent stays fresh.
 */
export type Consent = "granted" | "denied";

const KEY = "tmd_cookie_consent";
export const CONSENT_EVENT = "tmd-consent";
export const CONSENT_REOPEN_EVENT = "tmd-consent-reopen";

/** How long a choice is honored before we ask again. Comfortably past any
 *  minimum-retention floor while keeping consent reasonably fresh. */
export const CONSENT_TTL_DAYS = 180;
const TTL_MS = CONSENT_TTL_DAYS * 24 * 60 * 60 * 1000;

type StoredConsent = { choice: Consent; ts: number };

function parse(raw: string | null): StoredConsent | null {
  if (!raw) return null;
  // Current format: JSON with a timestamp.
  try {
    const obj = JSON.parse(raw) as Partial<StoredConsent>;
    if ((obj.choice === "granted" || obj.choice === "denied") && typeof obj.ts === "number") {
      return { choice: obj.choice, ts: obj.ts };
    }
  } catch {
    /* not JSON; fall through to legacy handling */
  }
  // Legacy format: a bare "granted" / "denied" string with no timestamp.
  // Treat as expired (ts 0) so we ask once more and re-store with a timestamp.
  if (raw === "granted" || raw === "denied") {
    return { choice: raw, ts: 0 };
  }
  return null;
}

export function getConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = parse(localStorage.getItem(KEY));
    if (!stored) return null;
    if (Date.now() - stored.ts > TTL_MS) {
      // Expired: clear it so the banner shows again.
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* noop */
      }
      return null;
    }
    return stored.choice;
  } catch {
    return null;
  }
}

export function setConsent(choice: Consent) {
  try {
    const payload: StoredConsent = { choice, ts: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
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
