import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { dayKey, notifyAdmins, resolveAdminNotifications } from "@/lib/admin-notify";
import { crmGate, type CrmConfig } from "@/lib/crm/config";
import { getContact } from "@/lib/crm/client";
import { readEmailDnd } from "@/lib/crm/dnd";
import {
  ensureCrmContact,
  getCrmContact,
  getCrmContactByGhlId,
  isCrmContactBlocked,
  rekeyCrmContact,
  setCrmContactDndMirror,
  updateCrmContact,
  type CrmContactRow,
} from "@/lib/crm/identity";
import { normalizeEmail, setSubscriberStatus, type SubscriberStatus } from "@/lib/subscribers-data";
import {
  createBookedCall,
  listBookedCalls,
  refreshGuaranteeStatus,
  updateBookedCall,
  type BookedCall,
  type BookedCallSource,
  type BookedCallStatus,
} from "@/lib/onboarding-data";
import { getClientById } from "@/lib/clients-data";

/**
 * The inbound half of the CRM sync: record every delivery, then apply it.
 *
 * Two rules shape everything here.
 *
 * SUPPRESSION IS MONOTONE. An inbound event may only ever raise how suppressed
 * someone is, never lower it. That is why most disagreements between our record
 * and theirs are not conflicts at all: our unsubscribe and their unsubscribe
 * crossing in flight both converge on suppressed.
 *
 * THE CRM CANNOT MANUFACTURE CONSENT. A DND-off arriving from them is recorded
 * and raised for the owner to confirm; it never flips anyone back to mailable on
 * its own, because a ContactDndUpdate does not say whether a person, a workflow
 * or a staff member cleared the flag, and only the first of those is consent.
 *
 * ERASURE. `deleteSubscriberAction` hard-deletes the subscriber and
 * subscriber_events cascades, so if their contact survives, the next inbound
 * event would recreate the person with no memory of the request. That is closed
 * by the spine, which has no foreign key to subscribers and therefore outlives
 * the delete: every handler below refuses to act on a `crm_contacts` row with
 * `erased_at` set, exactly as `crm_enqueue` does in SQL. The tombstone holds
 * only an email key and CRM state, which is what makes keeping it compatible
 * with the erasure request rather than in tension with it.
 *
 * Nothing in this module throws at its caller. It is driven by a cron pass and
 * by `after()` in the inbound route, and in both places a thrown error would
 * take out the whole pass instead of failing one delivery. The functions that do
 * throw (createBookedCall, updateBookedCall, and anything reached through db())
 * are wrapped, and their failure is recorded on the inbox row for retry.
 */

// The events the marketplace app subscribes to. Anything else is recorded
// 'ignored' with the value kept, plus one notification a day naming what
// arrived, so the account tells us its own vocabulary instead of us guessing it.
export const CRM_INBOUND_EVENTS = [
  "ContactDndUpdate",
  "ContactCreate",
  "ContactUpdate",
  "ContactDelete",
  "ContactTagUpdate",
  "AppointmentCreate",
  "AppointmentUpdate",
  "AppointmentDelete",
] as const;

export type CrmInboundEvent = (typeof CRM_INBOUND_EVENTS)[number];

const KNOWN_EVENTS: ReadonlySet<string> = new Set(CRM_INBOUND_EVENTS);

/**
 * Exactly what getSupabaseAdmin() hands back, so the helpers below take the
 * client this module already checked for null rather than importing the vendor
 * type and inviting a second opinion about which client is meant.
 */
type Supa = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/** Eight tries spans about twelve hours, so a half-day outage costs latency only. */
const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 6 * 60 * 60 * 1000;
/** An unmapped row waits for the owner, so it retries slowly and forever. */
const UNMAPPED_RETRY_MS = 60 * 60 * 1000;
/** Small batches: a pass that runs out of budget mid-batch releases the rest. */
const CLAIM_BATCH = 3;
const DEFAULT_BUDGET_MS = 20_000;
const DEFAULT_MAX_JOBS = 100;
/** Who to record as having changed a client row, so the audit trail says why. */
const ACTOR = "crm-sync";

export type CrmInboxRunResult =
  | {
      ok: true;
      /** The owner switch is off, or the connection is not verified yet. */
      skipped?: boolean;
      reason?: string;
      claimed: number;
      applied: number;
      ignored: number;
      stale: number;
      unmapped: number;
      failed: number;
      dead: number;
    }
  | { ok: false; error: string };

type InboxStatus = "applied" | "ignored" | "stale" | "unmapped" | "failed" | "dead";

/** Keyed by outcome so a pass can count one without a switch that forgets a case. */
type InboxCounts = Record<InboxStatus, number> & { claimed: number };

/** What one handler decided. `detail` is kept on the row so the admin can read it. */
type InboxOutcome =
  | { status: "applied"; detail?: string }
  | { status: "ignored"; detail: string }
  | { status: "stale"; detail: string }
  | { status: "unmapped"; detail: string }
  | { status: "failed"; error: string }
  | { status: "dead"; error: string };

type InboxRow = {
  id: string;
  dedupe_key: string;
  event_type: string;
  location_id: string | null;
  ghl_contact_id: string | null;
  email_key: string | null;
  occurred_at: string | null;
  payload: Record<string, unknown>;
  signature_ok: boolean;
  status: string;
  attempts: number;
  received_at: string;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

const clip = (v: string, max: number): string => (v.length > max ? `${v.slice(0, max)}...` : v);

/** Their timestamps arrive as an ISO string or as epoch millis, depending on the event. */
function toIso(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    return new Date(ms).toISOString();
  }
  const s = str(v);
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim()) : [];
}

// ---------------------------------------------------------------------------
// Reading a delivery
// ---------------------------------------------------------------------------

export type CrmDeliveryFacts = {
  eventType: string;
  /** Their own delivery id. Present, it is the dedupe key; absent, we hash. */
  webhookId: string | null;
  /** The body timestamp, which is what the route's replay window measures. */
  timestamp: string | null;
  locationId: string | null;
  ghlContactId: string | null;
  emailKey: string | null;
  occurredAt: string | null;
  dedupeKey: string;
};

/**
 * Everything the route needs out of a parsed body, in one place.
 *
 * The route deliberately knows nothing about payload shapes: it owns the raw
 * bytes, the signature and the 200, and this module owns what the bytes mean.
 * `webhookId` and `timestamp` are BODY fields on these webhooks, not headers,
 * which is the one thing about them that is easy to get wrong.
 */
