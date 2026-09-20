import { getSupabaseAdmin } from "@/lib/supabase";
import type { StripeMode } from "@/lib/stripe-mode";

/**
 * Owner-controlled switches, stored in `site_settings` and read at request time
 * so a change takes effect at once with nothing deployed.
 *
 * Every reader names its own safe default, and a failed read returns that
 * default. For a switch that changes what buyers pay, the safe default is off.
 */

export type SalesTaxSetting = Record<StripeMode, boolean>;

async function read<T>(key: string, fallback: T): Promise<T> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return fallback;
  const { data, error } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
  if (error) {
    console.error(`[site settings] could not read ${key}`, error.message);
    return fallback;
  }
  return (data?.value as T | undefined) ?? fallback;
}

async function write(key: string, value: unknown, by: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from("site_settings")
    .upsert({ key, value, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) console.error(`[site settings] could not save ${key}`, error.message);
  return !error;
}

export async function getSalesTaxSetting(): Promise<SalesTaxSetting> {
  const v = await read<Partial<SalesTaxSetting>>("sales_tax", {});
  // Anything but a literal true is off: a malformed row must never start charging tax.
  return { live: v.live === true, test: v.test === true };
}

export async function setSalesTax(mode: StripeMode, on: boolean, by: string): Promise<boolean> {
  const current = await getSalesTaxSetting();
  return write("sales_tax", { ...current, [mode]: on }, by);
}
