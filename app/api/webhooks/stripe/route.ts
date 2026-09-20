import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { provisionClient } from "@/lib/client-provisioning";
import { createNotification, getClientById, getClientByStripeCustomer, logActivity, updateClient } from "@/lib/clients-data";
import { completeTaskByKey, getActiveOnboarding } from "@/lib/onboarding-data";
import { getProductMeta } from "@/config/products";
import { reportPurchase } from "@/lib/meta-conversions";
import { stripeFor, webhookSecret, type StripeMode } from "@/lib/stripe-mode";
import { hourKey, moneyLabel, notifyAdmins, resolveAdminNotifications } from "@/lib/admin-notify";
import {
  getOrderByPaymentIntent,
  getOrderBySession,
  orderFromSession,
  paymentMethodLabel,
  updateOrder,
  upsertOrder,
  type OrderStatus,
} from "@/lib/orders-data";

// Stripe signature verification needs the raw body, so this must run on Node.
export const runtime = "nodejs";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

function utmFrom(meta: Stripe.Metadata | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!meta) return out;
  for (const k of UTM_KEYS) {
    const v = meta[k];
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  return typeof ref === "string" ? ref : (ref?.id ?? null);
}

/** Terminal money states never get downgraded by a late-arriving session event. */
const FINAL: OrderStatus[] = ["refunded", "partially_refunded", "disputed"];

/**
 * One-time purchase (Checkout in `payment` mode): record the order, then, once
 * paid, provision the portal account. Idempotent on the session id. The
 * payment method (card / Klarna / Afterpay / Affirm) is read off the charge so
 * the buy-now-pay-later share is visible in the admin.
 */
async function handleOrderSession(stripe: Stripe, s: Stripe.Checkout.Session, status: OrderStatus) {
  const productId = typeof s.metadata?.product === "string" ? s.metadata.product : null;

  let paymentMethodType: string | null = null;
  const piId = idOf(s.payment_intent);
  if (piId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
      const charge = pi.latest_charge as Stripe.Charge | null;
      paymentMethodType = charge?.payment_method_details?.type ?? pi.payment_method_types?.[0] ?? null;
    } catch (err) {
      console.error("[stripe webhook] payment intent lookup failed", err instanceof Error ? err.message : String(err));
    }
  }

  const existing = await getOrderBySession(s.id);
  const row = orderFromSession(s, { productId, paymentMethodType, status });
  if (existing) {
    if (existing.paid_at) row.paid_at = existing.paid_at;
    if (FINAL.includes(existing.status)) row.status = existing.status;
  }
  const order = await upsertOrder(row);

  // Day 0 of onboarding: the paid customer becomes a portal account and gets
  // their invite within minutes. Never let this break the order record above;
  // a failure here is logged and can be re-run from admin (Add client).
  if (order.status === "paid" && order.email) {
    const businessName = order.business_name || order.name || order.email.split("@")[1] || "New client";
    try {
      await provisionClient({
        client_id: s.client_reference_id ?? null,
        business_name: businessName,
        email: order.email,
        name: order.name,
        phone: order.phone,
        plan_id: productId,
        stripe_customer_id: order.stripe_customer_id,
        order_id: order.id,
        actor_type: "system",
        actor_email: null,
        is_test: !s.livemode,
      });
    } catch (err) {
      console.error("[stripe webhook] client provisioning failed", err instanceof Error ? err.message : String(err));
      await notifyProvisionFailed(s, order.email, err);
    }
  }

  // Staff hear about it once per outcome, and only after provisioning above: a
  // notification must never delay the buyer's account or invite. Keyed on the
  // session, so the three ways one payment can arrive (completed, async
  // succeeded, a retry) are one row. A re-delivery that lands after the order
  // was refunded or disputed keeps that final status and says nothing new.
  if (!(existing && FINAL.includes(existing.status))) {
    const buyer = order.business_name || order.name || order.email || "Someone";
    const amount = moneyLabel(order.amount_total, order.currency);
    const what = getProductMeta(productId)?.name ?? "a one-time purchase";
    const method = paymentMethodLabel(order.payment_method_type);
    await notifyAdmins({
      event: order.status === "paid" ? "order.paid" : order.status === "failed" ? "order.payment_failed" : "order.pending",
      title:
        order.status === "paid"
          ? `${buyer} paid ${amount} for ${what}`
          : order.status === "failed"
            ? `${buyer}'s payment of ${amount} for ${what} failed`
            : `${buyer}'s payment of ${amount} for ${what} is processing`,
      body: [order.email, method && method !== "-" ? method : null, s.livemode ? null : "Stripe sandbox"].filter(Boolean).join(" · "),
      url: order.client_id ? `/admin/clients/${order.client_id}` : "/admin/subscriptions",
      entity: { type: "order", id: order.id },
      clientId: order.client_id ?? null,
      actor: { type: "stripe", label: order.email },
      isTest: !s.livemode,
      dedupeKey: `order:${s.id}:${order.status}`,
      data: {
        email: order.email,
        product: productId,
        amount_total: order.amount_total,
        currency: order.currency,
        payment_method: order.payment_method_type,
        stripe_checkout_session_id: s.id,
      },
    });
  }
}

