/**
 * Cookie consent for the public site. Client only.
 *
 * One choice, one purpose: advertising cookies (the Meta Pixel). Everything
 * else the site does is cookieless and runs regardless. The choice lives in
 * localStorage, which is strictly necessary to remember it and needs no
 * consent of its own.
 *
 * Off by default: nothing advertising-related loads until the visitor says
 * yes. A browser sending Global Privacy Control is treated as a no without
 * being asked, and can still opt in from "Cookie settings" in the footer.
 */

const KEY = "tmd_consent";

/**
 * Bump only when what we ask consent FOR changes (a new ad platform, a new
 * purpose). A changed version asks everyone again. Editing policy wording
 * does not count.
 */
export const CONSENT_VERSION = "2026-09-18";

export const CONSENT_EVENT = "tmd-consent";
export const CONSENT_OPEN_EVENT = "tmd-consent-open";

export type Consent = { marketing: boolean; version: string; at: string };

export function getConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Consent;
    return c && c.version === CONSENT_VERSION && typeof c.marketing === "boolean" ? c : null;
  } catch {
    return null;
  }
}

export function hasMarketingConsent(): boolean {
  return getConsent()?.marketing === true;
}

/** True when the browser asks not to be tracked via Global Privacy Control. */
export function globalPrivacyControl(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function setConsent(marketing: boolean): Consent {
  const consent: Consent = { marketing, version: CONSENT_VERSION, at: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(consent));
  } catch {
    /* storage unavailable: the choice holds for this page only */
  }
  window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: consent }));
  return consent;
}

/** Reopen the banner, from the footer's "Cookie settings". */
export function openConsentSettings(): void {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
