import { getSupabaseAdmin } from "@/lib/supabase";
import { getProductMeta, installmentAmount, productMeta, type ProductMeta } from "@/config/products";

/** A row of the `products` table: the live price and Stripe ids for a one-time offer. */
export type ProductRow = {
  id: string;
  name: string;
  currency: string;
  amount: number; // cents, charged once
  compare_at_amount: number | null; // cents; optional "typical price" anchor
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Metadata + live price, ready to render and to send to checkout. */
export type DisplayProduct = Omit<ProductMeta, "currency"> & {
  currency: string;
  amount: number;
  compareAtAmount: number | null;
  /** One of four equal pay-in-4 instalments (cents). */
  installment: number;
  /** True when a Stripe price exists, i.e. the buy button can work. */
  purchasable: boolean;
};

export async function getProduct(id: string): Promise<ProductRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  return (data as ProductRow | null) ?? null;
}

export async function getAllProducts(): Promise<ProductRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase.from("products").select("*").order("sort_order", { ascending: true });
  return (data as ProductRow[]) ?? [];
}

/**
 * The product as the sales page needs it. Falls back to the config default
 * amount when the DB is unreachable so the page still renders (with the buy
 * button disabled, since there is no Stripe price to charge).
 */
export async function getDisplayProduct(id: string): Promise<DisplayProduct | null> {
  const meta = getProductMeta(id);
  if (!meta) return null;
  const row = await getProduct(id);
  const amount = row?.amount ?? meta.defaultAmount;
  return {
    ...meta,
    currency: (row?.currency || meta.currency).toUpperCase(),
    amount,
    compareAtAmount: row?.compare_at_amount ?? null,
    installment: installmentAmount(amount),
    purchasable: Boolean(row?.active && row?.stripe_price_id),
  };
}

export function allProductMeta(): ProductMeta[] {
  return productMeta;
}
