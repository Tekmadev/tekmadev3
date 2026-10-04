import { instant } from "@/lib/admin-api";
import type { CampaignRow } from "@/lib/email-data";
import {
  apiSourceKey,
  apiUnsubscribeSource,
  isSubscriberStatus,
  isUnsubscribeReason,
  type ApiConsentEvent,
  type ApiSubscriberStatus,
  type ApiUnsubscribeReason,
  type ApiUnsubscribeSource,
} from "./labels";

/**
 * Database rows to the shapes in the app's src/api/schemas/email.ts.
 * Instants go through instant() (string work only, microseconds kept).
 */

export type ApiCampaign = {
  id: string;
  key: string;
  name: string;
  subject: string | null;
  template: string | null;
  description: string | null;
  opens: number;
  clicks: number;
  active: boolean;
  createdAt: string;
};

/**
 * email_campaigns keeps running totals beside the events (bumped by the
 * increment_email_open / increment_email_click RPCs from the first event after
 * the row exists), so they already count "since this campaign was added": a
 * key added again starts from zero while its past events stay on record.
 */
export function toCampaign(row: CampaignRow): ApiCampaign {
  return {
    id: String(row.id),
    key: row.key,
    name: row.name,
    subject: row.subject ?? null,
    template: row.template ?? null,
    description: row.description ?? null,
    opens: Math.max(0, Math.trunc(Number(row.open_count ?? 0)) || 0),
    clicks: Math.max(0, Math.trunc(Number(row.click_count ?? 0)) || 0),
    active: row.active === true,
    createdAt: instant(row.created_at),
  };
}

export type EmailEventDbRow = {
  id: string;
  created_at: string;
  type: string;
  campaign_key: string | null;
  url: string | null;
  device: string | null;
  country: string | null;
};

export const EMAIL_EVENT_COLUMNS = "id,created_at,type,campaign_key,url,device,country";

export type ApiEngagementEvent = {
  id: string;
  at: string;
  type: "open" | "click";
  campaignKey: string;
  link: string | null;
  device: string | null;
  country: string | null;
};

export function toEngagementEvent(row: EmailEventDbRow): ApiEngagementEvent {
  const type = row.type === "click" ? "click" : "open";
  return {
    id: String(row.id),
    at: instant(row.created_at),
    type,
    campaignKey: row.campaign_key ?? "",
    link: type === "click" ? (row.url ?? null) : null,
    device: row.device ?? null,
    country: countryName(row.country),
  };
}

export type SubscriberDbRow = {
  id: string;
  created_at: string;
  email: string;
  status: string;
  source: string | null;
  country: string | null;
  ghl_synced_at: string | null;
  unsubscribed_at: string | null;
  status_source: string | null;
  unsubscribe_reason: string | null;
};

export const SUBSCRIBER_COLUMNS =
  "id,created_at,email,status,source,country,ghl_synced_at,unsubscribed_at,status_source,unsubscribe_reason";

export type ApiSubscriber = {
  id: string;
  email: string;
  source: string;
  status: ApiSubscriberStatus;
  reason: ApiUnsubscribeReason | null;
  unsubscribeSource: ApiUnsubscribeSource | null;
  inCrm: boolean;
  country: string | null;
  signedUpAt: string;
  unsubscribedAt: string | null;
};

export function toSubscriber(row: SubscriberDbRow): ApiSubscriber {
  // The table's CHECK allows only these four; anything else would be a hand edit.
  const status: ApiSubscriberStatus = isSubscriberStatus(row.status) ? row.status : "unsubscribed";
  const unsubscribed = status === "unsubscribed";
  return {
    id: String(row.id),
    email: row.email,
    source: row.source?.trim() || "unknown",
    status,
    // Both are only meaningful while the row is unsubscribed.
    reason: unsubscribed && isUnsubscribeReason(row.unsubscribe_reason) ? row.unsubscribe_reason : null,
    unsubscribeSource: unsubscribed ? apiUnsubscribeSource(row.status_source) : null,
    // The same test as the web admin's CRM badge: only a real push stamps it.
    inCrm: !!row.ghl_synced_at,
    country: countryName(row.country),
    signedUpAt: instant(row.created_at),
    unsubscribedAt: status === "active" ? null : instant(row.unsubscribed_at),
  };
}

/** One subscriber_events row, in the shape lib/crm/admin-data.ts also reads it. */
export type ConsentEventInput = {
  at: string;
  type: string;
  source: string;
  reason: string | null;
  policyVersion: string | null;
};

export type ApiConsentEventRow = {
  at: string;
  event: ApiConsentEvent;
  source: string;
  policyVersion: string | null;
  reason?: ApiUnsubscribeReason;
};

const EVENT_TYPE: Record<string, ApiConsentEvent> = {
  subscribed: "subscribed",
  resubscribed: "resubscribed",
  unsubscribed: "unsubscribed",
  bounced: "bounced",
  complained: "complained",
  // "Said why they left" is written as 'feedback' by the history trigger.
  feedback: "reason",
};

/** A history row for the timeline, or null for a type the app does not know. */
export function toConsentEvent(e: ConsentEventInput): ApiConsentEventRow | null {
  const event = EVENT_TYPE[e.type];
  if (!event) return null;
  const out: ApiConsentEventRow = {
    at: instant(e.at),
    event,
    source: apiSourceKey(e.source),
    policyVersion: event === "bounced" || event === "complained" ? null : (e.policyVersion ?? null),
  };
  if ((event === "reason" || event === "unsubscribed") && isUnsubscribeReason(e.reason)) out.reason = e.reason;
  return out;
}

export function toConsentHistory(events: readonly ConsentEventInput[]): ApiConsentEventRow[] {
  const out: ApiConsentEventRow[] = [];
  for (const e of events) {
    const mapped = toConsentEvent(e);
    if (mapped) out.push(mapped);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Countries                                                           */
/* ------------------------------------------------------------------ */

let regionNames: Intl.DisplayNames | null | undefined;

function displayNames(): Intl.DisplayNames | null {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  return regionNames;
}

/**
 * The website stores the visitor's country as the two-letter code its edge
 * sent ("CA"). The app shows a country name ("Canada"): Hermes has no
 * Intl.DisplayNames, so the server does it. Unknown and placeholder codes
 * ("XX", Tor's "T1") are null; anything that is not a code is sent as stored.
 */
export function countryName(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^(xx|zz|t1)$/i.test(v)) return null;
  if (!/^[a-z]{2}$/i.test(v)) return v;
  const code = v.toUpperCase();
  try {
    const name = displayNames()?.of(code);
    if (name && name !== code) return name;
  } catch {
    // An invalid code throws a RangeError; fall through to the code itself.
  }
  return code;
}
