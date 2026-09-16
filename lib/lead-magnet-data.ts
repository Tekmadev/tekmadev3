import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Storage for every lead magnet submission.
 *
 * Two rows are written per submit: the submission itself (answers, result,
 * consent, attribution) and a `leads` row, so the admin funnel keeps showing
 * every way a person can enter it in one place. The submission is the record
 * of truth; the lead row is the index into it.
 */

export type LeadMagnetSubmissionInput = {
  /** Slug from config/lead-magnets.ts. */
  magnet: string;
  /** Already normalized through normalizeEmail. */
  email: string;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  answers: Record<string, unknown>;
  result: Record<string, unknown>;
  /** The one number worth ranking on for this magnet. */
  score?: number | null;
  consentMarketing: boolean;
  consentPolicyVersion?: string | null;
  path?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  country?: string | null;
  device?: string | null;
};

export type LeadMagnetSubmissionRow = {
  id: string;
  created_at: string;
  magnet: string;
  email: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  answers: Record<string, unknown>;
  result: Record<string, unknown>;
  score: number | null;
  consent_marketing: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  country: string | null;
  ghl_synced_at: string | null;
  emailed_at: string | null;
};

export type RecordSubmissionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "config" | "db" };

/**
 * Writes the submission, then best-effort writes the matching `leads` row.
 * A failed lead row never fails the submission: the person gets their report
 * either way, and the submission still holds everything the lead row would.
 */
export async function recordLeadMagnetSubmission(
  input: LeadMagnetSubmissionInput,
): Promise<RecordSubmissionResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "config" };

  const { data, error } = await supabase
    .from("lead_magnet_submissions")
    .insert({
      magnet: input.magnet,
      email: input.email,
      name: input.name ?? null,
      company: input.company ?? null,
      phone: input.phone ?? null,
      answers: input.answers,
      result: input.result,
      score: input.score ?? null,
      consent_marketing: input.consentMarketing,
      consent_policy_version: input.consentPolicyVersion ?? null,
      path: input.path ?? null,
      referrer: input.referrer ?? null,
      utm_source: input.utm_source ?? null,
      utm_medium: input.utm_medium ?? null,
      utm_campaign: input.utm_campaign ?? null,
      utm_term: input.utm_term ?? null,
      utm_content: input.utm_content ?? null,
      country: input.country ?? null,
      device: input.device ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[lead-magnet] insert failed", error?.message);
    return { ok: false, reason: "db" };
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      source: "lead_magnet",
      status: "new",
      name: input.name ?? null,
      email: input.email,
      phone: input.phone ?? null,
      utm_source: input.utm_source ?? null,
      utm_medium: input.utm_medium ?? null,
      utm_campaign: input.utm_campaign ?? null,
      utm_term: input.utm_term ?? null,
      utm_content: input.utm_content ?? null,
      referrer: input.referrer ?? null,
      landing_page: input.path ?? null,
      raw: {
        magnet: input.magnet,
        company: input.company ?? null,
        score: input.score ?? null,
        submission_id: data.id,
      },
    })
    .select("id")
    .single();

  if (leadError) {
    console.error("[lead-magnet] lead row failed", leadError.message);
  } else if (lead) {
    await supabase.from("lead_magnet_submissions").update({ lead_id: lead.id }).eq("id", data.id);
  }

  return { ok: true, id: data.id };
}

/** Stamps what actually went out, so a retry or an audit can tell. */
export async function markLeadMagnetDelivery(
  id: string,
  marks: { ghlSynced?: boolean; emailed?: boolean },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const patch: Record<string, string> = {};
  const now = new Date().toISOString();
  if (marks.ghlSynced) patch.ghl_synced_at = now;
  if (marks.emailed) patch.emailed_at = now;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("lead_magnet_submissions").update(patch).eq("id", id);
  if (error) console.error("[lead-magnet] delivery stamp failed", error.message);
}

/** Newest first, for the admin list. */
export async function getLeadMagnetSubmissions(limit = 100): Promise<LeadMagnetSubmissionRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("lead_magnet_submissions")
    .select(
      "id, created_at, magnet, email, name, company, phone, answers, result, score, consent_marketing, utm_source, utm_medium, utm_campaign, country, ghl_synced_at, emailed_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[lead-magnet] list failed", error.message);
    return [];
  }
  return (data ?? []) as LeadMagnetSubmissionRow[];
}

export type LeadMagnetStats = {
  total: number;
  last30: number;
  optedIn: number;
  /** Sum of every score, which for the revenue leak calculator is dollars a month. */
  pipelineScore: number;
};

export async function getLeadMagnetStats(): Promise<LeadMagnetStats> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { total: 0, last30: 0, optedIn: 0, pipelineScore: 0 };

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("lead_magnet_submissions")
    .select("created_at, score, consent_marketing");

  if (error || !data) {
    console.error("[lead-magnet] stats failed", error?.message);
    return { total: 0, last30: 0, optedIn: 0, pipelineScore: 0 };
  }

  const rows = data as { created_at: string; score: number | null; consent_marketing: boolean }[];
  return {
    total: rows.length,
    last30: rows.filter((r) => r.created_at >= since).length,
    optedIn: rows.filter((r) => r.consent_marketing).length,
    pipelineScore: rows.reduce((sum, r) => sum + (Number(r.score) || 0), 0),
  };
}
