import { getSupabaseAdmin } from "@/lib/supabase";
import { tierMeta, type TierMeta } from "@/config/pricing";

/** A tier ready to render: metadata + live prices from the `plans` table. */
export type DisplayTier = TierMeta & {
  currency: string;
  setupAmount: number | null; // cents; null = custom / quote
  monthlyAmount: number | null; // cents; null = custom / quote
};

type PlanRow = {
  id: string;
  currency: string | null;
  setup_amount: number | null;
  monthly_amount: number | null;
};

export type PlanFull = PlanRow & {
  name: string;
  stripe_product_id: string | null;
  stripe_setup_product_id: string | null;
  stripe_monthly_price_id: string | null;
  stripe_setup_price_id: string | null;
};

/** Tiers for the /start page: config metadata merged with DB prices. */
export async function getDisplayTiers(): Promise<DisplayTier[]> {
  const supabase = getSupabaseAdmin();
  const byId = new Map<string, PlanRow>();

  if (supabase) {
    const { data } = await supabase.from("plans").select("id,currency,setup_amount,monthly_amount");
    for (const p of (data ?? []) as PlanRow[]) byId.set(p.id, p);
  }

  return tierMeta.map((m) => {
    const plan = byId.get(m.id);
    return {
      ...m,
      currency: (plan?.currency || "cad").toUpperCase(),
      setupAmount: plan ? (plan.setup_amount ?? 0) : null,
      monthlyAmount: plan ? (plan.monthly_amount ?? 0) : null,
    };
  });
}

/** Full plan row (incl. Stripe IDs) for checkout and the dashboard editor. */
export async function getPlan(tierId: string): Promise<PlanFull | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase.from("plans").select("*").eq("id", tierId).maybeSingle();
  return (data as PlanFull) ?? null;
}

export async function getAllPlans(): Promise<PlanFull[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase.from("plans").select("*").order("monthly_amount", { ascending: true });
  return (data as PlanFull[]) ?? [];
}
