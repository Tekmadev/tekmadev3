import { z } from "zod";
import { dbError, instant, money, notConfigured, notFound, requireDb, unavailable, upstream } from "@/lib/admin-api";
import { BUSINESS_TZ, addDays, torontoDayStart, torontoToday } from "@/lib/admin-api/analytics/calendar";
import { metaAdsConfig, syncMetaInsights } from "@/lib/meta-ads";

/**
 * The Ads screen of the admin app (owners and managers): GET /ads, GET /ads/campaigns/:id
 * and POST /ads/refresh (docs/api-requests/ads.md in the app repo, schema
 * src/api/schemas/ads.ts).
 *
 * Same two sources as the web admin's Ads page (lib/ads-data.ts), kept apart:
 *   what Meta reported   ad_insights_daily via ads_platform_summary() and ads_breakdown()
 *   what the site saw    paid Meta visitors' visits, leads, bookings and sales via
 *                        ads_outcomes() and ads_breakdown() (per utm_content)
 * Cost per outcome divides Meta's spend by the site's count, because the site
 * sees every visitor and Meta only the ones who accepted the cookie banner.
 *
 * Windows are whole Toronto days ending today. Meta reports in the ad
 * account's time zone (set to Toronto, see lib/meta-ads.ts), so its days and
 * the site's line up.
 */

export const ADS_RANGES = ["7d", "14d", "30d", "3m", "all"] as const;
export type AdsRange = (typeof ADS_RANGES)[number];
export const DEFAULT_ADS_RANGE: AdsRange = "30d";

/** Days in each range, counting today. "All" is the last 12 months. */
const RANGE_DAYS: Record<AdsRange, number> = { "7d": 7, "14d": 14, "30d": 30, "3m": 90, all: 365 };

const PLATFORM = "meta";

/** `?range=`: missing or empty is 30 days; anything else unknown is 400 `range`. */
export const adsQuery = z.object({
  range: z.preprocess(
    (v) => (v === undefined || v === "" ? DEFAULT_ADS_RANGE : v),
    z.enum(ADS_RANGES, "Unknown range. Use 7d, 14d, 30d, 3m or all."),
  ),
});

/** The toast after a failed refresh (brief 8.10). The inbox row carries the full reason. */
export const META_REFUSED = "Meta refused the pull. The inbox has the reason; an expired token is the usual cause.";

/* ---------- shapes sent to the app ---------- */

type Money = { amount: number; currency: string };

export type AdsCampaignStatus = "active" | "paused" | "archived";
export type AdsLastSync = { at: string; ok: boolean; error: string | null };
export type AdsDay = { date: string; spend: Money; visits: number };

type Outcomes = { visits: number; leads: number; booked: number; sales: number; revenue: Money };

export type AdsCampaign = Outcomes & {
  id: string;
  name: string;
  status: AdsCampaignStatus;
  spend: Money;
  linkClicks: number;
  costPerLead: Money | null;
  costPerSale: Money | null;
};

export type AdsAd = Outcomes & {
  id: string;
  campaignId: string;
  name: string;
  spend: Money;
  linkClicks: number;
  costPerLead: Money | null;
  costPerSale: Money | null;
};

export type AdsConnectedReport = {
  connected: true;
  range: AdsRange;
  lastSync: AdsLastSync | null;
  totals: { spend: Money; impressions: number; reach: number; linkClicks: number; ctr: number; costPerLinkClick: Money | null };
  outcomes: Outcomes & { roas: number | null };
  cost: { perVisit: Money | null; perLead: Money | null; perBooked: Money | null; perSale: Money | null };
  days: AdsDay[];
  campaigns: AdsCampaign[];
  ads: AdsAd[];
};

export type AdsReport = AdsConnectedReport | { connected: false; range: AdsRange; lastSync: AdsLastSync | null };

/** GET /ads/campaigns/:id: one campaign card and the ads inside it, for the same range. */
export type AdsCampaignDetail = { range: AdsRange; lastSync: AdsLastSync | null; campaign: AdsCampaign; ads: AdsAd[] };

