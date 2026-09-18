import type Stripe from "stripe";
import { productMeta } from "@/config/products";
import { business, portal } from "@/config/site";
import { resolveRole } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProduct } from "@/lib/products-data";
import { syncCarePlanToStripe, syncProductToStripe } from "@/lib/product-sync";
import { stripeFor, stripeSecret, testModeConfigured, webhookSecret } from "@/lib/stripe-mode";

/**
 * Everything behind Admin > Test mode: what is configured, building the
 * sandbox catalog, and clearing out what test purchases leave behind.
 */

export type TestModeStatus = {
  keyPresent: boolean;
  /** A live key was pasted into the test slot. Test mode refuses to run. */
  keyIsLive: boolean;
  webhookSecretPresent: boolean;
  configured: boolean;
  products: { id: string; name: string; oneTimeReady: boolean; monthlyNeeded: boolean; monthlyReady: boolean }[];
  catalogReady: boolean;
  counts: { clients: number; orders: number; subscriptions: number };
};

export async function getTestModeStatus(): Promise<TestModeStatus> {
  const raw = process.env.STRIPE_TEST_SECRET_KEY?.trim() || "";
  const keyIsLive = /^(sk|rk)_live_/.test(raw);
  const supabase = getSupabaseAdmin();

  const products = await Promise.all(
    productMeta.map(async (meta) => {
      const row = await getProduct(meta.id);
      return {
        id: meta.id,
        name: meta.name,
        oneTimeReady: Boolean(row?.stripe_test_price_id),
        monthlyNeeded: Boolean(meta.care),
        monthlyReady: Boolean(row?.stripe_test_monthly_price_id),
      };
    }),
  );

  const count = async (table: string, col: string, val: boolean) => {
    if (!supabase) return 0;
    const { count: n } = await supabase.from(table).select("*", { count: "exact", head: true }).eq(col, val);
    return n ?? 0;
  };
  const [clients, orders, subscriptions] = await Promise.all([
    count("clients", "is_test", true),
    count("orders", "livemode", false),
    count("subscriptions", "livemode", false),
  ]);

  return {
    keyPresent: Boolean(raw),
    keyIsLive,
    webhookSecretPresent: Boolean(webhookSecret("test")),
    configured: testModeConfigured(),
    products,
    catalogReady: products.every((p) => p.oneTimeReady && (!p.monthlyNeeded || p.monthlyReady)),
    counts: { clients, orders, subscriptions },
  };
}

/** True when that price still exists in the sandbox, is active, and charges this amount. */
async function priceStillGood(stripe: Stripe, priceId: string | null, amount: number | null): Promise<boolean> {
  if (!priceId || amount == null) return false;
  try {
    const price = await stripe.prices.retrieve(priceId);
    return price.active && price.unit_amount === amount;
  } catch {
    return false; // deleted with the sandbox's test data, or from another sandbox
  }
}

async function productStillThere(stripe: Stripe, productId: string | null): Promise<string | null> {
  if (!productId) return null;
  try {
    const product = await stripe.products.retrieve(productId);
    return product.active ? product.id : null;
  } catch {
    return null;
  }
}

/**
 * Builds the sandbox copy of the catalog with the same sync functions that
 * build the live one, so a test checkout shows the same name, description and
 * amount a real buyer sees. Safe to run again: a price that still matches is
 * kept, and one that was wiped with the sandbox's test data is rebuilt.
 */
