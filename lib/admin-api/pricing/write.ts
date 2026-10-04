import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductMeta } from "@/config/products";
import { business } from "@/config/site";
import { formatMoney } from "@/lib/money";
import type { PlanFull } from "@/lib/pricing-data";
import type { ProductRow } from "@/lib/products-data";
import { archiveStripePrice, createPlanMonthlyPrice, createPlanSetupPrice } from "@/lib/plan-sync";
import { reconcileProductCopy, syncCarePlanToStripe, syncProductToStripe } from "@/lib/product-sync";
import { switchSalesTax } from "@/lib/stripe-tax";
import { stripeSecret, testModeConfigured } from "@/lib/stripe-mode";
import { ApiError, badRequest, notConfigured, notFound } from "../errors";
import { dbError } from "../data";
import { COMPARE_AT_MESSAGE, type PlanPatch, type ProductPatch, type SalesTaxInput } from "./input";
import {
  isPlanId,
  planViews,
  productView,
  readPlans,
  salesTaxView,
  type PricingPlanView,
  type PricingProductView,
  type SalesTaxView,
  type StripeSync,
} from "./view";

/**
 * The pricing writes behind PATCH /pricing/plans/:id, PATCH /pricing/products/:id
 * and PUT /pricing/sales-tax.
 *
 * Stripe prices are immutable, so saving a price creates a new Stripe price,
 * points the site at it, then archives the old one (lib/plan-sync.ts and
 * lib/product-sync.ts, the same calls Admin, Pricing makes). Unlike the web
 * form, which saves a whole plan at once, the app saves only what changed and
 * each price lands on its own: it is created in Stripe and written to the
 * database, or Stripe refuses it and it stays as it was. The old price is
 * archived only after the database points at the new one, so checkout never
 * holds an archived price. A refused price answers 502 `stripe` with a message
 * that says what was and was not saved (pricing.md section 3).
 */

type PriceChange<K extends string> = { key: K; label: string; before: number; value: number };

const joinLabels = (labels: string[]) =>
  labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

/** 502 `stripe`: "Stripe did not accept the new ..., so it was not saved: ... Saved: ... Try again in a moment." */
function stripeFailure<K extends string>(failed: PriceChange<K>[], saved: string[], currency: string): ApiError {
  const plural = failed.length > 1;
  const still = failed.map((c) => `the ${c.label} is still ${formatMoney(c.before, currency)}`).join(" and ");
  const first = `Stripe did not accept the new ${joinLabels(failed.map((c) => c.label))}, so ${plural ? "they were" : "it was"} not saved: ${still}.`;
  const rest = saved.length > 0 ? ` Saved: ${joinLabels(saved)}.` : " Nothing else changed.";
  const fields: Record<string, string> = {};
  for (const c of failed) fields[c.key] = `Stripe did not accept this price. It is still ${formatMoney(c.before, currency)}.`;
  return new ApiError(502, "stripe", `${first}${rest} Try again in a moment.`, fields);
}

const savedNote = <K extends string>(c: PriceChange<K>, currency: string) => `the ${c.label} is now ${formatMoney(c.value, currency)}`;

const stripeMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

const PLAN_LABELS = { monthly: "monthly fee", setup: "Build & Install fee" } as const;
type PlanKey = keyof typeof PLAN_LABELS;

