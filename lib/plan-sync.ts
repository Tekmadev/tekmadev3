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
  const currency = opts.currency.toLowerCase();

  // Subscription product (carries the monthly price). Reused across edits.
  let productId = opts.existing.productId || null;
  if (!productId) {
    const product = await stripe.products.create({ name: `Tekmadev ${opts.name}` });
    productId = product.id;
  }

  const monthlyPrice = await stripe.prices.create({
    product: productId,
    currency,
    unit_amount: opts.monthlyCents,
    recurring: { interval: "month" },
  });

  // Setup fee: its own product, so a coupon can target setup-only.
  let setupProductId = opts.existing.setupProductId || null;
  let setupPriceId: string | null = null;
  if (opts.setupCents > 0) {
    if (!setupProductId) {
      const setupProduct = await stripe.products.create({ name: `Tekmadev ${opts.name} Setup` });
      setupProductId = setupProduct.id;
    }
    const setupPrice = await stripe.prices.create({
      product: setupProductId,
      currency,
      unit_amount: opts.setupCents,
    });
    setupPriceId = setupPrice.id;
  }

  // Archive the prices this replaces (best-effort; never block on it).
  for (const old of [opts.existing.monthlyPriceId, opts.existing.setupPriceId]) {
    if (old) {
      try {
        await stripe.prices.update(old, { active: false });
      } catch {
        /* already archived or missing */
      }
    }
  }

  return { productId, setupProductId, monthlyPriceId: monthlyPrice.id, setupPriceId };
}
