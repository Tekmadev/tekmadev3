"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminCapability } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAllPlans } from "@/lib/pricing-data";
import { getAllProducts } from "@/lib/products-data";
import { getProductMeta } from "@/config/products";
import type { CouponDuration, DiscountType } from "@/lib/coupon-sync";
import { isOneTimeScope, type CouponScope } from "@/lib/coupon-scopes";
import { couponProducts, createCoupon, disableCoupon } from "@/lib/coupon-admin";

const DURATIONS: CouponDuration[] = ["once", "repeating", "forever"];

/** A scope is valid if it is one of the plan scopes or names a real product. */
function isKnownScope(scope: string): scope is CouponScope {
  if (scope === "monthly" || scope === "setup" || scope === "order") return true;
  if (scope.startsWith("product:")) return Boolean(getProductMeta(scope.slice("product:".length)));
  if (scope.startsWith("care:")) {
    const meta = getProductMeta(scope.slice("care:".length));
    return Boolean(meta?.care);
  }
  return false;
}

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
  await requireAdminCapability("coupons.write");

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) redirect("/admin/coupons?e=nostripe");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/coupons?e=config");

  const name = (String(formData.get("name") || "").trim() || null) as string | null;
  const discountType = String(formData.get("discount_type") || "") as DiscountType;
  const scope = String(formData.get("scope") || "") as CouponScope;
  let duration = String(formData.get("duration") || "once") as CouponDuration;

  if (discountType !== "percent" && discountType !== "fixed") redirect("/admin/coupons?e=input");
  if (!isKnownScope(scope)) redirect("/admin/coupons?e=input");
  if (!DURATIONS.includes(duration)) redirect("/admin/coupons?e=input");

  // A one-time charge (setup fee, build fee) bills once, so repeating and
  // forever are meaningless there.
  if (isOneTimeScope(scope)) duration = "once";

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

  let redeemBy: Date | null = null;
  const expiresRaw = String(formData.get("expires") || "").trim();
  if (expiresRaw) {
    // Treat the picked day as valid through its end (UTC), so choosing "today"
    // still lands in the future rather than at a past midnight.
    const d = new Date(`${expiresRaw}T23:59:59.999Z`);
    if (Number.isNaN(d.getTime())) redirect("/admin/coupons?e=expires");
    if (d.getTime() <= Date.now()) redirect("/admin/coupons?e=expirespast");
    redeemBy = d;
  }

  // Resolve the Stripe products this scope is limited to. An empty list means
  // the whole order, which is only correct for the "order" scope: anything else
  // resolving to nothing would silently create a code that discounts every
  // offer, so it is treated as an error.
  const [plans, products] = await Promise.all([getAllPlans(), getAllProducts()]);
  const { productIds, currency } = couponProducts(scope, plans, products);
  if (scope !== "order" && productIds.length === 0) redirect("/admin/coupons?e=noproducts");

  // Code: use the given one, else generate.
  const rawCode = String(formData.get("code") || "").trim();
  const code = rawCode ? normalizeCode(rawCode) : randomCode();
  if (!code) redirect("/admin/coupons?e=code");

  // Create in Stripe (coupon + promotion code), then mirror into the DB.
  const res = await createCoupon({
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
    redeemBy,
    productIds,
  });
  if (!res.ok) {
    if (res.error === "dupe") redirect("/admin/coupons?e=dupe");
    // Surface the real Stripe reason so the dashboard shows it instead of a generic error.
    if (res.error === "stripe") redirect(`/admin/coupons?e=stripe&msg=${encodeURIComponent(res.message.slice(0, 240))}`);
    redirect("/admin/coupons?e=db");
  }

  revalidatePath("/admin/coupons");
  redirect(`/admin/coupons?ok=created&code=${encodeURIComponent(code)}`);
}

export async function deactivateCouponAction(formData: FormData) {
  await requireAdminCapability("coupons.write");

  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/coupons?e=input");

  const res = await disableCoupon(id);
  if (!res.ok) redirect(`/admin/coupons?e=${res.error}`);

  revalidatePath("/admin/coupons");
  redirect("/admin/coupons?ok=disabled");
}