/* ---------- reading the database ---------- */

const zNum = z.coerce.number().transform((n) => (Number.isFinite(n) ? n : 0));

const zPlatformSummary = z.object({
  totals: z.object({
    spend: zNum,
    impressions: zNum,
    reach: zNum,
    link_clicks: zNum,
    currency: z.string().nullable().optional(),
  }),
  days: z.array(z.object({ day: z.string(), spend: zNum })),
  campaigns: z.array(
    z.object({
      campaign_id: z.string(),
      campaign_name: z.string().nullable().optional(),
      spend: zNum,
      link_clicks: zNum,
      last_day: z.string().nullable().optional(),
    }),
  ),
});

const zSiteRow = { visits: zNum, leads: zNum, bookings: zNum, sales: zNum, revenue: zNum };

const zOutcomes = z.object({
  totals: z.object(zSiteRow),
  days: z.array(z.object({ day: z.string(), visits: zNum })),
  campaigns: z.array(z.object({ campaign: z.string().nullable(), ...zSiteRow })),
});

const zBreakdown = z.object({
  ads: z.array(
    z.object({
      ad_id: z.string(),
      campaign_id: z.string(),
      ad_name: z.string().nullable().optional(),
      spend: zNum,
      link_clicks: zNum,
    }),
  ),
  site_ads: z.array(z.object({ campaign: z.string().nullable(), content: z.string(), ...zSiteRow })),
});

type SiteRow = { visits: number; leads: number; bookings: number; sales: number; revenue: number };

async function rpc<S extends z.ZodType>(name: string, args: Record<string, unknown>, schema: S): Promise<z.output<S>> {
  const { data, error } = await requireDb().rpc(name, args);
  if (error) throw dbError(`ads ${name}`, error);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw dbError(`ads ${name} shape`, { message: parsed.error.message });
  return parsed.data;
}

