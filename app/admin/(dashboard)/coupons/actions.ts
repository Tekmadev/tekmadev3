"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAllPlans } from "@/lib/pricing-data";
import {
  createCouponInStripe,
  deactivateCouponInStripe,
  type CouponScope,
  type CouponDuration,
  type DiscountType,
} from "@/lib/coupon-sync";

const SCOPES: CouponScope[] = ["monthly", "setup", "order"];
const DURATIONS: CouponDuration[] = ["once", "repeating", "forever"];

/** Stripe codes allow A-Z, 0-9 and dashes. Uppercase, strip the rest. */
function normalizeCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function createCouponAction(formData: FormData) {
  await requireOwner();

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) redirect("/admin/coupons?e=nostripe");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/coupons?e=config");

  const name = (String(formData.get("name") || "").trim() || null) as string | null;
  const discountType = String(formData.get("discount_type") || "") as DiscountType;
  const scope = String(formData.get("scope") || "") as CouponScope;
  let duration = String(formData.get("duration") || "once") as CouponDuration;

  if (discountType !== "percent" && discountType !== "fixed") redirect("/admin/coupons?e=input");
  if (!SCOPES.includes(scope)) redirect("/admin/coupons?e=input");
  if (!DURATIONS.includes(duration)) redirect("/admin/coupons?e=input");

  // A one-time setup charge bills once, so repeating/forever is meaningless there.
  if (scope === "setup") duration = "once";

  // Discount amount.
  let percentOff: number | undefined;
  let amountOffCents: number | undefined;
  if (discountType === "percent") {
    percentOff = Number(formData.get("percent"));
    if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) {
      redirect("/admin/coupons?e=percent");
    }
  } else {
    const dollars = Number(formData.get("amount"));
    if (!Number.isFinite(dollars) || dollars <= 0) redirect("/admin/coupons?e=amount");
    amountOffCents = Math.round(dollars * 100);
  }

  // Repeating duration needs a month count.
  let durationInMonths: number | undefined;
  if (duration === "repeating") {
    durationInMonths = Number(formData.get("duration_months"));
    if (!Number.isFinite(durationInMonths) || durationInMonths < 1) redirect("/admin/coupons?e=months");
    durationInMonths = Math.round(durationInMonths);
  }

  // Optional limits.
  let maxRedemptions: number | null = null;
  const maxRaw = formData.get("max_redemptions");
  if (maxRaw && String(maxRaw).trim() !== "") {
    const m = Number(maxRaw);
    if (!Number.isFinite(m) || m < 1) redirect("/admin/coupons?e=max");
    maxRedemptions = Math.round(m);
  }

  let redeemByUnix: number | null = null;
  let redeemByIso: string | null = null;
  const expiresRaw = String(formData.get("expires") || "").trim();
  if (expiresRaw) {
    const d = new Date(expiresRaw);
    if (Number.isNaN(d.getTime())) redirect("/admin/coupons?e=expires");
    redeemByUnix = Math.floor(d.getTime() / 1000);
    redeemByIso = d.toISOString();
  }

  // Resolve product ids for scoping from the live plans.
  const plans = await getAllPlans();
  const currency = plans[0]?.currency || "cad";
  const monthlyProductIds = plans.map((p) => p.stripe_product_id).filter((x): x is string => Boolean(x));
  const setupProductIds = plans.map((p) => p.stripe_setup_product_id).filter((x): x is string => Boolean(x));
  if (scope === "monthly" && monthlyProductIds.length === 0) redirect("/admin/coupons?e=noproducts");
  if (scope === "setup" && setupProductIds.length === 0) redirect("/admin/coupons?e=noproducts");

  // Code: use the given one, else generate.
  const rawCode = String(formData.get("code") || "").trim();
  const code = rawCode ? normalizeCode(rawCode) : randomCode();
  if (!code) redirect("/admin/coupons?e=code");

  // Create in Stripe (coupon + promotion code), then mirror into the DB.
  let couponId: string;
  let promotionCodeId: string;
  try {
    const res = await createCouponInStripe({
      secret,
      code,
      name,
      discountType,
      percentOff,
      amountOffCents,
      currency,
      scope,
      duration,
      durationInMonths,
      maxRedemptions,
      redeemBy: redeemByUnix,
      monthlyProductIds,
      setupProductIds,
    });
    couponId = res.couponId;
    promotionCodeId = res.promotionCodeId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[coupons] Stripe create failed", msg);
    // Most common failure: a duplicate active code.
    redirect(/already exists|unique|code/i.test(msg) ? "/admin/coupons?e=dupe" : "/admin/coupons?e=stripe");
  }

  const { error } = await supabase.from("coupons").insert({
    id: promotionCodeId,
    code,
    stripe_coupon_id: couponId,
    name,
    discount_type: discountType,
    percent_off: discountType === "percent" ? percentOff : null,
    amount_off: discountType === "fixed" ? amountOffCents : null,
    currency: discountType === "fixed" ? currency.toUpperCase() : null,
    applies_to: scope,
    duration,
    duration_in_months: duration === "repeating" ? durationInMonths : null,
    max_redemptions: maxRedemptions,
    redeem_by: redeemByIso,
    active: true,
    times_redeemed: 0,
  });

  if (error) {
    console.error("[coupons] DB insert failed", error.message);
    // The code lives in Stripe but not our table; deactivate it so state stays consistent.
    try {
      await deactivateCouponInStripe(secret, promotionCodeId);
    } catch {
      /* best effort */
    }
    redirect("/admin/coupons?e=db");
  }

  revalidatePath("/admin/coupons");
  redirect(`/admin/coupons?ok=created&code=${encodeURIComponent(code)}`);
}

export async function deactivateCouponAction(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/coupons?e=input");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/coupons?e=config");

  const secret = process.env.STRIPE_SECRET_KEY;
  if (secret) {
    try {
      await deactivateCouponInStripe(secret, id);
    } catch (err) {
      console.error("[coupons] Stripe deactivate failed", err instanceof Error ? err.message : String(err));
      redirect("/admin/coupons?e=stripe");
    }
  }

  const { error } = await supabase.from("coupons").update({ active: false }).eq("id", id);
  if (error) {
    console.error("[coupons] DB deactivate failed", error.message);
    redirect("/admin/coupons?e=db");
  }

  revalidatePath("/admin/coupons");
  redirect("/admin/coupons?ok=disabled");
}
