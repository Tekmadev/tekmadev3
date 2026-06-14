import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { business } from "@/config/site";
import { getTierMeta } from "@/config/pricing";
import { getPlan } from "@/lib/pricing-data";

// Stripe's SDK needs the Node.js runtime (not Edge).
export const runtime = "nodejs";

const NOT_CONFIGURED =
  "Online checkout isn't available yet. Please book a call and we'll get you set up.";

/**
 * Creates a Stripe Checkout Session for a paid tier and returns its URL. The
 * price IDs come from the `plans` table (set in the admin dashboard), so prices
 * always match what the dashboard shows. Degrades gracefully (friendly 503) when
 * Stripe or the plan's prices are not configured yet.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const tierId = (body as { tier?: string })?.tier ?? "";
  const meta = getTierMeta(tierId);
  if (!meta || meta.cta.type !== "checkout") {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const plan = await getPlan(tierId);
  const monthlyPrice = plan?.stripe_monthly_price_id;
  const setupPrice = plan?.stripe_setup_price_id;
  if (!monthlyPrice) {
    return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  }

  // Carry attribution (UTM / click IDs) onto the customer + subscription.
  const rawAttr = (body as { attribution?: Record<string, unknown> })?.attribution ?? {};
  const metadata: Record<string, string> = { tier: tierId };
  for (const [k, v] of Object.entries(rawAttr)) {
    if (typeof v === "string" && v.length > 0 && v.length <= 480) {
      metadata[k.slice(0, 40)] = v;
    }
  }

  const stripe = new Stripe(secret);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: monthlyPrice, quantity: 1 },
  ];
  if (setupPrice) lineItems.push({ price: setupPrice, quantity: 1 });

  const origin = req.headers.get("origin") || business.url;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: lineItems,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      success_url: `${origin}/start?checkout=success`,
      cancel_url: `${origin}/start?checkout=cancelled`,
      metadata,
      subscription_data: { metadata },
    });

    if (!session.url) {
      return NextResponse.json({ error: NOT_CONFIGURED }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(
      "[checkout] Stripe session creation failed",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "Couldn't start checkout. Please try again or book a call." },
      { status: 500 },
    );
  }
}
