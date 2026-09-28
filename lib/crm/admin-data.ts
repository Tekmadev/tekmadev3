import { getSupabaseAdmin } from "@/lib/supabase";
import { crmConfig, getCrmSyncSetting } from "@/lib/crm/config";
import { lookupContactByEmail, type GhlContact } from "@/lib/crm/client";
import { readEmailDnd, type CrmDndState } from "@/lib/crm/dnd";
import { emailKey, getCrmContact, type CrmContactRow } from "@/lib/crm/identity";
import type { CrmSyncRun } from "@/lib/crm/reconcile";

/**
 * Reads for /admin/crm. Everything here degrades to an empty answer rather
 * than throwing, because it renders inside an admin page and one unreadable
 * table must not take the rest of the page down with it.
 */

type Counts = Record<string, number>;

const OUTBOX_STATUSES = ["pending", "sending", "failed", "dead", "done", "noop", "discarded"] as const;
const INBOX_STATUSES = ["pending", "processing", "failed", "dead", "unmapped", "unverified", "applied", "ignored", "stale"] as const;

export type CrmQueueCounts = { outbox: Counts; inbox: Counts; oldestPendingAt: string | null };

/** Row counts per status for both queues, plus how long the oldest due job has waited. */
export async function getCrmQueueCounts(): Promise<CrmQueueCounts> {
  const empty: CrmQueueCounts = { outbox: {}, inbox: {}, oldestPendingAt: null };
  const supabase = getSupabaseAdmin();
  if (!supabase) return empty;

  const count = (table: "crm_outbox" | "crm_inbox", status: string) =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("status", status);

  const [outbox, inbox, oldest] = await Promise.all([
    Promise.all(OUTBOX_STATUSES.map((s) => count("crm_outbox", s))),
    Promise.all(INBOX_STATUSES.map((s) => count("crm_inbox", s))),
    supabase
      .from("crm_outbox")
      .select("created_at")
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const out: CrmQueueCounts = { outbox: {}, inbox: {}, oldestPendingAt: null };
  for (const [i, res] of outbox.entries()) {
    if (res.error) {
      console.error("[crm admin] could not count the outbox", res.error.message);
      return empty;
    }
    out.outbox[OUTBOX_STATUSES[i]] = res.count ?? 0;
  }
  for (const [i, res] of inbox.entries()) {
    if (res.error) {
      console.error("[crm admin] could not count the inbox", res.error.message);
      return empty;
    }
    out.inbox[INBOX_STATUSES[i]] = res.count ?? 0;
  }
  out.oldestPendingAt = oldest.error ? null : ((oldest.data as { created_at?: string } | null)?.created_at ?? null);
  return out;
}

export type CrmAttentionRow = {
  queue: "outbox" | "inbox";
  id: string;
  /** Outbox: the job kind. Inbox: the event type they sent. */
  kind: string;
  status: string;
  email: string | null;
  attempts: number;
  lastError: string | null;
  httpStatus: number | null;
  traceId: string | null;
  /** Inbox only. An unverified delivery can be discarded but never retried. */
  signed: boolean;
  at: string;
};

/**
 * The dead-letter surface: everything that stopped on its own and is waiting
 * for a person. Dead outbox jobs, and inbound deliveries that failed, died,
 * could not be matched to a client, or could not be verified.
 */
export async function listCrmAttention(limit = 50): Promise<CrmAttentionRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const [outbox, inbox] = await Promise.all([
    supabase
      .from("crm_outbox")
      .select("id,kind,status,email_key,attempts,last_error,last_http_status,ghl_trace_id,updated_at")
      .eq("status", "dead")
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("crm_inbox")
      .select("id,event_type,status,email_key,attempts,last_error,signature_ok,received_at")
      .in("status", ["failed", "dead", "unmapped", "unverified"])
      .order("received_at", { ascending: false })
      .limit(limit),
  ]);
  if (outbox.error) console.error("[crm admin] could not read dead jobs", outbox.error.message);
  if (inbox.error) console.error("[crm admin] could not read stuck deliveries", inbox.error.message);

  const rows: CrmAttentionRow[] = [];
  for (const r of (outbox.data ?? []) as Record<string, unknown>[]) {
    rows.push({
      queue: "outbox",
      id: String(r.id),
      kind: String(r.kind),
      status: String(r.status),
      email: (r.email_key as string | null) ?? null,
      attempts: Number(r.attempts ?? 0),
      lastError: (r.last_error as string | null) ?? null,
      httpStatus: (r.last_http_status as number | null) ?? null,
      traceId: (r.ghl_trace_id as string | null) ?? null,
      signed: true,
      at: String(r.updated_at),
    });
  }
  for (const r of (inbox.data ?? []) as Record<string, unknown>[]) {
    rows.push({
      queue: "inbox",
      id: String(r.id),
      kind: String(r.event_type),
      status: String(r.status),
      email: (r.email_key as string | null) ?? null,
      attempts: Number(r.attempts ?? 0),
      lastError: (r.last_error as string | null) ?? null,
      httpStatus: null,
      traceId: null,
      signed: r.signature_ok === true,
      at: String(r.received_at),
    });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** The newest runs of every job, for the queue and reconcile panels. */
export async function listCrmRuns(limit = 8): Promise<CrmSyncRun[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("crm_sync_runs")
    .select("id,job,trigger,started_at,finished_at,status,claimed,done,noop,failed,dead,corrected,api_calls,error")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[crm admin] could not read the run log", error.message);
    return [];
  }
  return (data ?? []) as CrmSyncRun[];
}

export type ConsentEvent = {
  at: string;
  type: string;
  source: string;
  reason: string | null;
  policyVersion: string | null;
};

export type SubscriberSnapshot = {
  id: string;
  email: string;
  status: string;
  statusSource: string | null;
  source: string;
  createdAt: string;
  consentedAt: string | null;
  consentPolicyVersion: string | null;
  unsubscribedAt: string | null;
  syncedAt: string | null;
};

export type TheirSide =
  | { state: "not_checked"; why: string }
  | { state: "error"; message: string }
  | { state: "absent" }
  | {
      state: "found";
      contactId: string;
      dnd: CrmDndState;
      dndCode: string | null;
      globalDnd: boolean | null;
      conflict: boolean;
      tags: string[];
      updatedAt: string | null;
    };

export type CrmInspection = {
  email: string;
  subscriber: SubscriberSnapshot | null;
  history: ConsentEvent[];
  mirror: CrmContactRow | null;
  theirs: TheirSide;
};

/**
 * Everything we know about one address, ours beside theirs.
 *
 * Their side is read live, one lookup, only when the connection has been
 * verified: the point of the inspector is to compare what they hold NOW with
 * what we hold, and the mirror alone would only show what we last believed.
 * The owner typed the address, so this is one call on one click, never a loop.
 */
export async function inspectCrmContact(rawEmail: string): Promise<CrmInspection | null> {
  const email = emailKey(rawEmail);
  if (!email || !email.includes("@")) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const [subRes, mirror, setting] = await Promise.all([
    supabase
      .from("subscribers")
      .select("id,email,status,status_source,source,created_at,consented_at,consent_policy_version,unsubscribed_at,ghl_synced_at")
      .eq("email", email)
      .maybeSingle(),
    getCrmContact(email),
    getCrmSyncSetting(),
  ]);
  if (subRes.error) console.error("[crm admin] could not read the subscriber", subRes.error.message);

  const s = subRes.data as Record<string, unknown> | null;
  const subscriber: SubscriberSnapshot | null = s
    ? {
        id: String(s.id),
        email: String(s.email),
        status: String(s.status),
        statusSource: (s.status_source as string | null) ?? null,
        source: String(s.source ?? ""),
        createdAt: String(s.created_at),
        consentedAt: (s.consented_at as string | null) ?? null,
        consentPolicyVersion: (s.consent_policy_version as string | null) ?? null,
        unsubscribedAt: (s.unsubscribed_at as string | null) ?? null,
        syncedAt: (s.ghl_synced_at as string | null) ?? null,
      }
    : null;

  let history: ConsentEvent[] = [];
  if (subscriber) {
    const { data, error } = await supabase
      .from("subscriber_events")
      .select("created_at,type,source,reason,policy_version")
      .eq("subscriber_id", subscriber.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) console.error("[crm admin] could not read the consent history", error.message);
    history = ((data ?? []) as Record<string, unknown>[]).map((e) => ({
      at: String(e.created_at),
      type: String(e.type),
      source: String(e.source),
      reason: (e.reason as string | null) ?? null,
      policyVersion: (e.policy_version as string | null) ?? null,
    }));
  }

  let theirs: TheirSide;
  const cfg = crmConfig();
  if (!cfg) theirs = { state: "not_checked", why: "The CRM is not connected yet." };
  else if (setting.health !== "ok") theirs = { state: "not_checked", why: "The connection has not passed Verify yet." };
  else {
    const res = await lookupContactByEmail(cfg, email);
    if (!res.ok) theirs = { state: "error", message: `${res.error.status} ${res.error.message}` };
    else if (!res.data) theirs = { state: "absent" };
    else theirs = describe(res.data);
  }

  return { email, subscriber, history, mirror, theirs };
}

function describe(c: GhlContact): TheirSide {
  const read = readEmailDnd(c.dndSettings, c.dnd);
  return {
    state: "found",
    contactId: c.id,
    dnd: read.state,
    dndCode: read.code,
    globalDnd: c.dnd,
    conflict: read.conflict,
    tags: c.tags,
    updatedAt: c.dateUpdated,
  };
}

export type ClientCrmLocation = {
  locationId: string;
  calendarIds: string[];
  heldAppointments: number;
};

/** The CRM sub-account mapped to a client, and how many of its appointments are still held for it. */
export async function getCrmLocationForClient(clientId: string): Promise<ClientCrmLocation | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("crm_locations")
    .select("ghl_location_id,qualifying_calendar_ids")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) {
    console.error("[crm admin] could not read the client's CRM account", error.message);
    return null;
  }
  if (!data) return null;
  const locationId = String(data.ghl_location_id);
  const { count } = await supabase
    .from("crm_inbox")
    .select("id", { count: "exact", head: true })
    .eq("location_id", locationId)
    .in("status", ["unmapped", "pending", "failed"]);
  return {
    locationId,
    calendarIds: Array.isArray(data.qualifying_calendar_ids) ? (data.qualifying_calendar_ids as string[]) : [],
    heldAppointments: count ?? 0,
  };
}
