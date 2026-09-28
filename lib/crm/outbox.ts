import type { SupabaseClient } from "@supabase/supabase-js";

import { needLabel, revenueBandLabel } from "@/config/grow";
import { REVENUE_LEAK_SLUG } from "@/config/lead-magnets";
import { dayKey, notifyAdmins, resolveAdminNotifications } from "@/lib/admin-notify";
import {
  addTags,
  lookupContactByEmail,
  removeTags,
  setEmailDnd,
  upsertContact,
  type CrmError,
  type CrmErrorCode,
  type GhlContact,
  type UpsertContactInput,
} from "@/lib/crm/client";
import { crmGate, setCrmSync, type CrmConfig } from "@/lib/crm/config";
import { readEmailDnd, type CrmDndState } from "@/lib/crm/dnd";
import { cachedFieldIds, type CrmFieldKey } from "@/lib/crm/fields";
import { markCrmContactErased } from "@/lib/crm/identity";
import { CRM_TAGS, crmTag, type CrmTag } from "@/lib/crm/tags";
import type { SubscriberStatus } from "@/lib/subscribers-data";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * The outbound worker. The only thing in this codebase that pushes to the CRM.
 *
 * Nothing calls the CRM from a request path. Every outbound intent is already a
 * committed `crm_outbox` row by the time this module sees it, enqueued by a
 * trigger inside the transaction that caused it, so losing a lead or an
 * unsubscribe would take losing a committed Postgres row.
 *
 * THE PAYLOAD NEVER CARRIES THE DESIRED STATE. An outbox row names a subject
 * and, at most, which tag a job is about. Every handler below re-reads current
 * truth out of Supabase the instant before it calls out, which is what makes
 * this whole design converge instead of flap:
 *
 *  - A `dnd.set` job queued an hour ago cannot apply an hour-old opinion. It
 *    reads `subscribers.status` now, so a stale job becomes a `noop` rather
 *    than a regression.
 *  - It is also what closes the inbound-to-outbound feedback loop with no
 *    suppression flag anywhere. An inbound unsubscribe writes the mirror
 *    (`crm_contacts.ghl_dnd_email`) before it writes `subscribers.status`, so
 *    when the worker picks up the echo job the mirror already agrees, the
 *    compare short-circuits, and the job finishes with zero API calls. If the
 *    mirror is ever wrong the call happens, corrects their side, and converges.
 *
 * `noop` is a distinct terminal status from `done` on purpose: the admin can
 * see how much traffic the send-time compare saves, and a reconcile can tell
 * "we checked and agreed" from "we never tried".
 *
 * Jobs are claimed only through `crm_outbox_claim(worker, limit)`. That
 * function, not this file, is what makes "never double-applied" true under
 * concurrent workers and Vercel functions that time out mid-send: it locks with
 * SKIP LOCKED, reclaims rows abandoned in 'sending', and returns at most one
 * job per contact per pass. A select-then-update here would quietly undo all of
 * that.
 */

export type CrmOutboxKind = "contact.upsert" | "dnd.set" | "tags.add" | "tags.remove" | "contact.erase";

export type CrmOutboxStatus = "pending" | "sending" | "done" | "noop" | "failed" | "dead" | "discarded";

/** A claimed row, exactly as `crm_outbox_claim` returns it. */
export type CrmOutboxRow = {
  id: string;
  kind: CrmOutboxKind;
  idem_key: string;
  email_key: string;
  subject_type: "subscriber" | "lead" | "lead_magnet_submission" | "client" | "admin";
  subject_id: string | null;
  payload: Record<string, unknown> | null;
  status: CrmOutboxStatus;
  priority: number;
  attempts: number;
  revision: number;
  next_attempt_at: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  last_http_status: number | null;
  ghl_trace_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type CrmRunResult =
  | {
      ok: true;
      claimed: number;
      done: number;
      noop: number;
      failed: number;
      dead: number;
      apiCalls: number;
      /** True when a gate refused and nothing was claimed. Not a failure: the owner turned it off. */
      skipped?: boolean;
      /** Which gate said no, or why the pass stopped early. For the cron body and the admin banner. */
      reason?: string;
    }
  | { ok: false; error: string };

/**
 * What a handler decided. Not exported: callers see counts and the rows, never
 * this shape.
 *
 * `countAttempt: false` gives the attempt back, for a throttle that is not a
 * failure of the job. `code` travels so the pass can stop on the two errors
 * that make every remaining job pointless.
 */
type JobOutcome =
  | { status: "done"; traceId?: string | null; httpStatus?: number }
  | { status: "noop"; reason: string }
  | {
      status: "retry";
      error: string;
      httpStatus?: number | null;
      afterMs?: number;
      countAttempt?: boolean;
      code?: CrmErrorCode;
    }
  | { status: "dead"; error: string; httpStatus?: number | null; code?: CrmErrorCode };

/**
 * State for one pass. `apiCalls` is a counter rather than a return value
 * because a handler can make two calls (resolve the contact, then act) and the
 * run log has to show what the sub-account was actually charged in requests.
 */
type PassContext = {
  supabase: SupabaseClient;
  cfg: CrmConfig;
  worker: string;
  fieldIds: Partial<Record<CrmFieldKey, string>>;
  apiCalls: number;
  /** Set when one job proves the rest of the pass is pointless. */
  halt: { reason: "auth" | "rate_limit_daily"; error: string; afterMs: number | null } | null;
};

/** The spine row, or what stands in for one when a job arrived without it. */
type SpineRow = {
  ghl_contact_id: string | null;
  ghl_dnd_email: CrmDndState;
  ghl_tags: string[];
  erased_at: string | null;
};

const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 6 * 60 * 60 * 1000;
/** A dead row's error is the only description of it the admin gets, so it is generous. */
const ERROR_CHARS = 1000;
/** Claim in small batches: the claim returns one job per contact, so a contact with three queued jobs needs three passes through it. */
const CLAIM_BATCH = 5;
/** Do not start a job with no time left. The budget bounds when we stop claiming, not how long one call takes. */
const MIN_JOB_MS = 250;

const DEFAULT_MAX_JOBS: Record<"cron" | "manual" | "inline", number> = { cron: 100, manual: 50, inline: 3 };
const DEFAULT_BUDGET_MS: Record<"cron" | "manual" | "inline", number> = { cron: 50_000, manual: 25_000, inline: 4_000 };

const nowIso = () => new Date().toISOString();
const clip = (v: string, max: number) => (v.length > max ? `${v.slice(0, max)}...` : v);
const emailKeyOf = (v: string | null | undefined) => (typeof v === "string" ? v.trim().toLowerCase() : "");

/**
 * The outbound DND table, computed fresh at send time and nowhere else.
 *
 * "active" means DND is ON, that is suppressed. `code` records why, so the
 * owner's own account can tell an opt-out from a bounce.
 */
const DESIRED_EMAIL_DND: Record<SubscriberStatus, { state: "active" | "inactive"; code?: string }> = {
  active: { state: "inactive" },
  unsubscribed: { state: "active", code: "OPTED_OUT" },
  bounced: { state: "active", code: "BOUNCED" },
  complained: { state: "active", code: "COMPLAINED" },
};

/** What a job is, in the owner's words. His inbox should not have to read our schema. */
const KIND_LABEL: Record<CrmOutboxKind, string> = {
  "contact.upsert": "contact update",
  "dnd.set": "consent update",
  "tags.add": "tag",
  "tags.remove": "tag removal",
  "contact.erase": "erasure",
};

/** Both of their suppressed states, so a comparison cannot be written against one of them by mistake. */
const isSuppressed = (state: CrmDndState) => state === "active" || state === "permanent";

/**
 * `least(6 hours, 30s * 2^attempts)`, jittered.
 *
 * Eight attempts spans most of a day, so a long CRM outage costs latency and
 * nothing else. The jitter matters because an outage queues every job at once
 * and an un-jittered backoff would send them all back in the same second, which
 * is how a recovering API gets knocked over again.
 */
function backoffMs(attempts: number): number {
  const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(attempts, 0));
  return Math.round(base * (0.85 + Math.random() * 0.3));
}

