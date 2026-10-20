import { NextResponse, after, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runCrmOutbox } from "@/lib/crm/outbox";
import { TRIGGER_TAGGED_BOOKING_SOURCES, bookingTagJobs, type BookingTagState } from "@/lib/crm/booking-tags";
import { reportBooking } from "@/lib/meta-conversions";
import { hourKey, notifyAdmins, resolveAdminNotifications } from "@/lib/admin-notify";
import { GROW_LEAD_SOURCE } from "@/config/grow";
import { toLeadStatus } from "@/lib/admin-api/leads/shape";
import { bookingDayTime } from "@/lib/booking-ui";

// HMAC verification needs the raw body, so this must run on Node.
export const runtime = "nodejs";

/**
 * Cal.com webhook (payload version 2021-10-20): every booked call lands on a
 * lead in `leads`, one lead per booking and, where we can tell, one lead per
 * person. Setup is in docs/crm-setup.md ("Cal.com: the booking webhook").
 *
 * What each trigger does:
 *
 *  - BOOKING_CREATED: the lead that owns the uid (a retry), else the /grow
 *    lead named by metadata.lead_ref, else the newest lead with the same email
 *    and no booking from the last 60 days (any source but a free tool or a
 *    portal sign-up), else a new cal_booking lead. Status "booked".
 *  - BOOKING_RESCHEDULED: Cal makes a new booking with a new uid and names
 *    the old one in rescheduleUid. The lead that owns the old uid moves to the
 *    new uid, start and end. Status "booked" (the read side folds the old
 *    stored value "rescheduled" into "booked", and the CRM trigger treats the
 *    two the same, so nothing relies on writing it).
 *  - BOOKING_CANCELLED: status "cancelled" on the lead that owns the uid.
 *    The cancel of a uid a lead was rescheduled away from is ignored.
 *  - A reschedule or cancel of a booking we never recorded is recorded the
 *    way a new booking is (one email, one lead), with its own status.
 *  - BOOKING_LOCATION_UPDATED, BOOKING_NO_SHOW_UPDATED: the stored event and
 *    the booking columns of the lead that owns the uid. The status stays.
 *    For a uid no lead owns they are acknowledged and ignored.
 *  - Anything else (PING, BOOKING_REQUESTED, MEETING_ENDED, ...): 200, ignored.
 *
 * Stored data, which lib/admin-api/leads/booking.ts reads back:
 *
 *  - `raw` is the newest full event `{ triggerEvent, createdAt, payload }`.
 *    A lead that had a raw of its own keeps its own keys next to those three. A location update merges its payload
 *    over the stored one and drops what described the old location; a
 *    no-show update keeps the stored event and only sets `noShow` on the
 *    matching attendees (and `noShowHost`).
 *  - booking_uid, booking_start, booking_end, event_type: the booking.
 *  - A lead the booking was attached to keeps its own name, phone, source and
 *    attribution (blank name and phone are filled in). A new cal_booking lead
 *    gets the booker's name, email (lowercased), phone and the UTM and click
 *    ids the booking carried.
 *  - A lead that reads "won" keeps its status whatever the calendar says.
 *
 * The CRM: the leads trigger (crm_enqueue_from_lead) queues the booked-call
 * tags only for cal_booking and /grow rows, and only when the status changes.
 * queueBookingTags queues the same jobs, with the trigger's keys, for the two
 * writes it misses: a booking on an outreach lead, and a cancel on a won lead.
 * Free tool and portal sign-up leads are never attached to: their trigger
 * branch would queue their own tag again under the booking uid on every
 * status change, re-running that workflow for someone who just booked.
 */

const CREATED = "BOOKING_CREATED";
const RESCHEDULED = "BOOKING_RESCHEDULED";
const CANCELLED = "BOOKING_CANCELLED";
const LOCATION_UPDATED = "BOOKING_LOCATION_UPDATED";
const NO_SHOW_UPDATED = "BOOKING_NO_SHOW_UPDATED";

