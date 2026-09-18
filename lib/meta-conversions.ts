import { business } from "@/config/site";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdContext, getAdContextByBooking } from "@/lib/ad-context-data";
import { sendMetaEvent, splitName, type MetaSendResult } from "@/lib/meta-capi";
import { purchaseEventId, scheduleEventId } from "@/lib/meta-events";

/**
 * What each conversion looks like to Meta, in one place. The routes and
 * webhooks call these and stay thin.
 *
 * Every function starts from the visitor's ad context. No context means they
 * did not accept advertising cookies, and the event is skipped.
 */

/** A lead magnet submission. `eventId` is the one the browser fired its Lead with. */
export async function reportLead(input: {
  contextId: unknown;
  eventId: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  sourceUrl: string | null;
  magnet: string;
}): Promise<MetaSendResult> {
  const context = await getAdContext(input.contextId);
  if (!context || !input.eventId) return { status: "skipped", reason: "no_consent_context" };
  return sendMetaEvent({
    event: "Lead",
    eventId: input.eventId,
    context,
    user: { email: input.email, phone: input.phone, ...splitName(input.name) },
    sourceUrl: input.sourceUrl,
    custom: { content_name: input.magnet, content_category: "lead_magnet" },
  });
}

/**
 * A booked call. Two things must both exist before this can send: the Cal
 * webhook's lead row (who booked) and the browser's link from that booking to
 * its ad context (which ad, and consent). They arrive in either order, so both
 * the webhook and the link endpoint call this; whichever runs second finds
 * both halves and sends. If the browser never links, nothing is sent, which is
 * the right outcome for someone who did not consent.
 */
export async function reportBooking(bookingUid: string): Promise<MetaSendResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: "skipped", reason: "not_configured" };

  const context = await getAdContextByBooking(bookingUid);
  if (!context) return { status: "skipped", reason: "no_consent_context" };

  const { data: lead } = await supabase
    .from("leads")
    .select("email,name,phone,status,created_at")
    .eq("booking_uid", bookingUid)
    .maybeSingle();
  if (!lead) return { status: "skipped", reason: "lead_not_recorded_yet" };
  if (lead.status !== "booked") return { status: "skipped", reason: "not_a_new_booking" };

  return sendMetaEvent({
    event: "Schedule",
    eventId: scheduleEventId(bookingUid),
    context,
    user: { email: lead.email, phone: lead.phone, ...splitName(lead.name) },
    sourceUrl: `${business.url}/#book`,
    custom: { content_name: "audit_call" },
  });
}

/** A paid Stripe checkout. Server only: the browser never sees the payment succeed. */
export async function reportPurchase(input: {
  contextId: unknown;
  sessionId: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  amountTotal: number | null;
  currency: string | null;
  item: string | null;
}): Promise<MetaSendResult> {
  if (!input.amountTotal || input.amountTotal <= 0) return { status: "skipped", reason: "no_amount" };
  const context = await getAdContext(input.contextId);
  if (!context) return { status: "skipped", reason: "no_consent_context" };
  return sendMetaEvent({
    event: "Purchase",
    eventId: purchaseEventId(input.sessionId),
    context,
    user: { email: input.email, phone: input.phone, ...splitName(input.name) },
    sourceUrl: `${business.url}/start`,
    value: input.amountTotal / 100,
    currency: input.currency ?? "cad",
    custom: input.item ? { content_name: input.item } : undefined,
  });
}
