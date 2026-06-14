import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

// HMAC verification needs the raw body, so this must run on Node.
export const runtime = "nodejs";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const CLICK_KEYS = ["gclid", "fbclid", "ttclid", "msclkid", "li_fat_id"] as const;

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

  const row = {
    source: "cal_booking",
    status: statusFor(evt.triggerEvent ?? ""),
    name: s(attendee?.name) ?? s(p.organizer?.name),
    email: s(attendee?.email),
    phone: s(attendee?.phoneNumber),
    booking_uid: s(p.uid),
    booking_start: s(p.startTime),
    booking_end: s(p.endTime),
    event_type: s(p.type),
    ...utm,
    click_ids: Object.keys(clickIds).length ? clickIds : null,
    referrer: s(track.referrer),
    landing_page: s(track.landing_page) ?? s(track.landingPage),
    raw: evt as unknown as Record<string, unknown>,
  };

  try {
    if (row.booking_uid) {
      await supabase.from("leads").upsert(row, { onConflict: "booking_uid" });
    } else {
      await supabase.from("leads").insert(row);
    }
  } catch (err) {
    console.error("[cal webhook] insert error", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
