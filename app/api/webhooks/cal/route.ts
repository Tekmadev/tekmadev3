import { NextResponse, after, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runCrmOutbox } from "@/lib/crm/outbox";
import { reportBooking } from "@/lib/meta-conversions";
import { hourKey, notifyAdmins, resolveAdminNotifications } from "@/lib/admin-notify";
import { GROW_LEAD_SOURCE } from "@/config/grow";

// HMAC verification needs the raw body, so this must run on Node.
export const runtime = "nodejs";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const CLICK_KEYS = ["gclid", "fbclid", "ttclid", "msclkid", "li_fat_id"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CalAttendee = { name?: string; email?: string; phoneNumber?: string };
type CalPayload = {
  uid?: string;
  type?: string;
  startTime?: string;
  endTime?: string;
  attendees?: CalAttendee[];
  organizer?: { name?: string; email?: string };
  responses?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tracking?: Record<string, unknown>;
};
type CalEvent = { triggerEvent?: string; payload?: CalPayload };

function s(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Constant-time string compare to avoid timing attacks on the signature. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Anyone can POST junk here. The hourly key stops a flood of rows, but not a
// flood of database calls, so this instance alerts at most once an hour.
let lastSignatureAlert = "";

function statusFor(trigger: string): string {
  if (trigger === "BOOKING_CANCELLED") return "cancelled";
  if (trigger === "BOOKING_RESCHEDULED") return "rescheduled";
  if (trigger === "BOOKING_CREATED") return "booked";
  return trigger.toLowerCase();
}

/**
 * Cal.com webhook: records every booked call in `leads`, stamped with the
 * traffic source that produced it. The full payload is stored in `raw`, so the
 * mapped columns below are best-effort and never the only copy of the data.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CAL_WEBHOOK_SECRET;
  const body = await req.text();

  // Verify the HMAC-SHA256 signature when a secret is set.
  if (secret) {
    const provided = req.headers.get("x-cal-signature-256") || "";
    const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
    if (!provided || !safeEqual(provided, expected)) {
      console.error("[cal webhook] signature mismatch");
      if (lastSignatureAlert !== hourKey("cal_sig")) {
        lastSignatureAlert = hourKey("cal_sig");
        await notifyAdmins({
          event: "cal.webhook_failed",
          title: "A booking webhook arrived with a bad signature",
          body: "Either the Cal.com signing secret changed, or someone is probing the endpoint. Bookings are not being recorded if it is the secret.",
          dedupeKey: hourKey("cal_sig"),
          collapse: true,
        });
      }
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  }

  let evt: CalEvent;
  try {
    evt = JSON.parse(body) as CalEvent;
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }

  const p = evt.payload ?? {};
  const attendee = Array.isArray(p.attendees) ? p.attendees[0] : undefined;
  // UTM / click ids land in metadata or tracking depending on Cal config; merge both.
  const track: Record<string, unknown> = { ...(p.metadata ?? {}), ...(p.tracking ?? {}) };

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

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("[cal webhook] Supabase not configured; event acknowledged but not stored");
    return NextResponse.json({ received: true });
  }

  const referrer = s(track.referrer);
  const landingPage = s(track.landing_page) ?? s(track.landingPage);

  // No `source` here on purpose. A new row gets the column default,
  // 'cal_booking'; a row that already owns this booking keeps whatever source
  // it has, which is how a /grow lead that booked stays a /grow lead.
  const row = {
    status: statusFor(evt.triggerEvent ?? ""),
    name: s(attendee?.name) ?? s(p.organizer?.name),
    email: s(attendee?.email),
    phone: s(attendee?.phoneNumber),
    booking_uid: s(p.uid),
    booking_start: s(p.startTime),
    booking_end: s(p.endTime),
    event_type: s(p.type),
    ...utm,
    // Attribution is omitted when empty, exactly like utm_* above. The write is
    // an upsert on booking_uid, so every key present here overwrites what the
    // original booking recorded, and a later BOOKING_CANCELLED or
    // BOOKING_RESCHEDULED delivery carries no tracking at all: writing these
    // unconditionally nulled click_ids, referrer and landing_page and threw
    // away the attribution of the booking they belonged to.
    ...(Object.keys(clickIds).length ? { click_ids: clickIds } : {}),
    ...(referrer ? { referrer } : {}),
    ...(landingPage ? { landing_page: landingPage } : {}),
    // raw stays unconditional on purpose: every delivery carries a full
    // payload, and the newest one is the copy worth keeping because it is the
    // only place a cancellation or a reschedule is described. Overwriting it
    // costs nothing now that the tracking it used to be the last backup for
    // survives in the columns above.
    raw: evt as unknown as Record<string, unknown>,
  };

  // Only the booking itself: a form lead's own name, phone and attribution
  // are what it gave us and must survive every later Cal delivery.
  const bookingOnly = {
    status: row.status,
    booking_uid: row.booking_uid,
    booking_start: row.booking_start,
    booking_end: row.booking_end,
    event_type: row.event_type,
    raw: row.raw,
  };
  let linkedLeadId: string | null = null;

  try {
    // supabase-js reports a failed write in `error` instead of throwing. Unchecked,
    // a booking that was never saved still returned 200 (so Cal.com did not
    // retry) and would have announced "X booked a call" for a lead that did not exist.
    linkedLeadId = await attachToFormLead(supabase, s(track.lead_ref), evt.triggerEvent, row.email, bookingOnly);

    if (!linkedLeadId) {
      // A later delivery (cancel) for a booking a form lead already owns
      // updates the booking fields on that row and nothing else.
      const { data: owner, error: ownerError } = row.booking_uid
        ? await supabase.from("leads").select("id,source").eq("booking_uid", row.booking_uid).maybeSingle()
        : { data: null, error: null };
      if (ownerError) throw new Error(ownerError.message);

      const { error } =
        owner && owner.source !== "cal_booking"
          ? await supabase.from("leads").update(bookingOnly).eq("id", owner.id)
          : row.booking_uid
            ? await supabase.from("leads").upsert(row, { onConflict: "booking_uid" })
            : await supabase.from("leads").insert(row);
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    console.error("[cal webhook] insert error", err instanceof Error ? err.message : String(err));
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

  // The lead row is committed, so the CRM job the trigger wrote inside that
  // write is committed with it. Draining it here only shortens the wait for the
  // contact to appear; the cron picks the row up either way, which is why this
  // runs after the response and never on the path Cal.com times out.
  after(() => runCrmOutbox({ trigger: "inline", maxJobs: 3, budgetMs: 4000 }));

  // A new booking is a conversion worth reporting to Meta, if the booker
  // accepted advertising cookies. reportBooking sends only once the browser
  // has linked this booking to a consented ad context, and never throws.
  if (row.status === "booked" && row.booking_uid) await reportBooking(row.booking_uid);

  // The form lead was waiting in Needs action for a call back. They booked one.
  if (linkedLeadId) await resolveAdminNotifications({ events: ["lead.form_submitted"], entityId: linkedLeadId });

  // Tell staff. The key includes the start time, so a reschedule is its own
  // notification while a retried delivery of the same event is not.
  const event =
    row.status === "booked"
      ? ("lead.booked" as const)
      : row.status === "rescheduled"
        ? ("lead.booking_rescheduled" as const)
        : row.status === "cancelled"
          ? ("lead.booking_cancelled" as const)
          : null;
  if (event) {
    const who = row.name || row.email || "Someone";
    const when = row.booking_start
      ? new Date(row.booking_start).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" })
      : null;
    await notifyAdmins({
      event,
      title:
        event === "lead.booked"
          ? `${who} booked a call${when ? ` for ${when}` : ""}`
          : event === "lead.booking_rescheduled"
            ? `${who} moved their call${when ? ` to ${when}` : ""}`
            : `${who} cancelled their call${when ? ` (${when})` : ""}`,
      body:
        [row.email, row.phone, linkedLeadId ? "from the lead form" : null, utm.utm_source ? `via ${utm.utm_source}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      url: "/admin/leads",
      entity: { type: "lead", id: row.booking_uid },
      actor: { type: "visitor", label: row.email ?? row.name ?? null },
      dedupeKey: row.booking_uid ? `cal:${row.booking_uid}:${row.status}:${row.booking_start ?? ""}` : null,
      data: { email: row.email, phone: row.phone, booking_start: row.booking_start, event_type: row.event_type, ...utm },
    });
  }

  return NextResponse.json({ received: true });
}

/**
 * Someone who filled in the /grow form and then booked is one lead, not two.
 * On the first delivery of a new booking, the booking is written onto their
 * form lead instead of a separate cal_booking row. Two ways to find it:
 *
 *  1. `metadata[lead_ref]`, the form lead's id, which the welcome page passes
 *     to Cal when the booking happens in the tab that sent the form.
 *  2. Otherwise (the reply email's "Book my call" opens a new tab with no
 *     session), the newest form lead from the last 30 days with this email and
 *     no booking yet. /api/grow stores emails trimmed and lowercased.
 *
 * Either way the lead must be a /grow lead with no booking whose email matches
 * the booking's. Anything else returns null and the booking is recorded as its
 * own row, as before.
 */
const LINK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

async function attachToFormLead(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  leadRef: string | null,
  trigger: string | undefined,
  email: string | null,
  booking: Record<string, unknown> & { booking_uid: string | null },
): Promise<string | null> {
  if (trigger !== "BOOKING_CREATED" || !email || !booking.booking_uid) return null;
  const key = email.trim().toLowerCase();

  let leadId: string | null = null;
  if (leadRef && UUID_RE.test(leadRef)) {
    const { data: lead, error } = await supabase
      .from("leads")
      .select("id,email,source,booking_uid")
      .eq("id", leadRef)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (lead && lead.source === GROW_LEAD_SOURCE && !lead.booking_uid && String(lead.email ?? "").trim().toLowerCase() === key) {
      leadId = lead.id as string;
    }
  }
  if (!leadId) {
    const { data: lead, error } = await supabase
      .from("leads")
      .select("id")
      .eq("source", GROW_LEAD_SOURCE)
      .eq("email", key)
      .is("booking_uid", null)
      .gte("created_at", new Date(Date.now() - LINK_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    leadId = (lead?.id as string | undefined) ?? null;
  }
  if (!leadId) return null;

  const { data: updated, error: updateError } = await supabase
    .from("leads")
    .update(booking)
    .eq("id", leadId)
    .is("booking_uid", null)
    .select("id")
    .maybeSingle();
  if (updateError) throw new Error(updateError.message);
  return (updated?.id as string | undefined) ?? null;
}
