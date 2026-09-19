import { getSupabaseAdmin } from "@/lib/supabase";
import type { DayPoint, Tally } from "@/lib/admin-data";

/**
 * Traffic numbers for the admin, for any time range.
 *
 * All the counting happens in Postgres (public.traffic_analytics). Pulling rows
 * into Node and counting them here is what this replaced: PostgREST caps a
 * response at 1000 rows, so anything longer than a quiet month would have been
 * counted from a sample without saying so. The function also owns the two rules
 * every screen must share: buckets are cut in the business timezone, and
 * development traffic (rows with no country) is not counted.
 */

export type Bucket = "hour" | "day" | "week" | "month";

export type AnalyticsRange = {
  key: string;
  /** On the picker. */
  label: string;
  /** In a sentence: "Pageviews, last 30 days". */
  phrase: string;
  /** Null bucket and count mean "all time": the bucket is picked from how far back the data goes. */
  bucket: Bucket | null;
  /** How many buckets, counting the current one. */
  count: number | null;
};

// Longer ranges use wider buckets on purpose. A year of daily points on a site
// this size is a row of spikes; twelve months is a trend you can read.
export const ANALYTICS_RANGES: AnalyticsRange[] = [
  { key: "24h", label: "24 hours", phrase: "last 24 hours", bucket: "hour", count: 24 },
  { key: "7d", label: "7 days", phrase: "last 7 days", bucket: "day", count: 7 },
  { key: "30d", label: "30 days", phrase: "last 30 days", bucket: "day", count: 30 },
  { key: "3m", label: "3 months", phrase: "last 3 months", bucket: "week", count: 13 },
  { key: "6m", label: "6 months", phrase: "last 6 months", bucket: "week", count: 26 },
  { key: "1y", label: "1 year", phrase: "last 12 months", bucket: "month", count: 12 },
  { key: "all", label: "All time", phrase: "all time", bucket: null, count: null },
];

export const DEFAULT_RANGE = "30d";

export function resolveRange(key: string | undefined | null): AnalyticsRange {
  return (
    ANALYTICS_RANGES.find((r) => r.key === key) ??
    (ANALYTICS_RANGES.find((r) => r.key === DEFAULT_RANGE) as AnalyticsRange)
  );
}

export type TrafficAnalytics = {
  range: AnalyticsRange;
  bucket: Bucket;
  total: number;
  /** Same-length window just before this one. Null for all time, which has no "before". */
  prevTotal: number | null;
  /**
   * Whole-number percent change against prevTotal. Null when there is no fair
   * comparison: all time, an empty previous window, or a previous window that
   * reaches back before tracking began (which would read as "up 700%").
   */
  change: number | null;
  /** Set when this window, or the one it is compared with, starts before the first recorded pageview. */
  trackingSince: string | null;
  /** Views per hour on the 24 hour view, per day on every other. One decimal. */
  average: { per: "hour" | "day"; value: number };
  peak: { label: string; count: number } | null;
  series: DayPoint[];
  topSources: Tally[];
  topPages: Tally[];
  topReferrers: Tally[];
  devices: Tally[];
  countries: Tally[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Axis label and tooltip text for one bucket. `t` is already local time
 * ("2026-09-19T15:00:00", cut in the business timezone by the database), so it
 * is read as plain text. Passing it through Date would shift it by the server's
 * own timezone, which on Vercel is UTC.
 */
function describe(t: string, bucket: Bucket): { label: string; title: string } {
  const year = t.slice(0, 4);
  const month = MONTHS[Number(t.slice(5, 7)) - 1] ?? "";
  const day = Number(t.slice(8, 10));
  if (bucket === "hour") {
    const h = Number(t.slice(11, 13));
    const clock = `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
    return { label: clock, title: `${month} ${day}, ${clock}` };
  }
  // The year in full: "Oct 25" would read as the 25th of October.
  if (bucket === "month") return { label: `${month} ${year}`, title: `${month} ${year}` };
  if (bucket === "week") return { label: `${month} ${day}`, title: `Week of ${month} ${day}` };
  return { label: `${month} ${day}`, title: `${month} ${day}, ${year}` };
}

/** Top entries, plus one "Other" slice so a donut's total is the true total. */
function withOther(items: Tally[], total: number, keep = 7): Tally[] {
  const top = items.slice(0, keep);
  const rest = total - top.reduce((s, t) => s + t.count, 0);
  return rest > 0 ? [...top, { label: "Other", count: rest }] : top;
}

/** When the first real pageview was recorded. Everything before it is not "zero traffic", it is "not measured". */
async function firstPageviewAt(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("events")
    .select("created_at")
    .eq("type", "pageview")
    .not("country", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.created_at ? String(data.created_at) : null;
}

/** All time has no fixed length, so its bucket follows how far back the data goes. */
function bucketForAllTime(first: string | null): Bucket {
  if (!first) return "day";
  const days = (Date.now() - new Date(first).getTime()) / 86_400_000;
  if (days <= 2) return "hour";
  if (days <= 60) return "day";
  if (days <= 420) return "week";
  return "month";
}

type Raw = {
  bucket: Bucket;
  from: string;
  to: string;
  total: number;
  prev_total: number | null;
  series: { t: string; n: number }[];
  sources: Tally[];
  pages: Tally[];
  referrers: Tally[];
  devices: Tally[];
  countries: Tally[];
};

export async function getTrafficAnalytics(rangeKey?: string | null): Promise<TrafficAnalytics | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const range = resolveRange(rangeKey);
  const first = await firstPageviewAt();
  const bucket = range.bucket ?? bucketForAllTime(first);

  const { data, error } = await supabase.rpc("traffic_analytics", {
    p_bucket: bucket,
    p_count: range.count,
  });
  if (error || !data) {
    console.error("[analytics] traffic_analytics failed", error?.message);
    return null;
  }
  const raw = data as Raw;

  const series: DayPoint[] = raw.series.map((p) => ({ day: p.t, count: p.n, ...describe(p.t, bucket) }));

  const top = series.reduce<DayPoint | null>((best, p) => (p.count > (best?.count ?? 0) ? p : best), null);

  const fromMs = new Date(raw.from).getTime();
  const toMs = new Date(raw.to).getTime();
  const firstMs = first ? new Date(first).getTime() : null;
  // Average over the time we were measuring, not over months before the first
  // pageview existed, or a year's view would understate a three month old site.
  const hours = Math.max((toMs - Math.max(fromMs, firstMs ?? fromMs)) / 3_600_000, 1);
  const average =
    bucket === "hour"
      ? { per: "hour" as const, value: Math.round((raw.total / hours) * 10) / 10 }
      : { per: "day" as const, value: Math.round((raw.total / (hours / 24)) * 10) / 10 };

  // Only compare against a window we were actually measuring for the whole of.
  const prevFromMs = fromMs - (toMs - fromMs);
  const measuredPrev = firstMs !== null && firstMs <= prevFromMs;
  const prevTotal = measuredPrev ? raw.prev_total : null;
  const change = prevTotal ? Math.round(((raw.total - prevTotal) / prevTotal) * 100) : null;
  const trackingSince = range.count !== null && first && !measuredPrev ? first : null;

  return {
    range,
    bucket,
    total: raw.total,
    prevTotal,
    change,
    trackingSince,
    average,
    peak: top ? { label: top.title ?? top.day, count: top.count } : null,
    series,
    topSources: withOther(raw.sources, raw.total),
    topPages: raw.pages,
    topReferrers: raw.referrers,
    devices: withOther(raw.devices, raw.total),
    countries: raw.countries,
  };
}