/** The first Toronto day any ad spent (all time). Null before the first delivery is synced. */
async function firstSpendDay(): Promise<string | null> {
  const { data, error } = await requireDb()
    .from("ad_insights_daily")
    .select("day")
    .eq("platform", PLATFORM)
    .gt("spend", 0)
    .order("day", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("ads first day", error);
  const day = (data as { day?: unknown } | null)?.day;
  return typeof day === "string" ? day.slice(0, 10) : null;
}

type SyncRunRow = { started_at: string; finished_at: string | null; status: string; error: string | null };

/**
 * The last pull that finished (a pull still running is not "the last sync").
 * Null until the first pull ever ran.
 */
async function lastSync(): Promise<AdsLastSync | null> {
  const { data, error } = await requireDb()
    .from("ad_sync_runs")
    .select("started_at,finished_at,status,error")
    .eq("platform", PLATFORM)
    .in("status", ["ok", "error"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("ads last sync", error);
  const run = data as SyncRunRow | null;
  if (!run) return null;
  const ok = run.status === "ok";
  return { at: instant(run.finished_at ?? run.started_at), ok, error: ok ? null : readableSyncError(run.error) };
}

/**
 * Campaign statuses saved by the Meta sync (ad_campaigns). Best effort: before
 * that table exists, or before a sync filled it, the map is empty and
 * `statusOf` falls back to delivery.
 */
async function campaignStatuses(ids: readonly string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await requireDb()
    .from("ad_campaigns")
    .select("campaign_id,status,effective_status")
    .eq("platform", PLATFORM)
    .in("campaign_id", [...ids]);
  if (error) {
    console.warn("[admin-api] ads campaign statuses unavailable", error.code ?? "", error.message ?? "");
    return map;
  }
  for (const row of (data ?? []) as { campaign_id: string; status: string | null; effective_status: string | null }[]) {
    const value = row.effective_status ?? row.status;
    if (value) map.set(row.campaign_id, value.toUpperCase());
  }
  return map;
}

/** Meta's status in the app's three words; without one, "delivered yesterday or today" reads as active. */
function statusOf(stored: string | undefined, lastDay: string | null | undefined, today: string): AdsCampaignStatus {
  switch (stored) {
    case "ACTIVE":
    case "IN_PROCESS":
    case "WITH_ISSUES":
      return "active";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
    case "ADSET_PAUSED":
      return "paused";
    case "ARCHIVED":
    case "DELETED":
      return "archived";
    default:
      return lastDay && lastDay.slice(0, 10) >= addDays(today, -1) ? "active" : "paused";
  }
}

/* ---------- matching Meta's campaigns and ads to the site's utm tags ---------- */

/** "Webline: Hamilton trades" and "webline-hamilton-trades" are the same tag. */
const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** A utm value names this campaign or ad by its id, its name, or its name as a slug. */
function tagMatches(tag: string | null, id: string, name: string | null | undefined): boolean {
  if (!tag) return false;
  const t = tag.trim();
  if (t === id) return true;
  const named = name ? slug(name) : "";
  return named !== "" && slug(t) === named;
}

const ZERO_SITE: SiteRow = { visits: 0, leads: 0, bookings: 0, sales: 0, revenue: 0 };
const addSite = (a: SiteRow, b: SiteRow): SiteRow => ({
  visits: a.visits + b.visits,
  leads: a.leads + b.leads,
  bookings: a.bookings + b.bookings,
  sales: a.sales + b.sales,
  revenue: a.revenue + b.revenue,
});

/* ---------- numbers ---------- */

/** numeric(12,2) dollars from Postgres to integer cents (two decimals survive the float). */
const cents = (dollars: number) => Math.round(dollars * 100);
const int = (n: number) => Math.round(n);
const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
/** Spend per outcome; null when there was no such outcome. */
const per = (spendCents: number, count: number, currency: string): Money | null =>
  count > 0 ? money(Math.round(spendCents / count), currency) : null;

/** Site revenue is in the shop's currency. */
const SITE_CURRENCY = "CAD";

function outcomes(site: SiteRow): Outcomes {
  return {
    visits: int(site.visits),
    leads: int(site.leads),
    booked: int(site.bookings),
    sales: int(site.sales),
    revenue: money(cents(site.revenue), SITE_CURRENCY),
  };
}

/* ---------- the report ---------- */

export async function getAdsReport(range: AdsRange, nowMs: number = Date.now()): Promise<AdsReport> {
  // No ad account id or token on the server: nothing to show, never zeros.
  if (!metaAdsConfig()) return { connected: false, range, lastSync: null };
  requireDb();

  const today = torontoToday(nowMs);
  const rangeStart = addDays(today, -(RANGE_DAYS[range] - 1));
  const [first, sync] = await Promise.all([firstSpendDay(), lastSync()]);
  // The days start where the range does, or on the first day any ad ran.
  const start = first && first > rangeStart ? (first > today ? today : first) : rangeStart;
  const from = torontoDayStart(start);
  const to = new Date(nowMs).toISOString();

  const [platform, site, breakdown] = await Promise.all([
    rpc("ads_platform_summary", { p_from: start, p_to: today, p_platform: PLATFORM }, zPlatformSummary),
    rpc("ads_outcomes", { p_from: from, p_to: to, p_tz: BUSINESS_TZ }, zOutcomes),
    rpc("ads_breakdown", { p_from_day: start, p_to_day: today, p_from: from, p_to: to, p_platform: PLATFORM }, zBreakdown),
  ]);

  const currency = (platform.totals.currency || "CAD").toUpperCase();
  const spend = cents(platform.totals.spend);
  const impressions = int(platform.totals.impressions);
  const linkClicks = int(platform.totals.link_clicks);

  // Campaigns that spent in the window, by spend.
  const spent = platform.campaigns
    .filter((c) => cents(c.spend) > 0)
    .sort((a, b) => cents(b.spend) - cents(a.spend) || a.campaign_id.localeCompare(b.campaign_id));
  const statuses = await campaignStatuses(spent.map((c) => c.campaign_id));
  const campaignName = new Map(spent.map((c) => [c.campaign_id, c.campaign_name ?? null]));

  // Site outcomes per campaign: each utm_campaign goes to the first campaign it names.
  const siteByCampaign = new Map<string, SiteRow>();
  for (const row of site.campaigns) {
    const hit = spent.find((c) => tagMatches(row.campaign, c.campaign_id, c.campaign_name));
    if (hit) siteByCampaign.set(hit.campaign_id, addSite(siteByCampaign.get(hit.campaign_id) ?? ZERO_SITE, row));
  }

  // Site outcomes per ad, through utm_content. Ads with the same name in two
  // campaigns are told apart by the row's utm_campaign; an ad id is always exact.
  const spentAds = breakdown.ads.filter((a) => cents(a.spend) > 0);
  const siteByAd = new Map<string, SiteRow>();
  for (const row of breakdown.site_ads) {
    const candidates = spentAds.filter((a) => tagMatches(row.content, a.ad_id, a.ad_name));
    if (candidates.length === 0) continue;
    const exact = candidates.find((a) => a.ad_id === row.content.trim());
    const sameCampaign = candidates.filter((a) => tagMatches(row.campaign, a.campaign_id, campaignName.get(a.campaign_id)));
    const pick = exact ?? sameCampaign[0] ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (pick) siteByAd.set(pick.ad_id, addSite(siteByAd.get(pick.ad_id) ?? ZERO_SITE, row));
  }

  const campaigns: AdsCampaign[] = spent.map((c) => {
    const s = siteByCampaign.get(c.campaign_id) ?? ZERO_SITE;
    const cSpend = cents(c.spend);
    return {
      id: c.campaign_id,
      name: c.campaign_name?.trim() || c.campaign_id,
      status: statusOf(statuses.get(c.campaign_id), c.last_day, today),
      spend: money(cSpend, currency),
      linkClicks: int(c.link_clicks),
      ...outcomes(s),
      costPerLead: per(cSpend, s.leads, currency),
      costPerSale: per(cSpend, s.sales, currency),
    };
  });

  const ads: AdsAd[] = spentAds
    .map((a): AdsAd => {
      const s = siteByAd.get(a.ad_id) ?? ZERO_SITE;
      const aSpend = cents(a.spend);
      return {
        id: a.ad_id,
        campaignId: a.campaign_id,
        name: a.ad_name?.trim() || a.ad_id,
        spend: money(aSpend, currency),
        linkClicks: int(a.link_clicks),
        ...outcomes(s),
        costPerLead: per(aSpend, s.leads, currency),
        costPerSale: per(aSpend, s.sales, currency),
      };
    })
    .sort((a, b) => b.spend.amount - a.spend.amount || a.id.localeCompare(b.id));

  // Every Toronto day of the window, oldest first; a day no ad ran is 0.
  const spendByDay = new Map(platform.days.map((d) => [d.day.slice(0, 10), cents(d.spend)]));
  const visitsByDay = new Map(site.days.map((d) => [d.day.slice(0, 10), int(d.visits)]));
  const days: AdsDay[] = [];
  for (let date = start; date <= today; date = addDays(date, 1)) {
    days.push({ date, spend: money(spendByDay.get(date) ?? 0, currency), visits: visitsByDay.get(date) ?? 0 });
  }

  const total = outcomes(site.totals);
  return {
    connected: true,
    range,
    lastSync: sync,
    totals: {
      spend: money(spend, currency),
      impressions,
      reach: int(platform.totals.reach),
      linkClicks,
      ctr: impressions > 0 ? round(linkClicks / impressions, 4) : 0,
      costPerLinkClick: per(spend, linkClicks, currency),
    },
    outcomes: { ...total, roas: spend > 0 ? round(total.revenue.amount / spend, 2) : null },
    cost: {
      perVisit: per(spend, total.visits, currency),
      perLead: per(spend, total.leads, currency),
      perBooked: per(spend, total.booked, currency),
      perSale: per(spend, total.sales, currency),
    },
    days,
    campaigns,
    ads,
  };
}

/** Meta campaign ids are long numbers. */
const CAMPAIGN_ID_RE = /^\d{1,32}$/;

/**
 * One campaign card and its ads for a range. A campaign Meta knows about but
 * that spent nothing in the range comes back with empty numbers; one that was
 * never synced is 404.
 */
export async function getAdsCampaign(id: string, range: AdsRange, nowMs: number = Date.now()): Promise<AdsCampaignDetail> {
  if (!CAMPAIGN_ID_RE.test(id)) throw notFound("That campaign");
  const report = await getAdsReport(range, nowMs);
  if (!report.connected) throw notConfigured();
  const campaign = report.campaigns.find((c) => c.id === id);
  if (campaign) return { range, lastSync: report.lastSync, campaign, ads: report.ads.filter((a) => a.campaignId === id) };

  const { data, error } = await requireDb()
    .from("ad_insights_daily")
    .select("campaign_name,day,currency")
    .eq("platform", PLATFORM)
    .eq("campaign_id", id)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("ads campaign", error);
  const row = data as { campaign_name: string | null; day: string; currency: string | null } | null;
  if (!row) throw notFound("That campaign");
  const statuses = await campaignStatuses([id]);
  const currency = (row.currency || "CAD").toUpperCase();
  return {
    range,
    lastSync: report.lastSync,
    campaign: {
      id,
      name: row.campaign_name?.trim() || id,
      status: statusOf(statuses.get(id), row.day, torontoToday(nowMs)),
      spend: money(0, currency),
      linkClicks: 0,
      ...outcomes(ZERO_SITE),
      costPerLead: null,
      costPerSale: null,
    },
    ads: [],
  };
}

/* ---------- refresh ---------- */

/**
 * "Refresh from Meta": the same pull as the nightly job and the web admin's
 * button (lib/meta-ads.ts syncMetaInsights). The pull records its run in
 * ad_sync_runs (the next GET /ads carries it as `lastSync`) and, when it fails,
 * bumps the owner's "Ads report not synced" inbox row (once a day at most, the
 * same row each time).
 */
export async function refreshAds(): Promise<{ rowsUpserted: number }> {
  if (!metaAdsConfig()) throw notConfigured();
  requireDb();
  const result = await syncMetaInsights({ trigger: "manual" });
  if (result.ok) return { rowsUpserted: result.rows };
  if (/^(Meta ads are not connected|Supabase is not configured)/.test(result.error)) throw notConfigured();
  // Meta answered; our own save failed. Not Meta's refusal, so not a 502.
  if (/^save failed/.test(result.error)) throw unavailable();
  throw upstream("upstream", META_REFUSED);
}

/* ---------- readable sync errors ---------- */

/**
 * The stored reason a pull failed, as a sentence for the Ads status line.
 * Meta's errors are stored as "Meta 400 (code 190): <message>".
 */
export function readableSyncError(raw: string | null): string {
  const text = (raw ?? "").trim();
  if (!text) return "The last pull from Meta failed.";
  const code = text.match(/\(code (\d+)\)/)?.[1];
  if (code === "190") return "Meta refused the pull: the access token expired or was revoked.";
  if (code && ["10", "200", "294"].includes(code)) return "Meta refused the pull: the token cannot read this ad account (it needs ads_read).";
  if (code && ["4", "17", "32", "613", "80000", "80004"].includes(code)) return "Meta refused the pull: too many requests. Try again later.";
  if (/^save failed/i.test(text)) return "Meta answered, but saving the rows failed.";
  if (/timeout|timed out|aborted/i.test(text)) return "Meta did not answer in time.";
  if (/fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN/i.test(text)) return "Could not reach Meta.";
  if (/^Meta ads are not connected/i.test(text)) return "Meta ads are not connected on the server.";
  const meta = text.match(/^Meta \d+(?: \(code \d+\))?: (.+)$/s)?.[1]?.trim();
  const reason = (meta ?? text).replace(/\s+/g, " ");
  const short = reason.length > 200 ? `${reason.slice(0, 197).trimEnd()}...` : reason;
  return meta ? `Meta refused the pull: ${short}` : short;
}