/**
 * The failure table from the design, in one place.
 *
 * Dead means a retry cannot help: a rotated token, a malformed request, a
 * contact that is not there. Retry means the CRM or the network was
 * momentarily unavailable, which is the only kind of failure that fixes itself.
 * Retrying a 401 eight times just burns the seven-day dual-validity window on a
 * token rotation.
 */
function outcomeFor(err: CrmError): JobOutcome {
  const error = clip(`${err.status} ${err.message}`, ERROR_CHARS);
  switch (err.code) {
    case "rate_limit_burst":
      // A throttle is not a failure of the job, so the attempt is given back.
      // Without that, a busy minute could spend a job's whole retry budget
      // without the job ever having been tried.
      return { status: "retry", error, httpStatus: err.status, afterMs: err.retryAfterMs ?? 10_000, countAttempt: false, code: err.code };
    case "rate_limit_daily":
      // Never retried today: the retries would burn tomorrow's quota too. The
      // pass parks every due job on the reset and stops.
      return { status: "retry", error, httpStatus: err.status, afterMs: err.retryAfterMs ?? 3_600_000, countAttempt: false, code: err.code };
    case "server":
    case "network":
      return { status: "retry", error, httpStatus: err.status || null, code: err.code };
    default:
      // auth, bad_request, not_found. A malformed request will not fix itself,
      // and a contact id that 404s is repaired by the reconciler clearing the
      // spine, after which Retry on /admin/crm works.
      return { status: "dead", error, httpStatus: err.status || null, code: err.code };
  }
}

// ---------------------------------------------------------------------------
// The spine: reading it, and writing back what the CRM just told us.
// ---------------------------------------------------------------------------

/**
 * `crm_enqueue` creates the spine row before the job, so it is normally there.
 * A missing row is still survivable (a hand-inserted outbox row, a spine
 * cleaned up by hand), so it stands in as an empty one and the first write
 * upserts it.
 */
async function loadSpine(ctx: PassContext, emailKey: string): Promise<{ ok: true; spine: SpineRow } | { ok: false; error: string }> {
  const { data, error } = await ctx.supabase
    .from("crm_contacts")
    .select("ghl_contact_id,ghl_dnd_email,ghl_tags,erased_at")
    .eq("email_key", emailKey)
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: `could not read the contact spine: ${error.message}` };
  if (!data) return { ok: true, spine: { ghl_contact_id: null, ghl_dnd_email: "unknown", ghl_tags: [], erased_at: null } };
  const row = data as { ghl_contact_id: string | null; ghl_dnd_email: string | null; ghl_tags: string[] | null; erased_at: string | null };
  const mirror = row.ghl_dnd_email;
  return {
    ok: true,
    spine: {
      ghl_contact_id: row.ghl_contact_id,
      ghl_dnd_email:
        mirror === "active" || mirror === "inactive" || mirror === "permanent" ? mirror : "unknown",
      ghl_tags: Array.isArray(row.ghl_tags) ? row.ghl_tags : [],
      erased_at: row.erased_at,
    },
  };
}

/**
 * Record everything a contact response told us.
 *
 * `ghl_dnd_at` is only ever passed by `dnd.set`, because that column means "the
 * occurred-at of the newest applied change" and the inbound staleness rule
 * compares against it. A read is not a change, so a lookup or a profile upsert
 * must not move it or a genuinely older inbound event would be dropped as stale.
 *
 * The mirror is left alone when the response reads "unknown". Overwriting a
 * known 'permanent' with 'unknown' would let a later `dnd.set` write 'inactive'
 * for someone the CRM holds as permanently suppressed, which is the one thing
 * this mirror exists to prevent.
 */
async function syncSpineFromContact(
  ctx: PassContext,
  emailKey: string,
  contact: GhlContact,
  extra?: { traceId?: string | null; dndAt?: string | null; forceState?: CrmDndState; forceCode?: string | null },
): Promise<void> {
  const seen = readEmailDnd(contact.dndSettings, contact.dnd);
  const state = extra?.forceState && seen.state === "unknown" ? extra.forceState : seen.state;
  const at = nowIso();

  const patch: Record<string, unknown> = {
    email_key: emailKey,
    email: emailKey,
    ghl_contact_id: contact.id,
    ghl_location_id: contact.locationId,
    ghl_tags: contact.tags,
    synced_at: at,
    updated_at: at,
  };
  if (state !== "unknown") {
    patch.ghl_dnd_email = state;
    patch.ghl_dnd_code = seen.code ?? extra?.forceCode ?? null;
  }
  if (extra?.dndAt) patch.ghl_dnd_at = extra.dndAt;
  if (extra?.traceId) patch.last_trace_id = extra.traceId;

  const { error } = await ctx.supabase.from("crm_contacts").upsert(patch, { onConflict: "email_key" });
  // Not fatal: the CRM side is already correct. It costs a redundant call next
  // pass, which is much cheaper than failing a job that succeeded.
  if (error) console.error("[crm outbox] could not update the contact spine", emailKey, error.message);

  if (seen.conflict) {
    await notifyAdmins({
      event: "crm.dnd_conflict",
      title: `Consent records disagree for ${emailKey}`,
      body: `The CRM reports the email channel as "${seen.state}" while its own Do Not Disturb switch says ${contact.dnd === true ? "on" : "off"}. Nothing was changed on our side. Check the contact in the CRM before the next campaign.`,
      url: "/admin/crm",
      needsAction: true,
      dedupeKey: `crm_conflict:${emailKey}`,
      entity: { type: "crm_contact", id: emailKey },
      data: { email: emailKey, state: seen.state, dnd: contact.dnd, contactId: contact.id },
    });
  }
}

/** The tag endpoints return only the resulting list, so the mirror is written on its own. */
async function syncSpineTags(ctx: PassContext, emailKey: string, tags: string[]): Promise<void> {
  const at = nowIso();
  const { error } = await ctx.supabase
    .from("crm_contacts")
    .upsert({ email_key: emailKey, email: emailKey, ghl_tags: tags, synced_at: at, updated_at: at }, { onConflict: "email_key" });
  if (error) console.error("[crm outbox] could not cache tags on the spine", emailKey, error.message);
}

/**
 * The sub-account matched a contact whose email is not the one we asked about,
 * which happens when Allow Duplicate Contact is off and the phone number
 * matched first.
 *
 * Fail loud rather than corrupt a stranger's DND state. The id is not adopted,
 * a held id that turned out to be that stranger's is dropped, and every other
 * job queued for this address is discarded so the mistake is made once. There
 * is no error column on `crm_contacts`, so "stopped" is expressed as an empty
 * contact id plus an owner notification that stays in Needs action.
 */
