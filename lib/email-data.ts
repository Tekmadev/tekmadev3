import { getSupabaseAdmin } from "@/lib/supabase";
import { business } from "@/config/site";
import { resolveSubscriberIdByPublicId } from "@/lib/subscribers-data";

/** A marketing campaign. GHL sends the email; we own the first-party engagement. */
export type CampaignRow = {
  id: string;
  created_at: string;
  key: string;
  name: string;
  subject: string | null;
  template: string | null;
  description: string | null;
  active: boolean;
  open_count: number;
  click_count: number;
};

/** One first-party open (pixel) or click (redirect). */
export type EmailEventRow = {
  created_at: string;
  type: "open" | "click";
  campaign_key: string | null;
  url: string | null;
  link_label: string | null;
  device: string | null;
  country: string | null;
};

export type EmailStats = {
  opens: number;
  clicks: number;
  opens30: number;
  clicks30: number;
};

/**
 * Hosts a tracked email click is allowed to forward to. Every CTA runs through
 * /api/e/c, so this list is what stops the redirect from being abused as an
 * open redirect in a phishing email. Add a host here before linking to it.
 */
const ALLOWED_EMAIL_HOSTS = new Set([
  "tekmadev.com",
  "www.tekmadev.com",
  "content.tekmadev.com",
  "cal.com",
  "www.cal.com",
]);

/**
 * Resolve a tracked click's destination safely. Relative paths resolve against
 * our own site; absolute URLs must be https(ish) and on an allowlisted host.
 * Anything else falls back to the homepage rather than redirecting off-domain.
 */
export function safeEmailDestination(raw: string | null | undefined): string {
  const fallback = business.url;
  if (!raw) return fallback;
  const v = raw.trim();
  if (!v) return fallback;

  // Protocol-relative ("//evil.com") is an off-domain redirect in disguise.
  if (v.startsWith("//")) return fallback;
  if (v.startsWith("/")) return `${business.url}${v}`;

  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return fallback;
    if (!ALLOWED_EMAIL_HOSTS.has(u.hostname.toLowerCase())) return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

/**
 * Log a first-party email event and bump the campaign's denormalized counter.
 * Best-effort: swallows every error so the pixel/redirect always completes.
 */
export async function logEmailEvent(input: {
  type: "open" | "click";
  campaignKey: string | null;
  subscriberPublicId: string | null;
  url?: string | null;
  linkLabel?: string | null;
  device: string | null;
  country: string | null;
  referrer: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    const subscriberId = input.subscriberPublicId
      ? await resolveSubscriberIdByPublicId(input.subscriberPublicId)
      : null;

    await supabase.from("email_events").insert({
      type: input.type,
      campaign_key: input.campaignKey,
      subscriber_id: subscriberId,
      url: input.url ?? null,
      link_label: input.linkLabel ?? null,
      device: input.device,
      country: input.country,
      referrer: input.referrer,
    });

    if (input.campaignKey) {
      await supabase.rpc(
        input.type === "open" ? "increment_email_open" : "increment_email_click",
        { p_key: input.campaignKey },
      );
    }
  } catch (err) {
    console.error("[email] event log failed", err instanceof Error ? err.message : String(err));
  }
}

export async function getCampaigns(): Promise<CampaignRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("email_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as CampaignRow[]) ?? [];
}

export async function getRecentEmailEvents(limit = 30): Promise<EmailEventRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("email_events")
    .select("created_at,type,campaign_key,url,link_label,device,country")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as EmailEventRow[]) ?? [];
}

export async function getEmailStats(): Promise<EmailStats> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { opens: 0, clicks: 0, opens30: 0, clicks30: 0 };

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const countQuery = () => supabase.from("email_events").select("*", { count: "exact", head: true });

  const [opens, clicks, opens30, clicks30] = await Promise.all([
    countQuery().eq("type", "open"),
    countQuery().eq("type", "click"),
    countQuery().eq("type", "open").gte("created_at", since),
    countQuery().eq("type", "click").gte("created_at", since),
  ]);

  return {
    opens: opens.count ?? 0,
    clicks: clicks.count ?? 0,
    opens30: opens30.count ?? 0,
    clicks30: clicks30.count ?? 0,
  };
}
