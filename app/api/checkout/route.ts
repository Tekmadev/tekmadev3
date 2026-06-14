import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { business } from "@/config/site";
import { getTier, STRIPE_PRICE_ENV, type PaidTierId } from "@/config/pricing";

// Stripe's SDK needs the Node.js runtime (not Edge).
export const runtime = "nodejs";

const NOT_CONFIGURED =
  "Online checkout isn't available yet. Please book a call and we'll get you set up.";

/**
 * Creates a Stripe Checkout Session for a paid tier and returns its URL.
 * The client redirects the browser to that URL.
 *
 * Everything degrades gracefully: if the secret key or a tier's price IDs are
 * missing, we return a friendly 503 and the page tells the visitor to book a
 * call. Nothing throws, the page never breaks.
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
  const tier = getTier(tierId);
  if (!tier || tier.cta.type !== "checkout") {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const envNames = STRIPE_PRICE_ENV[tierId as PaidTierId];
  const monthlyPrice = envNames ? process.env[envNames.monthly] : undefined;
  const setupPrice = envNames ? process.env[envNames.setup] : undefined;
  if (!monthlyPrice) {
    return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  }

  // Carry attribution (UTM / click IDs) onto the Stripe customer + subscription
  // so every paying customer is tied back to the source that won them.
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
  // One-time setup fee, billed on the first invoice (optional).
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
    console.error("[checkout] Stripe session creation failed", {
      tier: tierId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Couldn't start checkout. Please try again or book a call." },
      { status: 500 },
    );
  }
}