async function recordContactMismatch(ctx: PassContext, job: CrmOutboxRow, contact: GhlContact): Promise<void> {
  const returned = emailKeyOf(contact.email) || "no email";

  const { error: spineError } = await ctx.supabase
    .from("crm_contacts")
    .update({ ghl_contact_id: null, synced_at: null, updated_at: nowIso() })
    .eq("email_key", job.email_key)
    .eq("ghl_contact_id", contact.id);
  if (spineError) console.error("[crm outbox] could not clear a mismatched contact id", job.email_key, spineError.message);

  const { error: queueError } = await ctx.supabase
    .from("crm_outbox")
    .update({
      status: "discarded",
      last_error: clip(`stopped: the CRM matched ${returned} for ${job.email_key}`, ERROR_CHARS),
      updated_at: nowIso(),
      completed_at: nowIso(),
    })
    .eq("email_key", job.email_key)
    .in("status", ["pending", "failed"])
    // An erasure request is never cancelled by a matching problem. The stranger's
    // id has just been dropped, so when that job runs it re-resolves by email and
    // either finds the right contact or finds nothing. It cannot reach the stranger.
    .neq("kind", "contact.erase");
  if (queueError) console.error("[crm outbox] could not stop the queue for a mismatched contact", job.email_key, queueError.message);

  await notifyAdmins({
    event: "crm.contact_mismatch",
    title: `The CRM matched the wrong contact for ${job.email_key}`,
    body: `An upsert for ${job.email_key} came back as ${returned} (contact ${contact.id}), so the sub-account matched on something other than email. Nothing further is being pushed for this address. Merge or separate the two contacts in the CRM, then press Retry.`,
    url: "/admin/crm",
    needsAction: true,
    dedupeKey: `crm_mismatch:${job.email_key}`,
    entity: { type: "crm_contact", id: job.email_key },
    data: { email: job.email_key, matched: returned, contactId: contact.id },
  });
}

/**
 * Upsert, then check what came back.
 *
 * The email compare is the whole reason this is one function. Skip it and a
 * phone-matched contact gets adopted under our email key, after which the next
 * `dnd.set` suppresses a stranger.
 */
async function upsertAndAdopt(
  ctx: PassContext,
  job: CrmOutboxRow,
  input: UpsertContactInput,
): Promise<{ ok: true; contact: GhlContact; traceId: string | null } | { ok: false; outcome: JobOutcome }> {
  ctx.apiCalls += 1;
  const res = await upsertContact(ctx.cfg, input);
  if (!res.ok) return { ok: false, outcome: outcomeFor(res.error) };

  const { contact, traceId } = res.data;
  if (emailKeyOf(contact.email) !== job.email_key) {
    await recordContactMismatch(ctx, job, contact);
    return {
      ok: false,
      outcome: {
        status: "dead",
        error: clip(`the CRM matched ${emailKeyOf(contact.email) || "a contact with no email"} instead of ${job.email_key}`, ERROR_CHARS),
        httpStatus: 200,
      },
    };
  }

  await syncSpineFromContact(ctx, job.email_key, contact, { traceId });
  return { ok: true, contact, traceId };
}

/**
 * Every handler resolves its own contact id: the spine, else a lookup, else an
 * upsert. One extra call in a rare cold case buys a queue with no dependency
 * graph, no `depends_on` column and no ordering questions between kinds, which
 * at one sub-account against a hundred-requests-per-ten-seconds budget is
 * obviously the right trade.
 *
 * `create: false` is for the jobs where conjuring a contact would be wrong: you
 * do not create someone in the CRM in order to take a tag off them.
 */
async function resolveContactId(
  ctx: PassContext,
  job: CrmOutboxRow,
  spine: SpineRow,
  opts: { create: boolean },
): Promise<{ ok: true; contactId: string | null } | { ok: false; outcome: JobOutcome }> {
  if (spine.ghl_contact_id) return { ok: true, contactId: spine.ghl_contact_id };

  ctx.apiCalls += 1;
  const found = await lookupContactByEmail(ctx.cfg, job.email_key);
  if (!found.ok) return { ok: false, outcome: outcomeFor(found.error) };

  if (found.data) {
    // The lookup was by email, so this is our contact. Its dnd, tags and
    // location came back with it, which is free mirror state.
    await syncSpineFromContact(ctx, job.email_key, found.data);
    return { ok: true, contactId: found.data.id };
  }
  if (!opts.create) return { ok: true, contactId: null };

  // Created with everything we know, not the email alone. A tag job can be
  // claimed before the same person's profile push (both priority 5, both
  // stamped with one transaction's now()), and a workflow keyed on that tag,
  // like speed-to-lead on tmd-grow-form, must not start on a contact with no
  // name or phone. The profile read is database only; the profile push still
  // runs as its own job afterwards and is idempotent.
  const built = await buildContactProfile(ctx, job);
  const made = await upsertAndAdopt(ctx, job, built.ok ? built.input : { email: job.email_key });
  if (!made.ok) return { ok: false, outcome: made.outcome };
  return { ok: true, contactId: made.contact.id };
}

// ---------------------------------------------------------------------------
// Current truth, read immediately before the call.
// ---------------------------------------------------------------------------

/** The one status that decides both the DND state and the newsletter tag. */
async function readSubscriberStatus(
  ctx: PassContext,
  emailKey: string,
): Promise<{ ok: true; status: SubscriberStatus | null } | { ok: false; error: string }> {
  // Plain equality on the column, which `subscribers_email_plain_idx` covers.
  // Every writer normalizes before inserting, so this cannot miss a row that
  // our own code wrote.
  const { data, error } = await ctx.supabase
    .from("subscribers")
    .select("status")
    .eq("email", emailKey)
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: `could not read the subscriber: ${error.message}` };
  const status = (data as { status?: string } | null)?.status;
  if (status === "active" || status === "unsubscribed" || status === "bounced" || status === "complained") {
    return { ok: true, status };
  }
  return { ok: true, status: null };
}

