import type Stripe from "stripe";
import { db, type Client } from "@/lib/clients-data";

/**
 * One-time purchases (Stripe Checkout in `payment` mode). A row is written
 * when the session completes and kept in step with refunds and disputes by
 * the webhook. `subscriptions` remains the record for recurring plans.
 */

export type OrderStatus = "pending" | "paid" | "failed" | "refunded" | "partially_refunded" | "disputed";

export type OrderRow = {
  id: string;
  product_id: string | null;
  client_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  stripe_invoice_id: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  business_name: string | null;
  status: OrderStatus;
  amount_subtotal: number | null;
  amount_discount: number | null;
  amount_tax: number | null;
  amount_total: number | null;
  amount_refunded: number;
  currency: string | null;
  /** card, klarna, afterpay_clearpay, affirm, link, ... as reported by Stripe. */
  payment_method_type: string | null;
  promotion_code: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  click_ids: Record<string, string> | null;
  paid_at: string | null;
  refunded_at: string | null;
  raw: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const CLICK_ID_KEYS = ["gclid", "fbclid", "ttclid", "msclkid", "li_fat_id"] as const;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Everything a Checkout Session tells us about the order, shaped for the table. */
export function orderFromSession(
  s: Stripe.Checkout.Session,
  extra: { productId: string | null; paymentMethodType: string | null; status: OrderStatus },
): Omit<OrderRow, "id" | "created_at" | "updated_at" | "client_id" | "amount_refunded" | "refunded_at"> {
  const meta = s.metadata ?? {};
  const utm: Record<string, string | null> = {};
  for (const k of UTM_KEYS) utm[k] = str(meta[k]);
  const clickIds: Record<string, string> = {};
  for (const k of CLICK_ID_KEYS) {
    const v = str(meta[k]);
    if (v) clickIds[k] = v;
  }
  const businessField = s.custom_fields?.find((f) => f.key === "business_name");
  // Session-level discounts carry the promotion code; typed loosely because
  // the SDK's shape for this field has shifted between API versions.
  const applied = (s as unknown as { discounts?: { promotion_code?: string | { code?: string } | null }[] }).discounts?.[0];
  const promo = applied?.promotion_code ?? null;

  return {
    product_id: extra.productId,
    stripe_checkout_session_id: s.id,
    stripe_payment_intent_id: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
    stripe_customer_id: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
    stripe_invoice_id: typeof s.invoice === "string" ? s.invoice : (s.invoice?.id ?? null),
    email: s.customer_details?.email ?? s.customer_email ?? null,
    name: s.customer_details?.name ?? null,
    phone: s.customer_details?.phone ?? null,
    business_name: businessField?.text?.value?.trim() || null,
    status: extra.status,
    amount_subtotal: s.amount_subtotal ?? null,
    amount_discount: s.total_details?.amount_discount ?? null,
    amount_tax: s.total_details?.amount_tax ?? null,
    amount_total: s.amount_total ?? null,
    currency: s.currency ?? null,
    payment_method_type: extra.paymentMethodType,
    promotion_code: typeof promo === "string" ? promo : (promo?.code ?? null),
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_term: utm.utm_term,
    utm_content: utm.utm_content,
    click_ids: Object.keys(clickIds).length ? clickIds : null,
    paid_at: extra.status === "paid" ? new Date().toISOString() : null,
    raw: s as unknown as Record<string, unknown>,
  };
}

/** Idempotent on the Checkout Session id (Stripe retries webhooks). */
export async function upsertOrder(row: ReturnType<typeof orderFromSession>): Promise<OrderRow> {
  const { data, error } = await db()
    .from("orders")
    .upsert(row, { onConflict: "stripe_checkout_session_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as OrderRow;
}

export async function getOrderBySession(sessionId: string): Promise<OrderRow | null> {
  const { data } = await db().from("orders").select("*").eq("stripe_checkout_session_id", sessionId).maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export async function getOrderByPaymentIntent(paymentIntentId: string): Promise<OrderRow | null> {
  const { data } = await db().from("orders").select("*").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export async function updateOrder(id: string, patch: Partial<OrderRow>): Promise<OrderRow> {
  const { data, error } = await db().from("orders").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as OrderRow;
}

/** Most recent order for a client (by link, then by Stripe customer, then by email). */
export async function getLatestOrderForClient(client: Client): Promise<OrderRow | null> {
  const supabase = db();
  const byLink = await supabase
    .from("orders")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byLink.data) return byLink.data as OrderRow;
  if (client.stripe_customer_id) {
    const byCustomer = await supabase
      .from("orders")
      .select("*")
      .eq("stripe_customer_id", client.stripe_customer_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byCustomer.data) return byCustomer.data as OrderRow;
  }
  const byEmail = await supabase
    .from("orders")
    .select("*")
    .ilike("email", client.primary_email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (byEmail.data as OrderRow | null) ?? null;
}

export async function listOrders(limit = 200): Promise<OrderRow[]> {
  const { data } = await db().from("orders").select("*").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as OrderRow[];
}

/** Human label for how they paid, for admin lists and the portal. */
export function paymentMethodLabel(type: string | null | undefined): string {
  switch (type) {
    case "klarna":
      return "Klarna";
    case "afterpay_clearpay":
      return "Afterpay";
    case "affirm":
      return "Affirm";
    case "link":
      return "Link";
    case "card":
      return "Card";
    case null:
    case undefined:
      return "-";
    default:
      return type.replace(/_/g, " ");
  }
}
