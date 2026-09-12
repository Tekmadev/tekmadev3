"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPlan } from "@/lib/pricing-data";
import { syncPlanToStripe } from "@/lib/plan-sync";
import { getProductMeta } from "@/config/products";
import { business } from "@/config/site";
import { getProduct } from "@/lib/products-data";
import { syncProductToStripe } from "@/lib/product-sync";

/**
 * Updates a plan's price from the dashboard: writes the new amounts to the DB
 * (so /start updates immediately) and, if Stripe is configured, creates the new
 * Stripe prices and archives the old ones (so checkout uses the new amount).
 */
export async function updatePlanAction(formData: FormData) {
  await requireOwner();

  const tierId = String(formData.get("tier") || "");
  const monthlyDollars = Number(formData.get("monthly"));
  const setupDollars = Number(formData.get("setup"));

  if (
    !tierId ||
    !Number.isFinite(monthlyDollars) ||
    monthlyDollars < 0 ||
    !Number.isFinite(setupDollars) ||
    setupDollars < 0
  ) {
    redirect("/admin/pricing?e=input");
  }

  const plan = await getPlan(tierId);
  if (!plan) redirect("/admin/pricing?e=notfound");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/pricing?e=config");

  const monthlyCents = Math.round(monthlyDollars * 100);
  const setupCents = Math.round(setupDollars * 100);

  const update: Record<string, unknown> = {
    setup_amount: setupCents,
    monthly_amount: monthlyCents,
  };

  const secret = process.env.STRIPE_SECRET_KEY;
  if (secret) {
    try {
      const synced = await syncPlanToStripe({
        secret,
        name: plan.name,
        currency: plan.currency || "cad",
        setupCents,
        monthlyCents,
        existing: {
          productId: plan.stripe_product_id,
          setupProductId: plan.stripe_setup_product_id,
          monthlyPriceId: plan.stripe_monthly_price_id,
          setupPriceId: plan.stripe_setup_price_id,
        },
      });
      update.stripe_product_id = synced.productId;
      update.stripe_setup_product_id = synced.setupProductId;
      update.stripe_monthly_price_id = synced.monthlyPriceId;
      update.stripe_setup_price_id = synced.setupPriceId;
    } catch (err) {
      console.error("[pricing] Stripe sync failed", err instanceof Error ? err.message : String(err));
      redirect("/admin/pricing?e=stripe");
    }
  }

  const { error } = await supabase.from("plans").update(update).eq("id", tierId);
  if (error) {
    console.error("[pricing] DB update failed", error.message);
    redirect("/admin/pricing?e=db");
  }

  revalidatePath("/start");
  redirect("/admin/pricing?ok=1");
}

/**
 * Updates a one-time product (Webline): writes the amount to the DB (the sales
 * page and llms.txt re-render) and creates the new Stripe price, archiving the
 * old one. The Stripe product itself is created on first save.
 */
export async function updateProductAction(formData: FormData) {
  await requireOwner();

  const productId = String(formData.get("product") || "");
  const meta = getProductMeta(productId);
  const amountDollars = Number(formData.get("amount"));
  const compareRaw = String(formData.get("compare_at") || "").trim();
  const compareDollars = compareRaw ? Number(compareRaw) : null;
  const active = formData.get("active") === "on";

  if (
    !meta ||
    !Number.isFinite(amountDollars) ||
    amountDollars < 0 ||
    (compareDollars !== null && (!Number.isFinite(compareDollars) || compareDollars < 0))
  ) {
    redirect("/admin/pricing?e=input");
  }

  const row = await getProduct(meta.id);
  if (!row) redirect("/admin/pricing?e=notfound");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/pricing?e=config");

  const amountCents = Math.round(amountDollars * 100);
  const update: Record<string, unknown> = {
    amount: amountCents,
    compare_at_amount: compareDollars === null ? null : Math.round(compareDollars * 100),
    active,
  };

  const secret = process.env.STRIPE_SECRET_KEY;
  if (secret && (row.amount !== amountCents || !row.stripe_price_id)) {
    try {
      const synced = await syncProductToStripe({
        secret,
        meta,
        currency: row.currency || "cad",
        amountCents,
        imageUrl: `${business.url}${meta.path}/opengraph-image`,
        existing: { productId: row.stripe_product_id, priceId: row.stripe_price_id },
      });
      update.stripe_product_id = synced.productId;
      update.stripe_price_id = synced.priceId;
    } catch (err) {
      console.error("[pricing] Stripe product sync failed", err instanceof Error ? err.message : String(err));
      redirect("/admin/pricing?e=stripe");
    }
  }

  const { error } = await supabase.from("products").update(update).eq("id", meta.id);
  if (error) {
    console.error("[pricing] product update failed", error.message);
    redirect("/admin/pricing?e=db");
  }

  revalidatePath(meta.path);
  revalidatePath("/llms.txt");
  redirect("/admin/pricing?ok=1");
}
