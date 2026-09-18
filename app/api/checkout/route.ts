import { NextResponse, type NextRequest } from "next/server";
import { business } from "@/config/site";
import { getProductMeta } from "@/config/products";
import { NOT_CONFIGURED, prepareCheckout } from "@/lib/checkout";
import { stripeFor } from "@/lib/stripe-mode";
import { checkoutMode } from "@/lib/test-mode";

// Stripe's SDK needs the Node.js runtime (not Edge).
export const runtime = "nodejs";

type Body = {
  tier?: string;
  product?: string;
  attribution?: Record<string, unknown>;
  deal?: unknown;
};

/**
 * Creates a Stripe Checkout Session and returns its URL. Body carries either
 * `tier` (subscription plan) or `product` (one-time purchase). The session
 * rules live in lib/checkout.ts, shared with the portal's Plans page.
 * Degrades gracefully (friendly 503) when Stripe or the price is not
 * configured yet.
 */
export async function POST(req: NextRequest) {
  // Live, unless a signed-in admin has switched test mode on in this browser.
  const mode = await checkoutMode();
  const stripe = stripeFor(mode);
  if (!stripe) {
    return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (body.product && !getProductMeta(body.product)) {
    return NextResponse.json({ error: "Unknown product." }, { status: 400 });
  }

  const origin = req.headers.get("origin") || business.url;

  const prepared = await prepareCheckout(stripe, {
    tier: body.tier,
    product: body.product,
    attribution: body.attribution,
    deal: String(body.deal ?? ""),
    origin,
    mode,
  });
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  }

  try {
    const session = await stripe.checkout.sessions.create(prepared.params);
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
