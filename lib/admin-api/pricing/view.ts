import type { SupabaseClient } from "@supabase/supabase-js";
import { tierMeta, type TierId } from "@/config/pricing";
import { getProductMeta, productMeta, type ProductMeta } from "@/config/products";
import type { PlanFull } from "@/lib/pricing-data";
import type { ProductRow } from "@/lib/products-data";
import { getTaxStatus, salesTaxState, taxReadinessLine, type SalesTaxState, type TaxStatus } from "@/lib/stripe-tax";
import { testModeConfigured, type StripeMode } from "@/lib/stripe-mode";
import { dbError } from "../data";

/**
 * GET /pricing and the shapes every pricing write returns (docs/api-requests/pricing.md
 * in the app repo). Reads are strict: a failed read is an error, never an
 * empty list or a switch shown as off.
 */

export type PricingPlanView = {
  id: TierId;
  name: string;
  monthly: number;
  setup: number;
  currency: string;
  inStripe: boolean;
  sort: number;
};

export type PricingProductStatus = "selling" | "paused" | "not_in_stripe";

export type PricingProductView = {
  id: string;
  name: string;
  tagline: string | null;
  status: PricingProductStatus;
  amount: number;
  compareAt: number | null;
  monthly: number;
  currency: string;
  trialDays: number;
  active: boolean;
  inStripe: boolean;
};

export type TaxView = { state: SalesTaxState; explanation: string; readiness: string };

export type SalesTaxView = { setting: { live: boolean; test: boolean }; live: TaxView; test: TaxView | null };

export type PricingView = { plans: PricingPlanView[]; products: PricingProductView[]; salesTax: SalesTaxView };

export type StripeSync = "synced" | "skipped" | "failed";

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

const PLAN_IDS = new Set<string>(tierMeta.map((t) => t.id));

export const isPlanId = (id: string): id is TierId => PLAN_IDS.has(id);

/** Every plan row the app knows (Convert, Grow, Let's Talk). */
export async function readPlans(db: SupabaseClient): Promise<PlanFull[]> {
  const { data, error } = await db.from("plans").select("*").order("monthly_amount", { ascending: true });
  if (error) throw dbError("pricing plans", error);
  return ((data ?? []) as PlanFull[]).filter((row) => isPlanId(row.id));
}

/** Every product row with metadata in config/products.ts (Webline). */
export async function readProducts(db: SupabaseClient): Promise<ProductRow[]> {
  const { data, error } = await db.from("products").select("*").order("sort_order", { ascending: true });
  if (error) throw dbError("pricing products", error);
  return ((data ?? []) as ProductRow[]).filter((row) => Boolean(getProductMeta(row.id)));
}

/** The owner's sales tax switches. Anything but a literal true is off (lib/site-settings.ts). */
export async function readSalesTaxSetting(db: SupabaseClient): Promise<{ live: boolean; test: boolean }> {
  const { data, error } = await db.from("site_settings").select("value").eq("key", "sales_tax").maybeSingle();
  if (error) throw dbError("sales tax setting", error);
  const value = (data?.value ?? {}) as { live?: unknown; test?: unknown };
  return { live: value.live === true, test: value.test === true };
}

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

const currencyOf = (value: string | null | undefined) => (value || "cad").toUpperCase();

/** Cheapest monthly first (then cheapest setup), numbered from 1. */
export function planViews(rows: PlanFull[]): PricingPlanView[] {
  return rows
    .map((row) => ({
      id: row.id as TierId,
      name: row.name || tierMeta.find((t) => t.id === row.id)?.name || row.id,
      monthly: Math.round(row.monthly_amount ?? 0),
      setup: Math.round(row.setup_amount ?? 0),
      currency: currencyOf(row.currency),
      // Checkout sells a plan by its monthly price: without one it is not for sale.
      inStripe: Boolean(row.stripe_monthly_price_id),
      sort: 0,
    }))
    .sort((a, b) => a.monthly - b.monthly || a.setup - b.setup || a.id.localeCompare(b.id))
    .map((plan, index) => ({ ...plan, sort: index + 1 }));
}

