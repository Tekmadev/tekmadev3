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

const ANON_KEY = "tmd_anon_id";
/** Bump this when the cookie-policy text materially changes, so the audit trail
 *  records which version each visitor consented to. */
export const CONSENT_POLICY_VERSION = "2026-06-14";

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
  // Best-effort audit log to our own first-party store. Never blocks the UI.
  try {
    logConsent(choice);
  } catch {
    /* logging must never break the choice */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: choice }));
  }
}

/**
 * Send the consent decision to our own /api/consent endpoint for a Law 25
 * demonstrable-consent audit trail. Uses an anonymous first-party id stored
 * alongside the choice (the choice itself is strictly necessary). Prefers
 * sendBeacon so it survives navigation, with a keepalive fetch fallback.
 */
function logConsent(choice: Consent) {
  if (typeof window === "undefined") return;

  let anon = "";
  try {
    anon = localStorage.getItem(ANON_KEY) || "";
    if (!anon) {
      anon =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `a_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
      localStorage.setItem(ANON_KEY, anon);
    }
  } catch {
    /* storage unavailable; send without a stable id */
  }

  let utmSource = "";
  try {
    utmSource = new URLSearchParams(window.location.search).get("utm_source") || "";
  } catch {
    /* ignore */
  }

  const data = JSON.stringify({
    choice,
    anonymous_id: anon,
    policy_version: CONSENT_POLICY_VERSION,
    path: window.location.pathname,
    utm_source: utmSource,
  });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/consent", new Blob([data], { type: "application/json" }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch("/api/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: data,
      keepalive: true,
    });
  } catch {
    /* best-effort only */
  }
}

/** Re-open the banner so a visitor can change their choice (from the footer). */
export function reopenConsent() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CONSENT_REOPEN_EVENT));
  }
}
