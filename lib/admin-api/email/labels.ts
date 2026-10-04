import { unsubscribeCopy } from "@/config/site";
import { leadMagnets } from "@/config/lead-magnets";

/**
 * The email domain's vocabulary for the admin API: the enums the app's
 * src/api/schemas/email.ts accepts, and the labels GET /meta sends for them.
 * Constants only (no data access, no barrel import), so the meta fragment and
 * the search subtitles can load it cheaply.
 */

export const SUBSCRIBER_STATUSES = ["active", "unsubscribed", "bounced", "complained"] as const;
export type ApiSubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export const UNSUBSCRIBE_REASONS = ["too_many", "not_relevant", "never_signed_up", "other"] as const;
export type ApiUnsubscribeReason = (typeof UNSUBSCRIBE_REASONS)[number];

/** Where an unsubscribe came from, as the app names it. */
export const UNSUBSCRIBE_SOURCES = ["unsubscribe_page", "crm", "crm_permanent", "admin"] as const;
export type ApiUnsubscribeSource = (typeof UNSUBSCRIBE_SOURCES)[number];

export const CONSENT_EVENTS = ["subscribed", "resubscribed", "unsubscribed", "bounced", "complained", "reason"] as const;
export type ApiConsentEvent = (typeof CONSENT_EVENTS)[number];

export const isSubscriberStatus = (v: unknown): v is ApiSubscriberStatus =>
  typeof v === "string" && (SUBSCRIBER_STATUSES as readonly string[]).includes(v);

export const isUnsubscribeReason = (v: unknown): v is ApiUnsubscribeReason =>
  typeof v === "string" && (UNSUBSCRIBE_REASONS as readonly string[]).includes(v);

/**
 * subscribers.status_source and subscriber_events.source use the website's
 * internal vocabulary (lib/subscribers-data.ts SubscriberStatusSource). The app
 * gets the same facts under CRM-neutral keys: the unsubscribe page is one
 * place whichever direction the person went, and the CRM is never named.
 */
const SOURCE_KEY: Record<string, string> = {
  email_link: "unsubscribe_page",
  unsubscribe_page: "unsubscribe_page",
  ghl: "crm",
  ghl_permanent: "crm_permanent",
};

/** A consent event's or signup's source key, as the app shows it (labels in meta `subscriberSources`). */
export function apiSourceKey(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "unknown";
  return SOURCE_KEY[v] ?? v;
}

/**
 * `Subscriber.unsubscribeSource`: only for an unsubscribed row. The nightly
 * reconcile only ever applies an unsubscribe the CRM reported, so it reads
 * "via the CRM". A row from before status_source existed has none.
 */
export function apiUnsubscribeSource(statusSource: string | null | undefined): ApiUnsubscribeSource | null {
  switch (statusSource) {
    case "email_link":
    case "unsubscribe_page":
      return "unsubscribe_page";
    case "ghl":
    case "reconcile":
      return "crm";
    case "ghl_permanent":
      return "crm_permanent";
    case "admin":
      return "admin";
    default:
      return null;
  }
}

type Tone = "neutral" | "gold" | "ok" | "warn" | "muted" | "signal";

export const SUBSCRIBER_STATUS_OPTIONS: { value: ApiSubscriberStatus; label: string; tone: Tone }[] = [
  { value: "active", label: "Active", tone: "gold" },
  { value: "unsubscribed", label: "Unsubscribed", tone: "muted" },
  { value: "bounced", label: "Bounced", tone: "muted" },
  { value: "complained", label: "Complained", tone: "muted" },
];

export const UNSUBSCRIBE_REASON_OPTIONS: { value: ApiUnsubscribeReason; label: string }[] = UNSUBSCRIBE_REASONS.map((value) => ({
  value,
  label: unsubscribeCopy.reasons.find((r) => r.key === value)?.label ?? value,
}));

export const UNSUBSCRIBE_SOURCE_OPTIONS: { value: ApiUnsubscribeSource; label: string }[] = [
  { value: "unsubscribe_page", label: "via the unsubscribe page" },
  { value: "crm", label: "via the CRM" },
  { value: "crm_permanent", label: "via the CRM, as permanent" },
  { value: "admin", label: "via the admin" },
];

/**
 * Signup sources (subscribers.source: "footer", "form:grow", "magnet:<slug>")
 * plus every source a consent event can carry. A key not listed here is shown
 * as is by the app.
 */
export const SUBSCRIBER_SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "footer", label: "Website footer" },
  { value: "form:grow", label: "Grow form" },
  ...leadMagnets.map((m) => ({ value: `magnet:${m.slug}`, label: `Free tool: ${m.name}` })),
  { value: "signup", label: "Signup form" },
  { value: "unsubscribe_page", label: "Unsubscribe page" },
  { value: "crm", label: "CRM" },
  { value: "crm_permanent", label: "CRM, as permanent" },
  { value: "admin", label: "Admin" },
  { value: "reconcile", label: "Nightly reconcile" },
  { value: "resend", label: "Email delivery" },
  { value: "unknown", label: "Unknown" },
];

export const CONSENT_EVENT_OPTIONS: { value: ApiConsentEvent; label: string }[] = [
  { value: "subscribed", label: "Subscribed" },
  { value: "resubscribed", label: "Resubscribed" },
  { value: "unsubscribed", label: "Unsubscribed" },
  { value: "bounced", label: "Bounced" },
  { value: "complained", label: "Marked as spam" },
  { value: "reason", label: "Said why they left" },
];

export const CAMPAIGN_STATUS_OPTIONS: { value: "active" | "paused"; label: string; tone: Tone }[] = [
  { value: "active", label: "Active", tone: "gold" },
  { value: "paused", label: "Paused", tone: "muted" },
];

export const ENGAGEMENT_TYPE_OPTIONS: { value: "open" | "click"; label: string; tone: Tone }[] = [
  { value: "open", label: "Open", tone: "muted" },
  { value: "click", label: "Click", tone: "gold" },
];
