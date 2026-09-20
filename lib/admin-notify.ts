import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Writing to the admin notification center.
 *
 * The owner wants to hear about everything worth hearing about inside the
 * admin (and, later, a phone app reading the same rows), not by email. This is
 * the one door events come in through.
 *
 * Three promises every caller can rely on:
 *
 *  1. It never throws and never rejects. It is called from the Stripe webhook,
 *     the booking webhook and checkout, where a thrown error becomes a 500 and
 *     Stripe retries the whole event for days. A notification is never worth
 *     breaking the thing it is describing.
 *  2. It is idempotent. Pass a `dedupeKey` built from the real-world thing
 *     (a Stripe session id, a booking uid), not from the delivery, and a retry
 *     or a double click writes nothing.
 *  3. It is a leaf. It imports only the Supabase client, so the mail sender,
 *     the ad tracker and the data layer can all call it without an import cycle.
 *
 * Event keys are an API. A mobile client will switch on them, so add freely and
 * never rename. The catalogue below is the single place a key gets its
 * category, its default severity, who may see it, and whether it lands in
 * "Needs action".
 */

export type AdminCategory = "leads" | "sales" | "billing" | "clients" | "audience" | "team" | "system";
export type AdminSeverity = "info" | "success" | "warning" | "critical";
export type AdminActor = "system" | "visitor" | "client" | "staff" | "stripe";

type EventDef = {
  category: AdminCategory;
  severity: AdminSeverity;
  /** "owner" hides the event from managers: security and team changes. */
  audience?: "staff" | "owner";
  /** Someone has to do something. Stays in Needs action until resolved. */
  needsAction?: boolean;
  /** Plain name, for settings screens and a future mobile client. */
  label: string;
};

