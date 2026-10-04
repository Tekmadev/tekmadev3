import { getSupabaseAdmin } from "@/lib/supabase";
import type { PlanFull } from "@/lib/pricing-data";
import type { ProductRow } from "@/lib/products-data";
import type { CouponRow } from "@/lib/coupon-data";
import { createCouponInStripe, deactivateCouponInStripe, type CouponDuration, type DiscountType } from "@/lib/coupon-sync";
import type { CouponScope } from "@/lib/coupon-scopes";
import { scopeProductId } from "@/lib/coupon-scopes";

/**
 * Creating and disabling discount codes, shared by Admin, Coupons (server
 * actions) and the admin API (/api/admin/v1/coupons). Each caller validates its
 * own input and words its own errors; the Stripe and database steps live here
 * so both behave the same.
 */

/**
 * The Stripe products a scope is limited to, from the plans and products rows
 * the caller read. An empty list means the whole order: right for "order"
 * (Anything), and a "no matching Stripe products yet" error for any other scope.
 */
export function couponProducts(
  scope: CouponScope,
  plans: Pick<PlanFull, "currency" | "stripe_product_id" | "stripe_setup_product_id">[],
  products: Pick<ProductRow, "id" | "currency" | "stripe_product_id" | "stripe_monthly_product_id">[],
): { productIds: string[]; currency: string } {
  const productRow = products.find((p) => p.id === scopeProductId(scope)) ?? null;

  let productIds: string[] = [];
  let currency = plans[0]?.currency || "cad";
  if (scope === "monthly") {
    productIds = plans.map((p) => p.stripe_product_id).filter((x): x is string => Boolean(x));
  } else if (scope === "setup") {
    productIds = plans.map((p) => p.stripe_setup_product_id).filter((x): x is string => Boolean(x));
  } else if (scope.startsWith("product:")) {
    productIds = productRow?.stripe_product_id ? [productRow.stripe_product_id] : [];
    currency = productRow?.currency || currency;
  } else if (scope.startsWith("care:")) {
    productIds = productRow?.stripe_monthly_product_id ? [productRow.stripe_monthly_product_id] : [];
    currency = productRow?.currency || currency;
  }
  return { productIds, currency };
}

export type CreateCouponResult =
  | { ok: true; row: CouponRow }
  /** Stripe already has a promotion code with that code. */
  | { ok: false; error: "dupe"; message: string }
  /** Stripe refused the coupon; `message` is Stripe's own, for logs and the web admin. */
  | { ok: false; error: "stripe"; message: string }
  /** Created in Stripe, but the database write failed, so the code was disabled again. */
  | { ok: false; error: "db"; message: string };

/**
 * Creates the coupon in Stripe (coupon + promotion code), then mirrors it into
 * the `coupons` table. If the table write fails, the Stripe code is disabled so
 * the two never disagree.
 */
export async function createCoupon(opts: {
  secret: string;
  /** Already normalized: A-Z, 0-9 and dashes. */
  code: string;
  name: string | null;
  /**
   * Whether the name goes to Stripe as the coupon name, where buyers see it on
   * invoices and receipts. The web admin sends it; the app's label is internal.
   */
  nameInStripe?: boolean;
  discountType: DiscountType;
  percentOff?: number;
  amountOffCents?: number;
  currency: string;
  scope: CouponScope;
  duration: CouponDuration;
  durationInMonths?: number;
  maxRedemptions: number | null;
  /** The last moment the code works, or null for no expiry. */
  redeemBy: Date | null;
  productIds: string[];
}): Promise<CreateCouponResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "db", message: "Supabase is not configured." };

  const redeemByUnix = opts.redeemBy ? Math.floor(opts.redeemBy.getTime() / 1000) : null;
  const redeemByIso = opts.redeemBy ? opts.redeemBy.toISOString() : null;

  let couponId: string;
  let promotionCodeId: string;
  try {
    const res = await createCouponInStripe({
      secret: opts.secret,
      code: opts.code,
      name: opts.nameInStripe === false ? null : opts.name,
      discountType: opts.discountType,
      percentOff: opts.percentOff,
      amountOffCents: opts.amountOffCents,
      currency: opts.currency,
      scope: opts.scope,
      duration: opts.duration,
      durationInMonths: opts.durationInMonths,
      maxRedemptions: opts.maxRedemptions,
      redeemBy: redeemByUnix,
      productIds: opts.productIds,
    });
    couponId = res.couponId;
    promotionCodeId = res.promotionCodeId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[coupons] Stripe create failed", message);
    if (/already exists/i.test(message)) return { ok: false, error: "dupe", message };
    return { ok: false, error: "stripe", message };
  }

  const { data, error } = await supabase
    .from("coupons")
    .insert({
      id: promotionCodeId,
      code: opts.code,
      stripe_coupon_id: couponId,
      name: opts.name,
      discount_type: opts.discountType,
      percent_off: opts.discountType === "percent" ? opts.percentOff : null,
      amount_off: opts.discountType === "fixed" ? opts.amountOffCents : null,
      currency: opts.discountType === "fixed" ? opts.currency.toUpperCase() : null,
      applies_to: opts.scope,
      duration: opts.duration,
      duration_in_months: opts.duration === "repeating" ? opts.durationInMonths : null,
      max_redemptions: opts.maxRedemptions,
      redeem_by: redeemByIso,
      active: true,
      times_redeemed: 0,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[coupons] DB insert failed", error?.message ?? "no row returned");
    // The code lives in Stripe but not our table; deactivate it so state stays consistent.
    try {
      await deactivateCouponInStripe(opts.secret, promotionCodeId);
    } catch {
      /* best effort */
    }
    return { ok: false, error: "db", message: error?.message ?? "no row returned" };
  }

  return { ok: true, row: data as CouponRow };
}

export type DisableCouponResult = { ok: true } | { ok: false; error: "config" | "stripe" | "db" };

/**
 * Disables a code so it can no longer be redeemed: in Stripe first (when Stripe
 * is configured), then in the `coupons` table. There is no re-enable.
 */
export async function disableCoupon(id: string): Promise<DisableCouponResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "config" };

  const secret = process.env.STRIPE_SECRET_KEY;
  if (secret) {
    try {
      await deactivateCouponInStripe(secret, id);
    } catch (err) {
      console.error("[coupons] Stripe deactivate failed", err instanceof Error ? err.message : String(err));
      return { ok: false, error: "stripe" };
    }
  }

  const { error } = await supabase.from("coupons").update({ active: false }).eq("id", id);
  if (error) {
    console.error("[coupons] DB deactivate failed", error.message);
    return { ok: false, error: "db" };
  }
  return { ok: true };
}