export function readDeliveryFacts(payload: unknown): CrmDeliveryFacts {
  const body = asObject(payload);
  const contact = asObject(body.contact);
  const appointment = asObject(body.appointment);

  const eventType = str(body.type) ?? str(body.event) ?? str(body.eventType) ?? "";
  const webhookId = str(body.webhookId) ?? str(body.webhook_id);
  const timestamp = toIso(body.timestamp);
  const locationId = str(body.locationId) ?? str(contact.locationId) ?? str(appointment.locationId);
  const ghlContactId =
    str(body.contactId) ?? str(appointment.contactId) ?? str(contact.id) ?? (eventType.startsWith("Contact") ? str(body.id) : null);
  const emailKey = normalizeEmail(body.email) ?? normalizeEmail(contact.email);
  const occurredAt =
    toIso(body.dateUpdated) ??
    toIso(appointment.dateUpdated) ??
    toIso(contact.dateUpdated) ??
    toIso(body.dateAdded) ??
    timestamp;

  // A content hash only has to be stable for one real event, so it is built
  // from the identity of that event and nothing that varies between retries.
  const dedupeKey =
    webhookId ??
    `sha256:${crypto
      .createHash("sha256")
      .update([eventType, locationId ?? "", ghlContactId ?? str(appointment.id) ?? "", occurredAt ?? ""].join("|"))
      .digest("hex")}`;

  return { eventType, webhookId, timestamp, locationId, ghlContactId, emailKey, occurredAt, dedupeKey };
}

// ---------------------------------------------------------------------------
// Recording a delivery
// ---------------------------------------------------------------------------

export type RecordDeliveryInput = {
  dedupeKey: string;
  eventType: string;
  locationId?: string | null;
  ghlContactId?: string | null;
  emailKey?: string | null;
  occurredAt?: string | null;
  payload: Record<string, unknown>;
  /** Kept as evidence: the signing docs are stale, so what arrived beats what is documented. */
  headers?: Record<string, string> | null;
  signatureOk: boolean;
  /**
   * Overrides the status derived from `signatureOk`: 'stale' for a body outside
   * the replay window, 'dead' for one we could not parse. Both are stored rather
   * than discarded, because a delivery nobody can explain later is worse than a
   * row nobody acts on.
   */
  status?: "pending" | "unverified" | "stale" | "dead";
};

export type RecordDeliveryResult =
  | { ok: true; id: string; duplicate: false }
  | { ok: true; id: null; duplicate: true }
  | { ok: false; error: string };

/**
 * Write the delivery down before anything tries to understand it.
 *
 * The unique index on `dedupe_key` is what makes this the whole replay
 * defence: SQLSTATE 23505 means we have already seen this exact delivery, so
 * the caller answers 200 at once and nothing is applied twice.
 *
 * A failure here must NOT be answered with a 200. There is no durable row, so
 * the sender's own retry is the only remaining copy of the event.
 */
export async function recordDelivery(input: RecordDeliveryInput): Promise<RecordDeliveryResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const status = input.status ?? (input.signatureOk ? "pending" : "unverified");
  const { data, error } = await supabase
    .from("crm_inbox")
    .insert({
      dedupe_key: input.dedupeKey,
      event_type: input.eventType || "unknown",
      location_id: input.locationId ?? null,
      ghl_contact_id: input.ghlContactId ?? null,
      email_key: input.emailKey ?? null,
      occurred_at: input.occurredAt ?? null,
      payload: input.payload,
      headers: input.headers ?? null,
      signature_ok: input.signatureOk,
      status,
      // A delivery we will never apply is closed on the spot, so it never shows
      // up as due work. 'pending' and 'unverified' stay open on purpose: the
      // first is processed, the second is evidence the owner should look at.
      processed_at: status === "stale" || status === "dead" ? new Date().toISOString() : null,
    })
    .select("id")
    .maybeSingle();

  // supabase-js reports a failed write in `error` rather than throwing, so an
  // unchecked insert here would acknowledge a DND event that was never stored.
  if (error) {
    if (error.code === "23505") return { ok: true, id: null, duplicate: true };
    console.error("[crm inbox] could not record a delivery", error.message);
    return { ok: false, error: error.message };
  }
  if (!data?.id) return { ok: false, error: "the delivery insert returned no row" };
  return { ok: true, id: String(data.id), duplicate: false };
}

// ---------------------------------------------------------------------------
// The identity spine
//
// Owned by lib/crm/identity.ts, which holds emailKey() and every read and write
// of public.crm_contacts. Nothing here touches that table directly: one
// definition of the tombstone rule, the mismatch block and the mirror is the
// whole reason a handler can be this short.
// ---------------------------------------------------------------------------

/**
 * Why a handler must not touch a contact, phrased as an inbox outcome.
 *
 * `erased_at` is the tombstone and is final. A mismatch block means a contact
 * upsert once handed us somebody else's record, so the contact id we hold may
 * belong to a stranger: acting on their DND flag would move OUR subscriber's
 * consent on the strength of a stranger's. Both are recorded and left for the
 * owner rather than retried, because neither will resolve itself.
 */