/** Someone paid and has no portal account. The worst silent failure there is. */
async function notifyProvisionFailed(s: Stripe.Checkout.Session, email: string | null, err: unknown) {
  await notifyAdmins({
    event: "client.provision_failed",
    title: `${email ?? "A customer"} paid, but their portal account was not created`,
    body: `${err instanceof Error ? err.message : String(err)}. Add them by hand from Clients, Add client, so they get their invite.`,
    url: "/admin/clients/new",
    actor: { type: "system", label: email },
    isTest: !s.livemode,
    dedupeKey: `provision_failed:${s.id}`,
    data: { email, stripe_checkout_session_id: s.id },
  });
}

/** Trial end or period end, whichever the subscription is in, as ISO. */
/**
 * A paid checkout is reported to Meta when the buyer accepted advertising
 * cookies: `mctx` is only in the metadata if they did. Keyed on the session
 * id, so a webhook retry or the async-payment event cannot count it twice.
 * Never throws and never blocks the order handling that follows.
 */
async function reportPurchaseToMeta(s: Stripe.Checkout.Session): Promise<void> {
  // A sandbox purchase is not a conversion. Telling Meta about one would train
  // the ads on money that never moved.
  if (!s.livemode) return;
  if (s.payment_status !== "paid" || !s.metadata?.mctx) return;
  try {
    await reportPurchase({
      contextId: s.metadata.mctx,
      sessionId: s.id,
      email: s.customer_details?.email ?? s.customer_email ?? null,
      name: s.customer_details?.name ?? null,
      phone: s.customer_details?.phone ?? null,
      amountTotal: s.amount_total ?? null,
      currency: s.currency ?? null,
      item: s.metadata.product ?? s.metadata.tier ?? null,
    });
  } catch (err) {
    console.error("[stripe webhook] meta purchase report failed", err instanceof Error ? err.message : String(err));
  }
}

function periodEndOf(sub: Stripe.Subscription): string | null {
  // current_period_end moved to the subscription item in recent API versions.
  const end = sub.status === "trialing" && sub.trial_end ? sub.trial_end : (sub.items?.data?.[0]?.current_period_end ?? null);
  return end ? new Date(end * 1000).toISOString() : null;
}

/** Stripe's unix seconds as an ISO string for a timestamptz column. */
function isoOf(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/** "September 17, 2026" in Toronto time, for log lines and client copy. */
function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Toronto" });
}

/** Columns that mark a subscription as a product care plan, read off its metadata. */
function careColumns(meta: Stripe.Metadata | null): { kind: "plan" | "care"; product_id?: string | null; client_id?: string } {
  if (meta?.kind !== "care") return { kind: "plan" };
  return {
    kind: "care",
    product_id: getProductMeta(meta.product) ? meta.product : null,
    ...(meta.client_id ? { client_id: meta.client_id } : {}),
  };
}

/**
 * Care plan started (Checkout in `subscription` mode, metadata.kind = care):
 * the client added a card for the monthly plan attached to their one-time
 * product. Records the subscription against the account, ticks the onboarding
 * step, and never provisions a new client (the account already exists).
 */
