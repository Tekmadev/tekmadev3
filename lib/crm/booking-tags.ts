import { GROW_LEAD_SOURCE } from "@/config/grow";

/**
 * The CRM booked-call tags for one booking, with exactly the idempotency keys
 * and payloads the leads trigger writes (crm_enqueue_from_lead,
 * supabase/migrations/20260928000002_crm_grow_leads.sql): a booked call adds
 * booked-call; a cancelled one adds booking-cancelled and takes booked-call
 * off, so reminders stop for a meeting that is not happening.
 *
 * The trigger queues these only for Booked call (cal_booking) and /grow rows,
 * and only when the status changes. The Cal webhook queues them from code for
 * the writes that slip past it, and the CRM backfill repairs the rest, both
 * through this one definition so the keys cannot drift apart. `scope` is the
 * booking uid, the real-world event, so a reschedule is its own job.
 */

export type BookingTagState = "booked" | "cancelled";

export type BookingTagJob = {
  kind: "tags.add" | "tags.remove";
  idemKey: string;
  payload: { tag: "booked-call" | "booking-cancelled" };
};

/** The sources whose own trigger branch already tags their bookings. */
export const TRIGGER_TAGGED_BOOKING_SOURCES: ReadonlySet<string> = new Set(["cal_booking", GROW_LEAD_SOURCE]);

export function bookingTagJobs(emailKey: string, scope: string, state: BookingTagState): BookingTagJob[] {
  if (state === "booked") {
    return [{ kind: "tags.add", idemKey: `tags.add:${emailKey}:booked-call:${scope}`, payload: { tag: "booked-call" } }];
  }
  return [
    { kind: "tags.add", idemKey: `tags.add:${emailKey}:booking-cancelled:${scope}`, payload: { tag: "booking-cancelled" } },
    { kind: "tags.remove", idemKey: `tags.remove:${emailKey}:booked-call:${scope}`, payload: { tag: "booked-call" } },
  ];
}
