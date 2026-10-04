import { business } from "@/config/site";
import { RESERVED_SLUGS } from "@/lib/links-data";
import { instant } from "../data";

/**
 * The links shapes the admin app reads (docs/api-requests/links.md in the app
 * repo, src/api/schemas/links.ts), built from the website's `links` and
 * `link_clicks` rows (lib/links-data.ts, app/[slug]/page.tsx).
 */

export const LINK_COPY = {
  missing: "That link",
  slug: "Enter a slug using letters, numbers and dashes.",
  reserved: "That slug is reserved by an existing page. Pick another.",
  destination: "Enter a valid destination: a path like /start or a full https:// URL.",
  dupe: "A link with that slug already exists. Pick a different slug.",
  active: "Send active as true or false.",
} as const;

/** Lowercase letters, digits and single dashes. */
export const LINK_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const LINK_SLUG_MAX = 60;

/** A site path ("/start", "/blog/x?y=1"), never protocol-relative ("//evil.test"). */
export const LINK_PATH_RE = /^\/(?!\/)\S*$/;
/** A full https URL with a dotted host ("example.com" alone, http:// and //host are refused). */
export const LINK_HTTPS_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;
export const LINK_DESTINATION_MAX = 2048;

/**
 * Slugs a link can never take: the website's own list (lib/links-data.ts
 * RESERVED_SLUGS, the same one app/[slug] refuses), keeping only the ones a
 * slug could spell ("llms.txt" or "_next" never pass the slug rule anyway).
 */
export const LINK_RESERVED_SLUGS: string[] = [...RESERVED_SLUGS].filter((s) => LINK_SLUG_RE.test(s)).sort();

export const LINK_COLUMNS = "id,slug,destination,utm_source,utm_medium,utm_campaign,label,active,click_count,created_at";

export type LinkDbRow = {
  id: string | number;
  slug: string;
  destination: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  label: string | null;
  active: boolean | null;
  click_count: number | string | null;
  created_at: string;
};

export type ApiShortLink = {
  id: string;
  slug: string;
  destination: string;
  shareUrl: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  label: string | null;
  active: boolean;
  clicks: number;
  createdAt: string;
};

const textOrNull = (value: string | null | undefined) => (typeof value === "string" && value.trim() ? value : null);

/** What the QR code encodes and Copy and Share send: always https://www.tekmadev.com/<slug>. */
export function shareUrlFor(slug: string): string {
  return `${business.url}/${slug}`;
}

export function toShortLink(row: LinkDbRow): ApiShortLink {
  const clicks = Number(row.click_count ?? 0);
  return {
    id: String(row.id),
    slug: row.slug,
    destination: row.destination || "/",
    shareUrl: shareUrlFor(row.slug),
    utmSource: textOrNull(row.utm_source),
    utmMedium: textOrNull(row.utm_medium),
    utmCampaign: textOrNull(row.utm_campaign),
    label: textOrNull(row.label),
    active: Boolean(row.active),
    // The link's own counter: a deleted and recreated slug starts again at 0.
    clicks: Number.isFinite(clicks) ? Math.trunc(clicks) : 0,
    createdAt: instant(row.created_at),
  };
}

/* ------------------------------------------------------------------ */
/* Clicks                                                              */
/* ------------------------------------------------------------------ */

export const CLICK_COLUMNS = "id,created_at,link_id,slug,device,country,referrer";

export type ClickDbRow = {
  id: string | number;
  created_at: string;
  link_id: string | number | null;
  slug: string | null;
  device: string | null;
  country: string | null;
  referrer: string | null;
};

export type ApiLinkClick = {
  id: string;
  at: string;
  linkId: string;
  slug: string;
  device: string | null;
  country: string | null;
  referrer: string | null;
};

const DEVICES = new Set(["mobile", "desktop", "tablet"]);

let regionNames: Intl.DisplayNames | null | undefined;

/**
 * A country name for the app ("Canada"). The redirect stores the two-letter
 * code from the edge header (x-vercel-ip-country); a value that is already a
 * name passes through.
 */
export function countryName(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (!/^[A-Za-z]{2}$/.test(raw)) return raw;
  const code = raw.toUpperCase();
  if (code === "XX" || code === "T1") return null; // unknown, Tor
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * The referring site's host ("instagram.com", "l.facebook.com"), without
 * "www.". The redirect stores the whole Referer header; null for direct
 * visits and QR scans.
 */
export function referrerHost(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    try {
      host = new URL(`https://${raw}`).hostname;
    } catch {
      return null;
    }
  }
  host = host.toLowerCase().replace(/^www\./, "");
  return host || null;
}

export function toLinkClick(row: ClickDbRow): ApiLinkClick {
  const device = row.device?.trim().toLowerCase() ?? "";
  return {
    id: String(row.id),
    at: instant(row.created_at),
    linkId: row.link_id === null || row.link_id === undefined ? "" : String(row.link_id),
    slug: row.slug ?? "",
    device: DEVICES.has(device) ? device : null,
    country: countryName(row.country),
    referrer: referrerHost(row.referrer),
  };
}
