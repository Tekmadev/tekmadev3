import type Stripe from "stripe";
import { getTierMeta } from "@/config/pricing";
import { getProductMeta } from "@/config/products";
import { getPlan } from "@/lib/pricing-data";
import { getProduct } from "@/lib/products-data";

/**
 * Builds Stripe Checkout Session parameters for either a subscription tier
 * (Convert, Grow) or a one-time product (Webline). Shared by the public
 * /api/checkout route and the portal's Plans page, so a lead who signed up
 * first and a visitor who buys straight from the site go through the same
 * rules and land in the same webhook.
 */

export const NOT_CONFIGURED =
  "Online checkout isn't available yet. Please book a call and we'll get you set up.";

export type CheckoutInput = {
  tier?: string;
  product?: string;
  /** UTM / click ids captured on the marketing site. */
  attribution?: Record<string, unknown>;
  /** Startup deal code (subscription tiers only). */
  deal?: string;
  /** Where the site is served from; used for the default return URLs. */
  origin: string;
  /** Override the return URLs (the portal sends buyers back to the portal). */
  urls?: { success: string; cancel: string };
  /** A signed-in portal member: prefill their email and link the session to their account. */
  customerEmail?: string | null;
  clientReferenceId?: string | null;
  businessName?: string | null;
};

export type PreparedCheckout =
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
function businessNameField(defaultValue?: string | null): Stripe.Checkout.SessionCreateParams.CustomField {
  const preset = defaultValue?.trim().slice(0, 255);
  return {
    key: "business_name",
    label: { type: "custom", custom: "Business name" },
    type: "text",
    optional: false,
    ...(preset ? { text: { default_value: preset } } : {}),
  };
}

/** Fields every session gets, whichever offer it is for. */
function common(input: CheckoutInput, metadata: Record<string, string>): Partial<Stripe.Checkout.SessionCreateParams> {
  return {
    billing_address_collection: "required",
    phone_number_collection: { enabled: true },
    custom_fields: [businessNameField(input.businessName)],
    metadata,
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    ...(input.clientReferenceId ? { client_reference_id: input.clientReferenceId } : {}),
  };
}

/**
 * Subscription tiers: setup fee today, monthly starts in 30 days. Price IDs
 * come from the `plans` table (set in the admin dashboard).
 */
async function prepareSubscription(stripe: Stripe, input: CheckoutInput): Promise<PreparedCheckout> {
  const tierId = input.tier ?? "";
  const meta = getTierMeta(tierId);
  if (!meta || meta.cta.type !== "checkout") return { ok: false, error: "Unknown plan.", status: 400 };

  const plan = await getPlan(tierId);
  const monthlyPrice = plan?.stripe_monthly_price_id;
  const setupPrice = plan?.stripe_setup_price_id;
  if (!monthlyPrice) return { ok: false, error: NOT_CONFIGURED, status: 503 };

  const metadata = withAttribution({ tier: tierId }, input.attribution);
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
    ...common(input, metadata),
    success_url: input.urls?.success ?? `${input.origin}/start?checkout=success`,
    cancel_url: input.urls?.cancel ?? `${input.origin}/start?checkout=cancelled`,
    subscription_data: { metadata, trial_period_days: TRIAL_DAYS },
  };

  // Optional startup "deal" link: waive the setup fee (omit the setup line) and
  // auto-apply the deal's promo code. Stripe allows only one discount per
  // checkout, so this replaces allow_promotion_codes rather than stacking.
  const dealCode = (input.deal ?? "").trim();
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
async function prepareProduct(input: CheckoutInput): Promise<PreparedCheckout> {
  const meta = getProductMeta(input.product);
  if (!meta) return { ok: false, error: "Unknown product.", status: 400 };
  const row = await getProduct(meta.id);
  if (!row?.active || !row.stripe_price_id) return { ok: false, error: NOT_CONFIGURED, status: 503 };

  const metadata = withAttribution({ product: meta.id }, input.attribution);

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [{ price: row.stripe_price_id, quantity: 1 }],
    customer_creation: "always",
    invoice_creation: {
      enabled: true,
      invoice_data: { description: `${meta.name}: ${meta.tagline}`, metadata },
    },
    ...common(input, metadata),
    custom_text: { submit: { message: meta.checkout.submitMessage } },
    submit_type: "pay",
    allow_promotion_codes: true,
    success_url: input.urls?.success ?? `${input.origin}${meta.checkout.successPath}`,
    cancel_url: input.urls?.cancel ?? `${input.origin}${meta.checkout.cancelPath}`,
    payment_intent_data: { metadata, description: `${meta.name}: ${meta.tagline}` },
  };

  return { ok: true, params };
}

export async function prepareCheckout(stripe: Stripe, input: CheckoutInput): Promise<PreparedCheckout> {
  if (input.product) return prepareProduct(input);
  return prepareSubscription(stripe, input);
}
