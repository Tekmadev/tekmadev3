import { getSupabaseAdmin } from "@/lib/supabase";

/** A newsletter subscriber captured first-party from the site footer. */
export type SubscriberStatus = "active" | "unsubscribed" | "bounced" | "complained";

export type SubscriberRow = {
  id: string;
  created_at: string;
  email: string;
  status: SubscriberStatus;
  source: string;
  name: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  country: string | null;
  device: string | null;
  unsubscribe_token: string;
  ghl_synced_at: string | null;
};

export type SubscriberStats = {
  total: number;
  active: number;
  unsubscribed: number;
  last30: number;
};

// Deliberately conservative: one @, one dot after it, no spaces. Real validation
// is the confirmation of a live inbox; this only rejects obvious junk.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trim + lowercase + shape-check an email. null when it cannot be a valid address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  if (!EMAIL_RE.test(e)) return null;
  return e;
}

export type AddSubscriberInput = {
  email: string; // must already be normalized via normalizeEmail
  source?: string;
  name?: string | null;
  path?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  country?: string | null;
  device?: string | null;
  consentPolicyVersion?: string | null;
};

/** The minimal, non-PII-heavy shape we forward to GHL after a successful add. */
export type AddedSubscriber = {
  email: string;
  name: string | null;
  source: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

export type AddSubscriberResult =
  | { ok: true; created: boolean; reactivated: boolean; subscriber: AddedSubscriber }
  | { ok: false; reason: "config" | "db" };

/**
 * Idempotent subscribe. Inserts a new active subscriber; if the email already
 * exists it reactivates a previously unsubscribed address and otherwise is a
 * no-op success. `created || reactivated` signals that a GHL push is warranted.
 */
export async function addSubscriber(input: AddSubscriberInput): Promise<AddSubscriberResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "config" };

  const now = new Date().toISOString();
  const summary: AddedSubscriber = {
    email: input.email,
    name: input.name ?? null,
    source: input.source ?? "footer",
    utm_source: input.utm_source ?? null,
    utm_medium: input.utm_medium ?? null,
    utm_campaign: input.utm_campaign ?? null,
  };

  const { data: existing, error: selErr } = await supabase
    .from("subscribers")
    .select("id,status")
    .eq("email", input.email)
    .maybeSingle();
  if (selErr) {
    console.error("[subscribers] select failed", selErr.message);
    return { ok: false, reason: "db" };
  }

  if (existing) {
    if (existing.status === "active") {
      return { ok: true, created: false, reactivated: false, subscriber: summary };
    }
    const { error: updErr } = await supabase
      .from("subscribers")
      .update({
        status: "active",
        unsubscribed_at: null,
        updated_at: now,
        consented_at: now,
        consent_policy_version: input.consentPolicyVersion ?? null,
      })
      .eq("id", existing.id);
    if (updErr) {
      console.error("[subscribers] reactivate failed", updErr.message);
      return { ok: false, reason: "db" };
    }
    return { ok: true, created: false, reactivated: true, subscriber: summary };
  }

  const { error: insErr } = await supabase.from("subscribers").insert({
    email: input.email,
    status: "active",
    source: input.source ?? "footer",
    name: input.name ?? null,
    path: input.path ?? null,
    referrer: input.referrer ?? null,
    utm_source: input.utm_source ?? null,
    utm_medium: input.utm_medium ?? null,
    utm_campaign: input.utm_campaign ?? null,
    utm_term: input.utm_term ?? null,
    utm_content: input.utm_content ?? null,
    country: input.country ?? null,
    device: input.device ?? null,
    consent_policy_version: input.consentPolicyVersion ?? null,
    consented_at: now,
  });
  if (insErr) {
    // Race: a concurrent request inserted the same email between select and insert.
    // Prefer the stable SQLSTATE (23505 = unique_violation); fall back to message.
    if (insErr.code === "23505" || /duplicate key|unique/i.test(insErr.message)) {
      return { ok: true, created: false, reactivated: false, subscriber: summary };
    }
    console.error("[subscribers] insert failed", insErr.message);
    return { ok: false, reason: "db" };
  }
  return { ok: true, created: true, reactivated: false, subscriber: summary };
}

/** Mark a subscriber unsubscribed by their opaque token. Idempotent. */
export async function unsubscribeByToken(
  token: string,
): Promise<"ok" | "notfound" | "config"> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return "config";
  if (!UUID_RE.test(token)) return "notfound";

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("subscribers")
    .update({ status: "unsubscribed", unsubscribed_at: now, updated_at: now })
    .eq("unsubscribe_token", token)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[subscribers] unsubscribe failed", error.message);
    return "config";
  }
  return data ? "ok" : "notfound";
}

/** Resolve our opaque public_id (used in tracking URLs) to a subscriber id. */
export async function resolveSubscriberIdByPublicId(publicId: string): Promise<string | null> {
  if (!UUID_RE.test(publicId)) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("subscribers")
    .select("id")
    .eq("public_id", publicId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function getSubscribers(limit = 200): Promise<SubscriberRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("subscribers")
    .select(
      "id,created_at,email,status,source,name,utm_source,utm_medium,utm_campaign,country,device,unsubscribe_token,ghl_synced_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as SubscriberRow[]) ?? [];
}

export async function getSubscriberStats(): Promise<SubscriberStats> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { total: 0, active: 0, unsubscribed: 0, last30: 0 };

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const countQuery = () => supabase.from("subscribers").select("*", { count: "exact", head: true });

  const [total, active, unsub, last30] = await Promise.all([
    countQuery(),
    countQuery().eq("status", "active"),
    countQuery().eq("status", "unsubscribed"),
    countQuery().gte("created_at", since),
  ]);

  return {
    total: total.count ?? 0,
    active: active.count ?? 0,
    unsubscribed: unsub.count ?? 0,
    last30: last30.count ?? 0,
  };
}
