import { getSupabaseAdmin } from "@/lib/supabase";
import { getLastSyncRun, metaAdsConfig, type SyncRun } from "@/lib/meta-ads";

/**
 * The Ads dashboard, per time range.
 *
 * Two sources, kept apart on purpose:
 *   platform  what Meta reported (spend, impressions, clicks, its own results),
 *             from `ad_insights_daily` via ads_platform_summary()
 *   site      what our own site recorded for paid Meta visitors (visits, leads,
 *             bookings, sales, revenue), from ads_outcomes()
 * Cost per lead, cost per sale and return on ad spend divide platform spend by
 * site outcomes: the site counts every visitor, Meta only the ones who accepted
 * the cookie banner, so the site is the denominator that is actually complete.
 *
 * Reads return null when they fail, never an empty dashboard.
 */

export type AdsRange = { key: string; label: string; phrase: string; days: number | null };

export const ADS_RANGES: AdsRange[] = [
  { key: "7d", label: "7 days", phrase: "last 7 days", days: 7 },
  { key: "14d", label: "14 days", phrase: "last 14 days", days: 14 },
  { key: "30d", label: "30 days", phrase: "last 30 days", days: 30 },
  { key: "3m", label: "3 months", phrase: "last 3 months", days: 91 },
  { key: "all", label: "All time", phrase: "all time", days: null },
];
export const DEFAULT_ADS_RANGE = "30d";

export function resolveAdsRange(key: string | null | undefined): AdsRange {
  return ADS_RANGES.find((r) => r.key === key) ?? (ADS_RANGES.find((r) => r.key === DEFAULT_ADS_RANGE) as AdsRange);
}

export type PlatformTotals = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  landing_page_views: number;
  conversations: number;
  leads: number;
  schedules: number;
  purchases: number;
  purchase_value: number;
  currency: string | null;
  ads: number;
  campaigns: number;
  first_day: string | null;
  last_day: string | null;
};
export type PlatformDay = { day: string; spend: number; impressions: number; link_clicks: number; conversations: number; leads: number; purchases: number };
export type PlatformCampaign = {
  campaign_id: string;
  campaign_name: string | null;
  objective: string | null;
  spend: number;
  impressions: number;
  link_clicks: number;
  landing_page_views: number;
  conversations: number;
  leads: number;
  schedules: number;
  purchases: number;
  purchase_value: number;
  first_day: string;
  last_day: string;
};
export type PlatformAd = {
  ad_id: string;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  spend: number;
  impressions: number;
  link_clicks: number;
  conversations: number;
  leads: number;
  purchases: number;
};

export type SiteTotals = { pageviews: number; visits: number; leads: number; bookings: number; subscribers: number; sales: number; revenue: number };
export type SiteDay = SiteTotals & { day: string };
export type SiteCampaign = Omit<SiteTotals, "pageviews"> & { campaign: string | null };

export type AdsDashboard = {
  range: AdsRange;
  from: string;
  to: string;
  /** Both env vars are present. Without them the platform half is empty and the page says why. */
  connected: boolean;
  lastSync: SyncRun | null;
  platform: { totals: PlatformTotals; days: PlatformDay[]; campaigns: PlatformCampaign[]; ads: PlatformAd[] };
  site: { totals: SiteTotals; days: SiteDay[]; campaigns: SiteCampaign[] };
  /** Spend divided by site outcomes. Null when there is nothing to divide by. */
  cost: { perVisit: number | null; perLead: number | null; perBooking: number | null; perSale: number | null; roas: number | null };
};

const TZ = "America/Toronto";
const MS_DAY = 86_400_000;

function ratio(spend: number, n: number): number | null {
  return n > 0 && spend > 0 ? spend / n : null;
}

export async function getAdsDashboard(rangeKey: string | null | undefined): Promise<AdsDashboard | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const range = resolveAdsRange(rangeKey);

  const to = new Date();
  // "All time" starts where either source starts; a year back is plenty until then.
  const from = new Date(to.getTime() - (range.days ?? 366) * MS_DAY);
  const day = (d: Date) => d.toISOString().slice(0, 10);

  const [platform, site, lastSync] = await Promise.all([
    supabase.rpc("ads_platform_summary", { p_from: day(from), p_to: day(to), p_platform: "meta" }),
    supabase.rpc("ads_outcomes", { p_from: from.toISOString(), p_to: to.toISOString(), p_tz: TZ }),
    getLastSyncRun(),
  ]);
  if (platform.error || site.error) {
    console.error("[ads] dashboard read failed", platform.error?.message ?? site.error?.message);
    return null;
  }

  const p = platform.data as AdsDashboard["platform"];
  const s = site.data as { totals: SiteTotals; days: SiteDay[]; campaigns: SiteCampaign[] };
  const spend = Number(p.totals.spend ?? 0);

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    connected: Boolean(metaAdsConfig()),
    lastSync,
    platform: p,
    site: s,
    cost: {
      perVisit: ratio(spend, s.totals.visits),
      perLead: ratio(spend, s.totals.leads),
      perBooking: ratio(spend, s.totals.bookings),
      perSale: ratio(spend, s.totals.sales),
      roas: spend > 0 && s.totals.revenue > 0 ? s.totals.revenue / spend : null,
    },
  };
}