function blockedOutcome(row: CrmContactRow): InboxOutcome | null {
  if (row.erased_at) {
    return { status: "ignored", detail: "the contact asked to be erased, so nothing inbound is applied to them" };
  }
  if (isCrmContactBlocked(row)) {
    return { status: "unmapped", detail: `${row.email_key} is flagged as a wrong-contact match, so nothing is applied until that is resolved` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Contact DND, the consent leg
// ---------------------------------------------------------------------------

type Subscriber = { id: string; status: SubscriberStatus };

async function subscriberByEmail(
  supabase: Supa,
  emailKey: string,
): Promise<{ ok: true; row: Subscriber | null } | { ok: false; error: string }> {
  // Matched on the plain column: every writer normalizes before storing, and
  // migration 1 adds subscribers_email_plain_idx so this is an index lookup
  // rather than the sequential scan the expression-only index used to force.
  const { data, error } = await supabase.from("subscribers").select("id,status").eq("email", emailKey).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, row: null };
  return { ok: true, row: { id: String(data.id), status: data.status as SubscriberStatus } };
}

/**
 * Learn the email behind a contact id we have never seen, so the leg also works
 * for contacts the owner made by hand or a workflow created. One GET, only on
 * the cold path, and only when the inbound gate is open.
 */
async function learnContact(
  cfg: CrmConfig,
  contactId: string,
): Promise<{ ok: true; row: CrmContactRow } | { ok: false; outcome: InboxOutcome }> {
  const res = await getContact(cfg, contactId);
  if (!res.ok) {
    if (res.error.code === "not_found") {
      return { ok: false, outcome: { status: "ignored", detail: `contact ${contactId} no longer exists in the CRM` } };
    }
    // Auth failures are retried rather than killed here. The outbox owns the
    // health flip that stops the whole integration, and once it flips the gate
    // refuses this call before it is made, so there is nothing to duplicate.
    return { ok: false, outcome: { status: "failed", error: `could not read contact ${contactId}: ${res.error.message}` } };
  }

  const email = normalizeEmail(res.data.email);
  if (!email) {
    return { ok: false, outcome: { status: "ignored", detail: `contact ${contactId} has no email address` } };
  }
  const row = await ensureCrmContact(email, res.data.email);
  // null is either a database problem or a row we cannot create, and both are
  // worth another attempt: the alternative is dropping a consent change.
  if (!row) return { ok: false, outcome: { status: "failed", error: `could not create the spine row for ${email}` } };
  return { ok: true, row };
}

async function handleDndUpdate(supabase: Supa, row: InboxRow, cfg: CrmConfig): Promise<InboxOutcome> {
  const body = row.payload;
  const contactId = row.ghl_contact_id ?? str(body.id) ?? str(body.contactId);
  if (!contactId) return { status: "dead", error: "a DND event with no contact id cannot be resolved to anyone" };

  // Their DND payload carries `id` and `locationId` but no email, so the stored
  // contact id is what makes this event attachable to anyone at all. When we do
  // not recognise it, one GET buys the address.
  let spine = await getCrmContactByGhlId(contactId);
  if (!spine) {
    const learned = await learnContact(cfg, contactId);
    if (!learned.ok) return learned.outcome;
    spine = learned.row;
  }

  const blocked = blockedOutcome(spine);
  if (blocked) return blocked;

  const emailKey = spine.email_key;
  const contact = asObject(body.contact);
  const dndSettings = body.dndSettings ?? contact.dndSettings;
  const globalDnd = typeof body.dnd === "boolean" ? body.dnd : contact.dnd;
  const read = readEmailDnd(dndSettings, globalDnd);
  let state = read.state;

  if (read.conflict) {
    // The tripwire for having the polarity backwards. Read wrong, a DND-ON
    // event looks like "contactable" and we quietly keep mailing someone who
    // opted out, so a disagreement with the unambiguous global flag is raised
    // rather than resolved in code.
    await notifyAdmins({
      event: "crm.dnd_conflict",
      title: "The CRM's consent flags disagree with each other",
      body: `${emailKey} · email DND reads "${state}" while the contact-wide flag says ${String(globalDnd)}. Check the polarity before trusting either side.`,
      url: "/admin/crm",
      entity: { type: "crm_contact", id: emailKey },
      dedupeKey: `crm_conflict:${emailKey}`,
      data: { email_key: emailKey, email_state: state, global_dnd: globalDnd, contact_id: contactId },
    });
  }

  if (state === "unknown" && globalDnd === true) {
    // The contact-wide boolean is unambiguous and covers email among every
    // other channel, so a payload we cannot read the email channel out of still
    // tells us this person is suppressed. Monotone, so acting on it is safe.
    state = "active";
  }
  if (state === "unknown") {
    return { status: "ignored", detail: "no readable email DND state in the delivery" };
  }

  const suppression = state === "active" || state === "permanent";
  // Their clock is not ours, so occurred_at breaks ties one way only: an old
  // delivery is dropped, UNLESS it suppresses, which is applied regardless.
  // A stale replay can therefore never un-suppress anyone.
  const occurredAt = row.occurred_at;
  if (!suppression && occurredAt && spine.ghl_dnd_at && Date.parse(occurredAt) < Date.parse(spine.ghl_dnd_at)) {
    return { status: "stale", detail: `delivery from ${occurredAt} is older than what we already applied (${spine.ghl_dnd_at})` };
  }

  // The mirror is written BEFORE our own status. The status write fires the
  // enqueue trigger, and by the time that job is claimed the mirror already
  // agrees with what the CRM holds, so the echo completes as a noop with no API
  // call at all. Self-healing rather than flag-dependent: if the mirror is ever
  // wrong the job runs, corrects them, and converges.
  const mirrored = await setCrmContactDndMirror(emailKey, {
    state,
    code: read.code,
    occurredAt: occurredAt ?? row.received_at,
    ghlContactId: contactId,
    ghlLocationId: row.location_id,
  });
  // The tombstone and the mismatch block were both checked above, so a refusal
  // here is a write that failed and is worth another attempt.
  if (!mirrored) return { status: "failed", error: `could not record the DND mirror for ${emailKey}` };

  const subscriber = await subscriberByEmail(supabase, emailKey);
  if (!subscriber.ok) return { status: "failed", error: subscriber.error };
  if (!subscriber.row) {
    // A DND flag on somebody who never subscribed is not our consent record.
    // Left unmapped rather than applied: if they subscribe later, the retry
    // meets the choke point's staleness guard and loses to their fresh consent.
    return { status: "unmapped", detail: `${emailKey} is not one of our subscribers, so their DND state is recorded and nothing else` };
  }

  const ours = subscriber.row.status;

  if (suppression) {
    if (ours !== "active") {
      return { status: "applied", detail: `mirror recorded; we already hold ${ours}, so no second history row was written` };
    }
    const applied = await setSubscriberStatus({
      match: { by: "email", email: emailKey },
      status: "unsubscribed",
      // 'permanent' maps to unsubscribed, never to bounced or complained: their
      // enum cannot tell a hard bounce from a spam complaint from a carrier
      // opt-out, and picking one would invent a fact a regulator may ask about.
      source: state === "permanent" ? "ghl_permanent" : "ghl",
      // Their delivery must not overwrite a decision the person made on our own
      // site afterwards. received_at is the fallback so there is always a bound.
      notNewerThan: occurredAt ?? row.received_at,
    });
    if (applied.ok) {
      // No notifyAdmins here. subscribers_log_event writes the history row and
      // notify_admin_subscriber_event puts it in the owner's inbox already, so
      // a second call would report one unsubscribe twice.
      return { status: "applied", detail: applied.changed ? `suppressed from the CRM (${state})` : "already suppressed" };
    }
    if (applied.reason === "stale") {
      return { status: "stale", detail: "our row moved after this event, so the delivery lost" };
    }
    if (applied.reason === "notfound") {
      return { status: "unmapped", detail: `${emailKey} is no longer one of our subscribers` };
    }
    if (applied.reason === "refused") {
      return { status: "applied", detail: "the address is bounced or complained, which is the harder signal, so it was left alone" };
    }
    return { status: "failed", error: `status write refused: ${applied.reason}` };
  }

  // Inbound DND-off. Recorded, never applied. The CRM cannot manufacture
  // consent: only a person acting on a Tekmadev surface creates a consent
  // record, and their payload does not say who cleared the flag.
  if (ours === "unsubscribed") {
    await notifyAdmins({
      event: "crm.resubscribe_requested",
      title: "Someone was marked mailable again in the CRM",
      body: `${emailKey} · their CRM contact is no longer suppressed, but our record still says unsubscribed. Confirm it on the CRM page if this was the person's own choice.`,
      url: "/admin/crm",
      entity: { type: "crm_contact", id: emailKey },
      // Per distinct event, so a redelivery is silent while a second genuine
      // request weeks later is its own row rather than a write that vanishes.
      dedupeKey: `crm_resub:${emailKey}:${occurredAt ?? row.id}`,
      // The subscriber id travels with it so the owner's confirm action can
      // resolve this row without having to look the person up again.
      data: { email_key: emailKey, subscriber_id: subscriber.row.id, contact_id: contactId, occurred_at: occurredAt },
    });
    return { status: "applied", detail: "mirror recorded; a resubscribe needs the owner to confirm it" };
  }
  if (ours === "bounced" || ours === "complained") {
    return { status: "applied", detail: `mirror recorded; ${ours} is never revived, so no offer was raised` };
  }
  return { status: "applied", detail: "mirror recorded; both sides already agree this address is mailable" };
}

// ---------------------------------------------------------------------------
// Contact identity and tags, no consent effect
// ---------------------------------------------------------------------------

/**
 * Their side changed an address. Because the spine stores their contact id we
 * CAN say who this is, which is the whole argument for storing it, so our row
 * is re-keyed and `subscribers.email` is left exactly as it is: the address the
 * person gave us is our consent record, and it is not theirs to rewrite.
 *
 * Nothing here creates a spine row for a contact we do not already hold. The
 * owner's sub-account has contacts from sources that have nothing to do with
 * this site, and seeding the spine with all of them would put every one of them
 * in the reconciler's cursor for good.
 */
async function handleContactUpdate(row: InboxRow): Promise<InboxOutcome> {
  const body = row.payload;
  const contactId = row.ghl_contact_id ?? str(body.id) ?? str(body.contactId);
  if (!contactId) return { status: "dead", error: "a contact event with no contact id cannot be resolved to anyone" };

  const emailKey = row.email_key ?? normalizeEmail(body.email) ?? normalizeEmail(asObject(body.contact).email);
  if (!emailKey) return { status: "ignored", detail: "no email address in the delivery, so there is nothing to re-key" };

  const byId = await getCrmContactByGhlId(contactId);
  if (byId) {
    const blocked = blockedOutcome(byId);
    if (blocked) return blocked;
  }

  const tags = asStrings(body.tags);

  // Same address, so this is an ordinary profile edit. Their tags are worth
  // mirroring because it saves us issuing tag writes that would change nothing.
  if (byId && byId.email_key === emailKey) {
    if (!tags.length) return { status: "ignored", detail: "nothing changed that we hold" };
    if (!(await updateCrmContact(emailKey, { ghl_tags: tags }))) {
      return { status: "failed", error: `could not mirror tags for ${emailKey}` };
    }
    return { status: "applied", detail: `tags mirrored for ${emailKey}` };
  }

  const byEmail = await getCrmContact(emailKey);
  if (byEmail) {
    const blocked = blockedOutcome(byEmail);
    if (blocked) return blocked;
  }
  if (!byId && !byEmail) {
    return { status: "ignored", detail: `we hold neither contact ${contactId} nor ${emailKey}` };
  }

  if (byId) {
    const moved = await rekeyCrmContact(byId.email_key, emailKey);
    if (!moved.ok) {
      // 'notfound' and 'erased' are answers, not failures: another pass got
      // there first, or the row is a tombstone. Only a database problem retries.
      if (moved.reason === "db" || moved.reason === "config") {
        return { status: "failed", error: `could not re-key ${byId.email_key} to ${emailKey}` };
      }
      return { status: "ignored", detail: `re-key of ${byId.email_key} was refused: ${moved.reason}` };
    }
    if (tags.length) await updateCrmContact(emailKey, { ghl_tags: tags });

    // Worth one notification. Two addresses for one person is a deliverability
    // problem, and whichever of the two is wrong, mail is going somewhere the
    // owner did not intend.
    await notifyAdmins({
      event: "crm.contact_mismatch",
      title: "A CRM contact changed email address",
      body: `${byId.email_key} -> ${emailKey} · the CRM record moved${moved.collision ? ", and we already held that address, so the old row gave up its contact id" : ""}. Our subscriber address is unchanged, so check which of the two is current.`,
      url: "/admin/crm",
      entity: { type: "crm_contact", id: emailKey },
      dedupeKey: `crm_rekey:${contactId}:${emailKey}`,
      data: { from: byId.email_key, to: emailKey, contact_id: contactId, collision: moved.collision },
    });
    return { status: "applied", detail: `re-keyed ${byId.email_key} -> ${emailKey}${moved.collision ? " (collision)" : ""}` };
  }

  // We hold the address but not their id for it. Filling that gap is what lets
  // the next DND event about this contact be attached to anyone.
  const filled = await updateCrmContact(emailKey, {
    ...(byEmail?.ghl_contact_id ? {} : { ghl_contact_id: contactId }),
    ...(row.location_id && !byEmail?.ghl_location_id ? { ghl_location_id: row.location_id } : {}),
    ...(tags.length ? { ghl_tags: tags } : {}),
  });
  if (!filled) return { status: "failed", error: `could not attach contact ${contactId} to ${emailKey}` };
  return { status: "applied", detail: `contact id attached to ${emailKey}` };
}

async function handleContactDelete(row: InboxRow): Promise<InboxOutcome> {
  const contactId = row.ghl_contact_id ?? str(row.payload.id) ?? str(row.payload.contactId);
  if (!contactId) return { status: "dead", error: "a delete event with no contact id cannot be resolved to anyone" };

  const spine = await getCrmContactByGhlId(contactId);
  if (!spine) return { status: "ignored", detail: "we never held that contact id" };
  if (spine.erased_at) return { status: "ignored", detail: "the contact is already erased at our end" };

  // Back to pending, so the next real event recreates them. subscribers is
  // untouched: they deleted a record in their own system, which says nothing
  // about whether the person consented to hear from us.
  //
  // ghl_dnd_at is deliberately left in place. It is the floor the staleness
  // check measures against, and clearing it would let an old replay look fresh.
  const reset = await updateCrmContact(spine.email_key, {
    ghl_contact_id: null,
    ghl_dnd_email: "unknown",
    ghl_dnd_code: null,
    ghl_tags: [],
    synced_at: null,
  });
  if (!reset) return { status: "failed", error: `could not reset the spine row for ${spine.email_key}` };
  return { status: "applied", detail: `${spine.email_key} was deleted in the CRM; our spine row is back to pending` };
}

/**
 * ContactCreate and ContactTagUpdate. No consent effect at all: the mirror
 * records every tag they hold, including the ones their own workflows applied,
 * and it exists so we do not spend API calls re-applying a tag that is already
 * there. Nothing here decides which tags we own, so nothing is filtered.
 */
async function handleContactTags(row: InboxRow): Promise<InboxOutcome> {
  const body = row.payload;
  const contactId = row.ghl_contact_id ?? str(body.id) ?? str(body.contactId);
  const emailKey = row.email_key ?? normalizeEmail(body.email) ?? normalizeEmail(asObject(body.contact).email);

  let spine: CrmContactRow | null = contactId ? await getCrmContactByGhlId(contactId) : null;
  if (!spine && emailKey) spine = await getCrmContact(emailKey);
  // Same reason as handleContactUpdate: a tag on a contact we do not hold is
  // not ours to start tracking, and tags carry no consent to lose.
  if (!spine) return { status: "ignored", detail: "we hold no contact for this delivery" };
  const blocked = blockedOutcome(spine);
  if (blocked) return blocked;

  const written = await updateCrmContact(spine.email_key, {
    ghl_tags: asStrings(body.tags),
    // Only ever fills a gap. Re-pointing an id is a re-key, which is
    // handleContactUpdate's job because the unique constraint lives there.
    ...(contactId && !spine.ghl_contact_id ? { ghl_contact_id: contactId } : {}),
    ...(row.location_id && !spine.ghl_location_id ? { ghl_location_id: row.location_id } : {}),
  });
  if (!written) return { status: "failed", error: `could not mirror tags for ${spine.email_key}` };
  return { status: "applied", detail: `tags mirrored for ${spine.email_key}` };
}

// ---------------------------------------------------------------------------
// Client appointments, which feed the guarantee counter
// ---------------------------------------------------------------------------

type LocationMapping = { client_id: string | null; is_agency: boolean; qualifying_calendar_ids: string[] };

/**
 * Their source vocabulary onto ours, which needs no migration because
 * client_booked_calls.source is CHECK-constrained and is rendered to the client
 * in the portal. Nothing vendor-named may reach that column; the vendor's own
 * string stays in `raw`, where only we read it.
 */
function mapSource(raw: string | null): BookedCallSource {
  const v = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "booking_widget" || v === "calendar" || v === "widget") return "calendar";
  if (v === "form" || v === "survey" || v === "web_form") return "web_form";
  if (v === "chat_widget" || v === "chat" || v === "conversation_ai") return "chat";
  if (v === "sms" || v === "missed_call" || v === "missed_call_textback") return "missed_call_textback";
  return "other";
}

function mapStatus(raw: string | null, deleted: boolean): BookedCallStatus {
  // A deleted appointment is cancelled whatever the payload's own status says.
  // Reading it as anything else would let a removed appointment sit in a
  // publicly guaranteed count.
  if (deleted) return "cancelled";
  const v = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "confirmed") return "confirmed";
  if (v === "showed" || v === "showedup" || v === "showed_up") return "showed";
  if (v === "noshow" || v === "no_show") return "no_show";
  if (v === "cancelled" || v === "canceled") return "cancelled";
  if (v === "rescheduled") return "rescheduled";
  // 'invalid' is their own word for an appointment that is not real, so it is
  // read as cancelled rather than falling through to the booked default.
  if (v === "invalid") return "cancelled";
  return "booked";
}