export async function updatePlanPrices(db: SupabaseClient, id: string, patch: PlanPatch): Promise<{ plan: PricingPlanView; stripe: StripeSync }> {
  if (!isPlanId(id)) throw notFound("That plan");
  const rows = await readPlans(db);
  const index = rows.findIndex((r) => r.id === id);
  if (index < 0) throw notFound("That plan");
  let row: PlanFull = rows[index];
  const current = { monthly: row.monthly_amount ?? 0, setup: row.setup_amount ?? 0 };
  const currency = (row.currency || "cad").toUpperCase();

  const changes: PriceChange<PlanKey>[] = [];
  for (const key of ["monthly", "setup"] as const) {
    const value = patch[key];
    if (value === undefined || value === current[key]) continue;
    changes.push({ key, label: PLAN_LABELS[key], before: current[key], value });
  }

  const view = (): PricingPlanView => {
    const all = [...rows];
    all[index] = row;
    const found = planViews(all).find((p) => p.id === id);
    if (!found) throw notFound("That plan");
    return found;
  };

  // Nothing new for Stripe: no new price, nothing archived.
  if (changes.length === 0) return { plan: view(), stripe: "skipped" };

  const secret = stripeSecret("live");
  if (!secret) {
    // Without Stripe the site's price still changes (Admin, Pricing does the same).
    const update: Record<string, number> = {};
    for (const c of changes) update[c.key === "monthly" ? "monthly_amount" : "setup_amount"] = c.value;
    const { error } = await db.from("plans").update(update).eq("id", id);
    if (error) throw dbError("plan price save", error);
    row = { ...row, ...update };
    revalidatePath("/start");
    return { plan: view(), stripe: "skipped" };
  }

  // A plan reaches Stripe whole: a price it has never had there goes with this save.
  const touched = new Set(changes.map((c) => c.key));
  if (!touched.has("monthly") && !row.stripe_monthly_price_id) {
    changes.unshift({ key: "monthly", label: PLAN_LABELS.monthly, before: current.monthly, value: current.monthly });
  }
  const setupAfter = patch.setup ?? current.setup;
  if (!touched.has("setup") && setupAfter > 0 && !row.stripe_setup_price_id) {
    changes.push({ key: "setup", label: PLAN_LABELS.setup, before: current.setup, value: current.setup });
  }

  const failed: PriceChange<PlanKey>[] = [];
  const saved: PriceChange<PlanKey>[] = [];
  for (const change of changes) {
    let update: Record<string, string | number | null>;
    let newPrice: string | null;
    let oldPrice: string | null;
    try {
      if (change.key === "monthly") {
        const created = await createPlanMonthlyPrice({
          stripe: secret,
          name: row.name,
          currency: row.currency || "cad",
          monthlyCents: change.value,
          productId: row.stripe_product_id,
        });
        update = { monthly_amount: change.value, stripe_product_id: created.productId, stripe_monthly_price_id: created.priceId };
        newPrice = created.priceId;
        oldPrice = row.stripe_monthly_price_id;
      } else if (change.value > 0) {
        const created = await createPlanSetupPrice({
          stripe: secret,
          name: row.name,
          currency: row.currency || "cad",
          setupCents: change.value,
          setupProductId: row.stripe_setup_product_id,
        });
        update = { setup_amount: change.value, stripe_setup_product_id: created.setupProductId, stripe_setup_price_id: created.setupPriceId };
        newPrice = created.setupPriceId;
        oldPrice = row.stripe_setup_price_id;
      } else {
        // No setup fee: no setup price at checkout.
        update = { setup_amount: 0, stripe_setup_price_id: null };
        newPrice = null;
        oldPrice = row.stripe_setup_price_id;
      }
    } catch (err) {
      console.error(`[admin-api] pricing: Stripe refused the ${id} ${change.key} price`, stripeMessage(err));
      failed.push(change);
      continue;
    }

    const { error } = await db.from("plans").update(update).eq("id", id);
    if (error) {
      await archiveStripePrice(secret, newPrice);
      throw dbError("plan price save", error);
    }
    if (oldPrice && oldPrice !== newPrice) await archiveStripePrice(secret, oldPrice);
    row = { ...row, ...update } as PlanFull;
    saved.push(change);
  }

  revalidatePath("/start");
  if (failed.length > 0) throw stripeFailure(failed, saved.map((c) => savedNote(c, currency)), currency);
  return { plan: view(), stripe: "synced" };
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

type ProductKey = "amount" | "monthly";

export async function updateProductSettings(
  db: SupabaseClient,
  id: string,
  patch: ProductPatch,
): Promise<{ product: PricingProductView; stripe: StripeSync }> {
  const meta = getProductMeta(id);
  if (!meta) throw notFound("That product");
  const { data, error: readError } = await db.from("products").select("*").eq("id", meta.id).maybeSingle();
  if (readError) throw dbError("product read", readError);
  if (!data) throw notFound("That product");
  let row = data as ProductRow;
  const currency = (row.currency || "cad").toUpperCase();
  const currentMonthly = row.monthly_amount ?? meta.care?.defaultMonthlyAmount ?? 0;

  // A struck-through price must be higher than what buyers pay, or it reads as a mistake.
  const amountAfter = patch.amount ?? row.amount;
  const compareAfter = patch.compareAt !== undefined ? patch.compareAt : row.compare_at_amount;
  if (compareAfter !== null && compareAfter !== undefined && compareAfter <= amountAfter) {
    throw badRequest("compare_at", COMPARE_AT_MESSAGE, { compareAt: COMPARE_AT_MESSAGE });
  }

  // Site settings first: they never touch Stripe, and they stay saved even if a price is refused.
  const display: Record<string, number | boolean | null> = {};
  const displaySaved: string[] = [];
  if (patch.compareAt !== undefined && patch.compareAt !== row.compare_at_amount) {
    display.compare_at_amount = patch.compareAt;
    displaySaved.push(
      patch.compareAt === null ? "the compare-at price is removed" : `the compare-at price is now ${formatMoney(patch.compareAt, currency)}`,
    );
  }
  if (patch.trialDays !== undefined && patch.trialDays !== row.monthly_trial_days) {
    display.monthly_trial_days = patch.trialDays;
    displaySaved.push(`the first charge is now after ${patch.trialDays} ${patch.trialDays === 1 ? "day" : "days"}`);
  }
  if (patch.active !== undefined && patch.active !== row.active) {
    display.active = patch.active;
    displaySaved.push(patch.active ? "Purchasable is on" : "Purchasable is off");
  }
  if (Object.keys(display).length > 0) {
    const { error } = await db.from("products").update(display).eq("id", meta.id);
    if (error) throw dbError("product settings save", error);
    row = { ...row, ...display } as ProductRow;
  }

  const labels: Record<ProductKey, string> = {
    amount: "one-time fee",
    monthly: `${meta.care?.name ?? "care plan"} monthly fee`,
  };
  const changes: PriceChange<ProductKey>[] = [];
  if (patch.amount !== undefined && patch.amount !== row.amount) {
    changes.push({ key: "amount", label: labels.amount, before: row.amount, value: patch.amount });
  }
  if (meta.care && patch.monthly !== undefined && patch.monthly !== currentMonthly) {
    changes.push({ key: "monthly", label: labels.monthly, before: currentMonthly, value: patch.monthly });
  }

  const secret = stripeSecret("live");
  const failed: PriceChange<ProductKey>[] = [];
  const saved: PriceChange<ProductKey>[] = [];

  if (changes.length > 0 && !secret) {
    // Without Stripe the site's price still changes (Admin, Pricing does the same).
    const update: Record<string, number> = {};
    for (const c of changes) update[c.key === "amount" ? "amount" : "monthly_amount"] = c.value;
    const { error } = await db.from("products").update(update).eq("id", meta.id);
    if (error) throw dbError("product price save", error);
    row = { ...row, ...update } as ProductRow;
  } else if (changes.length > 0 && secret) {
    // A product reaches Stripe whole: a price it has never had there goes with this save.
    const touched = new Set(changes.map((c) => c.key));
    if (!touched.has("amount") && !row.stripe_price_id) {
      changes.unshift({ key: "amount", label: labels.amount, before: row.amount, value: row.amount });
    }
    if (meta.care && !touched.has("monthly") && !row.stripe_monthly_price_id) {
      changes.push({ key: "monthly", label: labels.monthly, before: currentMonthly, value: currentMonthly });
    }

    for (const change of changes) {
      let update: Record<string, string | number>;
      let newPrice: string;
      let oldPrice: string | null;
      try {
        if (change.key === "amount") {
          // `priceId: null`: the old price is archived below, once the site points at the new one.
          const synced = await syncProductToStripe({
            secret,
            meta,
            currency: row.currency || "cad",
            amountCents: change.value,
            imageUrl: `${business.url}${meta.path}/opengraph-image`,
            existing: { productId: row.stripe_product_id, priceId: null },
          });
          update = { amount: change.value, stripe_product_id: synced.productId, stripe_price_id: synced.priceId };
          newPrice = synced.priceId;
          oldPrice = row.stripe_price_id;
        } else {
          const synced = await syncCarePlanToStripe({
            secret,
            meta,
            currency: row.currency || "cad",
            monthlyCents: change.value,
            existing: { productId: row.stripe_monthly_product_id, priceId: null },
          });
          update = { monthly_amount: change.value, stripe_monthly_product_id: synced.productId, stripe_monthly_price_id: synced.priceId };
          newPrice = synced.priceId;
          oldPrice = row.stripe_monthly_price_id;
        }
      } catch (err) {
        console.error(`[admin-api] pricing: Stripe refused the ${meta.id} ${change.key} price`, stripeMessage(err));
        failed.push(change);
        continue;
      }

      const { error } = await db.from("products").update(update).eq("id", meta.id);
      if (error) {
        await archiveStripePrice(secret, newPrice);
        throw dbError("product price save", error);
      }
      if (oldPrice && oldPrice !== newPrice) await archiveStripePrice(secret, oldPrice);
      row = { ...row, ...update } as ProductRow;
      saved.push(change);
    }
  }

  // Keep the wording on Stripe's payment page equal to the site's, as Admin,
  // Pricing does on every save. Not worth failing a save over, so only logged.
  if (secret && row.stripe_product_id) {
    try {
      await reconcileProductCopy({ secret, meta, productId: row.stripe_product_id });
    } catch (err) {
      console.error("[admin-api] pricing: Stripe product copy sync failed", stripeMessage(err));
    }
  }

  if (Object.keys(display).length > 0 || saved.length > 0 || (changes.length > 0 && !secret)) {
    revalidatePath(meta.path);
    // The home page carries a Webline block with the live price on it.
    revalidatePath("/");
    revalidatePath("/llms.txt");
  }

  if (failed.length > 0) throw stripeFailure(failed, [...saved.map((c) => savedNote(c, currency)), ...displaySaved], currency);
  return { product: productView(row), stripe: saved.length > 0 ? "synced" : "skipped" };
}

/* ------------------------------------------------------------------ */
/* Sales tax                                                           */
/* ------------------------------------------------------------------ */

/**
 * Flip the sales tax switch for live or test mode (the same save, audit and
 * inbox line as Admin, Pricing), then answer the whole card.
 */
export async function setSalesTaxMode(db: SupabaseClient, input: SalesTaxInput, by: string): Promise<SalesTaxView> {
  if (!stripeSecret("live")) throw notConfigured();
  if (input.mode === "test" && !testModeConfigured()) throw notConfigured();
  const saved = await switchSalesTax(input.mode, input.on, by);
  if (!saved) throw new ApiError(500, "db", "Could not save. Nothing changed. Try again.");
  revalidatePath("/admin/pricing");
  return salesTaxView(db);
}
