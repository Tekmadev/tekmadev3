import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { provisionClient } from "@/lib/client-provisioning";
import { getClientByStripeCustomer, logActivity, updateClient } from "@/lib/clients-data";
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
      // current_period_end moved to the subscription item in recent API versions.
      const periodEnd = sub.items?.data?.[0]?.current_period_end ?? null;
      await supabase.from("subscriptions").upsert(
        {
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          tier: sub.metadata?.tier ?? null,
          status: sub.status,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          ...utmFrom(sub.metadata),
          raw: sub as unknown as Record<string, unknown>,
        },
        { onConflict: "stripe_subscription_id" },
      );

      // Keep the client account in step with billing. A fully cancelled
      // subscription churns the account; everything else is just recorded.
      try {
        const client = await getClientByStripeCustomer(customerId);
        if (client) {
          if (event.type === "customer.subscription.deleted" && client.status !== "churned") {
            await updateClient(client.id, { status: "churned", churned_at: new Date().toISOString() }, "stripe");
          }
          await logActivity({
            client_id: client.id,
            actor_type: "system",
            event: `billing.${event.type.replace("customer.subscription.", "subscription_")}`,
            entity_type: "subscription",
            summary: `Subscription ${sub.status}`,
            data: { stripe_subscription_id: sub.id, status: sub.status },
          });
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