type LeadFacts = {
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  booking_start: string | null;
  /** The /grow form's answers. Null on every other kind of lead. */
  business_name: string | null;
  website: string | null;
  need: string | null;
  revenue_band: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

type SubmissionFacts = {
  magnet: string | null;
  score: number | string | null;
  email: string | null;
  name: string | null;
  company: string | null;
  phone: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

type ClientFacts = {
  slug: string | null;
  business_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  plan_id: string | null;
  is_test: boolean | null;
};

type SubscriberFacts = {
  name: string | null;
  source: string | null;
  public_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  consent_policy_version: string | null;
  consented_at: string | null;
};

const text = (...vals: (string | null | undefined)[]): string | null => {
  for (const v of vals) if (typeof v === "string" && v.trim() !== "") return v.trim();
  return null;
};

/** The utm_* trio and the lead source travel lowercase, the convention the ads matcher hard-codes in SQL. */
const lower = (v: string | null): string | null => (v ? v.toLowerCase() : null);

/**
 * `leads.email`, `lead_magnet_submissions.email` and `clients.primary_email`
 * are never normalized on the way in (the Cal webhook writes the attendee's own
 * casing verbatim), so they are matched case-insensitively and then compared
 * exactly in TypeScript. The exact re-check is not belt and braces: `_` is a
 * legal character in a local part and a wildcard in ILIKE, so `a_b@x.com` would
 * otherwise also match `axb@x.com` and we would push a stranger's phone number.
 */
const exactly = <T extends { email?: string | null; primary_email?: string | null }>(rows: T[], emailKey: string): T[] =>
  rows.filter((r) => emailKeyOf(r.email ?? r.primary_email) === emailKey);

/**
 * Everything we know about this address, from every table that holds any of it.
 *
 * All four are read because `contact.upsert` has a coalescing idempotency key:
 * one row covers the subscriber, the lead and the client, and `subject_type`
 * records only whichever of them enqueued it first. Reading by email key is the
 * only way the pushed profile matches what the site actually holds.
 */
async function buildContactProfile(
  ctx: PassContext,
  job: CrmOutboxRow,
): Promise<{ ok: true; input: UpsertContactInput } | { ok: false; error: string }> {
  const k = job.email_key;
  const [subRes, leadRes, submissionRes, clientRes] = await Promise.all([
    ctx.supabase
      .from("subscribers")
      .select("name,source,public_id,utm_source,utm_medium,utm_campaign,consent_policy_version,consented_at")
      .eq("email", k)
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from("leads")
      .select("name,email,phone,source,booking_start,business_name,website,need,revenue_band,utm_source,utm_medium,utm_campaign")
      .ilike("email", k)
      .order("created_at", { ascending: false })
      .limit(25),
    ctx.supabase
      .from("lead_magnet_submissions")
      .select("magnet,score,email,name,company,phone,utm_source,utm_medium,utm_campaign")
      .ilike("email", k)
      .order("created_at", { ascending: false })
      .limit(25),
    ctx.supabase
      .from("clients")
      .select("slug,business_name,primary_email,primary_phone,plan_id,is_test")
      .ilike("primary_email", k)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (subRes.error) return { ok: false, error: `could not read the subscriber: ${subRes.error.message}` };
  if (leadRes.error) return { ok: false, error: `could not read leads: ${leadRes.error.message}` };
  if (submissionRes.error) return { ok: false, error: `could not read tool submissions: ${submissionRes.error.message}` };
  if (clientRes.error) return { ok: false, error: `could not read clients: ${clientRes.error.message}` };

  const subscriber = (subRes.data as SubscriberFacts | null) ?? null;
  const leads = exactly((leadRes.data ?? []) as LeadFacts[], k);
  const submissions = exactly((submissionRes.data ?? []) as SubmissionFacts[], k);
  // A sandbox purchase never reaches the CRM, so a test client contributes
  // nothing here either, not even a company name.
  const clients = exactly((clientRes.data ?? []) as ClientFacts[], k).filter((c) => c.is_test !== true);

  const lead = leads[0] ?? null;
  const submission = submissions[0] ?? null;
  const client = clients[0] ?? null;

  const input: UpsertContactInput = { email: k };
  const name = text(subscriber?.name, lead?.name, submission?.name);
  if (name) input.name = name;
  const phone = text(lead?.phone, submission?.phone, client?.primary_phone);
  if (phone) input.phone = phone;
  // The /grow answers come from the newest lead that has them, not simply the
  // newest lead: a reschedule arrives as a fresh cal_booking row with none of
  // them, and the push should still describe everything the site holds.
  const company = text(client?.business_name, ...leads.map((l) => l.business_name), submission?.company);
  if (company) input.companyName = company;
  const website = text(...leads.map((l) => plausibleWebsite(l.website)));
  if (website) input.website = website;

  const leadSource = lower(text(lead?.source, subscriber?.source, submission ? "lead_magnet" : null));
  if (leadSource) input.source = leadSource;

  // DND is deliberately absent from every upsert. `dnd.set` owns it, runs at
  // priority 1, and refuses to act for an address with no subscribers row.
  // Sending "inactive" here would assert a consent we do not have for every
  // lead who never ticked the box.
  const fields: Record<string, string | number> = {};
  const put = (key: CrmFieldKey, value: string | number | null | undefined) => {
    const id = ctx.fieldIds[key];
    if (!id || value == null || value === "") return;
    fields[id] = value;
  };

  put("subscriberPublicId", subscriber?.public_id ?? null);
  put("leadSource", leadSource);
  put("utmSource", lower(text(subscriber?.utm_source, lead?.utm_source, submission?.utm_source)));
  put("utmMedium", lower(text(subscriber?.utm_medium, lead?.utm_medium, submission?.utm_medium)));
  put("utmCampaign", lower(text(subscriber?.utm_campaign, lead?.utm_campaign, submission?.utm_campaign)));
  put("monthlyLeak", monthlyLeak(submissions));
  // The label they picked, which is what the owner reads and branches on. The
  // raw code is the fallback, so an option later taken off the form still
  // arrives on old leads as something rather than nothing.
  const need = text(...leads.map((l) => l.need));
  put("need", need ? (needLabel(need) ?? need) : null);
  const band = text(...leads.map((l) => l.revenue_band));
  put("revenueBand", band ? (revenueBandLabel(band) ?? band) : null);
  put("lastBookingAt", lastBookingAt(leads));
  put("consentVersion", subscriber?.consent_policy_version ?? null);
  put("consentAt", subscriber?.consented_at ?? null);
  put("clientSlug", client?.slug ?? null);

  if (Object.keys(fields).length) input.customFields = fields;
  return { ok: true, input };
}

/**
 * The /grow website answer, only when it could be one.
 *
 * The column is free text and never validated as a URL, so it can hold "n/a" or
 * "don't have one yet". Those are a truthful answer on our side and junk in the
 * contact's website field, so anything with a space or without a dot stays home.
 */
function plausibleWebsite(v: string | null): string | null {
  const t = (v ?? "").trim();
  return t && !/\s/.test(t) && t.includes(".") ? t : null;
}

/** Dollars a month from the revenue leak calculator, newest submission first. */
function monthlyLeak(submissions: SubmissionFacts[]): number | null {
  for (const s of submissions) {
    if (s.magnet !== REVENUE_LEAK_SLUG) continue;
    const n = typeof s.score === "string" ? Number(s.score) : s.score;
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return null;
}

/** The newest booking on record, as an ISO string, because the field is TEXT on their side. */
function lastBookingAt(leads: LeadFacts[]): string | null {
  let best: number | null = null;
  for (const l of leads) {
    if (!l.booking_start) continue;
    const t = Date.parse(l.booking_start);
    if (!Number.isFinite(t)) continue;
    if (best === null || t > best) best = t;
  }
  return best === null ? null : new Date(best).toISOString();
}

/**
 * Which tag a tag job is about.
 *
 * The triggers enqueue a bare slug, never the `tmd-` prefixed string, so the
 * vocabulary has exactly one definition (`lib/crm/tags.ts`). The plan job
 * carries the plan id as data because the products table owns the list of
 * plans and a migration must not hold a second copy of it.
 */
function resolveJobTag(payload: Record<string, unknown> | null): CrmTag | null {
  const bag = payload && typeof payload === "object" ? payload : {};
  const slug = typeof bag.tag === "string" ? bag.tag : "";
  if (slug === "plan") {
    const plan = typeof bag.plan === "string" ? bag.plan.trim().toLowerCase() : "";
    return plan ? crmTag(`plan-${plan}`) : null;
  }
  return crmTag(slug);
}

// ---------------------------------------------------------------------------
// The five handlers.
// ---------------------------------------------------------------------------

async function handleContactUpsert(job: CrmOutboxRow, ctx: PassContext): Promise<JobOutcome> {
  const built = await buildContactProfile(ctx, job);
  if (!built.ok) return { status: "retry", error: built.error };

  const pushed = await upsertAndAdopt(ctx, job, built.input);
  if (!pushed.ok) return pushed.outcome;
  await stampSynced(ctx, job.email_key);
  return { status: "done", traceId: pushed.traceId, httpStatus: 200 };
}

/**
 * Mark the rows the admin reads as "in the CRM" once a contact really is.
 *
 * subscribers.ghl_synced_at and lead_magnet_submissions.ghl_synced_at back the
 * CRM badges on the Email and Free tools pages. Only a successful upsert may
 * write them, which is the whole difference from the fire-and-forget POST they
 * used to record. First sync only: a later push changes nothing a badge shows.
 * A failed stamp is logged and never fails the job, because the contact did
 * reach the CRM and retrying would push it again for a cosmetic column.
 */
async function stampSynced(ctx: PassContext, key: string): Promise<void> {
  const at = nowIso();
  const [subs, subs2] = await Promise.all([
    ctx.supabase.from("subscribers").update({ ghl_synced_at: at }).eq("email", key).is("ghl_synced_at", null),
    ctx.supabase.from("lead_magnet_submissions").update({ ghl_synced_at: at }).eq("email", key).is("ghl_synced_at", null),
  ]);
  if (subs.error) console.error("[crm outbox] could not stamp the subscriber as synced", subs.error.message);
  if (subs2.error) console.error("[crm outbox] could not stamp the calculator submission as synced", subs2.error.message);
}

async function handleDndSet(job: CrmOutboxRow, ctx: PassContext, spine: SpineRow): Promise<JobOutcome> {
  const current = await readSubscriberStatus(ctx, job.email_key);
  if (!current.ok) return { status: "retry", error: current.error };

  // A lead-only contact. Absence of consent is not a suppression instruction,
  // and writing "inactive" would be us asserting a consent nobody gave.
  if (!current.status) return { status: "noop", reason: "no subscriber row, so there is no consent decision to mirror" };

  const desired = DESIRED_EMAIL_DND[current.status];

  // Their terminal state. Per their own docs it needs a contact-initiated
  // opt-in or a support ticket to clear, so we never try, and asking would
  // overwrite a harder signal than anything we hold.
  if (spine.ghl_dnd_email === "permanent" && desired.state === "inactive") {
    return { status: "noop", reason: "the CRM holds this address as permanently suppressed" };
  }
  // The send-time compare. This is the line that makes an echoed inbound
  // unsubscribe cost zero API calls, and a stale job a no-op instead of a flap.
  if (spine.ghl_dnd_email === desired.state) {
    return { status: "noop", reason: `the CRM already reads ${desired.state} for the email channel` };
  }

  const resolved = await resolveContactId(ctx, job, spine, { create: true });
  if (!resolved.ok) return resolved.outcome;
  if (!resolved.contactId) return { status: "retry", error: "no contact id to set DND on" };

  ctx.apiCalls += 1;
  const res = await setEmailDnd(ctx.cfg, resolved.contactId, desired.state, desired.code);
  if (!res.ok) return outcomeFor(res.error);

  const at = nowIso();
  await syncSpineFromContact(ctx, job.email_key, res.data, {
    dndAt: at,
    forceState: desired.state,
    forceCode: desired.code ?? null,
  });

  // We wrote a suppression and read back a contactable contact, or the other
  // way round. readEmailDnd's own tripwire only corroborates against their
  // global boolean; this catches the write itself not taking.
  const seen = readEmailDnd(res.data.dndSettings, res.data.dnd);
  if (seen.state !== "unknown" && isSuppressed(seen.state) !== isSuppressed(desired.state)) {
    await notifyAdmins({
      event: "crm.dnd_conflict",
      title: `A consent change did not take for ${job.email_key}`,
      body: `We set the email channel to "${desired.state}" and the CRM read back "${seen.state}". Our own record still says ${current.status}. Check the contact in the CRM before the next campaign.`,
      url: "/admin/crm",
      needsAction: true,
      dedupeKey: `crm_conflict:${job.email_key}`,
      entity: { type: "crm_contact", id: job.email_key },
      data: { email: job.email_key, wrote: desired.state, read: seen.state, status: current.status },
    });
  }

  return { status: "done", httpStatus: 200 };
}

async function handleTags(job: CrmOutboxRow, ctx: PassContext, spine: SpineRow, add: boolean): Promise<JobOutcome> {
  const tag = resolveJobTag(job.payload);
  // Not retryable: a payload outside the vocabulary will not become valid, and
  // guessing would invent a tag in the owner's account that nothing cleans up.
  if (!tag) return { status: "dead", error: `unrecognised tag payload: ${clip(JSON.stringify(job.payload ?? {}), 200)}` };

  // The newsletter tag is the one state-derived tag: it IS the consent record on
  // their side, every marketing audience filters on it, so it is recomputed
  // here rather than trusted from a job that may be an hour old.
  if (tag === CRM_TAGS.newsletter) {
    const current = await readSubscriberStatus(ctx, job.email_key);
    if (!current.ok) return { status: "retry", error: current.error };
    const shouldHave = current.status === "active";
    if (add && !shouldHave) {
      return { status: "noop", reason: `the subscriber is ${current.status ?? "not on the list"}, so the newsletter tag does not belong` };
    }
    if (!add && shouldHave) return { status: "noop", reason: "the subscriber is active again, so the newsletter tag stays" };
  }

  // Adding a tag is worth creating the contact for. Removing one is not: there
  // is nothing to take off a contact that does not exist.
  const resolved = await resolveContactId(ctx, job, spine, { create: add });
  if (!resolved.ok) return resolved.outcome;
  if (!resolved.contactId) return { status: "noop", reason: "the address is not in the CRM, so there is no tag to remove" };

  ctx.apiCalls += 1;
  const res = add
    ? await addTags(ctx.cfg, resolved.contactId, [tag])
    : await removeTags(ctx.cfg, resolved.contactId, [tag]);
  if (!res.ok) return outcomeFor(res.error);

  // The endpoints answer with the contact's full tag list after the change,
  // which is the only cheap way to cache the post-state without overwriting it.
  await syncSpineTags(ctx, job.email_key, res.data.tags);
  return { status: "done", httpStatus: 200 };
}

/**
 * Someone asked to be forgotten.
 *
 * Suppress first, tag second. If the function dies between the two, the person
 * is suppressed, which is the half that matters. `erased_at` is deliberately
 * not cleared and not checked here: `crm_enqueue` refuses to create anything
 * for an erased address, so this job is the one thing still allowed to act.
 */
async function handleErase(job: CrmOutboxRow, ctx: PassContext, spine: SpineRow): Promise<JobOutcome> {
  const resolved = await resolveContactId(ctx, job, spine, { create: false });
  if (!resolved.ok) return resolved.outcome;
  if (!resolved.contactId) return { status: "noop", reason: "the address is not in the CRM, so there is nothing to erase" };

  ctx.apiCalls += 1;
  const dnd = await setEmailDnd(ctx.cfg, resolved.contactId, "active", "OPTED_OUT");
  if (!dnd.ok) return outcomeFor(dnd.error);
  await syncSpineFromContact(ctx, job.email_key, dnd.data, { dndAt: nowIso(), forceState: "active", forceCode: "OPTED_OUT" });

  ctx.apiCalls += 1;
  const tagged = await addTags(ctx.cfg, resolved.contactId, [CRM_TAGS.erased]);
  // The suppression already landed and both calls are idempotent, so a retry
  // costs one redundant DND write and finishes the job properly.
  if (!tagged.ok) return outcomeFor(tagged.error);
  await syncSpineTags(ctx, job.email_key, tagged.data.tags);

  return { status: "done", httpStatus: 200 };
}

/** One job, start to finish, with the erasure and spine checks every kind shares. */
async function runJob(job: CrmOutboxRow, ctx: PassContext): Promise<JobOutcome> {
  const loaded = await loadSpine(ctx, job.email_key);
  if (!loaded.ok) return { status: "retry", error: loaded.error };
  const spine = loaded.spine;

  // A job enqueued a minute before the erasure request is still in the queue
  // when it arrives. Pushing it would rebuild the profile of someone who asked
  // to be forgotten, which is exactly what the tombstone exists to stop.
  if (spine.erased_at && job.kind !== "contact.erase") {
    return { status: "noop", reason: "this address was erased, so nothing further is pushed for it" };
  }

  switch (job.kind) {
    case "contact.upsert":
      return handleContactUpsert(job, ctx);
    case "dnd.set":
      return handleDndSet(job, ctx, spine);
    case "tags.add":
      return handleTags(job, ctx, spine, true);
    case "tags.remove":
      return handleTags(job, ctx, spine, false);
    case "contact.erase":
      return handleErase(job, ctx, spine);
    default:
      // The CHECK constraint makes this unreachable, and a row that got past it
      // by hand must not be retried forever.
      return { status: "dead", error: `unknown job kind: ${clip(String(job.kind), 80)}` };
  }
}

// ---------------------------------------------------------------------------
// Writing the outcome back.
// ---------------------------------------------------------------------------

/**
 * The outcome write carries `locked_by`, so a pass that overran the five-minute
 * reclaim window and lost its row to another worker discards its own answer
 * instead of clobbering the newer one. Both workers made the same idempotent
 * call, so the newer answer is the true one.
 */
async function writeRow(ctx: PassContext, job: CrmOutboxRow, patch: Record<string, unknown>): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("crm_outbox")
    .update({ ...patch, updated_at: nowIso() })
    .eq("id", job.id)
    .eq("locked_by", ctx.worker)
    .select("id");
  if (error) {
    console.error("[crm outbox] could not record the outcome of", job.kind, job.id, error.message);
    return;
  }
  if (!(data ?? []).length) {
    console.error("[crm outbox] outcome discarded, the row was reclaimed while this pass held it:", job.id);
  }
}

type Tally = { done: number; noop: number; failed: number; dead: number };

async function applyOutcome(ctx: PassContext, job: CrmOutboxRow, outcome: JobOutcome, tally: Tally): Promise<void> {
  const at = nowIso();

  if (outcome.status === "done") {
    tally.done += 1;
    await writeRow(ctx, job, {
      status: "done",
      completed_at: at,
      last_error: null,
      last_http_status: outcome.httpStatus ?? 200,
      ...(outcome.traceId ? { ghl_trace_id: outcome.traceId } : {}),
    });
    // A job that needed more than one attempt had a dead-letter card raised
    // against it. It worked, so the card closes itself.
    if (job.attempts > 1) {
      await resolveAdminNotifications({ events: ["crm.sync_stuck"], entityId: job.id, by: "crm outbox" });
    }
    return;
  }

  if (outcome.status === "noop") {
    tally.noop += 1;
    await writeRow(ctx, job, {
      status: "noop",
      completed_at: at,
      // `last_error` is the only text column on the row, and why a job no-opped
      // is the most useful thing the admin can read about it.
      last_error: clip(outcome.reason, ERROR_CHARS),
      last_http_status: null,
    });
    return;
  }

  // Both read before the dead branch below, so neither depends on TypeScript
  // narrowing the false branch of a disjunction.
  const throttled = outcome.status === "retry" && outcome.countAttempt === false;
  const exhausted = outcome.status === "retry" && !throttled && job.attempts >= MAX_ATTEMPTS;

  if (outcome.status === "dead" || exhausted) {
    tally.dead += 1;
    const error = exhausted
      ? clip(`gave up after ${job.attempts} attempts: ${outcome.error}`, ERROR_CHARS)
      : clip(outcome.error, ERROR_CHARS);
    await writeRow(ctx, job, {
      status: "dead",
      completed_at: at,
      last_error: error,
      last_http_status: outcome.httpStatus ?? null,
    });
    await notifyAdmins({
      event: "crm.sync_stuck",
      title: `A CRM ${KIND_LABEL[job.kind] ?? "job"} gave up for ${job.email_key}`,
      body: `${error} · ${job.attempts} attempt${job.attempts === 1 ? "" : "s"}. Retry or discard it in Needs attention on the CRM page.`,
      url: "/admin/crm",
      needsAction: true,
      dedupeKey: `crm_dead:${job.id}`,
      entity: { type: "crm_outbox", id: job.id },
      data: { kind: job.kind, email: job.email_key, attempts: job.attempts, httpStatus: outcome.httpStatus ?? null },
    });
    return;
  }

  tally.failed += 1;
  await writeRow(ctx, job, {
    // A throttle leaves the row 'pending', not 'failed'. Nothing about the job
    // failed, and the admin's failure count should mean something.
    status: throttled ? "pending" : "failed",
    attempts: throttled ? Math.max(job.attempts - 1, 0) : job.attempts,
    next_attempt_at: new Date(Date.now() + (outcome.afterMs ?? backoffMs(job.attempts))).toISOString(),
    last_error: clip(outcome.error, ERROR_CHARS),
    last_http_status: outcome.httpStatus ?? null,
  });
}

/**
 * Hand claimed-but-unprocessed jobs straight back, rather than leaving them in
 * 'sending' for the five minutes the claim function waits before reclaiming
 * them. The attempt is given back too: running out of Vercel budget is not an
 * attempt at the job.
 */
async function releaseJobs(ctx: PassContext, jobs: CrmOutboxRow[], afterMs: number): Promise<void> {
  const next = new Date(Date.now() + Math.max(afterMs, 0)).toISOString();
  for (const job of jobs) {
    const { error } = await ctx.supabase
      .from("crm_outbox")
      .update({ status: "pending", attempts: Math.max(job.attempts - 1, 0), next_attempt_at: next, updated_at: nowIso() })
      .eq("id", job.id)
      .eq("locked_by", ctx.worker);
    if (error) console.error("[crm outbox] could not release a claimed job", job.id, error.message);
  }
}

/**
 * The daily quota is spent. Park everything that is due so the next ten passes
 * do not each spend a request discovering the same thing, and so the retries do
 * not eat into tomorrow's quota.
 */
async function parkDueJobs(ctx: PassContext, afterMs: number): Promise<void> {
  const until = new Date(Date.now() + Math.max(afterMs, 60_000)).toISOString();
  const { error } = await ctx.supabase
    .from("crm_outbox")
    .update({ next_attempt_at: until, updated_at: nowIso() })
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", nowIso());
  if (error) console.error("[crm outbox] could not park the queue on the daily quota", error.message);
}

// ---------------------------------------------------------------------------
// The pass.
// ---------------------------------------------------------------------------

/**
 * Drain the outbox.
 *
 * Three drivers, one function:
 *
 *  - **inline**, from `after()` in the site's own routes, `maxJobs: 3`,
 *    `budgetMs: 4000`. The visitor never waits for it: `after` runs once the
 *    response is already sent. The common case syncs within a second, and if
 *    the function dies first the row is committed and the cron picks it up.
 *  - **cron**, every ten minutes, `budgetMs: 50_000` inside a 60 second
 *    `maxDuration`.
 *  - **manual**, the owner's Sync now button on /admin/crm.
 *
 * Never throws and never rejects, because four route handlers call it inside
 * `after()` where a rejection is an unhandled one.
 */
export async function runCrmOutbox(
  opts: { trigger: "cron" | "manual" | "inline"; maxJobs?: number; budgetMs?: number } = { trigger: "cron" },
): Promise<CrmRunResult> {
  const trigger = opts.trigger ?? "cron";
  const maxJobs = Math.max(1, opts.maxJobs ?? DEFAULT_MAX_JOBS[trigger]);
  const budgetMs = Math.max(500, opts.budgetMs ?? DEFAULT_BUDGET_MS[trigger]);
  const startedAt = Date.now();
  const timeLeft = () => budgetMs - (Date.now() - startedAt);

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  // The gate is checked before the run row is opened, so a switched-off cron
  // does not leave ten empty rows an hour in the run log.
  const gate = await crmGate("outbound");
  if (!gate.ok) {
    if (gate.reason === "not_configured") {
      await notifyAdmins({
        event: "crm.not_configured",
        title: "CRM sync is switched on but not connected",
        body: "Outbound sync is armed and jobs are queueing, but GHL_PIT_TOKEN and GHL_LOCATION_ID are not both set in Vercel. Nothing is being lost: the queue keeps the rows until the credentials arrive.",
        url: "/admin/crm",
        dedupeKey: dayKey("crm_not_configured"),
        collapse: true,
      });
    }
    return { ok: true, skipped: true, reason: gate.reason, claimed: 0, done: 0, noop: 0, failed: 0, dead: 0, apiCalls: 0 };
  }

  const worker = `${trigger}-${randomWorkerId()}`;
  const ctx: PassContext = {
    supabase,
    cfg: gate.cfg,
    worker,
    // Read once per pass. Resolving them is the admin's job, because resolving
    // creates fields in the owner's sub-account and a worker must not.
    fieldIds: await cachedFieldIds(),
    apiCalls: 0,
    halt: null,
  };

  const { data: run, error: runInsertError } = await supabase
    .from("crm_sync_runs")
    .insert({ job: "outbox", trigger })
    .select("id")
    .single();
  // Losing the run log is not worth losing the pass: the queue rows are the
  // durable record and the log is only how the admin sees "last synced".
  if (runInsertError) console.error("[crm outbox] could not open a run row", runInsertError.message);
  const runId = (run as { id?: string } | null)?.id ?? null;
  const finish = (patch: Record<string, unknown>) =>
    runId
      ? supabase
          .from("crm_sync_runs")
          .update({ finished_at: nowIso(), ...patch })
          .eq("id", runId)
          .then(({ error }) => {
            if (error) console.error("[crm outbox] could not close the run row", error.message);
          })
      : Promise.resolve();

  const tally: Tally = { done: 0, noop: 0, failed: 0, dead: 0 };
  let claimed = 0;
  let drained = false;
  let stopped = false;
  let runError: string | null = null;

  try {
    while (!stopped && claimed < maxJobs) {
      if (timeLeft() <= MIN_JOB_MS) break;

      const want = Math.min(maxJobs - claimed, CLAIM_BATCH);
      const { data, error } = await supabase.rpc("crm_outbox_claim", { p_worker: worker, p_limit: want });
      if (error) {
        runError = `could not claim jobs: ${error.message}`;
        break;
      }
      const jobs = (data ?? []) as CrmOutboxRow[];
      if (!jobs.length) {
        drained = true;
        break;
      }
      claimed += jobs.length;

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        if (ctx.halt || timeLeft() <= MIN_JOB_MS) {
          await releaseJobs(ctx, jobs.slice(i), ctx.halt?.afterMs ?? 0);
          claimed -= jobs.length - i;
          stopped = true;
          break;
        }

        const outcome = await runJob(job, ctx);
        await applyOutcome(ctx, job, outcome, tally);

        if ((outcome.status === "retry" || outcome.status === "dead") && outcome.code === "auth") {
          ctx.halt = { reason: "auth", error: outcome.error, afterMs: null };
        } else if (outcome.status === "retry" && outcome.code === "rate_limit_daily") {
          ctx.halt = { reason: "rate_limit_daily", error: outcome.error, afterMs: outcome.afterMs ?? 3_600_000 };
        }
      }
    }

    if (ctx.halt?.reason === "auth") {
      // The whole integration stops trying. Every other job would 401 too, and
      // eight retries each would burn the seven-day dual-validity window a
      // token rotation gives us.
      await setCrmSync({ health: "auth_failed" }, "crm outbox");
      await notifyAdmins({
        event: "crm.auth_failed",
        title: "The CRM rejected our token",
        body: `${ctx.halt.error} · CRM sync is now stopped and nothing further will be pushed. Create a fresh Private Integration Token in GoHighLevel, set GHL_PIT_TOKEN in Vercel, then verify the connection on the CRM page to start it again.`,
        url: "/admin/crm",
        needsAction: true,
        // A fixed entity so a passing Verify on /admin/crm can resolve the card.
        entity: { type: "crm", id: "connection" },
        dedupeKey: dayKey("crm_auth_failed"),
        collapse: true,
      });
    } else if (ctx.halt?.reason === "rate_limit_daily") {
      const afterMs = ctx.halt.afterMs ?? 3_600_000;
      await parkDueJobs(ctx, afterMs);
      await notifyAdmins({
        event: "crm.rate_limited",
        title: "The CRM daily request quota is spent",
        body: `The queue is parked until roughly ${new Date(Date.now() + afterMs).toISOString().replace("T", " ").slice(0, 16)} UTC and resumes on its own. Nothing is lost, everything queued is still queued.`,
        url: "/admin/crm",
        dedupeKey: dayKey("crm_rate_limited"),
        collapse: true,
      });
    }

    // 'partial' is its own outcome: a pass that ran out of budget, or left
    // something failed or dead behind, did real work and is not an error, and
    // calling it 'ok' would hide a growing backlog.
    const incomplete = !drained || tally.failed > 0 || tally.dead > 0;
    const status = runError || ctx.halt?.reason === "auth" ? "error" : incomplete ? "partial" : "ok";
    await finish({
      status,
      claimed,
      done: tally.done,
      noop: tally.noop,
      failed: tally.failed,
      dead: tally.dead,
      api_calls: ctx.apiCalls,
      error: runError ? clip(runError, ERROR_CHARS) : ctx.halt ? clip(ctx.halt.error, ERROR_CHARS) : null,
    });

    if (runError) return { ok: false, error: runError };
    // A rotated token is broken and the cron should say so out loud. A spent
    // daily quota is a limit, not a fault: the work that could be done was
    // done, the rest is parked, and the owner already has the notification.
    if (ctx.halt?.reason === "auth") return { ok: false, error: ctx.halt.error };

    return {
      ok: true,
      claimed,
      done: tally.done,
      noop: tally.noop,
      failed: tally.failed,
      dead: tally.dead,
      apiCalls: ctx.apiCalls,
      // "more_due" covers both stopping conditions the caller can act on: the
      // job cap and the time budget. Either way the answer is the same, come back.
      ...(ctx.halt ? { reason: ctx.halt.reason } : !drained ? { reason: "more_due" } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[crm outbox] pass failed", message);
    await finish({
      status: "error",
      claimed,
      done: tally.done,
      noop: tally.noop,
      failed: tally.failed,
      dead: tally.dead,
      api_calls: ctx.apiCalls,
      error: clip(message, ERROR_CHARS),
    });
    return { ok: false, error: message };
  }
}

/** Short and unique per pass, so `locked_by` tells two concurrent workers apart in the admin. */
function randomWorkerId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

/**
 * The one line a route adds after its own write.
 *
 * Equivalent to `runCrmOutbox({ trigger: "inline", maxJobs: 3, budgetMs: 4000 })`,
 * which is what the existing call sites spell out. Use this from anything new:
 * it cannot get the budget wrong and it cannot reject inside `after()`.
 */
export async function nudgeCrmOutbox(): Promise<void> {
  try {
    const result = await runCrmOutbox({ trigger: "inline", maxJobs: 3, budgetMs: 4_000 });
    if (!result.ok) console.error("[crm outbox] inline nudge failed", result.error);
  } catch (err) {
    console.error("[crm outbox] inline nudge threw", err instanceof Error ? err.message : String(err));
  }
}

/**
 * An erasure request: queue the CRM half, then tombstone the address.
 *
 * Call it BEFORE deleting our own row. Deleting a subscriber alone left their
 * CRM contact tagged for the newsletter and mailable, so the person who asked
 * to be forgotten kept receiving campaigns. The erase job suppresses email on
 * their side and tags the contact erased; it never creates a contact, so an
 * address the CRM never held costs nothing.
 *
 * Queue first, tombstone second, because crm_enqueue refuses an address that
 * is already tombstoned. Enqueued whatever the switches say: the job waits in
 * the queue until outbound is on, and an erasure must not depend on a setting.
 *
 * The tombstone outlives the subscriber row on purpose and holds only the
 * email key. From then on nothing re-creates this person in the CRM, including
 * a later booking or purchase: /admin/crm shows the address as erased.
 */
export async function requestCrmErasure(email: string): Promise<boolean> {
  const key = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!key) return false;
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error } = await supabase.rpc("crm_enqueue", {
    p_kind: "contact.erase",
    p_idem_key: `contact.erase:${key}`,
    p_email_key: key,
    p_subject_type: "admin",
    p_subject_id: null,
    p_payload: {},
  });
  if (error) {
    console.error("[crm outbox] could not queue an erasure", error.message);
    return false;
  }
  return markCrmContactErased(key);
}

// ---------------------------------------------------------------------------
// The dead-letter surface on /admin/crm.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validIds = (ids: string[]): string[] => [...new Set((ids ?? []).filter((id) => typeof id === "string" && UUID_RE.test(id)))];

/**
 * Put rows back in the queue, attempts reset to zero.
 *
 * Only rows that have stopped: a 'pending' row is already due and a 'sending'
 * row is held by a worker, so retrying either would double the work.
 */
export async function retryOutbox(ids: string[], by: string): Promise<number> {
  const clean = validIds(ids);
  if (!clean.length) return 0;
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from("crm_outbox")
    .update({
      status: "pending",
      attempts: 0,
      next_attempt_at: nowIso(),
      locked_at: null,
      locked_by: null,
      last_error: null,
      last_http_status: null,
      completed_at: null,
      updated_at: nowIso(),
    })
    .in("id", clean)
    .in("status", ["failed", "dead", "discarded"])
    .select("id,email_key");
  if (error) {
    console.error("[crm outbox] retry failed", error.message);
    return 0;
  }

  const retried = (data ?? []) as { id: string; email_key: string }[];
  // The owner has dealt with it, so the cards come out of Needs action now
  // rather than waiting for the retry to succeed: if it fails again the next
  // pass raises a fresh one. The contact-level cards are keyed by email rather
  // than by row, so they need their own call or a fixed mismatch sits there for good.
  for (const row of retried) {
    await resolveAdminNotifications({ events: ["crm.sync_stuck"], entityId: row.id, by });
    await resolveAdminNotifications({
      events: ["crm.contact_mismatch", "crm.dnd_conflict"],
      entityId: row.email_key,
      by,
    });
  }
  console.error(`[crm outbox] ${retried.length} job(s) re-queued by ${by}`);
  return retried.length;
}

/**
 * Give up on rows, on purpose. Never a delete: the queue is the audit trail of
 * everything we ever tried to tell the CRM, and `last_error` records who
 * decided to stop.
 */
export async function discardOutbox(ids: string[], by: string): Promise<number> {
  const clean = validIds(ids);
  if (!clean.length) return 0;
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const at = nowIso();
  const { data, error } = await supabase
    .from("crm_outbox")
    .update({ status: "discarded", last_error: clip(`discarded by ${by}`, ERROR_CHARS), completed_at: at, updated_at: at })
    .in("id", clean)
    .in("status", ["pending", "failed", "dead"])
    .select("id");
  if (error) {
    console.error("[crm outbox] discard failed", error.message);
    return 0;
  }

  const discarded = (data ?? []) as { id: string }[];
  for (const row of discarded) {
    await resolveAdminNotifications({ events: ["crm.sync_stuck"], entityId: row.id, by });
  }
  return discarded.length;
}

/**
 * The queue panel's numbers. Degrades to zeros rather than throwing, because it
 * renders inside an admin page and an unreadable count must not take the page
 * down with it.
 */
export async function outboxStats(): Promise<{
  pending: number;
  failed: number;
  dead: number;
  oldestPendingAt: string | null;
}> {
  const empty = { pending: 0, failed: 0, dead: 0, oldestPendingAt: null };
  const supabase = getSupabaseAdmin();
  if (!supabase) return empty;

  const countOf = (status: CrmOutboxStatus) =>
    supabase.from("crm_outbox").select("id", { count: "exact", head: true }).eq("status", status);

  const [pending, failed, dead, oldest] = await Promise.all([
    countOf("pending"),
    countOf("failed"),
    countOf("dead"),
    supabase
      .from("crm_outbox")
      .select("created_at")
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  for (const res of [pending, failed, dead, oldest]) {
    if (res.error) {
      console.error("[crm outbox] could not read the queue counts", res.error.message);
      return empty;
    }
  }

  return {
    pending: pending.count ?? 0,
    failed: failed.count ?? 0,
    dead: dead.count ?? 0,
    oldestPendingAt: (oldest.data as { created_at?: string } | null)?.created_at ?? null,
  };
}
