"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPlan } from "@/lib/pricing-data";
import { syncPlanToStripe } from "@/lib/plan-sync";

/**
 * Updates a plan's price from the dashboard: writes the new amounts to the DB
 * (so /start updates immediately) and, if Stripe is configured, creates the new
 * Stripe prices and archives the old ones (so checkout uses the new amount).
 */
export async function updatePlanAction(formData: FormData) {
  await requireAdmin();

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