/** In Stripe when the one-time price exists, and the care plan price too when the product has one. */
export function productInStripe(row: ProductRow, meta: ProductMeta | undefined): boolean {
  return Boolean(row.stripe_price_id) && (!meta?.care || Boolean(row.stripe_monthly_price_id));
}

export function productStatus(row: ProductRow, meta: ProductMeta | undefined): PricingProductStatus {
  if (!row.active) return "paused";
  return productInStripe(row, meta) ? "selling" : "not_in_stripe";
}

export function productView(row: ProductRow): PricingProductView {
  const meta = getProductMeta(row.id);
  const monthly = row.monthly_amount ?? meta?.care?.defaultMonthlyAmount ?? 0;
  return {
    id: row.id,
    name: row.name || meta?.name || row.id,
    tagline: meta?.tagline ?? null,
    status: productStatus(row, meta),
    amount: Math.round(row.amount ?? 0),
    compareAt: row.compare_at_amount === null || row.compare_at_amount === undefined ? null : Math.round(row.compare_at_amount),
    monthly: Math.round(monthly),
    currency: currencyOf(row.currency),
    trialDays: row.monthly_trial_days ?? meta?.care?.defaultTrialDays ?? 30,
    active: Boolean(row.active),
    inStripe: productInStripe(row, meta),
  };
}

/** Products in the order the site lists them (config/products.ts). */
export function productViews(rows: ProductRow[]): PricingProductView[] {
  const order = new Map(productMeta.map((m, i) => [m.id as string, i]));
  return [...rows].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99)).map(productView);
}

/* ------------------------------------------------------------------ */
/* Sales tax                                                           */
/* ------------------------------------------------------------------ */

/** What buyers pay, per state, in the words of Admin, Pricing. */
const EXPLANATIONS: Record<StripeMode, Record<SalesTaxState, string>> = {
  live: {
    charging: "New checkouts add GST/HST by the buyer's province, and the tax shows on the invoice.",
    on_not_charging: "Switched on here, but Stripe is not ready, so checkouts are going out WITHOUT tax.",
    off: "Checkout is charging no tax. Turn it on when you are ready for buyers to see tax added.",
  },
  test: {
    charging: "Test checkouts add GST/HST by the buyer's province, like live ones.",
    on_not_charging: "Switched on for test mode, but the sandbox's Stripe Tax is not finished, so test checkouts go out without tax.",
    off: "Test checkouts charge no tax.",
  },
};

function taxView(mode: StripeMode, on: boolean, status: TaxStatus): TaxView {
  const state = salesTaxState(on, status);
  return { state, explanation: EXPLANATIONS[mode][state], readiness: taxReadinessLine(status) };
}

/**
 * The sales tax card: the switches, and what each mode does with them. Stripe
 * Tax is read fresh, like Admin, Pricing. `test` is null without a configured
 * sandbox (the app then hides the test switch).
 */
export async function salesTaxView(db: SupabaseClient): Promise<SalesTaxView> {
  const withTest = testModeConfigured();
  const [setting, live, test] = await Promise.all([
    readSalesTaxSetting(db),
    getTaxStatus("live", { fresh: true }),
    withTest ? getTaxStatus("test", { fresh: true }) : Promise.resolve(null),
  ]);
  return {
    setting,
    live: taxView("live", setting.live, live),
    test: test ? taxView("test", setting.test, test) : null,
  };
}

/** GET /pricing. */
export async function getPricing(db: SupabaseClient): Promise<PricingView> {
  const [plans, products, salesTax] = await Promise.all([readPlans(db), readProducts(db), salesTaxView(db)]);
  return { plans: planViews(plans), products: productViews(products), salesTax };
}