export async function setupTestCatalog(): Promise<{ ok: true; created: string[] } | { ok: false; error: string }> {
  const secret = stripeSecret("test");
  const stripe = stripeFor("test");
  const supabase = getSupabaseAdmin();
  if (!secret || !stripe) return { ok: false, error: "No usable STRIPE_TEST_SECRET_KEY." };
  if (!supabase) return { ok: false, error: "Database not configured." };

  const created: string[] = [];
  try {
    for (const meta of productMeta) {
      const row = await getProduct(meta.id);
      if (!row) continue;
      const update: Record<string, unknown> = {};

      if (!(await priceStillGood(stripe, row.stripe_test_price_id, row.amount))) {
        const synced = await syncProductToStripe({
          secret,
          meta,
          currency: row.currency || "cad",
          amountCents: row.amount,
          imageUrl: `${business.url}${meta.path}/opengraph-image`,
          existing: { productId: await productStillThere(stripe, row.stripe_test_product_id), priceId: null },
        });
        update.stripe_test_product_id = synced.productId;
        update.stripe_test_price_id = synced.priceId;
        created.push(`${meta.name} price`);
      }

      if (meta.care && row.monthly_amount != null && !(await priceStillGood(stripe, row.stripe_test_monthly_price_id, row.monthly_amount))) {
        const synced = await syncCarePlanToStripe({
          secret,
          meta,
          currency: row.currency || "cad",
          monthlyCents: row.monthly_amount,
          existing: { productId: await productStillThere(stripe, row.stripe_test_monthly_product_id), priceId: null },
        });
        update.stripe_test_monthly_product_id = synced.productId;
        update.stripe_test_monthly_price_id = synced.priceId;
        created.push(`${meta.care.name} price`);
      }

      if (Object.keys(update).length) {
        const { error } = await supabase.from("products").update(update).eq("id", meta.id);
        if (error) return { ok: false, error: error.message };
      }
    }

    // "Manage billing" needs a customer portal configuration in the sandbox
    // too. Same rules as the live one: update card, invoices, cancel at period
    // end, no self-serve plan switching.
    const configs = await stripe.billingPortal.configurations.list({ limit: 1 });
    if (configs.data.length === 0) {
      await stripe.billingPortal.configurations.create({
        name: "Tekmadev client portal (test)",
        business_profile: {
          headline: "Manage your Tekmadev billing",
          privacy_policy_url: `${business.url}/privacy`,
          terms_of_service_url: `${business.url}/terms`,
        },
        default_return_url: `${portal.url}/billing`,
        login_page: { enabled: false },
        features: {
          customer_update: { enabled: true, allowed_updates: ["email", "name", "address", "phone", "tax_id"] },
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: {
            enabled: true,
            mode: "at_period_end",
            proration_behavior: "none",
            cancellation_reason: {
              enabled: true,
              options: ["too_expensive", "missing_features", "switched_service", "unused", "customer_service", "too_complex", "low_quality", "other"],
            },
          },
          subscription_update: { enabled: false },
        },
      });
      created.push("billing portal settings");
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, created };
}

export type TestPurchase = { created_at: string; email: string | null; business_name: string | null; status: string; amount_total: number | null; currency: string | null };

export async function listTestOrders(limit = 50): Promise<TestPurchase[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("orders")
    .select("created_at,email,business_name,status,amount_total,currency")
    .eq("livemode", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as TestPurchase[];
}

/**
 * Removes what sandbox purchases created here. Deleting a test client cascades
 * through its members, onboarding, tasks, agreements, notifications and the
 * rest; orders and subscriptions are kept on purpose when a client goes (they
 * are financial records), so the test ones are removed by their own flag.
 *
 * A login is removed only when it is provably disposable: it belonged to a
 * test client, it is on no other account, and it is not an admin. Anything
 * less certain is left alone. Stripe's own sandbox data is untouched; clear it
 * from the Stripe dashboard if wanted.
 */
export async function purgeTestData(): Promise<{ clients: number; orders: number; subscriptions: number; logins: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { clients: 0, orders: 0, subscriptions: 0, logins: 0 };

  const { data: testClients } = await supabase.from("clients").select("id").eq("is_test", true);
  const ids = (testClients ?? []).map((c) => c.id as string);

  let candidates: { user_id: string; email: string }[] = [];
  if (ids.length) {
    const { data: members } = await supabase.from("client_members").select("user_id,email").in("client_id", ids).not("user_id", "is", null);
    candidates = (members ?? []) as { user_id: string; email: string }[];
  }

  let clients = 0;
  if (ids.length) {
    const { count } = await supabase.from("clients").delete({ count: "exact" }).eq("is_test", true);
    clients = count ?? 0;
  }
  const { count: orders } = await supabase.from("orders").delete({ count: "exact" }).eq("livemode", false);
  const { count: subscriptions } = await supabase.from("subscriptions").delete({ count: "exact" }).eq("livemode", false);

  let logins = 0;
  const seen = new Set<string>();
  for (const m of candidates) {
    if (seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    if (await resolveRole(m.email)) continue; // never an admin's login
    const { count: others } = await supabase.from("client_members").select("*", { count: "exact", head: true }).eq("user_id", m.user_id);
    if ((others ?? 0) > 0) continue; // still on a real account
    const { error } = await supabase.auth.admin.deleteUser(m.user_id);
    if (!error) logins += 1;
  }

  return { clients, orders: orders ?? 0, subscriptions: subscriptions ?? 0, logins };
}
