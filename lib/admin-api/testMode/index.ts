import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductMeta, offerName, productMeta } from "@/config/products";
import { isAllowedAdmin } from "@/lib/admin";
import type { OrderStatus } from "@/lib/orders-data";
import type { ProductRow } from "@/lib/products-data";
import { stripeSecret, webhookSecret } from "@/lib/stripe-mode";
import { purgeTestData, setupTestCatalog } from "@/lib/test-mode-data";
import { badRequest, notConfigured, upstream, validationError } from "../errors";
import { dbError, instant, money } from "../data";

/**
 * Test mode for the admin API (GET /test-mode, POST /test-mode/catalog,
 * POST /test-mode/purge). The app cannot switch test mode on: that is a
 * browser cookie on the website. It shows the sandbox status, rebuilds the
 * sandbox catalog and deletes test data, with the website's own functions
 * (lib/test-mode-data.ts). Reads here are strict: a failed count is an error,
 * never a zero.
 */

export type TestPurchaseStatus = "paid" | "pending" | "failed" | "refunded";

export type TestCounts = { clients: number; orders: number; subscriptions: number; logins: number };

export type TestModeView = {
  keysConfigured: boolean;
  webhookSecretConfigured: boolean;
  catalog: { productId: string; name: string; priceReady: boolean; carePlanReady: boolean }[];
  counts: TestCounts;
  recentPurchases: {
    id: string;
    at: string;
    email: string;
    product: string;
    amount: { amount: number; currency: string };
    status: TestPurchaseStatus;
  }[];
};

const RECENT_LIMIT = 6;

/** Order statuses as the app shows them: money back reads as refunded, a dispute as failed. */
const PURCHASE_STATUS: Record<OrderStatus, TestPurchaseStatus> = {
  pending: "pending",
  paid: "paid",
  failed: "failed",
  refunded: "refunded",
  partially_refunded: "refunded",
  disputed: "failed",
};

async function count(db: SupabaseClient, table: string, column: string, value: boolean): Promise<number> {
  const { count: n, error } = await db.from(table).select("*", { count: "exact", head: true }).eq(column, value);
  if (error) throw dbError(`test mode count ${table}`, error);
  return n ?? 0;
}

/**
 * Logins a purge would delete, by the purge's own rule (lib/test-mode-data.ts
 * purgeTestData): a login on a test client that is on no other account and is
 * not staff.
 */
async function disposableLogins(db: SupabaseClient): Promise<number> {
  const { data: clients, error } = await db.from("clients").select("id").eq("is_test", true);
  if (error) throw dbError("test mode clients", error);
  const testIds = new Set((clients ?? []).map((c) => String(c.id)));
  if (testIds.size === 0) return 0;

  const { data: members, error: membersError } = await db
    .from("client_members")
    .select("user_id,email")
    .in("client_id", [...testIds])
    .not("user_id", "is", null);
  if (membersError) throw dbError("test mode members", membersError);
  const candidates = new Map<string, string>();
  for (const m of (members ?? []) as { user_id: string; email: string | null }[]) {
    if (!candidates.has(m.user_id)) candidates.set(m.user_id, m.email ?? "");
  }
  if (candidates.size === 0) return 0;

  const { data: elsewhere, error: elsewhereError } = await db
    .from("client_members")
    .select("user_id,client_id")
    .in("user_id", [...candidates.keys()]);
  if (elsewhereError) throw dbError("test mode members elsewhere", elsewhereError);
  const onRealAccount = new Set(
    ((elsewhere ?? []) as { user_id: string; client_id: string }[]).filter((m) => !testIds.has(String(m.client_id))).map((m) => m.user_id),
  );

  let n = 0;
  for (const [userId, email] of candidates) {
    if (onRealAccount.has(userId)) continue;
    if (await isAllowedAdmin(email)) continue; // never staff's login
    n += 1;
  }
  return n;
}

type OrderRow = {
  id: string;
  created_at: string;
  email: string | null;
  product_id: string | null;
  status: OrderStatus;
  amount_total: number | null;
  currency: string | null;
};

export async function getTestMode(db: SupabaseClient): Promise<TestModeView> {
  const productsQuery = db.from("products").select("*");
  const ordersQuery = db
    .from("orders")
    .select("id,created_at,email,product_id,status,amount_total,currency")
    .eq("livemode", false)
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);

  const [productsRes, ordersRes, clients, orders, subscriptions, logins] = await Promise.all([
    productsQuery,
    ordersQuery,
    count(db, "clients", "is_test", true),
    count(db, "orders", "livemode", false),
    count(db, "subscriptions", "livemode", false),
    disposableLogins(db),
  ]);
  if (productsRes.error) throw dbError("test mode products", productsRes.error);
  if (ordersRes.error) throw dbError("test mode orders", ordersRes.error);

  const rows = new Map(((productsRes.data ?? []) as ProductRow[]).map((r) => [r.id, r]));
  const catalog = productMeta.map((meta) => {
    const row = rows.get(meta.id);
    return {
      productId: meta.id,
      name: meta.name,
      priceReady: Boolean(row?.stripe_test_price_id),
      // A product with no care plan has nothing to build here.
      carePlanReady: !meta.care || Boolean(row?.stripe_test_monthly_price_id),
    };
  });

  const recentPurchases = ((ordersRes.data ?? []) as OrderRow[]).map((o) => ({
    id: o.id,
    at: instant(o.created_at),
    email: o.email ?? "",
    product: getProductMeta(o.product_id)?.name ?? offerName(o.product_id) ?? "Purchase",
    amount: money(o.amount_total, o.currency),
    status: PURCHASE_STATUS[o.status] ?? "pending",
  }));

  return {
    keysConfigured: Boolean(stripeSecret("test")),
    webhookSecretConfigured: Boolean(webhookSecret("test")),
    catalog,
    counts: { clients, orders, subscriptions, logins },
    recentPurchases,
  };
}

/**
 * POST /test-mode/catalog (long job): builds or repairs the sandbox copy of
 * Webline and Webline Care (only what no longer matches), then answers the
 * whole status. 503 without a usable sandbox key.
 */
export async function rebuildTestCatalog(db: SupabaseClient): Promise<TestModeView> {
  if (!stripeSecret("test")) throw notConfigured();
  const result = await setupTestCatalog();
  if (!result.ok) {
    console.error("[admin-api] test catalog setup failed", result.error);
    throw upstream("stripe", "Stripe did not finish building the test catalog. Nothing live was touched. Try again in a moment.");
  }
  revalidatePath("/admin/test-mode");
  return getTestMode(db);
}

const purgeBody = z.object({ confirm: z.literal(true, { error: "Send confirm: true." }) });

/**
 * POST /test-mode/purge { confirm: true }: deletes every test client (and what
 * hangs off it), test orders, test subscriptions, test inbox rows and the
 * logins only they used. Returns how many of each were deleted; a second purge
 * answers zeros.
 */
export async function purgeTestModeData(raw: unknown): Promise<TestCounts> {
  // An explicit flag, so a stray empty POST can never wipe anything.
  const parsed = purgeBody.safeParse(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {});
  if (!parsed.success) throw badRequest("confirm", "Confirm to delete all test data.", validationError(parsed.error).fields);
  const deleted = await purgeTestData();
  revalidatePath("/admin/test-mode");
  revalidatePath("/admin/clients");
  return deleted;
}