export const ADMIN_EVENTS = {
  // Leads
  "lead.booked": { category: "leads", severity: "success", label: "New booking" },
  "lead.booking_rescheduled": { category: "leads", severity: "info", label: "Booking rescheduled" },
  "lead.booking_cancelled": { category: "leads", severity: "warning", label: "Booking cancelled" },
  "lead.magnet_submitted": { category: "leads", severity: "success", label: "Free tool submitted" },
  "portal.lead_signed_up": { category: "leads", severity: "success", label: "New portal sign-up" },

  // Sales
  "order.paid": { category: "sales", severity: "success", label: "Order paid" },
  "order.pending": { category: "sales", severity: "info", label: "Payment pending" },
  "order.payment_failed": { category: "sales", severity: "warning", needsAction: true, label: "Payment failed" },
  "subscription.created": { category: "sales", severity: "success", label: "New subscription" },
  "care.started": { category: "sales", severity: "success", label: "Care plan started" },
  "portal.checkout_started": { category: "sales", severity: "info", label: "Checkout started" },
  // Owner only: it links to Pricing, which managers cannot open.
  "checkout.error": { category: "sales", severity: "warning", audience: "owner", needsAction: true, label: "Checkout error" },
  // A registrant that sells without charging GST/HST still owes it. Owner only, like the above.
  "checkout.tax_failed": { category: "billing", severity: "critical", audience: "owner", needsAction: true, label: "Sold without sales tax" },

  // Billing
  "order.refunded": { category: "billing", severity: "warning", label: "Refund issued" },
  "order.disputed": { category: "billing", severity: "critical", needsAction: true, label: "Payment disputed" },
  "subscription.cancel_scheduled": { category: "billing", severity: "warning", needsAction: true, label: "Cancellation scheduled" },
  "subscription.cancel_undone": { category: "billing", severity: "success", label: "Cancellation undone" },
  "subscription.canceled": { category: "billing", severity: "warning", label: "Subscription cancelled" },
  "subscription.past_due": { category: "billing", severity: "critical", needsAction: true, label: "Payment past due" },
  "subscription.payment_failed": { category: "billing", severity: "critical", needsAction: true, label: "Renewal payment failed" },
  "subscription.recovered": { category: "billing", severity: "success", label: "Payment recovered" },
  "subscription.renewed": { category: "billing", severity: "success", label: "Subscription renewed" },

  // Clients
  "client.provisioned": { category: "clients", severity: "success", label: "Client account created" },
  "client.provision_failed": { category: "clients", severity: "critical", needsAction: true, label: "Paid, but no account" },
  "client.live": { category: "clients", severity: "success", label: "Client went live" },
  "client.deleted": { category: "clients", severity: "warning", audience: "owner", label: "Client deleted" },
  "member.invite_failed": { category: "clients", severity: "warning", needsAction: true, label: "Portal invite failed" },
  "portal.member_activated": { category: "clients", severity: "info", label: "Client joined the portal" },
  "onboarding.task_completed": { category: "clients", severity: "info", label: "Client finished a task" },
  "onboarding.intake_submitted": { category: "clients", severity: "info", needsAction: true, label: "Intake submitted" },
  "onboarding.access_marked_done": { category: "clients", severity: "info", needsAction: true, label: "Access granted, verify it" },
  "onboarding.access_not_applicable": { category: "clients", severity: "info", needsAction: true, label: "Client cannot grant this access" },
  "onboarding.approval_approved": { category: "clients", severity: "success", label: "Client approved" },
  "onboarding.approval_changes_requested": { category: "clients", severity: "warning", needsAction: true, label: "Client asked for changes" },
  "onboarding.asset_uploaded": { category: "clients", severity: "info", label: "Files uploaded" },
  "onboarding.agreement_signed": { category: "clients", severity: "success", label: "Agreement signed" },
  "guarantee.met": { category: "clients", severity: "success", label: "Guarantee met" },

  // Audience. Written by a database trigger on subscriber_events, listed here so
  // clients of this catalogue know every key that can appear. Owner only, like
  // the Email page they link to: managers should not read subscriber addresses.
  "subscriber.subscribed": { category: "audience", severity: "success", audience: "owner", label: "New subscriber" },
  "subscriber.resubscribed": { category: "audience", severity: "success", audience: "owner", label: "Subscriber came back" },
  "subscriber.unsubscribed": { category: "audience", severity: "info", audience: "owner", label: "Unsubscribed" },
  "subscriber.bounced": { category: "audience", severity: "warning", audience: "owner", label: "Email bouncing" },
  "subscriber.complained": { category: "audience", severity: "warning", audience: "owner", label: "Marked as spam" },
  "subscriber.feedback": { category: "audience", severity: "info", audience: "owner", label: "Unsubscribe reason" },

  // Team (owner only)
  "team.admin_added": { category: "team", severity: "info", audience: "owner", label: "Team member added" },
  "team.admin_removed": { category: "team", severity: "warning", audience: "owner", label: "Team member removed" },
  // It changes what every buyer pays, so the inbox keeps a record of who flipped it and when.
  "settings.sales_tax_changed": { category: "system", severity: "warning", audience: "owner", label: "Sales tax switched" },

  // System: the things that fail silently
  "email.failed": { category: "system", severity: "warning", needsAction: true, label: "Email failed to send" },
  "email.not_configured": { category: "system", severity: "critical", needsAction: true, label: "Email is not configured" },
  "meta.capi_failed": { category: "system", severity: "warning", label: "Meta conversion not delivered" },
  "stripe.webhook_error": { category: "system", severity: "critical", needsAction: true, label: "Stripe event not processed" },
  "stripe.webhook_signature_failed": { category: "system", severity: "warning", label: "Stripe signature check failed" },
  "cal.webhook_failed": { category: "system", severity: "warning", label: "Booking webhook failed" },
  "lead_magnet.store_failed": { category: "system", severity: "critical", needsAction: true, label: "A free tool submission was lost" },
} as const satisfies Record<string, EventDef>;

export type AdminEventKey = keyof typeof ADMIN_EVENTS;

export const ADMIN_CATEGORIES: { key: AdminCategory; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "sales", label: "Sales" },
  { key: "billing", label: "Billing" },
  { key: "clients", label: "Clients" },
  { key: "audience", label: "Audience" },
  { key: "team", label: "Team" },
  { key: "system", label: "System" },
];

export type AdminNotifyInput = {
  event: AdminEventKey;
  title: string;
  body?: string | null;
  /** Path inside the admin, e.g. `/admin/clients/<id>`. */
  url?: string | null;
  /** Override the catalogue default, e.g. a small refund versus a full one. */
  severity?: AdminSeverity;
  needsAction?: boolean;
  entity?: { type: string; id?: string | null };
  clientId?: string | null;
  actor?: { type: AdminActor; label?: string | null };
  /** Sandbox purchases and test accounts. Hidden unless asked for. */
  isTest?: boolean;
  /** Build it from the real-world thing, never from the delivery. */
  dedupeKey?: string | null;
  /**
   * What a second event with the same key means. False (the default): the same
   * event delivered again, a webhook retry or a double click, so it is ignored.
   * True: the same PROBLEM happening again inside its window (the key is an
   * hourKey or dayKey), so the row counts it, returns to the top, reopens and
   * becomes unread. Without this a second failed checkout in an hour vanished.
   */
  collapse?: boolean;
  /** Machine-readable details: amounts in cents, currency, emails, ids. */
  data?: Record<string, unknown>;
};

