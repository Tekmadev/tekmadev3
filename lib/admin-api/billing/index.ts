import { z } from "zod";
import { offerName, getProductMeta } from "@/config/products";
import { dbError, decodeCursor, instant, keysetFilter, money, pageQuery, requireDb, toPage, type Page } from "@/lib/admin-api";

/**
 * The Subscriptions screen of the admin app: GET /billing/orders and
 * GET /billing/subscriptions (docs/api-requests/billing.md in the app repo,
 * schema src/api/schemas/billing.ts). Live mode only, like the web admin's
 * Subscriptions page: sandbox purchases belong to Test mode.
 *
 * Both lists are newest first with keyset cursors on (created_at, id), and both
 * carry the same `summary` (every live row, whatever the filters) for the
 * screen subtitle. `listSubscriptions` is also what Home's "Recent
 * subscriptions" reads (its first rows).
 */

/* ---------- enums, as the app's schema has them ---------- */

export const ORDER_STATUSES = ["pending", "paid", "failed", "refunded", "partially_refunded", "disputed"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "canceled", "incomplete", "incomplete_expired", "unpaid", "paused"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_KINDS = ["plan", "care"] as const;
export type SubscriptionKind = (typeof SUBSCRIPTION_KINDS)[number];

export const PAYMENT_METHODS = ["card", "klarna", "afterpay", "affirm", "link"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Paid in instalments. */
const BNPL_METHODS: ReadonlySet<PaymentMethod> = new Set<PaymentMethod>(["klarna", "afterpay", "affirm"]);
/** Stripe's payment method types for those, as the orders table stores them ("afterpay" read too, like `paidWith`). */
const BNPL_STRIPE_TYPES = ["klarna", "afterpay_clearpay", "afterpay", "affirm"] as const;
/** The payment went through (it may have gone back since). */
const WENT_THROUGH: readonly OrderStatus[] = ["paid", "refunded", "partially_refunded", "disputed"];

/* ---------- shapes sent to the app ---------- */

type Money = { amount: number; currency: string };

export type Order = {
  id: string;
  clientId: string | null;
  business: string | null;
  email: string;
  product: string;
  status: OrderStatus;
  amount: Money;
  amountRefunded: Money | null;
  paidWith: PaymentMethod | null;
  bnpl: boolean;
  source: string | null;
  campaign: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type Cancellation = { reason: string | null; feedback: string | null; comment: string | null };

export type Subscription = {
  id: string;
  clientId: string | null;
  business: string | null;
  email: string;
  kind: SubscriptionKind;
  planId: string | null;
  productName: string;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  amount: Money;
  interval: "month" | "year";
  customerId: string;
  createdAt: string;
  canceledAt: string | null;
  cancellation: Cancellation | null;
};

export type BillingSummary = { subscriptions: number; orders: number; bnpl: number };
export type BillingPage<T> = Page<T> & { summary: BillingSummary };

/* ---------- query strings ---------- */

/** An empty `?status=` is no filter, like a missing one. */
const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.enum(values, message).optional());

export const ordersQuery = z.object({
  ...pageQuery,
  status: optionalEnum(ORDER_STATUSES, "Unknown order status."),
});

export const subscriptionsQuery = z.object({
  ...pageQuery,
  status: optionalEnum(SUBSCRIPTION_STATUSES, "Unknown subscription status."),
  kind: optionalEnum(SUBSCRIPTION_KINDS, "Unknown subscription kind. Use plan or care."),
});

/* ---------- rows ---------- */

type OrderRow = {
  id: string;
  created_at: string;
  product_id: string | null;
  client_id: string | null;
  email: string | null;
  business_name: string | null;
  status: string;
  amount_total: number | null;
  amount_refunded: number | null;
  currency: string | null;
  payment_method_type: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  paid_at: string | null;
};

const ORDER_COLUMNS =
  "id,created_at,product_id,client_id,email,business_name,status,amount_total,amount_refunded,currency,payment_method_type,utm_source,utm_campaign,paid_at";

type SubscriptionRow = {
  id: string;
  created_at: string;
  email: string | null;
  tier: string | null;
  kind: string | null;
  product_id: string | null;
  client_id: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  cancel_at: string | null;
  canceled_at: string | null;
  cancellation_reason: string | null;
  cancellation_feedback: string | null;
  cancellation_comment: string | null;
  amount_total: number | null;
  currency: string | null;
  stripe_customer_id: string | null;
  /** From the stored Stripe payload: "subscription" once a lifecycle event wrote it, "checkout.session" before. */
  raw_object: string | null;
  unit_amount: number | string | null;
  quantity: number | string | null;
  price_interval: string | null;
  price_currency: string | null;
};

/**
 * The recurring price comes from the stored Stripe subscription (first item);
 * the checkout total is only a fallback, because for a plan it includes the
 * setup fee charged on day one.
 */
const SUBSCRIPTION_COLUMNS = [
  "id,created_at,email,tier,kind,product_id,client_id,status,current_period_end",
  "cancel_at_period_end,cancel_at,canceled_at,cancellation_reason,cancellation_feedback,cancellation_comment",
  "amount_total,currency,stripe_customer_id",
  "raw_object:raw->>object",
  "unit_amount:raw->items->data->0->price->unit_amount",
  "quantity:raw->items->data->0->quantity",
  "price_interval:raw->items->data->0->price->recurring->>interval",
  "price_currency:raw->items->data->0->price->>currency",
].join(",");

type ClientRef = { id: string; business_name: string | null; primary_email: string | null; deleted_at: string | null };

/** The clients behind a page of rows. A client in the trash counts as no client. */
async function clientsFor(ids: readonly (string | null)[]): Promise<Map<string, ClientRef>> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  const map = new Map<string, ClientRef>();
  if (unique.length === 0) return map;
  const { data, error } = await requireDb().from("clients").select("id,business_name,primary_email,deleted_at").in("id", unique);
  if (error) throw dbError("billing clients", error);
  for (const row of (data ?? []) as ClientRef[]) if (!row.deleted_at) map.set(row.id, row);
  return map;
}

/* ---------- mapping ---------- */

function paidWith(type: string | null): PaymentMethod | null {
  switch (type) {
    case "card":
      return "card";
    case "klarna":
      return "klarna";
    case "afterpay_clearpay":
    case "afterpay":
      return "afterpay";
    case "affirm":
      return "affirm";
    case "link":
      return "link";
    default:
      // A method the app has no label for (or none yet) is sent as unknown, never guessed.
      return null;
  }
}

const isOrderStatus = (v: string): v is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(v);
const isSubscriptionStatus = (v: string | null): v is SubscriptionStatus => v !== null && (SUBSCRIPTION_STATUSES as readonly string[]).includes(v);

function productLabel(productId: string | null): string {
  if (!productId) return "One-time purchase";
  return offerName(productId) ?? productId;
}

export function toOrder(row: OrderRow, clients: Map<string, ClientRef>): Order {
  // The orders table only ever holds Stripe's statuses (a CHECK); "pending" is the safe reading of anything else.
  const status: OrderStatus = isOrderStatus(row.status) ? row.status : "pending";
  const client = row.client_id ? clients.get(row.client_id) : undefined;
  const method = status === "pending" ? null : paidWith(row.payment_method_type);
  const refunded = Number(row.amount_refunded ?? 0);
  return {
    id: String(row.id),
    clientId: client ? client.id : null,
    business: row.business_name ?? client?.business_name ?? null,
    email: row.email ?? client?.primary_email ?? "",
    product: productLabel(row.product_id),
    status,
    amount: money(row.amount_total, row.currency),
    amountRefunded:
      refunded > 0 ? money(refunded, row.currency) : status === "refunded" ? money(row.amount_total, row.currency) : null,
    paidWith: method,
    bnpl: method !== null && BNPL_METHODS.has(method),
    source: row.utm_source,
    campaign: row.utm_campaign,
    createdAt: instant(row.created_at),
    paidAt: instant(row.paid_at),
  };
}

/**
 * Stripe's `cancellation_details.reason`, in the contract's words. The portal is
 * where customers cancel, so a requested cancellation reads as theirs.
 */
const CANCEL_REASONS: ReadonlyMap<string, string> = new Map([
  ["cancellation_requested", "Cancelled by the customer"],
  ["payment_failed", "Payment failed"],
  ["payment_disputed", "Payment disputed"],
  ["canceled_by_retention_policy", "Cancelled automatically by Stripe"],
]);

const CANCEL_FEEDBACK: ReadonlyMap<string, string> = new Map([
  ["too_expensive", "Too expensive"],
  ["missing_features", "Missing features"],
  ["switched_service", "Switched to another service"],
  ["unused", "Not using it enough"],
  ["customer_service", "Customer service"],
  ["too_complex", "Too complicated"],
  ["low_quality", "Quality was not good enough"],
  ["other", "Other reason"],
]);

/** "payment_disputed" -> "Payment disputed", for a value Stripe adds later. */
function readable(value: string | null, labels: ReadonlyMap<string, string>): string | null {
  const v = value?.trim();
  if (!v) return null;
  const known = labels.get(v);
  if (known) return known;
  const words = v.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function toCents(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function careName(productId: string | null): string {
  return getProductMeta(productId)?.care?.name ?? getProductMeta("webline")?.care?.name ?? "Webline Care";
}

export function toSubscription(row: SubscriptionRow, clients: Map<string, ClientRef>): Subscription {
  const kind: SubscriptionKind = row.kind === "care" ? "care" : "plan";
  // Stripe's own status. Every Stripe status is in the app's list; "incomplete" is the safe reading of anything else.
  const status: SubscriptionStatus = isSubscriptionStatus(row.status) ? row.status : "incomplete";
  const client = row.client_id ? clients.get(row.client_id) : undefined;

  // Scheduled to end: the portal cancels at period end; newer Stripe API versions say it with cancel_at.
  const ending = status !== "canceled" && (Boolean(row.cancel_at_period_end) || Boolean(row.cancel_at));

  const fromStripe = row.raw_object === "subscription" ? toCents(row.unit_amount) : null;
  const quantity = Math.max(toCents(row.quantity) ?? 1, 1);
  const amount =
    fromStripe !== null ? money(fromStripe * quantity, row.price_currency ?? row.currency) : money(row.amount_total, row.currency);

  const planId = kind === "plan" ? row.tier : null;
  const productName = kind === "care" ? careName(row.product_id) : (offerName(planId) ?? planId ?? "Growth plan");

  return {
    id: String(row.id),
    clientId: client ? client.id : null,
    business: client?.business_name ?? null,
    email: row.email ?? client?.primary_email ?? "",
    kind,
    planId,
    productName,
    status,
    cancelAtPeriodEnd: ending,
    currentPeriodEnd: instant(row.current_period_end),
    amount,
    interval: row.price_interval === "year" ? "year" : "month",
    customerId: row.stripe_customer_id ?? "",
    createdAt: instant(row.created_at),
    canceledAt: instant(row.canceled_at),
    cancellation:
      status === "canceled" || ending
        ? {
            reason: readable(row.cancellation_reason, CANCEL_REASONS),
            feedback: readable(row.cancellation_feedback, CANCEL_FEEDBACK),
            comment: row.cancellation_comment?.trim() || null,
          }
        : null,
  };
}

/* ---------- the lists ---------- */

const zKeyset = z.tuple([z.string(), z.string()]);

/** Subtitle totals: every live row, whatever the filters or the page. */
export async function billingSummary(): Promise<BillingSummary> {
  const db = requireDb();
  const [subs, orders, bnpl] = await Promise.all([
    db.from("subscriptions").select("id", { count: "exact", head: true }).eq("livemode", true),
    db.from("orders").select("id", { count: "exact", head: true }).eq("livemode", true),
    db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("livemode", true)
      .in("payment_method_type", [...BNPL_STRIPE_TYPES])
      .in("status", [...WENT_THROUGH]),
  ]);
  if (subs.error) throw dbError("billing summary subscriptions", subs.error);
  if (orders.error) throw dbError("billing summary orders", orders.error);
  if (bnpl.error) throw dbError("billing summary bnpl", bnpl.error);
  return { subscriptions: subs.count ?? 0, orders: orders.count ?? 0, bnpl: bnpl.count ?? 0 };
}

export type OrderListOptions = { status?: OrderStatus; cursor?: string; limit: number };

/** One page of live one-time orders, newest first. */
export async function listOrders(options: OrderListOptions): Promise<Page<Order>> {
  const after = decodeCursor(options.cursor, zKeyset);
  let q = requireDb()
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("livemode", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.limit + 1);
  if (options.status) q = q.eq("status", options.status);
  if (after) q = q.or(keysetFilter(["created_at", "id"], after, "desc"));
  const { data, error } = await q;
  if (error) throw dbError("billing orders", error);
  const rows = (data ?? []) as unknown as OrderRow[];
  const clients = await clientsFor(rows.slice(0, options.limit).map((r) => r.client_id));
  return toPage(rows, options.limit, (r) => [r.created_at, String(r.id)], (r) => toOrder(r, clients));
}

export type SubscriptionListOptions = { status?: SubscriptionStatus; kind?: SubscriptionKind; cursor?: string; limit: number };

/** One page of live subscriptions (growth plans and care plans), newest first. */
export async function listSubscriptions(options: SubscriptionListOptions): Promise<Page<Subscription>> {
  const after = decodeCursor(options.cursor, zKeyset);
  let q = requireDb()
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("livemode", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.limit + 1);
  if (options.status) q = q.eq("status", options.status);
  if (options.kind) q = q.eq("kind", options.kind);
  if (after) q = q.or(keysetFilter(["created_at", "id"], after, "desc"));
  const { data, error } = await q;
  if (error) throw dbError("billing subscriptions", error);
  const rows = (data ?? []) as unknown as SubscriptionRow[];
  const clients = await clientsFor(rows.slice(0, options.limit).map((r) => r.client_id));
  return toPage(rows, options.limit, (r) => [r.created_at, String(r.id)], (r) => toSubscription(r, clients));
}

/** GET /billing/orders: the page plus the subtitle summary. */
export async function ordersPage(options: OrderListOptions): Promise<BillingPage<Order>> {
  const [page, summary] = await Promise.all([listOrders(options), billingSummary()]);
  return { ...page, summary };
}

/** GET /billing/subscriptions: the page plus the subtitle summary. */
export async function subscriptionsPage(options: SubscriptionListOptions): Promise<BillingPage<Subscription>> {
  const [page, summary] = await Promise.all([listSubscriptions(options), billingSummary()]);
  return { ...page, summary };
}
