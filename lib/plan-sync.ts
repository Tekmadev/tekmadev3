import Stripe from "stripe";

/**
 * Pushes a plan's amounts to Stripe. Stripe prices are immutable, so this
 * creates a fresh recurring monthly price (and a one-time setup price when the
 * setup fee is > 0), then archives the previous ones. Reused by the dashboard
 * editor and the initial seed so the behavior is identical everywhere.
 *
 * The setup fee lives under its OWN product so a coupon can discount setup only
 * (Stripe coupons apply at the product level). Existing subscribers are
 * unaffected; only new checkouts use the new prices.
 *
 * The admin API (lib/admin-api/pricing) saves one price at a time, so the
 * steps are also exported on their own: createPlanMonthlyPrice,
 * createPlanSetupPrice and archiveStripePrice.
 */
export async function syncPlanToStripe(opts: {
  secret: string;
  name: string;
  currency: string; // e.g. "cad"
  setupCents: number;
  monthlyCents: number;
  existing: {
    productId?: string | null;
    setupProductId?: string | null;
    monthlyPriceId?: string | null;
    setupPriceId?: string | null;
  };
}): Promise<{
  productId: string;
  setupProductId: string | null;
  monthlyPriceId: string;
  setupPriceId: string | null;
}> {
  const stripe = new Stripe(opts.secret);

  // Subscription product (carries the monthly price). Reused across edits.
  const monthly = await createPlanMonthlyPrice({
    stripe,
    name: opts.name,
    currency: opts.currency,
    monthlyCents: opts.monthlyCents,
    productId: opts.existing.productId,
  });

  // Setup fee: its own product, so a coupon can target setup-only.
  let setupProductId = opts.existing.setupProductId || null;
  let setupPriceId: string | null = null;
  if (opts.setupCents > 0) {
    const setup = await createPlanSetupPrice({
      stripe,
      name: opts.name,
      currency: opts.currency,
      setupCents: opts.setupCents,
      setupProductId,
    });
    setupProductId = setup.setupProductId;
    setupPriceId = setup.setupPriceId;
  }

  // Archive the prices this replaces (best-effort; never block on it).
  for (const old of [opts.existing.monthlyPriceId, opts.existing.setupPriceId]) {
    await archiveStripePrice(stripe, old);
  }

  return { productId: monthly.productId, setupProductId, monthlyPriceId: monthly.priceId, setupPriceId };
}

type StripeOrSecret = Stripe | string;
const client = (s: StripeOrSecret): Stripe => (typeof s === "string" ? new Stripe(s) : s);

/**
 * A new recurring monthly price for a plan, under the plan's subscription
 * product (created on first use). Archives nothing: see archiveStripePrice.
 */
export async function createPlanMonthlyPrice(opts: {
  stripe: StripeOrSecret;
  name: string;
  currency: string;
  monthlyCents: number;
  productId?: string | null;
}): Promise<{ productId: string; priceId: string }> {
  const stripe = client(opts.stripe);
  let productId = opts.productId || null;
  if (!productId) {
    const product = await stripe.products.create({ name: `Tekmadev ${opts.name}` });
    productId = product.id;
  }
  const price = await stripe.prices.create({
    product: productId,
    currency: opts.currency.toLowerCase(),
    unit_amount: opts.monthlyCents,
    recurring: { interval: "month" },
  });
  return { productId, priceId: price.id };
}

/**
 * A new one-time setup price for a plan, under the plan's own setup product
 * (created on first use). Archives nothing: see archiveStripePrice.
 */
export async function createPlanSetupPrice(opts: {
  stripe: StripeOrSecret;
  name: string;
  currency: string;
  setupCents: number;
  setupProductId?: string | null;
}): Promise<{ setupProductId: string; setupPriceId: string }> {
  const stripe = client(opts.stripe);
  let setupProductId = opts.setupProductId || null;
  if (!setupProductId) {
    const setupProduct = await stripe.products.create({ name: `Tekmadev ${opts.name} Setup` });
    setupProductId = setupProduct.id;
  }
  const setupPrice = await stripe.prices.create({
    product: setupProductId,
    currency: opts.currency.toLowerCase(),
    unit_amount: opts.setupCents,
  });
  return { setupProductId, setupPriceId: setupPrice.id };
}

/** Archive a price that was replaced. Best effort: an archived or missing price is fine. */
export async function archiveStripePrice(stripe: StripeOrSecret, priceId: string | null | undefined): Promise<void> {
  if (!priceId) return;
  try {
    await client(stripe).prices.update(priceId, { active: false });
  } catch {
    /* already archived or missing */
  }
}
