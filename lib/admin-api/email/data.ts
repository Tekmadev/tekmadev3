import { z } from "zod";
import { dbError, decodeCursor, keysetFilter, requireDb, toPage, type Page } from "@/lib/admin-api";
import type { CampaignRow } from "@/lib/email-data";
import type { ApiSubscriberStatus } from "./labels";
import {
  EMAIL_EVENT_COLUMNS,
  SUBSCRIBER_COLUMNS,
  toCampaign,
  toConsentHistory,
  toEngagementEvent,
  toSubscriber,
  type ApiCampaign,
  type ApiConsentEventRow,
  type ApiEngagementEvent,
  type ApiSubscriber,
  type EmailEventDbRow,
  type SubscriberDbRow,
} from "./shapes";

/**
 * Reads for the email endpoints (app/api/admin/v1/email). The same tables and
 * the same numbers as the web admin's /admin/email (lib/email-data.ts,
 * lib/subscribers-data.ts), but a failed read answers 500 instead of an
 * empty page, and every row carries the id the app needs.
 */

const RECENT_EVENTS = 25;
const CONSENT_HISTORY_MAX = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export type EmailOverview = {
  stats: { activeSubscribers: number; new30d: number; opens30d: number; clicks30d: number };
  campaigns: ApiCampaign[];
  recentEvents: ApiEngagementEvent[];
};

/**
 * GET /email/overview. Counters only: no subscriber record is in this answer,
 * so staff (email.view) get exactly what the owner gets.
 */
export async function loadEmailOverview(): Promise<EmailOverview> {
  const db = requireDb();
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const subscriberCount = () => db.from("subscribers").select("id", { count: "exact", head: true });
  const eventCount = () => db.from("email_events").select("id", { count: "exact", head: true });

  const [active, new30d, opens30d, clicks30d, campaigns, events] = await Promise.all([
    subscriberCount().eq("status", "active"),
    // Every signup in the window, whatever the status is now.
    subscriberCount().gte("created_at", since),
    // Every event in the window, including events of deleted campaigns.
    eventCount().eq("type", "open").gte("created_at", since),
    eventCount().eq("type", "click").gte("created_at", since),
    db.from("email_campaigns").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }),
    db
      .from("email_events")
      .select(EMAIL_EVENT_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(RECENT_EVENTS),
  ]);

  for (const [what, res] of [
    ["email overview: active subscribers", active],
    ["email overview: new subscribers", new30d],
    ["email overview: opens", opens30d],
    ["email overview: clicks", clicks30d],
    ["email overview: campaigns", campaigns],
    ["email overview: events", events],
  ] as const) {
    if (res.error) throw dbError(what, res.error);
  }

  return {
    stats: {
      activeSubscribers: active.count ?? 0,
      new30d: new30d.count ?? 0,
      opens30d: opens30d.count ?? 0,
      clicks30d: clicks30d.count ?? 0,
    },
    campaigns: ((campaigns.data ?? []) as CampaignRow[]).map(toCampaign),
    recentEvents: ((events.data ?? []) as EmailEventDbRow[]).map(toEngagementEvent),
  };
}

/** One campaign by id, or null. */
export async function getCampaign(id: string): Promise<CampaignRow | null> {
  const db = requireDb();
  const { data, error } = await db.from("email_campaigns").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError("email campaign read", error);
  return (data as CampaignRow | null) ?? null;
}

/* ------------------------------------------------------------------ */
/* Subscribers                                                         */
/* ------------------------------------------------------------------ */

/** A LIKE pattern that matches `q` literally anywhere in the value. */
function containsPattern(q: string): string {
  // PostgREST reads "*" as a wildcard, so it cannot be matched literally; drop it.
  const escaped = q.replace(/\*/g, "").replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

/**
 * GET /email/subscribers: newest signup first (created_at, then id), keyset
 * paged. `q` matches anywhere in the email, ignoring case.
 */
export async function listSubscribers(params: {
  q: string | null;
  status: ApiSubscriberStatus | null;
  cursor: string | null;
  limit: number;
}): Promise<Page<ApiSubscriber>> {
  const db = requireDb();
  const after = decodeCursor(params.cursor, z.tuple([z.string(), z.string()]));

  let query = db
    .from("subscribers")
    .select(SUBSCRIBER_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(params.limit + 1);
  if (params.status) query = query.eq("status", params.status);
  if (params.q) query = query.ilike("email", containsPattern(params.q));
  if (after) query = query.or(keysetFilter(["created_at", "id"], after, "desc"));

  const { data, error } = await query;
  if (error) throw dbError("subscribers list", error);
  return toPage((data ?? []) as SubscriberDbRow[], params.limit, (row) => [row.created_at, row.id], toSubscriber);
}

export type SubscriberDetail = { subscriber: ApiSubscriber; consentHistory: ApiConsentEventRow[] };

/** GET /email/subscribers/:id: the subscriber and their consent history, newest first. Null when gone. */
export async function loadSubscriberDetail(id: string): Promise<SubscriberDetail | null> {
  const db = requireDb();
  const [subscriber, history] = await Promise.all([
    db.from("subscribers").select(SUBSCRIBER_COLUMNS).eq("id", id).maybeSingle(),
    db
      .from("subscriber_events")
      .select("id,created_at,type,source,reason,policy_version")
      .eq("subscriber_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(CONSENT_HISTORY_MAX),
  ]);
  if (subscriber.error) throw dbError("subscriber read", subscriber.error);
  if (history.error) throw dbError("subscriber history read", history.error);
  if (!subscriber.data) return null;

  type EventRow = { created_at: string; type: string; source: string | null; reason: string | null; policy_version: string | null };
  const events = ((history.data ?? []) as EventRow[]).map((e) => ({
    at: e.created_at,
    type: e.type,
    source: e.source ?? "unknown",
    reason: e.reason ?? null,
    policyVersion: e.policy_version ?? null,
  }));

  return { subscriber: toSubscriber(subscriber.data as SubscriberDbRow), consentHistory: toConsentHistory(events) };
}