/** The triggers that set a status, and the status each writes. */
const STATUS_FOR: Record<string, "booked" | "cancelled"> = {
  [CREATED]: "booked",
  [RESCHEDULED]: "booked",
  [CANCELLED]: "cancelled",
};
/** The triggers that change the stored booking and nothing else. */
const UPDATE_TRIGGERS = new Set([LOCATION_UPDATED, NO_SHOW_UPDATED]);
/** Every trigger this route acts on (a bad signature on one of these is worth an alert). */
const BOOKING_TRIGGERS = new Set<string>([...Object.keys(STATUS_FOR), ...UPDATE_TRIGGERS]);

/** The top-level keys of a Cal.com event, replaced as a set on every write. */
const EVENT_KEYS = new Set(["triggerEvent", "createdAt", "payload"]);

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const CLICK_KEYS = ["gclid", "fbclid", "ttclid", "msclkid", "li_fat_id"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How far back an existing lead without a booking still takes a new one. */
const LINK_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
/** Same-email leads read per booking: the newest first, filtered exactly in code. */
const LINK_CANDIDATES = 10;

/**
 * Leads a booking never attaches to by email (they get their own cal_booking
 * lead): the trigger's branch for these re-tags the lead on every status
 * change, scoped on the booking uid once there is one, so a booking would
 * re-arm the free tool or portal workflow. Fixing that needs a migration.
 */
const NEVER_ATTACHED_SOURCES = ["lead_magnet", "portal_signup"] as const;

/** What the webhook reads of a lead before it writes to it. */
const LEAD_COLUMNS = "id,created_at,source,status,name,email,phone,booking_uid,booking_start,raw";

type Db = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type Obj = Record<string, unknown>;

type LeadRow = {
  id: string;
  created_at: string | null;
  source: string | null;
  status: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  booking_uid: string | null;
  booking_start: string | null;
  raw: unknown;
};

/** One delivery, read defensively: Cal leaves fields out and sends other types. */
type CalEvent = {
  trigger: string;
  /** The whole event as delivered, stored in raw. */
  event: Obj;
  payload: Obj;
  uid: string | null;
  /** BOOKING_RESCHEDULED: the old booking's uid. */
  rescheduleUid: string | null;
  /** As Cal sent it, for the notification dedupe key. */
  startText: string | null;
  start: string | null;
  end: string | null;
  /** BOOKING_RESCHEDULED: the old start. */
  previousStart: string | null;
  eventType: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  reason: string | null;
  leadRef: string | null;
  utm: Record<string, string>;
  clickIds: Record<string, string>;
  referrer: string | null;
  landingPage: string | null;
};

/** What a write did, for the notification and the follow-ups. */
type Recorded = {
  leadId: string;
  /** The lead as it was before this delivery; null for a new lead. */
  before: LeadRow | null;
  /** A lead that existed before the booking took it (lead_ref or email). */
  attached: boolean;
  /** BOOKING_RESCHEDULED: the start the call moved from. */
  previousStart: string | null;
};

/* ------------------------------------------------------------------ */
/* Reading odd JSON                                                    */
/* ------------------------------------------------------------------ */

function s(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

const obj = (v: unknown): Obj | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);

/** An instant Postgres accepts (ISO, UTC), or null: a bad date must never fail the whole write. */
function instantOf(v: unknown): string | null {
  const t = s(v);
  if (!t || t.length > 64) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

const emailKey = (v: unknown): string | null => s(v)?.toLowerCase() ?? null;

/** A booking form answer: `{ label, value }` from a webhook, or a bare value. */
function answer(responses: Obj | null, key: string): unknown {
  const r = responses?.[key];
  const o = obj(r);
  return o && "value" in o ? o.value : r;
}

/** A name answer: text, or `{ firstName, lastName }`. */
function nameOf(v: unknown): string | null {
  const text = s(v);
  if (text) return text;
  const o = obj(v);
  if (!o) return null;
  return s([s(o.firstName), s(o.lastName)].filter(Boolean).join(" "));
}

/** An exact, case-insensitive match for PostgREST ilike: LIKE wildcards escaped. */
const ilikeExact = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

function parseEvent(event: Obj): CalEvent {
  const payload = obj(event.payload) ?? {};
  const attendees = Array.isArray(payload.attendees) ? payload.attendees : [];
  const booker = obj(attendees[0]);
  const responses = obj(payload.responses);
  // UTM / click ids land in metadata or tracking depending on Cal config; merge both.
  const track: Obj = { ...(obj(payload.metadata) ?? {}), ...(obj(payload.tracking) ?? {}) };

  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = s(track[k]);
    if (v) utm[k] = v;
  }
  const clickIds: Record<string, string> = {};
  for (const k of CLICK_KEYS) {
    const v = s(track[k]);
    if (v) clickIds[k] = v;
  }

  return {
    trigger: (s(event.triggerEvent) ?? "").toUpperCase(),
    event,
    payload,
    // A no-show update names the booking as bookingUid.
    uid: s(payload.uid) ?? s(payload.bookingUid),
    rescheduleUid: s(payload.rescheduleUid),
    startText: s(payload.startTime),
    start: instantOf(payload.startTime),
    end: instantOf(payload.endTime),
    previousStart: instantOf(payload.rescheduleStartTime),
    eventType: s(payload.type),
    name: s(booker?.name) ?? nameOf(answer(responses, "name")) ?? s([s(booker?.firstName), s(booker?.lastName)].filter(Boolean).join(" ")),
    email: emailKey(booker?.email) ?? emailKey(answer(responses, "email")),
    phone: s(booker?.phoneNumber) ?? s(answer(responses, "attendeePhoneNumber")),
    reason: s(payload.cancellationReason) ?? s(answer(responses, "rescheduleReason")) ?? s(payload.rescheduleReason),
    leadRef: s(track.lead_ref),
    utm,
    clickIds,
    referrer: s(track.referrer),
    landingPage: s(track.landing_page) ?? s(track.landingPage),
  };
}

/* ------------------------------------------------------------------ */
/* The stored event                                                    */
/* ------------------------------------------------------------------ */

/** The lead's own raw keys (whatever its form stored), without an older event. */
function ownRaw(existing: unknown): Obj {
  const own = obj(existing) ?? {};
  return Object.fromEntries(Object.entries(own).filter(([k]) => !EVENT_KEYS.has(k)));
}

/** The attendees with the no-show flags of an update applied, matched by email. */
function withNoShow(stored: Obj, update: Obj): Obj {
  const out: Obj = { ...stored };
  const flags = (Array.isArray(update.attendees) ? update.attendees : []).map(obj).filter((f): f is Obj => !!f);
  if (Array.isArray(stored.attendees)) {
    out.attendees = stored.attendees.map((a) => {
      const attendee = obj(a);
      const key = emailKey(attendee?.email);
      const flag = key ? flags.find((f) => emailKey(f.email) === key) : undefined;
      return attendee && flag && typeof flag.noShow === "boolean" ? { ...attendee, noShow: flag.noShow } : a;
    });
  } else if (flags.length) {
    out.attendees = flags;
  }
  if (typeof update.noShowHost === "boolean") out.noShowHost = update.noShowHost;
  return out;
}

/** Whether `v` is an object that has `key`. */
const has = (v: unknown, key: string): boolean => {
  const o = obj(v);
  return !!o && key in o;
};

/**
 * A location update: its payload over the stored one. When it names a new
 * location, nothing that described the old one survives it: the booker's
 * old pick (responses.location) and the old video call, unless the update
 * sends its own.
 */
function withLocation(stored: Obj, update: Obj): Obj {
  const out: Obj = { ...stored, ...update };
  if (!("location" in update)) return out;
  const responses = obj(out.responses);
  if (responses && "location" in responses && !has(update.responses, "location")) {
    out.responses = Object.fromEntries(Object.entries(responses).filter(([k]) => k !== "location"));
  }
  if (!("videoCallData" in update)) delete out.videoCallData;
  const metadata = obj(out.metadata);
  if (metadata && "videoCallUrl" in metadata && !has(update.metadata, "videoCallUrl")) {
    out.metadata = Object.fromEntries(Object.entries(metadata).filter(([k]) => k !== "videoCallUrl"));
  }
  return out;
}

/**
 * What raw becomes. A status trigger carries the whole booking, so its event
 * replaces the stored one. A location update merges its payload over the
 * stored one (Cal may send only part of it; see withLocation). A no-show
 * update is not a booking at all: the stored event stays, with the flags set.
 */
function nextRaw(existing: unknown, e: CalEvent): Obj {
  const own = ownRaw(existing);
  if (!UPDATE_TRIGGERS.has(e.trigger)) return { ...own, ...e.event };
  const stored = obj(existing) ?? {};
  const storedPayload = obj(stored.payload) ?? {};
  if (e.trigger === NO_SHOW_UPDATED) {
    const kept = Object.fromEntries(Object.entries(stored).filter(([k]) => EVENT_KEYS.has(k)));
    return { ...own, ...kept, payload: withNoShow(storedPayload, e.payload) };
  }
  return { ...own, ...e.event, payload: withLocation(storedPayload, e.payload) };
}

/** The booking columns this delivery knows. Missing values never blank what is stored. */
function bookingColumns(e: CalEvent): Obj {
  return {
    ...(e.start ? { booking_start: e.start } : {}),
    ...(e.end ? { booking_end: e.end } : {}),
    ...(e.eventType ? { event_type: e.eventType } : {}),
  };
}

/**
 * The write for a lead that exists: the booking, the newest event, and the
 * status when the trigger sets one. Its own name, phone, source and
 * attribution stay; a blank name or phone takes the booker's. A won lead
 * keeps "won": the calendar never undoes a sale.
 */
function updateFor(lead: LeadRow, e: CalEvent, status: "booked" | "cancelled" | null): Obj {
  const fields: Obj = { ...bookingColumns(e), raw: nextRaw(lead.raw, e) };
  if (status && toLeadStatus(lead.status) !== "won") fields.status = status;
  if (status) {
    if (!s(lead.name) && e.name) fields.name = e.name;
    if (!s(lead.phone) && e.phone) fields.phone = e.phone;
  }
  return fields;
}

/* ------------------------------------------------------------------ */
/* Finding and writing the lead                                        */
/* ------------------------------------------------------------------ */

async function leadByUid(db: Db, uid: string): Promise<LeadRow | null> {
  const { data, error } = await db.from("leads").select(LEAD_COLUMNS).eq("booking_uid", uid).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LeadRow | null) ?? null;
}

