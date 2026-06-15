import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { CouponScope, CouponDuration, DiscountType } from "@/lib/coupon-sync";

/** A coupon row mirrored from Stripe into the `coupons` table. */
export type CouponRow = {
  id: string; // promotion code id (promo_...)
  code: string;
  stripe_coupon_id: string;
  name: string | null;
  discount_type: DiscountType;
  percent_off: number | null;
  amount_off: number | null; // cents
  currency: string | null;
  applies_to: CouponScope;
  duration: CouponDuration;
  duration_in_months: number | null;
  max_redemptions: number | null;
  redeem_by: string | null;
  active: boolean;
  times_redeemed: number;
  created_at: string;
};

export async function getCoupons(): Promise<CouponRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
  return (data as CouponRow[]) ?? [];
}

/**
 * Coupons for the dashboard list, enriched with LIVE redemption counts and
 * active state from Stripe (the source of truth for usage). Falls back to the
 * stored values if Stripe is unconfigured or unreachable.
 */
export async function getCouponsView(): Promise<CouponRow[]> {
  const rows = await getCoupons();
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || rows.length === 0) return rows;

  try {
    const stripe = new Stripe(secret);
    const live = await stripe.promotionCodes.list({ limit: 100 });
    const byId = new Map(live.data.map((p) => [p.id, p]));
    return rows.map((r) => {
      const p = byId.get(r.id);
      return p ? { ...r, times_redeemed: p.times_redeemed, active: p.active } : r;
    });
  } catch {
    return rows;
  }
}