async function handleCareSession(stripe: Stripe, s: Stripe.Checkout.Session) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const clientId = s.metadata?.client_id || s.client_reference_id || null;
  const meta = getProductMeta(s.metadata?.product);
  const subId = idOf(s.subscription);
  const customerId = idOf(s.customer);

  let sub: Stripe.Subscription | null = null;
  if (subId) {
    try {
      sub = await stripe.subscriptions.retrieve(subId);
    } catch (err) {
      console.error("[stripe webhook] care subscription lookup failed", err instanceof Error ? err.message : String(err));
    }
  }

  // supabase-js returns a failed write in `error`; it does not throw. Unchecked,
  // a subscription that was never recorded still answered Stripe with 200, so
  // Stripe never retried and nobody was told.
  const { error: careWriteError } = await supabase.from("subscriptions").upsert(
    {
      stripe_customer_id: customerId,
      stripe_subscription_id: subId,
      stripe_checkout_session_id: s.id,
      email: s.customer_details?.email ?? s.customer_email ?? null,
      tier: null,
      kind: "care",
      product_id: meta?.id ?? null,
      client_id: clientId,
      status: sub?.status ?? "active",
      current_period_end: sub ? periodEndOf(sub) : null,
      amount_total: sub?.items?.data?.[0]?.price?.unit_amount ?? s.amount_total ?? null,
      currency: s.currency ?? null,
      livemode: s.livemode,
      raw: (sub ?? s) as unknown as Record<string, unknown>,
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (careWriteError) throw new Error(`care subscription not saved: ${careWriteError.message}`);

  if (!clientId) return;
  const client = await getClientById(clientId);
  if (!client) return;
  if (Boolean(client.is_test) === s.livemode) {
    console.error(`[stripe webhook] care session ${s.id} is ${s.livemode ? "live" : "test"} but client ${client.id} is not. Skipped.`);
    return;
  }
  if (!client.stripe_customer_id && customerId) {
    await updateClient(client.id, { stripe_customer_id: customerId }, "stripe");
  }

  const onboarding = await getActiveOnboarding(client.id);
  if (onboarding && meta?.care) await completeTaskByKey(onboarding.id, meta.care.taskKey, "stripe");

  const planName = meta?.care?.name ?? "Monthly plan";
  const firstCharge = sub?.status === "trialing" && sub.trial_end ? new Date(sub.trial_end * 1000) : null;
  const firstChargeText = firstCharge
    ? firstCharge.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Toronto" })
    : null;

  await logActivity({
    client_id: client.id,
    actor_type: "system",
    event: "care.started",
    entity_type: "subscription",
    summary: firstChargeText ? `${planName} set up. First charge ${firstChargeText}.` : `${planName} set up.`,
    data: { stripe_subscription_id: subId, status: sub?.status ?? null },
    visibility: "client",
  });
  await createNotification({
    client_id: client.id,
    template_key: "care_started",
    subject: `${planName} is set up`,
    body: firstChargeText
      ? `Thanks. Nothing was charged today. Your first monthly charge is on ${firstChargeText}, and you can cancel anytime from Billing.`
      : "Thanks. Your plan is active, and you can cancel anytime from Billing.",
    action_url: "/billing",
  });
}

/** Refunds (full or partial) and disputes on one-time orders. */
async function handleChargeEvent(event: Stripe.Event) {
  const obj = event.data.object as Stripe.Charge | Stripe.Dispute;
  const piId = idOf(obj.payment_intent);
  if (!piId) return;
  const order = await getOrderByPaymentIntent(piId);
  if (!order) {
    // Plan and care plan charges have no orders row. They still get refunded and
    // disputed, and a dispute has an evidence deadline: staff must hear of it.
    const disputedNoOrder = event.type === "charge.dispute.created";
    const charge = obj as Stripe.Charge;
    const email = (charge.billing_details?.email as string | null | undefined) ?? null;
    await notifyAdmins({
      event: disputedNoOrder ? "order.disputed" : "order.refunded",
      title: disputedNoOrder
        ? `${email ?? "A customer"} disputed a subscription payment of ${moneyLabel(obj.amount, obj.currency)}`
        : `${email ?? "A customer"} was refunded ${moneyLabel(charge.amount_refunded ?? obj.amount, obj.currency)} on a subscription payment`,
      body: disputedNoOrder ? "Stripe sets a deadline to respond with evidence. Open the dispute in Stripe now." : null,
      url: "/admin/subscriptions",
      actor: { type: "stripe", label: email },
      isTest: !event.livemode,
      dedupeKey: `evt:${event.id}`,
      data: { payment_intent: piId, amount: obj.amount, currency: obj.currency, email },
    });
    return;
  }

  let patch: Partial<typeof order> = {};
  let summary = "";
  if (event.type === "charge.refunded") {
    const ch = obj as Stripe.Charge;
    const full = ch.refunded || (ch.amount_refunded ?? 0) >= (ch.amount ?? 0);
    patch = {
      amount_refunded: ch.amount_refunded ?? 0,
      status: full ? "refunded" : ch.amount_refunded > 0 ? "partially_refunded" : order.status,
      refunded_at: full ? new Date().toISOString() : order.refunded_at,
    };
    summary = full ? "Order refunded in full" : `Order partially refunded (${((ch.amount_refunded ?? 0) / 100).toFixed(2)} ${ch.currency.toUpperCase()})`;
  } else if (event.type === "charge.dispute.created") {
    patch = { status: "disputed" };
    summary = "Payment disputed by the buyer";
  } else {
    return;
  }

  await updateOrder(order.id, patch);
  const disputed = event.type === "charge.dispute.created";
  await notifyAdmins({
    event: disputed ? "order.disputed" : "order.refunded",
    title: `${order.business_name || order.name || order.email || "An order"}: ${summary}`,
    body: disputed
      ? "Stripe sets a deadline to respond with evidence. Open the dispute in Stripe now."
      : order.email,
    url: "/admin/subscriptions",
    entity: { type: "order", id: order.id },
    clientId: order.client_id ?? null,
    actor: { type: "stripe", label: order.email },
    isTest: order.livemode === false,
    // Partial refunds repeat for real, so this one is keyed on the delivery.
    dedupeKey: `evt:${event.id}`,
    data: { order_id: order.id, email: order.email, ...patch },
  });
  if (order.client_id) {
    await logActivity({
      client_id: order.client_id,
      actor_type: "system",
      event: `billing.${event.type.replace(/\./g, "_")}`,
      entity_type: "order",
      entity_id: order.id,
      summary,
      data: { order_id: order.id, payment_method: paymentMethodLabel(order.payment_method_type), ...patch },
    });
  }
}

/**
 * Stripe webhook: records paying customers (`subscriptions` for plans,
 * `orders` for one-time products), carrying the attribution we forwarded
 * through Checkout metadata, and provisions the portal account. Acknowledges
 * (200) once the signature is valid so Stripe stops retrying; data problems
 * are logged.
 */
/**
 * Live events and sandbox events arrive at this one URL, signed with different
 * secrets. Whichever secret verifies the signature decides the mode, and the
 * Stripe client for the rest of the request is that mode's and no other.
 *
 * Then Stripe's own `livemode` flag has to agree with the secret that
 * verified it. It always should. If it ever does not, the event is refused:
 * a sandbox event must never be handled as a real sale.
 */
function verifyEvent(body: string, sig: string): { event: Stripe.Event; mode: StripeMode; stripe: Stripe } | "unconfigured" | null {
  let configured = false;
  let lastError = "";
  for (const mode of ["live", "test"] as const) {
    const signingSecret = webhookSecret(mode);
    const stripe = stripeFor(mode);
    if (!signingSecret || !stripe) continue;
    configured = true;
    try {
      const event = stripe.webhooks.constructEvent(body, sig, signingSecret);
      if (event.livemode !== (mode === "live")) {
        console.error(
          `[stripe webhook] REFUSED ${event.id}: verified with the ${mode} secret but livemode is ${event.livemode}.`,
        );
        return null;
      }
      return { event, mode, stripe };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  if (!configured) return "unconfigured";
  console.error("[stripe webhook] signature verification failed", lastError);
  return null;
}

/**
 * customer.subscription.updated fires for every change to a subscription, most
 * of them noise. Staff hear about the four that matter, and only on the real
 * transition, read from `previous_attributes`: a cancellation scheduled (the
 * window to save the account), that cancellation undone, the subscription
 * ending, and a payment going past due or recovering.
 */
async function notifySubscriptionChange(
  event: Stripe.Event,
  sub: Stripe.Subscription,
  scheduled: boolean,
  endsAt: string | null,
  isCare: boolean,
  careClientId: string | null,
) {
  const prev = ((event.data as { previous_attributes?: Partial<Stripe.Subscription> }).previous_attributes ?? {}) as Partial<Stripe.Subscription>;
  const label = isCare ? "care plan" : `${sub.metadata?.tier ?? "plan"} subscription`;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Who is this? "A subscription is set to cancel" is no use to anyone with more
  // than one customer. Same mode only: a sandbox event never names a real client.
  let who: string | null = null;
  let clientId: string | null = null;
  try {
    const found = (careClientId ? await getClientById(careClientId) : null) ?? (await getClientByStripeCustomer(customerId));
    if (found && Boolean(found.is_test) !== sub.livemode) {
      who = found.business_name;
      clientId = found.id;
    } else {
      const db = getSupabaseAdmin();
      const { data } = db
        ? await db.from("subscriptions").select("email").eq("stripe_subscription_id", sub.id).maybeSingle()
        : { data: null };
      who = (data?.email as string | undefined) ?? null;
    }
  } catch {
    /* the name is a nicety; the notification still goes out without it */
  }
  const owner = who ? `${who}'s` : "A";

  const base = {
    url: clientId ? `/admin/clients/${clientId}` : "/admin/subscriptions",
    entity: { type: "subscription", id: sub.id },
    clientId,
    actor: { type: "stripe" as const, label: who ?? customerId },
    isTest: !sub.livemode,
    data: {
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      status: sub.status,
      ends_at: endsAt,
      cancellation_reason: sub.cancellation_details?.reason ?? null,
      cancellation_feedback: sub.cancellation_details?.feedback ?? null,
      cancellation_comment: sub.cancellation_details?.comment ?? null,
    },
  };
  const why = [sub.cancellation_details?.reason, sub.cancellation_details?.feedback, sub.cancellation_details?.comment]
    .filter((v) => v && v !== "cancellation_requested")
    .join(": ");
  const on = endsAt ? ` on ${longDate(endsAt)}` : "";

  if (event.type === "customer.subscription.deleted") {
    await notifyAdmins({
      ...base,
      event: "subscription.canceled",
      title: `${owner} ${label} has ended`,
      body: why ? `Their reason: ${why.replace(/_/g, " ")}` : null,
      dedupeKey: `sub:${sub.id}:canceled`,
    });
    // It is over. Nothing left to save, so the "set to cancel" item closes.
    await resolveAdminNotifications({ events: ["subscription.cancel_scheduled", "subscription.past_due", "subscription.payment_failed"], entityId: sub.id });
    return;
  }
  if (event.type !== "customer.subscription.updated") return;

  const wasScheduled =
    typeof prev.cancel_at_period_end === "boolean"
      ? prev.cancel_at_period_end || Boolean(sub.cancel_at && !("cancel_at" in prev))
      : "cancel_at" in prev
        ? Boolean(prev.cancel_at)
        : undefined;
  if (wasScheduled !== undefined && wasScheduled !== scheduled) {
    await notifyAdmins({
      ...base,
      event: scheduled ? "subscription.cancel_scheduled" : "subscription.cancel_undone",
      title: scheduled ? `${owner} ${label} is set to cancel${on}` : `${owner} ${label} was renewed: the cancellation is undone`,
      body: scheduled ? (why ? `Their reason: ${why.replace(/_/g, " ")}. There is still time to save it.` : "There is still time to save it.") : null,
      // Flip-flops are real and repeatable, so this is keyed on the delivery.
      dedupeKey: `evt:${event.id}:cancel`,
    });
    if (!scheduled) await resolveAdminNotifications({ events: ["subscription.cancel_scheduled"], entityId: sub.id });
  }

  if (typeof prev.status === "string" && prev.status !== sub.status) {
    const failing = sub.status === "past_due" || sub.status === "unpaid";
    const wasFailing = prev.status === "past_due" || prev.status === "unpaid";
    // Keyed on the delivery, not on the period end: older Stripe API versions do
    // not send one, and the key then collapsed every later failure into the first.
    if (failing && !wasFailing) {
      await notifyAdmins({
        ...base,
        event: "subscription.past_due",
        title: `A payment failed: ${owner.toLowerCase() === "a" ? "a" : owner} ${label} is now ${sub.status.replace("_", " ")}`,
        body: "Stripe will retry the card. If it keeps failing the subscription ends, so reach out before it does.",
        dedupeKey: `evt:${event.id}:status`,
      });
    } else if (wasFailing && sub.status === "active") {
      await notifyAdmins({
        ...base,
        event: "subscription.recovered",
        title: `A failed payment went through: ${owner.toLowerCase() === "a" ? "the" : owner} ${label} is active again`,
        dedupeKey: `evt:${event.id}:status`,
      });
      await resolveAdminNotifications({ events: ["subscription.past_due", "subscription.payment_failed"], entityId: sub.id });
    }
  }
}

/**
 * Renewals. The subscription events above only show status changes, so a
 * renewal that simply works, and the amount and attempt number of one that does
 * not, are only visible here. These fire once the Stripe endpoint is subscribed
 * to invoice.paid and invoice.payment_failed; until then this code is idle.
 */
async function notifyInvoice(event: Stripe.Event) {
  const inv = event.data.object as Stripe.Invoice & {
    subscription?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  };
  // The subscription id moved inside `parent` in 2025 API versions. Read both.
  const subRef = inv.parent?.subscription_details?.subscription ?? inv.subscription ?? null;
  const subId = typeof subRef === "string" ? subRef : (subRef?.id ?? null);
  if (!subId) return;
  // The first invoice is the purchase itself, already announced as a new subscription.
  if (event.type === "invoice.paid" && inv.billing_reason !== "subscription_cycle") return;

  const who = inv.customer_name || inv.customer_email || "A customer";
  const amount = moneyLabel(event.type === "invoice.paid" ? inv.amount_paid : inv.amount_due, inv.currency);
  const failed = event.type === "invoice.payment_failed";
  await notifyAdmins({
    event: failed ? "subscription.payment_failed" : "subscription.renewed",
    title: failed
      ? `${who}'s renewal of ${amount} failed${inv.attempt_count ? ` (attempt ${inv.attempt_count})` : ""}`
      : `${who} renewed: ${amount}`,
    body: failed ? "Stripe will retry. If it keeps failing the subscription ends, so reach out before it does." : inv.customer_email,
    url: "/admin/subscriptions",
    entity: { type: "subscription", id: subId },
    actor: { type: "stripe", label: inv.customer_email ?? null },
    isTest: !event.livemode,
    dedupeKey: `invoice:${inv.id}:${failed ? `failed:${inv.attempt_count ?? 0}` : "paid"}`,
    data: { invoice_id: inv.id, stripe_subscription_id: subId, amount_due: inv.amount_due, amount_paid: inv.amount_paid, currency: inv.currency, attempt_count: inv.attempt_count ?? null },
  });
  if (!failed) await resolveAdminNotifications({ events: ["subscription.past_due", "subscription.payment_failed"], entityId: subId });
}

// Anyone can POST junk here. The hourly key stops a flood of rows, but not a
// flood of database calls, so this instance alerts at most once an hour.
let lastSignatureAlert = "";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const body = await req.text();
  const verified = verifyEvent(body, sig);
  if (verified === "unconfigured") {
    return NextResponse.json({ error: "Stripe webhook not configured." }, { status: 503 });
  }
  if (!verified) {
    if (lastSignatureAlert !== hourKey("stripe_sig")) {
      lastSignatureAlert = hourKey("stripe_sig");
      await notifyAdmins({
        event: "stripe.webhook_signature_failed",
        title: "A Stripe event failed its signature check",
        body: "If this keeps happening, the webhook signing secret in Vercel no longer matches Stripe, and payments are not being recorded.",
        dedupeKey: hourKey("stripe_sig"),
        collapse: true,
      });
    }
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  const { event, stripe } = verified;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("[stripe webhook] Supabase not configured; event acknowledged but not stored");
    return NextResponse.json({ received: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      await reportPurchaseToMeta(s);

      if (s.mode === "subscription" && s.metadata?.kind === "care") {
        await handleCareSession(stripe, s);
        return NextResponse.json({ received: true });
      }

      if (s.mode === "payment") {
        // Card and BNPL payments confirm synchronously; a still-processing
        // method leaves the order pending until async_payment_succeeded.
        await handleOrderSession(stripe, s, s.payment_status === "paid" ? "paid" : "pending");
        return NextResponse.json({ received: true });
      }

      const customerId = idOf(s.customer);
      const email = s.customer_details?.email ?? s.customer_email ?? null;
      const { data: subRow, error: subWriteError } = await supabase
        .from("subscriptions")
        .upsert(
          {
            stripe_customer_id: customerId,
            stripe_subscription_id: idOf(s.subscription),
            stripe_checkout_session_id: s.id,
            email,
            tier: s.metadata?.tier ?? null,
            status: "active",
            amount_total: s.amount_total ?? null,
            currency: s.currency ?? null,
            livemode: s.livemode,
            ...utmFrom(s.metadata),
            raw: s as unknown as Record<string, unknown>,
          },
          { onConflict: "stripe_subscription_id" },
        )
        .select("id")
        .maybeSingle();
      if (subWriteError) throw new Error(`subscription not saved: ${subWriteError.message}`);

      await notifyAdmins({
        event: "subscription.created",
        title: `${s.customer_details?.name || email || "Someone"} subscribed to ${s.metadata?.tier ?? "a plan"}${s.amount_total ? `: ${moneyLabel(s.amount_total, s.currency)} today` : ""}`,
        body: [email, s.livemode ? null : "Stripe sandbox"].filter(Boolean).join(" · "),
        url: "/admin/subscriptions",
        entity: { type: "subscription", id: (subRow as { id: string } | null)?.id ?? idOf(s.subscription) },
        actor: { type: "stripe", label: email },
        isTest: !s.livemode,
        dedupeKey: `sub:${idOf(s.subscription) ?? s.id}:created`,
        data: { email, tier: s.metadata?.tier ?? null, amount_total: s.amount_total, currency: s.currency, stripe_subscription_id: idOf(s.subscription) },
      });

      // Day 0 of onboarding: the paid customer becomes a portal account and
      // gets their invite within minutes. Never let this break the billing
      // record above; a failure here is logged and can be re-run from admin.
      if (email) {
        const businessField = s.custom_fields?.find((f) => f.key === "business_name");
        const businessName = businessField?.text?.value?.trim() || s.customer_details?.name || email.split("@")[1] || "New client";
        try {
          await provisionClient({
            client_id: s.client_reference_id ?? null,
            business_name: businessName,
            email,
            name: s.customer_details?.name ?? null,
            phone: s.customer_details?.phone ?? null,
            plan_id: s.metadata?.tier ?? null,
            stripe_customer_id: customerId,
            subscription_id: (subRow as { id: string } | null)?.id ?? null,
            actor_type: "system",
            actor_email: null,
            is_test: !s.livemode,
          });
        } catch (err) {
          console.error("[stripe webhook] client provisioning failed", err instanceof Error ? err.message : String(err));
          await notifyProvisionFailed(s, email, err);
        }
      }
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      await reportPurchaseToMeta(event.data.object as Stripe.Checkout.Session);
      await handleOrderSession(stripe, event.data.object as Stripe.Checkout.Session, "paid");
    } else if (event.type === "checkout.session.async_payment_failed") {
      await handleOrderSession(stripe, event.data.object as Stripe.Checkout.Session, "failed");
    } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      await handleChargeEvent(event);
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      await notifyInvoice(event);
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const care = careColumns(sub.metadata);
      // The portal cancels at period end, so the plan stays active until the
      // paid period runs out. Record that as its own state instead of leaving
      // it buried in `raw`. Newer API versions express the same thing as a
      // `cancel_at` date, so treat either as "scheduled to end".
      const scheduled = sub.status !== "canceled" && (sub.cancel_at_period_end || Boolean(sub.cancel_at));
      const endsAt = scheduled ? (isoOf(sub.cancel_at) ?? periodEndOf(sub)) : null;
      const { error: lifecycleWriteError } = await supabase.from("subscriptions").upsert(
        {
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          tier: care.kind === "care" ? null : (sub.metadata?.tier ?? null),
          ...care,
          status: sub.status,
          current_period_end: periodEndOf(sub),
          cancel_at_period_end: sub.cancel_at_period_end,
          cancel_at: isoOf(sub.cancel_at),
          canceled_at: isoOf(sub.canceled_at),
          ended_at: isoOf(sub.ended_at),
          cancellation_reason: sub.cancellation_details?.reason ?? null,
          cancellation_feedback: sub.cancellation_details?.feedback ?? null,
          cancellation_comment: sub.cancellation_details?.comment ?? null,
          livemode: sub.livemode,
          ...utmFrom(sub.metadata),
          raw: sub as unknown as Record<string, unknown>,
        },
        { onConflict: "stripe_subscription_id" },
      );
      if (lifecycleWriteError) throw new Error(`subscription change not saved: ${lifecycleWriteError.message}`);

      await notifySubscriptionChange(event, sub, scheduled, endsAt, care.kind === "care", care.client_id ?? null);

      // Keep the client account in step with billing. A fully cancelled
      // subscription churns the account; everything else is just recorded.
      try {
        const client =
          (care.kind === "care" && care.client_id ? await getClientById(care.client_id) : null) ??
          (await getClientByStripeCustomer(customerId));
        // Same mode only: a sandbox subscription must never churn a real client.
        if (client && Boolean(client.is_test) !== sub.livemode) {
          // Cancelling the care plan ends hosting for that site, so the account
          // churns the same way a cancelled growth plan does.
          if (event.type === "customer.subscription.deleted" && client.status !== "churned") {
            await updateClient(client.id, { status: "churned", churned_at: new Date().toISOString() }, "stripe");
          }
          const label = care.kind === "care" ? (getProductMeta(care.product_id)?.care?.name ?? "Care plan") : "Subscription";

          // A cancellation from the portal arrives as an update with
          // cancel_at_period_end flipped on; renewing before the period ends
          // flips it back. Both get a plain line in the log and a word to the
          // client, instead of "Subscription active" twice.
          const prev = (event.data.previous_attributes ?? {}) as Partial<Stripe.Subscription>;
          const wasScheduled =
            typeof prev.cancel_at_period_end === "boolean"
              ? prev.cancel_at_period_end || Boolean(sub.cancel_at && !("cancel_at" in prev))
              : "cancel_at" in prev
                ? Boolean(prev.cancel_at)
                : undefined;
          const flipped = event.type === "customer.subscription.updated" && wasScheduled !== undefined && wasScheduled !== scheduled;
          const endsText = endsAt ? longDate(endsAt) : null;
          const summary =
            event.type === "customer.subscription.deleted"
              ? `${label} cancelled`
              : flipped && scheduled
                ? `${label} set to cancel${endsText ? ` on ${endsText}` : ""}`
                : flipped
                  ? `${label} renewed, cancellation undone`
                  : `${label} ${sub.status}`;
          await logActivity({
            client_id: client.id,
            actor_type: "system",
            event: `billing.${event.type.replace("customer.subscription.", "subscription_")}`,
            entity_type: "subscription",
            summary,
            data: {
              stripe_subscription_id: sub.id,
              status: sub.status,
              kind: care.kind,
              cancel_at_period_end: sub.cancel_at_period_end,
              ends_at: endsAt,
              feedback: sub.cancellation_details?.feedback ?? null,
            },
          });
          if (flipped) {
            await createNotification({
              client_id: client.id,
              template_key: scheduled ? "subscription_cancel_scheduled" : "subscription_renewed",
              subject: scheduled ? `${label} cancels${endsText ? ` on ${endsText}` : ""}` : `${label} renewed`,
              body: scheduled
                ? `Nothing more will be charged. ${label} runs until ${endsText ?? "the end of the period you have paid for"}, and you can renew it from Billing before then if you change your mind.`
                : `${label} will renew as normal. Thanks for staying.`,
              action_url: "/billing",
            });
          }
        }
      } catch (err) {
        console.error("[stripe webhook] client sync failed", err instanceof Error ? err.message : String(err));
      }
    }
  } catch (err) {
    console.error("[stripe webhook] handler error", err instanceof Error ? err.message : String(err));
    // Stripe retries a 500 for days. One row per event, however many retries.
    await notifyAdmins({
      event: "stripe.webhook_error",
      title: `A Stripe event could not be processed: ${event.type}`,
      body: `${err instanceof Error ? err.message : String(err)}. Stripe will retry it. If this stays unresolved, a payment or cancellation is missing from your records.`,
      url: "/admin/subscriptions",
      isTest: !event.livemode,
      dedupeKey: `stripe_err:${event.id}`,
      data: { stripe_event_id: event.id, type: event.type },
    });
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