/** Writes `fields` to one lead and returns its id, or null when the guard matched nothing. */
async function writeLead(db: Db, id: string, fields: Obj, guard?: { uid: string | null }): Promise<string | null> {
  let query = db.from("leads").update(fields).eq("id", id);
  if (guard) query = guard.uid === null ? query.is("booking_uid", null) : query.eq("booking_uid", guard.uid);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

/**
 * The lead a new booking belongs to, before a new one is made. One email is
 * one lead:
 *
 *  1. metadata.lead_ref, the /grow lead's id, which the welcome page passes
 *     to Cal when the booking happens in the tab that sent the form.
 *  2. Otherwise the newest lead with the same email (case-insensitive), no
 *     booking yet, created in the last 60 days, of any source but a free
 *     tool or a portal sign-up (NEVER_ATTACHED_SOURCES). A won lead is a
 *     client already: their call is its own lead.
 */
async function attachTarget(db: Db, e: CalEvent): Promise<LeadRow | null> {
  if (!e.email) return null;

  if (e.leadRef && UUID_RE.test(e.leadRef)) {
    const { data, error } = await db.from("leads").select(LEAD_COLUMNS).eq("id", e.leadRef).maybeSingle();
    if (error) throw new Error(error.message);
    const lead = data as LeadRow | null;
    if (lead && lead.source === GROW_LEAD_SOURCE && !s(lead.booking_uid) && emailKey(lead.email) === e.email) return lead;
  }

  const { data, error } = await db
    .from("leads")
    .select(LEAD_COLUMNS)
    .ilike("email", ilikeExact(e.email))
    .is("booking_uid", null)
    .not("source", "in", `(${NEVER_ATTACHED_SOURCES.join(",")})`)
    .gte("created_at", new Date(Date.now() - LINK_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(LINK_CANDIDATES);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LeadRow[];
  return rows.find((r) => emailKey(r.email) === e.email && toLeadStatus(r.status) !== "won") ?? null;
}

/** Whether a lead moved off this uid in a reschedule (so a cancel of the old booking is not news). */
async function movedFrom(db: Db, uid: string): Promise<boolean> {
  const { data, error } = await db.from("leads").select("id").eq("raw->payload->>rescheduleUid", uid).limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** A new cal_booking lead (the column default; no `source` here on purpose). */
async function insertLead(db: Db, e: CalEvent, status: "booked" | "cancelled"): Promise<Recorded> {
  const row = {
    status,
    name: e.name,
    email: e.email,
    phone: e.phone,
    booking_uid: e.uid,
    booking_start: e.start,
    booking_end: e.end,
    event_type: e.eventType,
    ...e.utm,
    // Omitted when empty, like utm_* above.
    ...(Object.keys(e.clickIds).length ? { click_ids: e.clickIds } : {}),
    ...(e.referrer ? { referrer: e.referrer } : {}),
    ...(e.landingPage ? { landing_page: e.landingPage } : {}),
    raw: e.event,
  };
  const { data, error } = await db.from("leads").insert(row).select("id").maybeSingle();
  if (error) {
    // Another delivery of the same booking won the race: update that lead instead.
    if (error.code === "23505" && e.uid) {
      const owner = await leadByUid(db, e.uid);
      if (owner) {
        const id = await writeLead(db, owner.id, updateFor(owner, e, status));
        if (id) return { leadId: id, before: owner, attached: false, previousStart: e.previousStart };
      }
    }
    throw new Error(error.message);
  }
  const id = data?.id as string | undefined;
  if (!id) throw new Error("The new lead was not returned.");
  return { leadId: id, before: null, attached: false, previousStart: e.previousStart };
}

/**
 * Writes the delivery onto its lead. Null when there is nothing to write: an
 * update for a booking no lead owns, or the cancel of a booking that was
 * rescheduled away. supabase-js reports a failed write in `error` instead of
 * throwing, so every error is thrown here and answered with a 500.
 */
async function record(db: Db, e: CalEvent): Promise<Recorded | null> {
  const status = STATUS_FOR[e.trigger] ?? null;

  // 1. The lead that owns this booking: a retry, a cancel, a location change.
  if (e.uid) {
    const owner = await leadByUid(db, e.uid);
    if (owner) {
      const id = await writeLead(db, owner.id, updateFor(owner, e, status));
      if (!id) throw new Error("The booking's lead could not be updated.");
      return { leadId: id, before: owner, attached: false, previousStart: e.previousStart };
    }
  }

  // 2. A reschedule stays on the same lead: it moves to the new uid.
  if (e.trigger === RESCHEDULED && e.uid && e.rescheduleUid) {
    const old = await leadByUid(db, e.rescheduleUid);
    if (old) {
      const fields = { ...updateFor(old, e, status), booking_uid: e.uid };
      const id = await writeLead(db, old.id, fields, { uid: e.rescheduleUid });
      if (!id) throw new Error("The rescheduled booking's lead changed while it was moved.");
      return { leadId: id, before: old, attached: false, previousStart: instantOf(old.booking_start) ?? e.previousStart };
    }
  }

  // Location and no-show updates only change a booking we have.
  if (!status) return null;
  if (e.trigger === CANCELLED && e.uid && (await movedFrom(db, e.uid))) return null;

  // 3. The first we hear of this booking: one email is one lead.
  if (e.uid) {
    const target = await attachTarget(db, e);
    if (target) {
      const id = await writeLead(db, target.id, { ...updateFor(target, e, status), booking_uid: e.uid }, { uid: null });
      if (id) return { leadId: id, before: target, attached: true, previousStart: e.previousStart };
      // Another delivery took it a moment ago: fall through, and the insert's
      // unique uid sends this one to that lead.
    }
  }

  // 4. Its own booked-call lead, when there is anyone to call.
  if (!e.uid && !e.email) return null;
  return insertLead(db, e, status);
}

/* ------------------------------------------------------------------ */
/* CRM booked-call tags the trigger misses                             */
/* ------------------------------------------------------------------ */

/**
 * The booked-call state to tag in the CRM for this write, when the leads
 * trigger will not (null otherwise). A new lead is a cal_booking row, which
 * the trigger tags itself.
 *
 *  - A lead that reads won keeps its status, so no trigger fires: a cancel
 *    still has to take booked-call off, whatever the source (once per uid).
 *  - A lead of a source without a booking branch (outreach): booked when this
 *    write attached the booking or changed the status to booked, cancelled
 *    when it changed the status to cancelled. An unchanged redelivery queues
 *    nothing, like the trigger.
 */
function untaggedBooking(e: CalEvent, r: Recorded): BookingTagState | null {
  const lead = r.before;
  const status = STATUS_FOR[e.trigger];
  if (!lead || !status || !e.uid) return null;
  if (toLeadStatus(lead.status) === "won") {
    // A redelivered cancel (this uid already cancelled) queues nothing new.
    const cancelledBefore = lead.booking_uid === e.uid && (s(obj(lead.raw)?.triggerEvent) ?? "").toUpperCase() === CANCELLED;
    return status === "cancelled" && !cancelledBefore ? "cancelled" : null;
  }
  if (TRIGGER_TAGGED_BOOKING_SOURCES.has(lead.source ?? "")) return null;
  return r.attached || (lead.status ?? null) !== status ? status : null;
}

/**
 * Queues those jobs through public.crm_enqueue, the function the trigger
 * calls (the erasure check and the priority rule live there), and only while
 * outbound is on (crm_outbound_enabled), as the trigger does. Never throws and
 * never fails the delivery: the lead is saved, and the CRM backfill
 * (lib/crm/reconcile.ts) queues the same keys for anything missed here.
 */
async function queueBookingTags(db: Db, e: CalEvent, r: Recorded): Promise<void> {
  try {
    const state = untaggedBooking(e, r);
    const email = emailKey(r.before?.email);
    if (!state || !email || !e.uid) return;
    const { data: outbound, error: gateError } = await db.rpc("crm_outbound_enabled");
    // Unreadable: queue anyway, as crm_outbound_enabled itself does.
    if (!gateError && outbound === false) return;
    for (const job of bookingTagJobs(email, e.uid, state)) {
      const { error } = await db.rpc("crm_enqueue", {
        p_kind: job.kind,
        p_idem_key: job.idemKey,
        p_email_key: email,
        p_subject_type: "lead",
        p_subject_id: r.leadId,
        p_payload: job.payload,
      });
      if (error) console.error("[cal webhook] CRM enqueue failed", job.kind, error.message);
    }
  } catch (err) {
    console.error("[cal webhook] CRM enqueue threw", err instanceof Error ? err.message : String(err));
  }
}

/* ------------------------------------------------------------------ */
/* Signature and alerts                                                */
/* ------------------------------------------------------------------ */

/** Constant-time compare of the hex HMAC-SHA256 Cal sends in x-cal-signature-256. */
function signatureOk(header: string | null, body: string, secret: string): boolean {
  const provided = (header ?? "").trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

// Anyone can POST junk here. The hourly key stops a flood of rows, but not a
// flood of database calls, so this instance alerts at most once an hour.
let lastSignatureAlert = "";
let lastNoSecretAlert = "";

/** The entity the "no secret" alerts carry, so a working delivery can close them. */
const SECRET_ENTITY = { type: "webhook", id: "cal-secret" } as const;

async function alertNoSecret(): Promise<void> {
  const key = hourKey("cal_no_secret");
  if (lastNoSecretAlert === key) return;
  lastNoSecretAlert = key;
  await notifyAdmins({
    event: "cal.webhook_failed",
    title: "Bookings are not being saved",
    body: "Add the booking secret (CAL_WEBHOOK_SECRET) in Vercel and in Cal.com.",
    severity: "critical",
    needsAction: true,
    entity: SECRET_ENTITY,
    dedupeKey: key,
  });
}

/**
 * Only a body that reads like a real Cal.com booking (a booking trigger and a
 * uid) raises the alert: a stranger poking the address, or a ping, is turned
 * away without buzzing anyone's phone (owner request 2026-10-20).
 */
function looksLikeBooking(body: string): boolean {
  try {
    const event = obj(JSON.parse(body));
    const payload = obj(event?.payload);
    return BOOKING_TRIGGERS.has(String(event?.triggerEvent ?? "").toUpperCase()) && typeof payload?.uid === "string" && payload.uid.trim() !== "";
  } catch {
    return false;
  }
}

async function alertBadSignature(): Promise<void> {
  const key = hourKey("cal_sig");
  if (lastSignatureAlert === key) return;
  lastSignatureAlert = key;
  await notifyAdmins({
    event: "cal.webhook_failed",
    title: "Bookings are not coming in",
    body: "The Cal.com connection needs a fix: its secret does not match the website's.",
    dedupeKey: key,
    collapse: true,
  });
}

/* ------------------------------------------------------------------ */
/* The staff notification                                              */
/* ------------------------------------------------------------------ */

const NOTICE = {
  [CREATED]: { event: "lead.booked", key: "booked" },
  [RESCHEDULED]: { event: "lead.booking_rescheduled", key: "rescheduled" },
  [CANCELLED]: { event: "lead.booking_cancelled", key: "cancelled" },
} as const;

async function notifyStaff(e: CalEvent, r: Recorded): Promise<void> {
  const notice = NOTICE[e.trigger as keyof typeof NOTICE];
  if (!notice) return;

  // Simple on purpose (owner request 2026-10-20): what happened, who and when.
  const now = Date.now();
  // "Tue, Oct 21 at 3:00 p.m." in Toronto.
  const at = (iso: string | null) => (iso ? bookingDayTime(iso, now).replace(/, (\d{1,2}:\d{2} [ap]\.m\.)$/, " at $1") || null : null);
  const when = at(e.start);
  const from = at(r.previousStart);
  const who = s(r.before?.name) ?? e.name ?? e.email ?? "Someone";

  const title = notice.event === "lead.booked" ? "New booking" : notice.event === "lead.booking_rescheduled" ? "Booking moved" : "Booking cancelled";

  // Where it came from: Cal.com, or the website form when a /grow lead booked.
  const source = s(r.before?.source) ?? "cal_booking";
  const origin = source === GROW_LEAD_SOURCE ? "From the website form." : "From Cal.com.";
  const reason = notice.event === "lead.booked" ? null : e.reason;
  const body =
    notice.event === "lead.booked"
      ? `${who}${when ? `, ${when}` : ""}. ${origin}`
      : notice.event === "lead.booking_rescheduled"
        ? `${who}${when ? `, now ${when}` : ""}${from && from !== when ? ` (was ${from})` : ""}.${reason ? ` Reason: ${reason}` : ""}`
        : `${who}${when ? `, was ${when}` : ""}.${reason ? ` Reason: ${reason}` : ""}`;

  await notifyAdmins({
    event: notice.event,
    title,
    body,
    url: `/admin/leads/${r.leadId}`,
    entity: { type: "lead", id: r.leadId },
    actor: { type: "visitor", label: e.email ?? e.name ?? null },
    // The key includes the start time, so a reschedule is its own
    // notification while a retried delivery of the same event is not.
    dedupeKey: e.uid ? `cal:${e.uid}:${notice.key}:${e.startText ?? ""}` : null,
    data: {
      lead_id: r.leadId,
      email: e.email,
      phone: e.phone,
      booking_start: e.start,
      ...(notice.event === "lead.booking_rescheduled" ? { previous_start: r.previousStart } : {}),
      event_type: e.eventType,
      ...e.utm,
    },
  });
}

/* ------------------------------------------------------------------ */
/* The handler                                                         */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  // Fail closed: without a secret anyone could write leads, so nothing is saved.
  const secret = (process.env.CAL_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    console.error("[cal webhook] CAL_WEBHOOK_SECRET is not set; delivery refused");
    await alertNoSecret();
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const body = await req.text();
  if (!signatureOk(req.headers.get("x-cal-signature-256"), body, secret)) {
    console.error("[cal webhook] signature mismatch");
    if (looksLikeBooking(body)) await alertBadSignature();
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }
  const event = obj(parsed);
  if (!event) return NextResponse.json({ error: "Bad JSON." }, { status: 400 });

  // A signed delivery got through, so the secret is in place again.
  await resolveAdminNotifications({ events: ["cal.webhook_failed"], entityId: SECRET_ENTITY.id });

  const e = parseEvent(event);
  // Every other trigger is acknowledged and left alone: a status written from
  // a trigger nobody reads (the old lowercased fallback) could break the lead.
  if (!STATUS_FOR[e.trigger] && !UPDATE_TRIGGERS.has(e.trigger)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("[cal webhook] Supabase not configured; delivery refused");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  let recorded: Recorded | null;
  try {
    recorded = await record(supabase, e);
  } catch (err) {
    console.error("[cal webhook] write error", err instanceof Error ? err.message : String(err));
    await notifyAdmins({
      event: "cal.webhook_failed",
      title: "A booking could not be saved",
      body: err instanceof Error ? err.message : String(err),
      needsAction: true,
      severity: "critical",
      dedupeKey: hourKey("cal_err"),
      collapse: true,
    });
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }
  if (!recorded) return NextResponse.json({ received: true, ignored: true });

  // The booked-call tags the trigger does not queue for this lead.
  await queueBookingTags(supabase, e, recorded);

  // The lead row is committed, so the CRM job the trigger wrote inside that
  // write is committed with it. Draining it here only shortens the wait for the
  // contact to appear; the cron picks the row up either way, which is why this
  // runs after the response and never on the path Cal.com times out.
  after(() => runCrmOutbox({ trigger: "inline", maxJobs: 3, budgetMs: 4000 }));

  // A new booking is a conversion worth reporting to Meta, if the booker
  // accepted advertising cookies. reportBooking sends only once the browser
  // has linked this booking to a consented ad context, and never throws.
  if (e.trigger === CREATED && e.uid) await reportBooking(e.uid);

  // The lead was waiting in Needs action for a call back. They booked one.
  if (recorded.attached && STATUS_FOR[e.trigger] === "booked") {
    await resolveAdminNotifications({ events: ["lead.form_submitted"], entityId: recorded.leadId });
  }

  await notifyStaff(e, recorded);

  return NextResponse.json({ received: true, leadId: recorded.leadId });
}
