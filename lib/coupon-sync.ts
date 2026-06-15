import Stripe from "stripe";

/**
 * Creates a discount in Stripe as a Coupon (the discount rule) + a Promotion
 * Code (the customer-facing code typed at checkout). Checkout already passes
 * `allow_promotion_codes: true`, so any code created here is usable immediately.
 *
 * Scoping leans on the fact that setup and monthly live under SEPARATE Stripe
 * products (see lib/plan-sync.ts): a coupon's `applies_to.products` restricts
 * the discount to just the monthly products, just the setup products, or
 * (omitted) the whole order.
 */
export type CouponScope = "monthly" | "setup" | "order";
export type CouponDuration = "once" | "repeating" | "forever";
export type DiscountType = "percent" | "fixed";

export async function createCouponInStripe(opts: {
  secret: string;
  code: string; // already normalized (A-Z, 0-9, dashes)
  name?: string | null;
  discountType: DiscountType;
  percentOff?: number; // 1..100, when discountType = "percent"
  amountOffCents?: number; // > 0, when discountType = "fixed"
  currency?: string; // required when fixed, e.g. "cad"
  scope: CouponScope;
  duration: CouponDuration;
  durationInMonths?: number; // when duration = "repeating"
  maxRedemptions?: number | null;
  redeemBy?: number | null; // unix seconds
  monthlyProductIds: string[];
  setupProductIds: string[];
}): Promise<{ couponId: string; promotionCodeId: string }> {
  const stripe = new Stripe(opts.secret);

  const couponParams: Stripe.CouponCreateParams = { duration: opts.duration };
  if (opts.name) couponParams.name = opts.name;

  if (opts.discountType === "percent") {
    couponParams.percent_off = opts.percentOff;
  } else {
    couponParams.amount_off = opts.amountOffCents;
    couponParams.currency = (opts.currency || "cad").toLowerCase();
  }

  if (opts.duration === "repeating") couponParams.duration_in_months = opts.durationInMonths;
  if (opts.maxRedemptions && opts.maxRedemptions > 0) couponParams.max_redemptions = opts.maxRedemptions;
  if (opts.redeemBy) couponParams.redeem_by = opts.redeemBy;

  // Restrict which products the discount applies to. "order" => whole cart.
  const products =
    opts.scope === "monthly"
      ? opts.monthlyProductIds
      : opts.scope === "setup"
        ? opts.setupProductIds
        : [];
  if (products.length > 0) couponParams.applies_to = { products };

  const coupon = await stripe.coupons.create(couponParams);

  try {
    const promo = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: coupon.id },
      code: opts.code,
      active: true,
    });
    return { couponId: coupon.id, promotionCodeId: promo.id };
  } catch (err) {
    // Roll back the orphan coupon so a failed code (e.g. duplicate) leaves nothing behind.
    try {
      await stripe.coupons.del(coupon.id);
    } catch {
      /* best effort */
    }
    throw err;
  }
}

/** Disables a promotion code so it can no longer be redeemed at checkout. */
export async function deactivateCouponInStripe(secret: string, promotionCodeId: string): Promise<void> {
  const stripe = new Stripe(secret);
  await stripe.promotionCodes.update(promotionCodeId, { active: false });
}
