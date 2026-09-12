import Stripe from "stripe";
import type { ProductMeta } from "@/config/products";

/**
 * Pushes a one-time product's amount to Stripe. Same rules as plan-sync:
 * Stripe prices are immutable, so a new one-time price is created and the
 * previous one archived. The Stripe product is created once and reused so
 * its checkout name, description, and statement descriptor stay stable.
 */
export async function syncProductToStripe(opts: {
  secret: string;
  meta: ProductMeta;
  currency: string; // e.g. "cad"
  amountCents: number;
  /** Absolute URL of an image to show on the Checkout page (optional). */
  imageUrl?: string | null;
  existing: { productId?: string | null; priceId?: string | null };
}): Promise<{ productId: string; priceId: string }> {
  const stripe = new Stripe(opts.secret);
  const currency = opts.currency.toLowerCase();

  let productId = opts.existing.productId || null;
  if (!productId) {
    const product = await stripe.products.create({
      name: opts.meta.stripe.name,
      description: opts.meta.stripe.description,
      statement_descriptor: opts.meta.stripe.statementDescriptor.slice(0, 22),
      images: opts.imageUrl ? [opts.imageUrl] : undefined,
      metadata: { product_id: opts.meta.id, kind: "one_time" },
    });
    productId = product.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    currency,
    unit_amount: opts.amountCents,
    metadata: { product_id: opts.meta.id },
  });

  if (opts.existing.priceId && opts.existing.priceId !== price.id) {
    try {
      await stripe.prices.update(opts.existing.priceId, { active: false });
    } catch {
      /* already archived or missing */
    }
  }

  return { productId, priceId: price.id };
}