const clip = (v: string | null | undefined, max: number) => {
  const t = (v ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Collapse a burst into one row: `hourKey("checkout_err")` is the same key all hour. */
export function hourKey(prefix: string, at: Date = new Date()): string {
  return `${prefix}:${at.toISOString().slice(0, 13)}`;
}

export function dayKey(prefix: string, at: Date = new Date()): string {
  return `${prefix}:${at.toISOString().slice(0, 10)}`;
}

// A path inside the admin and nothing else: no protocol-relative "//host", no
// backslash tricks. The column has the same rule as a check constraint.
const ADMIN_PATH = /^\/admin(?:[/?#]|$)/;
const safeUrl = (u: string | null | undefined) =>
  u && ADMIN_PATH.test(u) && !u.includes("//") && !u.includes("\\") ? u : null;

// A notification must never hold up a webhook. If the database stalls, give up.
const WRITE_TIMEOUT_MS = 3000;

export async function notifyAdmins(input: AdminNotifyInput): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return;

    const def: EventDef = ADMIN_EVENTS[input.event];
    const row = {
      event_key: input.event,
      category: def.category,
      severity: input.severity ?? def.severity,
      audience: def.audience ?? "staff",
      title: clip(input.title, 200) || def.label,
      body: clip(input.body, 600) || null,
      action_url: safeUrl(input.url),
      entity_type: input.entity?.type ?? null,
      entity_id: input.entity?.id ?? null,
      client_id: input.clientId ?? null,
      actor_type: input.actor?.type ?? "system",
      actor_label: clip(input.actor?.label, 160) || null,
      needs_action: input.needsAction ?? def.needsAction ?? false,
      is_test: input.isTest ?? false,
      dedupe_key: input.dedupeKey ? clip(input.dedupeKey, 240) : null,
      data: input.data ?? {},
    };

    if (!row.dedupe_key) {
      const { error } = await supabase.from("admin_notifications").insert(row).abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));
      if (error) console.error("[admin-notify] insert failed", input.event, error.message);
      return;
    }

    const { data, error } = await supabase
      .from("admin_notifications")
      .upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id")
      .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));
    if (error) {
      console.error("[admin-notify] insert failed", input.event, error.message);
      return;
    }
    // Nothing came back, so the key already existed. For a burst key that is
    // news (it happened again); for an idempotency key it is a retry, and silence.
    if (input.collapse && (data ?? []).length === 0) {
      const { error: bumpError } = await supabase
        .rpc("admin_notification_bump", { p_key: row.dedupe_key })
        .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));
      if (bumpError) console.error("[admin-notify] bump failed", input.event, bumpError.message);
    }
  } catch (err) {
    console.error("[admin-notify] threw", input.event, err instanceof Error ? err.message : String(err));
  }
}

/**
 * The problem went away by itself: the card was retried and worked, staff
 * verified the access, the intake was reviewed. Close the open rows about it,
 * so "Needs action" only ever lists things that still need someone. Never throws.
 */
export async function resolveAdminNotifications(opts: {
  events: AdminEventKey[];
  entityId?: string | null;
  clientId?: string | null;
  by?: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase || (!opts.entityId && !opts.clientId)) return;
    const { error } = await supabase
      .rpc("admin_notification_resolve_open", {
        p_events: opts.events,
        p_entity_id: opts.entityId ?? null,
        p_client: opts.clientId ?? null,
        p_by: opts.by ?? "system",
      })
      .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));
    if (error) console.error("[admin-notify] resolve failed", error.message);
  } catch (err) {
    console.error("[admin-notify] resolve threw", err instanceof Error ? err.message : String(err));
  }
}

/** "$797.00 CAD" from cents, for titles. Never throws on odd input. */
export function moneyLabel(cents: number | null | undefined, currency: string | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  const cur = (currency || "cad").toUpperCase();
  try {
    return `${new Intl.NumberFormat("en-CA", { style: "currency", currency: cur }).format(cents / 100)} ${cur}`;
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
}