async function handleAppointment(supabase: Supa, row: InboxRow, cfg: CrmConfig): Promise<InboxOutcome> {
  const body = row.payload;
  const appt = asObject(body.appointment);
  // Their platform webhooks nest the appointment on some events and flatten it
  // on others, so both shapes are read and neither is assumed.
  const pick = (key: string): unknown => (appt[key] !== undefined ? appt[key] : body[key]);

  const apptId = str(pick("id")) ?? str(body.appointmentId);
  if (!apptId) return { status: "dead", error: "an appointment event with no appointment id cannot be recorded without duplicating" };

  const locationId = row.location_id ?? str(pick("locationId"));
  if (!locationId) {
    return { status: "unmapped", detail: "the appointment carried no location id, so it cannot be matched to a client" };
  }

  // Our own sales sub-account, recognised from the token's own location rather
  // than from a mapping row nobody would think to create. Its bookings are
  // prospects booking us, which the Cal webhook already records as leads; left
  // to the mapping lookup they would sit as "unmapped" forever and keep asking
  // the owner to assign his own account to a client.
  if (locationId === cfg.locationId) {
    return { status: "ignored", detail: "the appointment is on our own sales sub-account" };
  }

  const { data: mappingRow, error: mappingError } = await supabase
    .from("crm_locations")
    .select("client_id,is_agency,qualifying_calendar_ids")
    .eq("ghl_location_id", locationId)
    .maybeSingle();
  if (mappingError) return { status: "failed", error: mappingError.message };

  const mapping = (mappingRow as LocationMapping | null) ?? null;
  // Checked before the client, because an agency row has no client by design
  // and would otherwise be held as unmapped.
  if (mapping?.is_agency) {
    return { status: "ignored", detail: "the appointment is on our own sales sub-account" };
  }
  if (!mapping || !mapping.client_id) {
    // Never silently dropped: unmapped is due work, not a dead end, and it
    // applies the moment the owner maps the sub-account.
    await notifyAdmins({
      event: "crm.inbound_unmapped",
      title: "An appointment arrived for an account we cannot place",
      body: `Sub-account ${locationId} is not mapped to a client, so its appointments are held and none of them count toward a guarantee yet. Open the client it belongs to and paste this id under CRM account. The held appointments apply as soon as you save.`,
      url: "/admin/clients",
      entity: { type: "crm_location", id: locationId },
      dedupeKey: `crm_unmapped:${locationId}`,
      data: { location_id: locationId, appointment_id: apptId, event: row.event_type },
    });
    return { status: "unmapped", detail: `sub-account ${locationId} is not mapped to a client` };
  }

  const clientId = mapping.client_id;
  let existing: BookedCall | null = null;
  try {
    const client = await getClientById(clientId);
    if (!client) {
      return { status: "unmapped", detail: `sub-account ${locationId} points at a client that no longer exists` };
    }
    if (client.deleted_at) return { status: "ignored", detail: "the mapped client is deleted" };
    // client_booked_calls has no livemode column of its own, so sandbox
    // isolation happens at the client level.
    if (client.is_test) return { status: "ignored", detail: "the mapped client is a test account" };

    const calls = await listBookedCalls(clientId, 2000);
    existing = calls.find((c) => c.external_id === `ghl:${apptId}`) ?? null;
  } catch (err) {
    // Everything reached through db() throws when Supabase is absent, and the
    // client readers throw on a failed query, so a failure here is a retry
    // rather than something that takes the pass down.
    return { status: "failed", error: `could not read the client: ${err instanceof Error ? err.message : String(err)}` };
  }

  const deleted = row.event_type === "AppointmentDelete";
  const status = mapStatus(str(pick("appointmentStatus")) ?? str(pick("status")), deleted);
  const calendarId = str(pick("calendarId"));
  const contactId = str(pick("contactId")) ?? row.ghl_contact_id;

  // Their appointment payload carries no email, so the address on the call comes
  // from the spine when we happen to hold that contact. Absent is fine: the
  // appointment is what counts, and the whole payload is kept in `raw`.
  let contactEmail = row.email_key;
  if (!contactEmail && contactId) contactEmail = (await getCrmContactByGhlId(contactId))?.email_key ?? null;

  // The contact is sometimes nested and sometimes named inline, so both are
  // read. Nothing here is required: the appointment matters, the label on it
  // does not, and `raw` keeps whatever we did not map.
  const nested = asObject(pick("contact"));
  const joinedName = [str(nested.firstName), str(nested.lastName)].filter(Boolean).join(" ");
  const contactName = str(pick("contactName")) ?? str(nested.name) ?? (joinedName === "" ? null : joinedName);
  const title = str(pick("title"));

  // Only the fields their side owns. qualified, disqualified_reason, notes,
  // reviewed_by and reviewed_at are never in here, so an update delivered after
  // the owner reviewed an appointment cannot undo his decision.
  const vendorFields = {
    source: mapSource(str(pick("source"))),
    status,
    contact_name: contactName,
    contact_phone: str(pick("phone")) ?? str(nested.phone),
    contact_email: contactEmail,
    service_requested: title ? clip(title, 200) : null,
    booked_for: toIso(pick("startTime")),
    raw: body,
  };

  // Empty means every calendar counts. When it is set, the promise is
  // "schedules through the system we built", so anything else is data the owner
  // decided on rather than code guessing.
  const qualifyingIds = Array.isArray(mapping.qualifying_calendar_ids) ? mapping.qualifying_calendar_ids : [];
  const offAllowlist = qualifyingIds.length > 0 && (!calendarId || !qualifyingIds.includes(calendarId));

  try {
    if (existing) {
      await updateBookedCall(existing.id, vendorFields);
    } else {
      await createBookedCall({
        client_id: clientId,
        // Always non-null. The unique index is (client_id, external_id) and
        // Postgres treats nulls as distinct, so a null external_id would insert
        // a fresh duplicate on every single delivery instead of conflicting.
        external_id: `ghl:${apptId}`,
        booked_at: toIso(pick("dateAdded")) ?? row.occurred_at ?? row.received_at,
        ...vendorFields,
        // Appointments wait for the owner's confirmation, so nothing counts
        // toward the guarantee until he says it does. The column defaults to
        // true, which is why this is written explicitly.
        qualified: false,
        ...(offAllowlist
          ? {
              disqualified_reason: "other" as const,
              notes: `Booked on calendar ${calendarId ?? "unknown"}, which is not one of the calendars that count toward this guarantee.`,
            }
          : {}),
      });
    }
  } catch (err) {
    // createBookedCall and updateBookedCall throw on a failed write. Caught, so
    // the failure lands on the inbox row and the cron tries it again.
    return { status: "failed", error: `could not save the appointment: ${err instanceof Error ? err.message : String(err)}` };
  }

  try {
    // Every writer of a booked call has to call this. An automated writer that
    // skips it leaves guarantee_status on 'running' for good, so the client is
    // never told they hit the number they were promised.
    await refreshGuaranteeStatus(clientId, ACTOR);
  } catch (err) {
    console.error("[crm inbox] guarantee refresh failed", err instanceof Error ? err.message : String(err));
  }

  await notifyAdmins({
    event: "client.appointment_booked",
    title: "An appointment came in and needs reviewing",
    body: [
      contactName ?? contactEmail ?? "Someone",
      vendorFields.booked_for
        ? new Date(vendorFields.booked_for).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" })
        : null,
      status === "booked" ? null : status.replace("_", " "),
      offAllowlist ? "not on a qualifying calendar" : null,
    ]
      .filter(Boolean)
      .join(" · "),
    url: `/admin/clients/${clientId}#calls`,
    entity: { type: "booked_call", id: `ghl:${apptId}` },
    clientId,
    // Per real-world state: a status change is its own notification, a retried
    // delivery of the same one is not.
    dedupeKey: `crm_appt:${apptId}:${status}`,
    data: { appointment_id: apptId, location_id: locationId, status, calendar_id: calendarId, qualifies: !offAllowlist },
  });

  return { status: "applied", detail: `${existing ? "updated" : "recorded"} appointment ${apptId} as ${status}` };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

let lastUnknownEventAlert = "";

/**
 * One notification a day naming what arrived, so the account tells us its own
 * vocabulary instead of us designing around an assumed event name.
 */
async function reportUnknownEvent(supabase: Supa, eventType: string): Promise<void> {
  const key = dayKey("crm_unknown_event");
  if (lastUnknownEventAlert === key) return;
  lastUnknownEventAlert = key;

  // The names from the last day, so the notification lists the vocabulary
  // rather than whichever one happened to arrive first.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("crm_inbox")
    .select("event_type")
    .eq("status", "ignored")
    .gte("received_at", since)
    .limit(200);
  if (error) console.error("[crm inbox] could not list unhandled events", error.message);

  const names = new Set<string>([eventType]);
  for (const r of data ?? []) {
    const name = str((r as { event_type?: unknown }).event_type);
    if (name && !KNOWN_EVENTS.has(name)) names.add(name);
  }

  await notifyAdmins({
    event: "crm.sync_stuck",
    title: "The CRM is sending events nothing here handles",
    body: `${[...names].join(", ")} · these deliveries are stored and ignored. Either unsubscribe them in the CRM app or say what they should do.`,
    url: "/admin/crm",
    dedupeKey: key,
    collapse: true,
    data: { events: [...names] },
  });
}

async function dispatch(supabase: Supa, row: InboxRow, cfg: CrmConfig): Promise<InboxOutcome> {
  switch (row.event_type) {
    case "ContactDndUpdate":
      return handleDndUpdate(supabase, row, cfg);
    case "ContactUpdate":
      return handleContactUpdate(row);
    case "ContactDelete":
      return handleContactDelete(row);
    case "ContactCreate":
    case "ContactTagUpdate":
      return handleContactTags(row);
    case "AppointmentCreate":
    case "AppointmentUpdate":
    case "AppointmentDelete":
      return handleAppointment(supabase, row, cfg);
    default: {
      await reportUnknownEvent(supabase, row.event_type);
      return { status: "ignored", detail: `no handler for "${row.event_type}"` };
    }
  }
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

/** Jittered so a backlog of rows that failed together does not retry in lockstep. */
function backoffMs(attempts: number): number {
  const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

async function recordOutcome(supabase: Supa, row: InboxRow, outcome: InboxOutcome): Promise<InboxStatus> {
  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  let final: InboxStatus = outcome.status;

  if (outcome.status === "failed") {
    if (row.attempts >= MAX_ATTEMPTS) {
      final = "dead";
      patch = { status: "dead", last_error: clip(outcome.error, 1000), processed_at: now, locked_at: null };
    } else {
      patch = {
        status: "failed",
        last_error: clip(outcome.error, 1000),
        next_attempt_at: new Date(Date.now() + backoffMs(row.attempts)).toISOString(),
        locked_at: null,
      };
    }
  } else if (outcome.status === "unmapped") {
    // Deliberately not subject to the attempt cap: an unmapped delivery is
    // waiting for the owner, and killing it would silently drop the appointment
    // the design exists to never drop. processed_at stays null so it stays due.
    patch = {
      status: "unmapped",
      last_error: clip(outcome.detail, 1000),
      next_attempt_at: new Date(Date.now() + UNMAPPED_RETRY_MS).toISOString(),
      locked_at: null,
    };
  } else if (outcome.status === "dead") {
    patch = { status: "dead", last_error: clip(outcome.error, 1000), processed_at: now, locked_at: null };
  } else {
    patch = {
      status: outcome.status,
      last_error: outcome.detail ? clip(outcome.detail, 1000) : null,
      processed_at: now,
      locked_at: null,
    };
  }

  const { error } = await supabase.from("crm_inbox").update(patch).eq("id", row.id);
  // Nothing to escalate to: the row stays 'processing' and the claim function
  // reclaims it after five minutes, which is the same recovery a killed function
  // gets. Logged so it is not invisible.
  if (error) console.error("[crm inbox] could not record an outcome", row.id, error.message);

  // A delivery that has stopped retrying is a consent change or an appointment
  // nobody applied. The outbox raises the same card for a dead job; without
  // this one a dead unsubscribe would only be visible to someone who happened
  // to open the CRM page. Keyed by row, so a retry that succeeds resolves it.
  if (final === "dead") {
    const why = outcome.status === "failed" || outcome.status === "dead" ? outcome.error : "";
    await notifyAdmins({
      event: "crm.sync_stuck",
      title: `A CRM ${row.event_type} could not be applied`,
      body: [row.email_key, clip(why, 300)].filter(Boolean).join(" · ") || null,
      url: "/admin/crm",
      needsAction: true,
      entity: { type: "crm_inbox", id: row.id },
      dedupeKey: `crm_inbox_dead:${row.id}`,
      data: { event_type: row.event_type, email: row.email_key, attempts: row.attempts },
    });
  }
  return final;
}

/** Hand back rows a pass claimed but ran out of budget for, without burning an attempt. */
async function releaseRows(supabase: Supa, rows: InboxRow[]): Promise<void> {
  const now = new Date().toISOString();
  for (const row of rows) {
    const { error } = await supabase
      .from("crm_inbox")
      .update({ status: "pending", locked_at: null, next_attempt_at: now, attempts: Math.max(0, row.attempts - 1) })
      .eq("id", row.id);
    if (error) console.error("[crm inbox] could not release a claimed row", row.id, error.message);
  }
}

/**
 * Drain the inbox.
 *
 * Called by the cron, and by the owner from the admin. A pass that runs out of
 * budget is not a failure: the queue is a state machine in Postgres, so
 * whatever is left is simply due on the next pass.
 */
export async function runCrmInbox(
  opts: { trigger: "cron" | "manual" | "inline"; maxJobs?: number; budgetMs?: number } = { trigger: "cron" },
): Promise<CrmInboxRunResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const empty: InboxCounts = { claimed: 0, applied: 0, ignored: 0, stale: 0, unmapped: 0, failed: 0, dead: 0 };

  // Gated before anything is claimed, so a switched-off surface never leaves a
  // row marked 'processing' waiting out the five-minute reclaim.
  const gate = await crmGate("inbound");
  if (!gate.ok) return { ok: true, skipped: true, reason: gate.reason, ...empty };

  const counts: InboxCounts = { ...empty };
  const maxJobs = Math.max(1, opts.maxJobs ?? DEFAULT_MAX_JOBS);
  const deadline = Date.now() + Math.max(1000, opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const worker = `inbox:${opts.trigger}:${Date.now()}`;

  let run: { id: string } | null = null;
  let runError: string | null = null;

  // The run row is opened lazily, on the first claimed delivery. Opening one per
  // pass would write a row every ten minutes forever into a table with no
  // index, and a log where every row describes real work is the one worth
  // keeping. A failed claim is still reported through the return value.
  const openRun = async (): Promise<void> => {
    if (run) return;
    const { data, error } = await supabase
      .from("crm_sync_runs")
      .insert({ job: "inbox", trigger: opts.trigger })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[crm inbox] could not open a run row", error.message);
      return;
    }
    run = data?.id ? { id: String(data.id) } : null;
  };

  const finish = async (patch: Record<string, unknown>): Promise<void> => {
    if (!run) return;
    const { error } = await supabase
      .from("crm_sync_runs")
      .update({ finished_at: new Date().toISOString(), ...patch })
      .eq("id", run.id);
    if (error) console.error("[crm inbox] could not close the run row", error.message);
  };

  while (counts.claimed < maxJobs && Date.now() < deadline) {
    const limit = Math.min(CLAIM_BATCH, maxJobs - counts.claimed);
    const { data, error } = await supabase.rpc("crm_inbox_claim", { p_worker: worker, p_limit: limit });
    if (error) {
      runError = `claim failed: ${error.message}`;
      break;
    }
    const batch = (data ?? []) as InboxRow[];
    if (!batch.length) break;

    await openRun();

    for (let i = 0; i < batch.length; i += 1) {
      if (Date.now() >= deadline) {
        await releaseRows(supabase, batch.slice(i));
        break;
      }
      const row = batch[i];
      counts.claimed += 1;
      let outcome: InboxOutcome;
      try {
        outcome = await dispatch(supabase, row, gate.cfg);
      } catch (err) {
        // A handler is not supposed to throw, so this is a bug rather than a
        // condition. Retried, because the alternative is losing the delivery.
        const message = err instanceof Error ? err.message : String(err);
        console.error("[crm inbox] handler threw", row.event_type, row.id, message);
        outcome = { status: "failed", error: `handler threw: ${message}` };
      }
      const final = await recordOutcome(supabase, row, outcome);
      counts[final] += 1;
    }
  }

  if (runError) {
    // Opened even though nothing was claimed: a pass that could not read the
    // queue is exactly what the owner needs to see under "last run".
    await openRun();
    await finish({ status: "error", error: clip(runError, 1000), ...countPatch(counts) });
    console.error("[crm inbox]", runError);
    return { ok: false, error: runError };
  }
  // 'partial' when something needs a person: a dead delivery is one nobody will
  // retry, and an unmapped one is waiting on the owner.
  await finish({ status: counts.dead > 0 || counts.unmapped > 0 ? "partial" : "ok", ...countPatch(counts) });
  return { ok: true, ...counts };
}

/** The run log mirrors ad_sync_runs, which has no inbox-shaped columns of its own. */
function countPatch(counts: InboxCounts): Record<string, number> {
  return {
    claimed: counts.claimed,
    done: counts.applied,
    // 'ignored' and 'stale' are both "we looked and there was nothing to do",
    // which is what noop counts for the outbox as well.
    noop: counts.ignored + counts.stale,
    failed: counts.failed + counts.unmapped,
    dead: counts.dead,
  };
}

/**
 * Apply one delivery, called from `after()` in the inbound route.
 *
 * The route has already answered 200 by the time this runs, which is the point:
 * their reviews pause a webhook URL whose success rate drops, and for DND events
 * a pause is a silent compliance failure. If this never runs, or throws, the row
 * is still `pending` and the cron sweeps it.
 */
export async function processCrmDelivery(id: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return;

    const gate = await crmGate("inbound");
    // Left pending on purpose. The delivery is recorded, and it applies the
    // moment the owner arms the inbound switch.
    if (!gate.ok) return;

    const { data, error } = await supabase.from("crm_inbox").select("*").eq("id", id).maybeSingle();
    if (error) {
      console.error("[crm inbox] could not read a delivery", id, error.message);
      return;
    }
    const row = data as InboxRow | null;
    // An unsigned delivery is never applied, whatever its status says. The
    // claim function holds the same line in SQL; this path skips the claim
    // function, so it has to hold it too.
    if (!row || !row.signature_ok || !["pending", "failed", "unmapped"].includes(row.status)) return;

    // Compare and swap on the status we just read, so the cron and this pass
    // cannot both be holding one delivery.
    const { data: claimed, error: claimError } = await supabase
      .from("crm_inbox")
      .update({ status: "processing", locked_at: new Date().toISOString(), attempts: row.attempts + 1 })
      .eq("id", id)
      .eq("status", row.status)
      .eq("signature_ok", true)
      .select("*")
      .maybeSingle();
    if (claimError) {
      console.error("[crm inbox] could not claim a delivery", id, claimError.message);
      return;
    }
    if (!claimed) return;

    const held = claimed as InboxRow;
    let outcome: InboxOutcome;
    try {
      outcome = await dispatch(supabase, held, gate.cfg);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[crm inbox] handler threw", held.event_type, held.id, message);
      outcome = { status: "failed", error: `handler threw: ${message}` };
    }
    await recordOutcome(supabase, held, outcome);
  } catch (err) {
    // after() callbacks have nobody to reject to, so this is the last catch.
    console.error("[crm inbox] processing threw", id, err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// The dead-letter surface on /admin/crm.
// ---------------------------------------------------------------------------

const INBOX_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanIds = (ids: string[]): string[] =>
  [...new Set((ids ?? []).filter((id) => typeof id === "string" && INBOX_UUID_RE.test(id)))];

/**
 * Put deliveries back in the queue, attempts reset.
 *
 * Signed rows only. An unverified delivery is evidence of what arrived, never
 * an instruction: retrying one would let anybody who can POST to the endpoint
 * suppress an address by waiting for the owner to press a button. The claim
 * function refuses unsigned rows as well; this keeps the button honest about
 * what it did.
 */
export async function retryInbox(ids: string[], by: string): Promise<number> {
  const clean = cleanIds(ids);
  if (!clean.length) return 0;
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from("crm_inbox")
    .update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), locked_at: null, last_error: null })
    .in("id", clean)
    .eq("signature_ok", true)
    .in("status", ["failed", "dead", "unmapped"])
    .select("id,location_id");
  if (error) {
    console.error("[crm inbox] retry failed", error.message);
    return 0;
  }

  const retried = (data ?? []) as { id: string; location_id: string | null }[];
  for (const row of retried) {
    await resolveAdminNotifications({ events: ["crm.sync_stuck"], entityId: row.id, by });
    if (row.location_id) await resolveAdminNotifications({ events: ["crm.inbound_unmapped"], entityId: row.location_id, by });
  }
  return retried.length;
}

/**
 * Stop trying, on purpose. Never a delete: the inbox is the record of what
 * their platform told us, which is exactly what a consent dispute asks for.
 * The table has no 'discarded' status, so it lands as 'ignored' with who
 * decided, which is what 'ignored' already means: seen, deliberately not applied.
 */
export async function discardInbox(ids: string[], by: string): Promise<number> {
  const clean = cleanIds(ids);
  if (!clean.length) return 0;
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const at = new Date().toISOString();
  const { data, error } = await supabase
    .from("crm_inbox")
    .update({ status: "ignored", last_error: clip(`discarded by ${by}`, 1000), processed_at: at, locked_at: null })
    .in("id", clean)
    .in("status", ["pending", "failed", "dead", "unmapped", "unverified"])
    .select("id,location_id");
  if (error) {
    console.error("[crm inbox] discard failed", error.message);
    return 0;
  }

  const discarded = (data ?? []) as { id: string; location_id: string | null }[];
  for (const row of discarded) {
    await resolveAdminNotifications({ events: ["crm.sync_stuck"], entityId: row.id, by });
  }
  return discarded.length;
}
