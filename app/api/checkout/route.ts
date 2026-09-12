import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { business } from "@/config/site";
import { getTierMeta } from "@/config/pricing";
import { getProductMeta, type ProductMeta } from "@/config/products";
import { getPlan } from "@/lib/pricing-data";
import { getProduct } from "@/lib/products-data";

// Stripe's SDK needs the Node.js runtime (not Edge).
export const runtime = "nodejs";

const NOT_CONFIGURED =
  "Online checkout isn't available yet. Please book a call and we'll get you set up.";

type Body = {
  tier?: string;
  product?: string;
  attribution?: Record<string, unknown>;
  deal?: unknown;
};

type Prepared =
  | { ok: true; params: Stripe.Checkout.SessionCreateParams }
  | { ok: false; error: string; status: number };

/** Carry attribution (UTM / click IDs) onto the customer and the Stripe objects. */
function withAttribution(base: Record<string, string>, rawAttr: Record<string, unknown> | undefined): Record<string, string> {
  const metadata = { ...base };
  for (const [k, v] of Object.entries(rawAttr ?? {})) {
    if (typeof v === "string" && v.length > 0 && v.length <= 480) {
      metadata[k.slice(0, 40)] = v;
    }
  }
  return metadata;
}

// Business name and phone feed the client portal account the webhook creates
// the moment payment clears (see app/api/webhooks/stripe).
const BUSINESS_NAME_FIELD: Stripe.Checkout.SessionCreateParams.CustomField = {
  key: "business_name",
  label: { type: "custom", custom: "Business name" },
  type: "text",
  optional: false,
};

/**
 * Subscription tiers (Convert, Grow): setup fee today, monthly starts in 30
 * days. Price IDs come from the `plans` table (set in the admin dashboard).
 */
async function prepareSubscription(stripe: Stripe, body: Body, origin: string): Promise<Prepared> {
  const tierId = body.tier ?? "";
  const meta = getTierMeta(tierId);
  if (!meta || meta.cta.type !== "checkout") return { ok: false, error: "Unknown plan.", status: 400 };

  const plan = await getPlan(tierId);
  const monthlyPrice = plan?.stripe_monthly_price_id;
  const setupPrice = plan?.stripe_setup_price_id;
  if (!monthlyPrice) return { ok: false, error: NOT_CONFIGURED, status: 503 };

  const metadata = withAttribution({ tier: tierId }, body.attribution);
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: monthlyPrice, quantity: 1 }];

  // The monthly subscription starts one month after the setup is paid. A trial
  // delays only the recurring price; a one-time line item (the setup fee) sits
  // on the first invoice, which Stripe cuts immediately at checkout. So the
  // client is charged the setup today and the first monthly charge lands ~30
  // days later. See https://docs.stripe.com/payments/checkout/free-trials
  const TRIAL_DAYS = 30;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: lineItems,
    billing_address_collection: "required",
    phone_number_collection: { enabled: true },
    custom_fields: [BUSINESS_NAME_FIELD],
    success_url: `${origin}/start?checkout=success`,
    cancel_url: `${origin}/start?checkout=cancelled`,
    metadata,
    subscription_data: { metadata, trial_period_days: TRIAL_DAYS },
  };

  // Optional startup "deal" link: waive the setup fee (omit the setup line) and
  // auto-apply the deal's promo code. Stripe allows only one discount per
  // checkout, so this replaces allow_promotion_codes rather than stacking.
  const dealCode = String(body.deal ?? "").trim();
  if (dealCode) {
    let promoId: string | undefined;
    try {
      const found = await stripe.promotionCodes.list({ code: dealCode, active: true, limit: 1 });
      promoId = found.data[0]?.id;
    } catch (err) {
      console.error("[checkout] deal lookup failed", err instanceof Error ? err.message : String(err));
      return { ok: false, error: "Couldn't apply the deal. Please try again or book a call.", status: 502 };
    }
    if (!promoId) return { ok: false, error: "This deal link is no longer valid.", status: 400 };
    metadata.deal = dealCode.slice(0, 40);
    params.discounts = [{ promotion_code: promoId }];
  } else {
    if (setupPrice) lineItems.push({ price: setupPrice, quantity: 1 });
    params.allow_promotion_codes = true;
  }

  return { ok: true, params };
}

/**
 * One-time products (Webline): a single payment today. No payment_method_types
 * are passed, so Stripe's dynamic payment methods apply and the account's
 * enabled buy-now-pay-later options (Afterpay, Klarna, Affirm) appear
 * automatically for eligible buyers. A Customer is always created so the
 * portal account and the Stripe billing portal (receipts) line up.
 */
async function prepareProduct(meta: ProductMeta, body: Body, origin: string): Promise<Prepared> {
  const row = await getProduct(meta.id);
  if (!row?.active || !row.stripe_price_id) return { ok: false, error: NOT_CONFIGURED, status: 503 };

  const metadata = withAttribution({ product: meta.id }, body.attribution);

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [{ price: row.stripe_price_id, quantity: 1 }],
    customer_creation: "always",
    invoice_creation: {
      enabled: true,
      invoice_data: { description: `${meta.name}: ${meta.tagline}`, metadata },
    },
    billing_address_collection: "required",
    phone_number_collection: { enabled: true },
    custom_fields: [BUSINESS_NAME_FIELD],
    custom_text: { submit: { message: meta.checkout.submitMessage } },
    submit_type: "pay",
    allow_promotion_codes: true,
    success_url: `${origin}${meta.checkout.successPath}`,
    cancel_url: `${origin}${meta.checkout.cancelPath}`,
    metadata,
    payment_intent_data: { metadata, description: `${meta.name}: ${meta.tagline}` },
  };

  return { ok: true, params };
}

/**
 * Creates a Stripe Checkout Session and returns its URL. Body carries either
 * `tier` (subscription plan) or `product` (one-time purchase). Degrades
 * gracefully (friendly 503) when Stripe or the price is not configured yet.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const stripe = new Stripe(secret);
  const origin = req.headers.get("origin") || business.url;

  const product = body.product ? getProductMeta(body.product) : undefined;
  if (body.product && !product) {
    return NextResponse.json({ error: "Unknown product." }, { status: 400 });
  }

  const prepared = product ? await prepareProduct(product, body, origin) : await prepareSubscription(stripe, body, origin);
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
