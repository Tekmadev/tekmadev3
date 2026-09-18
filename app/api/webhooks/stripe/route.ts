import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { provisionClient } from "@/lib/client-provisioning";
import { createNotification, getClientById, getClientByStripeCustomer, logActivity, updateClient } from "@/lib/clients-data";
import { completeTaskByKey, getActiveOnboarding } from "@/lib/onboarding-data";
import { getProductMeta } from "@/config/products";
import { reportPurchase } from "@/lib/meta-conversions";
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
      });
    } catch (err) {
      console.error("[stripe webhook] client provisioning failed", err instanceof Error ? err.message : String(err));
    }
  }
}

/** Trial end or period end, whichever the subscription is in, as ISO. */
/**
 * A paid checkout is reported to Meta when the buyer accepted advertising
 * cookies: `mctx` is only in the metadata if they did. Keyed on the session
 * id, so a webhook retry or the async-payment event cannot count it twice.
 * Never throws and never blocks the order handling that follows.
 */
async function reportPurchaseToMeta(s: Stripe.Checkout.Session): Promise<void> {
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

  await supabase.from("subscriptions").upsert(
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
      raw: (sub ?? s) as unknown as Record<string, unknown>,
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (!clientId) return;
  const client = await getClientById(clientId);
  if (!client) return;
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
  if (!order) return;

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
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook not configured." }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const body = await req.text();
  const stripe = new Stripe(secret);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error(
      "[stripe webhook] signature verification failed",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

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
      const { data: subRow } = await supabase
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
            ...utmFrom(s.metadata),
            raw: s as unknown as Record<string, unknown>,
          },
          { onConflict: "stripe_subscription_id" },
        )
        .select("id")
        .maybeSingle();

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
          });
        } catch (err) {
          console.error("[stripe webhook] client provisioning failed", err instanceof Error ? err.message : String(err));
        }
      }
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      await reportPurchaseToMeta(event.data.object as Stripe.Checkout.Session);
      await handleOrderSession(stripe, event.data.object as Stripe.Checkout.Session, "paid");
    } else if (event.type === "checkout.session.async_payment_failed") {
      await handleOrderSession(stripe, event.data.object as Stripe.Checkout.Session, "failed");
    } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      await handleChargeEvent(event);
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
      await supabase.from("subscriptions").upsert(
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
          ...utmFrom(sub.metadata),
          raw: sub as unknown as Record<string, unknown>,
        },
        { onConflict: "stripe_subscription_id" },
      );

      // Keep the client account in step with billing. A fully cancelled
      // subscription churns the account; everything else is just recorded.
      try {
        const client =
          (care.kind === "care" && care.client_id ? await getClientById(care.client_id) : null) ??
          (await getClientByStripeCustomer(customerId));
        if (client) {
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
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
