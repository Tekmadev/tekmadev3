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
import { reconcileProductCopy, syncCarePlanToStripe, syncProductToStripe } from "@/lib/product-sync";
import { setSalesTax } from "@/lib/site-settings";
import { notifyAdmins } from "@/lib/admin-notify";

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
 * Updates a product (Webline): the one-time amount and, when the product has a
 * care plan, the monthly amount and how many days after purchase it starts.
 * Writes to the DB (the sales page, home page, and llms.txt re-render) and
 * creates new Stripe prices for whichever amount changed, archiving the old
 * ones. Stripe products are created on first save.
 */
export async function updateProductAction(formData: FormData) {
  await requireOwner();

  const productId = String(formData.get("product") || "");
  const meta = getProductMeta(productId);
  const amountDollars = Number(formData.get("amount"));
  const compareRaw = String(formData.get("compare_at") || "").trim();
  const compareDollars = compareRaw ? Number(compareRaw) : null;
  const active = formData.get("active") === "on";
  const monthlyDollars = Number(formData.get("monthly"));
  const trialDays = Number(formData.get("trial_days"));
  const hasCare = Boolean(meta?.care);

  if (
    !meta ||
    !Number.isFinite(amountDollars) ||
    amountDollars < 0 ||
    (compareDollars !== null && (!Number.isFinite(compareDollars) || compareDollars < 0)) ||
    (hasCare &&
      (!Number.isFinite(monthlyDollars) ||
        monthlyDollars <= 0 ||
        !Number.isInteger(trialDays) ||
        trialDays < 1 ||
        trialDays > 365))
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

  const monthlyCents = hasCare ? Math.round(monthlyDollars * 100) : null;
  if (hasCare) {
    update.monthly_amount = monthlyCents;
    update.monthly_trial_days = trialDays;
  }

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

  // Keep the wording on Stripe's payment page equal to the site's. A failure
  // here is not worth blocking a price save over, so it is only logged.
  const stripeProductId = (update.stripe_product_id as string | undefined) ?? row.stripe_product_id;
  if (secret && stripeProductId) {
    try {
      await reconcileProductCopy({ secret, meta, productId: stripeProductId });
    } catch (err) {
      console.error("[pricing] Stripe product copy sync failed", err instanceof Error ? err.message : String(err));
    }
  }

  // The start delay is read at checkout time, so only a new amount needs a new price.
  if (secret && meta.care && monthlyCents !== null && (row.monthly_amount !== monthlyCents || !row.stripe_monthly_price_id)) {
    try {
      const synced = await syncCarePlanToStripe({
        secret,
        meta,
        currency: row.currency || "cad",
        monthlyCents,
        existing: { productId: row.stripe_monthly_product_id, priceId: row.stripe_monthly_price_id },
      });
      update.stripe_monthly_product_id = synced.productId;
      update.stripe_monthly_price_id = synced.priceId;
    } catch (err) {
      console.error("[pricing] Stripe care plan sync failed", err instanceof Error ? err.message : String(err));
      redirect("/admin/pricing?e=stripe");
    }
  }

  const { error } = await supabase.from("products").update(update).eq("id", meta.id);
  if (error) {
    console.error("[pricing] product update failed", error.message);
    redirect("/admin/pricing?e=db");
  }

  revalidatePath(meta.path);
  // The home page carries a Webline block with the live price on it.
  revalidatePath("/");
  revalidatePath("/llms.txt");
  redirect("/admin/pricing?ok=1");
}

/**
 * The owner's switch for charging GST/HST at checkout, per Stripe mode. It
 * changes what every buyer pays, so it is owner only, it records who flipped
 * it, and it leaves a line in the notification inbox.
 */
export async function setSalesTaxAction(formData: FormData) {
  const ctx = await requireOwner();
  const mode = formData.get("mode") === "test" ? "test" : "live";
  const on = formData.get("on") === "1";

  const ok = await setSalesTax(mode, on, ctx.email);
  if (!ok) redirect("/admin/pricing?e=db");

  await notifyAdmins({
    event: "settings.sales_tax_changed",
    title: `Sales tax switched ${on ? "ON" : "OFF"}${mode === "test" ? " in test mode" : ""}`,
    body: on
      ? "New checkouts now add GST/HST by the buyer's province. Plans already running are not changed."
      : "New checkouts no longer add GST/HST.",
    url: "/admin/pricing",
    actor: { type: "staff", label: ctx.email },
    isTest: mode === "test",
  });

  revalidatePath("/admin/pricing");
  redirect(`/admin/pricing?ok=${on ? "tax_on" : "tax_off"}`);
}
