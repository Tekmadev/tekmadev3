import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { provisionClient } from "@/lib/client-provisioning";
import { getClientByStripeCustomer, logActivity, updateClient } from "@/lib/clients-data";

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
      const customerId = typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null);
      const email = s.customer_details?.email ?? s.customer_email ?? null;
      const { data: subRow } = await supabase
        .from("subscriptions")
        .upsert(
          {
            stripe_customer_id: customerId,
            stripe_subscription_id:
              typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null),
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
