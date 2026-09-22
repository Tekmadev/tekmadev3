import { getSupabaseAdmin } from "@/lib/supabase";
import { dayKey, notifyAdmins } from "@/lib/admin-notify";

/**
 * Pulls what Meta reports about our ads into `ad_insights_daily`.
 *
 * One row per ad per day, from the Marketing API's Insights edge, so the Ads
 * dashboard can put Meta's spend beside what our own site recorded. Meta keeps
 * revising a day for about three days after it ends, so every pull re-reads a
 * trailing window and upserts; the first pull on an empty table reaches back
 * 90 days so the history is complete from day one.
 *
 * Needs two env vars the owner sets in Vercel:
 *   META_AD_ACCOUNT_ID      the ad account, with or without the `act_` prefix
 *   META_ADS_ACCESS_TOKEN   a system user token with `ads_read` on that account
 * The Conversions API token cannot be reused: its permission is for sending
 * events, not for reading reports.
 *
 * Meta reports in the ad account's own time zone. Set that account to
 * America/Toronto so its days line up with the site's first-party numbers.
 */

const GRAPH = "https://graph.facebook.com/v25.0";
const BACKFILL_DAYS = 90;
const REFRESH_DAYS = 7;
const PLATFORM = "meta";

const FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "objective",
  "account_currency",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "actions",
  "action_values",
  "date_start",
  "date_stop",
].join(",");

type Action = { action_type: string; value: string };

type InsightRow = {
  campaign_id: string;
  campaign_name?: string;
  adset_id: string;
  adset_name?: string;
  ad_id: string;
  ad_name?: string;
  objective?: string;
  account_currency?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: Action[];
  action_values?: Action[];
  date_start: string;
  date_stop: string;
};

export type MetaAdsConfig = { token: string; accountId: string };

export function metaAdsConfig(): MetaAdsConfig | null {
  const token = process.env.META_ADS_ACCESS_TOKEN?.trim();
  const raw = process.env.META_AD_ACCOUNT_ID?.trim().replace(/^act_/, "");
  if (!token || !raw || !/^\d+$/.test(raw)) return null;
  return { token, accountId: raw };
}

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** First matching action type's value; Meta names the same result more than one way. */
function pick(actions: Action[] | undefined, ...types: string[]): number {
  for (const t of types) {
    const hit = actions?.find((a) => a.action_type === t);
    if (hit) return num(hit.value);
  }
  return 0;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Every page of ad-level, per-day insights for the window. Throws on any API error. */
async function fetchInsights(cfg: MetaAdsConfig, since: string, until: string): Promise<InsightRow[]> {
  const rows: InsightRow[] = [];
  let after: string | null = null;
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({
      level: "ad",
      fields: FIELDS,
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      limit: "500",
    });
    if (after) params.set("after", after);
    const res = await fetch(`${GRAPH}/act_${cfg.accountId}/insights?${params}`, {
      // The token travels in a header, never in the URL, so it cannot land in a log.
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: InsightRow[];
      paging?: { cursors?: { after?: string }; next?: string };
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    if (!res.ok || body.error) {
      const e = body.error;
      throw new Error(`Meta ${res.status}${e?.code ? ` (code ${e.code})` : ""}: ${e?.message ?? "request failed"}`);
    }
    rows.push(...(body.data ?? []));
    after = body.paging?.next && body.paging.cursors?.after ? body.paging.cursors.after : null;
    if (!after) break;
  }
  return rows;
}

export type SyncResult =
  | { ok: true; rows: number; from: string; to: string; backfilled: boolean }
  | { ok: false; error: string };

/**
 * Pull the trailing window (or the 90-day backfill on first run) and upsert
 * it. Records the run in `ad_sync_runs` and alerts the owner, once a day at
 * most, when a pull fails.
 */
export async function syncMetaInsights(opts: { trigger: "cron" | "manual" } = { trigger: "cron" }): Promise<SyncResult> {
  const cfg = metaAdsConfig();
  const supabase = getSupabaseAdmin();
  if (!cfg) return { ok: false, error: "Meta ads are not connected. Set META_AD_ACCOUNT_ID and META_ADS_ACCESS_TOKEN." };
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  // First pull on an empty account: reach back so the history is complete.
  const { count } = await supabase
    .from("ad_insights_daily")
    .select("id", { count: "exact", head: true })
    .eq("platform", PLATFORM)
    .eq("account_id", cfg.accountId);
  const backfilled = !count;
  const days = backfilled ? BACKFILL_DAYS : REFRESH_DAYS;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const since = isoDay(from);
  const until = isoDay(to);

  const { data: run } = await supabase
    .from("ad_sync_runs")
    .insert({ platform: PLATFORM, trigger: opts.trigger, from_day: since, to_day: until })
    .select("id")
    .single();
  const finish = (patch: Record<string, unknown>) =>
    run ? supabase.from("ad_sync_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", run.id) : Promise.resolve();

  try {
    const rows = await fetchInsights(cfg, since, until);
    const records = rows.map((r) => ({
      platform: PLATFORM,
      account_id: cfg.accountId,
      day: r.date_start,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name ?? null,
      adset_id: r.adset_id,
      adset_name: r.adset_name ?? null,
      ad_id: r.ad_id,
      ad_name: r.ad_name ?? null,
      objective: r.objective ?? null,
      currency: (r.account_currency ?? "CAD").toUpperCase(),
      spend: num(r.spend),
      impressions: num(r.impressions),
      reach: num(r.reach),
      clicks: num(r.clicks),
      link_clicks: num(r.inline_link_clicks),
      landing_page_views: pick(r.actions, "landing_page_view"),
      conversations: pick(r.actions, "onsite_conversion.messaging_conversation_started_7d"),
      leads: pick(r.actions, "lead", "offsite_conversion.fb_pixel_lead"),
      schedules: pick(r.actions, "schedule_total", "schedule_website", "offsite_conversion.fb_pixel_schedule"),
      purchases: pick(r.actions, "purchase", "offsite_conversion.fb_pixel_purchase"),
      purchase_value: pick(r.action_values, "purchase", "offsite_conversion.fb_pixel_purchase"),
      actions: r.actions ?? null,
      raw: r,
      synced_at: new Date().toISOString(),
    }));

    // In chunks: a 90-day backfill of a busy account is thousands of rows.
    for (let i = 0; i < records.length; i += 500) {
      const { error } = await supabase
        .from("ad_insights_daily")
        .upsert(records.slice(i, i + 500), { onConflict: "platform,account_id,ad_id,day" });
      if (error) throw new Error(`save failed: ${error.message}`);
    }

    await finish({ status: "ok", rows_upserted: records.length });
    return { ok: true, rows: records.length, from: since, to: until, backfilled };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[meta ads] sync failed", message);
    await finish({ status: "error", error: message.slice(0, 1000) });
    await notifyAdmins({
      event: "ads.sync_failed",
      title: "Meta ads report did not sync",
      body: `${message}. The Ads dashboard is showing older numbers until this is fixed. An expired token is the usual cause.`,
      url: "/admin/ads",
      needsAction: true,
      dedupeKey: dayKey("ads_sync_failed"),
      collapse: true,
    });
    return { ok: false, error: message };
  }
}

export type SyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "error";
  trigger: "cron" | "manual";
  rows_upserted: number;
  error: string | null;
};

export async function getLastSyncRun(): Promise<SyncRun | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("ad_sync_runs")
    .select("id,started_at,finished_at,status,trigger,rows_upserted,error")
    .eq("platform", PLATFORM)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SyncRun | null) ?? null;
}
