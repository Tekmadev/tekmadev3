import { getSupabaseAdmin } from "@/lib/supabase";
import { GROW_LEAD_SOURCE, type GrowNeed, type RevenueBand } from "@/config/grow";

/**
 * Stores a /grow form lead in public.leads.
 *
 * One INSERT with every column set: each later UPDATE on a lead re-enqueues a
 * CRM contact upsert, and an update racing an inline CRM pass can be missed.
 * The first-party row is the record; everything else (email, Meta, the admin
 * inbox, the CRM) is derived from it after it exists.
 */

export type GrowLeadInput = {
  email: string;
  name: string;
  phone: string;
  businessName: string | null;
  website: string | null;
  need: GrowNeed;
  revenueBand: RevenueBand;
  message: string | null;
  utm: {
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_term: string | null;
    utm_content: string | null;
  };
  clickIds: Record<string, string> | null;
  referrer: string | null;
  landingPage: string | null;
  /** First-touch attribution, device, country, consent: kept where the Cal webhook never writes. */
  form: Record<string, unknown>;
};

export type GrowLeadResult =
  | { ok: true; id: string; duplicate: boolean }
  | { ok: false; reason: string };

/**
 * A retried request inside this window, with every answer the same, is the
 * same lead. A resubmit with any answer changed is a correction and is stored:
 * otherwise the fix to a mistyped phone never reaches the lead, the inbox or
 * the CRM, and the first lead's id would go to anyone posting that email.
 */
const DOUBLE_SUBMIT_MS = 2 * 60 * 1000;

export async function recordGrowLead(input: GrowLeadInput): Promise<GrowLeadResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const since = new Date(Date.now() - DOUBLE_SUBMIT_MS).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from("leads")
    .select("id,name,phone,business_name,website,need,revenue_band,message,form")
    .eq("source", GROW_LEAD_SOURCE)
    .eq("email", input.email)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // A failed lookup only costs the double-submit guard, never the lead.
  if (recentError) console.error("[grow] duplicate check failed", recentError.message);
  const same =
    !!recent &&
    recent.name === input.name &&
    recent.phone === input.phone &&
    (recent.business_name ?? null) === input.businessName &&
    (recent.website ?? null) === input.website &&
    recent.need === input.need &&
    recent.revenue_band === input.revenueBand &&
    (recent.message ?? null) === input.message &&
    (recent.form as { consent_marketing?: unknown } | null)?.consent_marketing === input.form.consent_marketing;
  if (recent && same) return { ok: true, id: recent.id as string, duplicate: true };

  const { data, error } = await supabase
    .from("leads")
    .insert({
      source: GROW_LEAD_SOURCE,
      status: "new",
      name: input.name,
      email: input.email,
      phone: input.phone,
      business_name: input.businessName,
      website: input.website,
      need: input.need,
      revenue_band: input.revenueBand,
      message: input.message,
      ...input.utm,
      click_ids: input.clickIds && Object.keys(input.clickIds).length ? input.clickIds : null,
      referrer: input.referrer,
      landing_page: input.landingPage,
      form: input.form,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, reason: error?.message ?? "no row returned" };
  return { ok: true, id: data.id as string, duplicate: false };
}
