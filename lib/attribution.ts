/**
 * First-party traffic attribution. No third-party tool, no cookies, no PII.
 *
 * How it works:
 *  - On first landing we read UTM params + ad click ids from the URL and the
 *    document referrer, and store them in localStorage.
 *  - "First touch" is written once and never overwritten (how they first found
 *    us). "Last touch" is updated every visit (how they came back this time).
 *  - The booking embed reads this and stamps every booked call with its source,
 *    and fires a Vercel Analytics event so bookings are attributable by channel.
 *
 * Aggregate visit sources (Instagram vs ads vs organic) are ALSO captured
 * automatically by Vercel Web Analytics from the UTM-tagged URL + referrer —
 * this module exists to attribute the high-value event (a booked call), not
 * just a pageview.
 *
 * UTM CONVENTION (lowercase, no spaces — see docs/attribution.md for ready links):
 *   utm_source   where it came from   e.g. instagram, google, business_card
 *   utm_medium   the channel type     e.g. social, cpc, qr, email, organic
 *   utm_campaign the specific push    e.g. bio_link, spring_promo, networking
 */

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export const CLICK_ID_KEYS = ["gclid", "fbclid", "ttclid", "msclkid", "li_fat_id"] as const;

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  clickId?: string;
  referrer?: string;
  landingPath?: string;
  capturedAt?: string;
};

const FIRST_TOUCH_KEY = "tmd_attribution_first";
const LAST_TOUCH_KEY = "tmd_attribution_last";

function read(key: string): Attribution | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: Attribution) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — skip silently */
  }
}

/** Build an Attribution snapshot from the current URL + referrer. */
export function snapshotFromUrl(nowIso: string): Attribution {
  const params = new URLSearchParams(window.location.search);
  const attr: Attribution = {};

  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) attr[k] = v;
  }
  for (const k of CLICK_ID_KEYS) {
    const v = params.get(k);
    if (v) {
      attr.clickId = `${k}:${v}`;
      break;
    }
  }

  const ref = document.referrer;
  if (ref && !ref.startsWith(window.location.origin)) {
    attr.referrer = ref;
  }
  attr.landingPath = window.location.pathname + window.location.search;
  attr.capturedAt = nowIso;
  return attr;
}

/** True when a snapshot carries a real source signal worth storing. */
function hasSignal(attr: Attribution): boolean {
  return Boolean(attr.utm_source || attr.clickId || attr.referrer);
}

/**
 * Capture attribution for this visit. Writes last-touch always, and first-touch
 * only if it has never been set. Call once on app mount (client only).
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  const snap = snapshotFromUrl(new Date().toISOString());
  if (!hasSignal(snap)) return;

  write(LAST_TOUCH_KEY, snap);
  if (!read(FIRST_TOUCH_KEY)) {
    write(FIRST_TOUCH_KEY, snap);
  }
}

/** First-touch attribution if known, else last-touch, else null. */
export function getAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  return read(FIRST_TOUCH_KEY) ?? read(LAST_TOUCH_KEY);
}

/** Flatten attribution into string-only props for analytics / Cal config. */
export function attributionProps(attr: Attribution | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!attr) {
    out.utm_source = "direct";
    return out;
  }
  for (const k of UTM_KEYS) {
    if (attr[k]) out[k] = attr[k] as string;
  }
  if (!out.utm_source) out.utm_source = attr.referrer ? "referral" : "direct";
  if (attr.clickId) out.click_id = attr.clickId;
  if (attr.referrer) out.referrer = attr.referrer;
  return out;
}
