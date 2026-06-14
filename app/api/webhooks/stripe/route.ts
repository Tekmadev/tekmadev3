import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

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

/**
 * Stripe webhook: records paying customers in `subscriptions`, carrying the
 * attribution we forwarded through Checkout metadata. Acknowledges (200) once
 * the signature is valid so Stripe stops retrying; data problems are logged.
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
      await supabase.from("subscriptions").upsert(
        {
          stripe_customer_id: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
          stripe_subscription_id:
            typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null),
          stripe_checkout_session_id: s.id,
          email: s.customer_details?.email ?? s.customer_email ?? null,
          tier: s.metadata?.tier ?? null,
          status: "active",
          amount_total: s.amount_total ?? null,
          currency: s.currency ?? null,
          ...utmFrom(s.metadata),
          raw: s as unknown as Record<string, unknown>,
        },
        { onConflict: "stripe_subscription_id" },
      );
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      // current_period_end moved to the subscription item in recent API versions.
      const periodEnd = sub.items?.data?.[0]?.current_period_end ?? null;
      await supabase.from("subscriptions").upsert(
        {
          stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          stripe_subscription_id: sub.id,
          tier: sub.metadata?.tier ?? null,
          status: sub.status,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          ...utmFrom(sub.metadata),
          raw: sub as unknown as Record<string, unknown>,
        },
        { onConflict: "stripe_subscription_id" },
      );
    }
  } catch (err) {
    console.error("[stripe webhook] handler error", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
