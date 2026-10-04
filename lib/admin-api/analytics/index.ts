import { z } from "zod";
import { dbError, requireDb } from "@/lib/admin-api";
import {
  BUSINESS_TZ,
  MONTH_LONG,
  MONTH_SHORT,
  WEEKDAY_LONG,
  addDays,
  parseDate,
  torontoDateOf,
  torontoToday,
  weekdayOf,
} from "./calendar";

/**
 * GET /analytics?range= for the admin app (docs/api-requests/analytics.md in
 * the app repo, schema src/api/schemas/analytics.ts).
 *
 * The counting is the website's: public.traffic_analytics() cuts buckets in
 * Toronto time, drops development traffic (no country) and returns the series,
 * the window before it and the top lists in one call. This module only reads it
 * the way the app's contract asks: month buckets for "all", full source,
 * device and country lists that add up to the total, readable labels, and the
 * comparison only when the window before was fully tracked (the same rule as
 * the web admin's Analytics page, lib/analytics-data.ts).
 */

export const ANALYTICS_RANGES = ["24h", "7d", "30d", "3m", "6m", "1y", "all"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = "30d";

export type AnalyticsBucket = "hour" | "day" | "week" | "month";

/** 24h: hour, 7d and 30d: day, 3m and 6m: week (Monday start), 1y and all: month. `count` null is "since tracking started". */
const RANGES: Record<AnalyticsRange, { bucket: AnalyticsBucket; count: number | null }> = {
  "24h": { bucket: "hour", count: 24 },
  "7d": { bucket: "day", count: 7 },
  "30d": { bucket: "day", count: 30 },
  "3m": { bucket: "week", count: 13 },
  "6m": { bucket: "week", count: 26 },
  "1y": { bucket: "month", count: 12 },
  all: { bucket: "month", count: null },
};

/** `?range=`: missing or empty is 30 days; anything else unknown is 400 `range`. */
export const analyticsQuery = z.object({
  range: z.preprocess(
    (v) => (v === undefined || v === "" ? DEFAULT_ANALYTICS_RANGE : v),
    z.enum(ANALYTICS_RANGES, "Unknown range. Use 24h, 7d, 30d, 3m, 6m, 1y or all."),
  ),
});

export type LabelCount = { label: string; count: number };
export type CountryCount = LabelCount & { code?: string; flag?: string };
export type AnalyticsPoint = { t: string; count: number; label: string; title: string };

export type Analytics = {
  range: AnalyticsRange;
  bucket: AnalyticsBucket;
  total: number;
  prevTotal: number | null;
  change: number | null;
  average: number;
  averagePer: "hour" | "day";
  peak: { label: string; count: number } | null;
  trackingSince: string | null;
  series: AnalyticsPoint[];
  topSources: LabelCount[];
  devices: LabelCount[];
  topPages: LabelCount[];
  countries: CountryCount[];
  topReferrers: LabelCount[];
};

/* ---------- reading public.traffic_analytics() ---------- */

const zCount = z.coerce.number().transform((n) => (Number.isFinite(n) ? Math.round(n) : 0));
const zTally = z.object({ label: z.string().nullable(), count: zCount });

const zTraffic = z.object({
  from: z.string(),
  to: z.string(),
  prev_total: zCount.nullable(),
  series: z.array(z.object({ t: z.string(), n: zCount })),
  sources: z.array(zTally),
  pages: z.array(zTally),
  referrers: z.array(zTally),
  devices: z.array(zTally),
  countries: z.array(zTally),
});
type Traffic = z.infer<typeof zTraffic>;

/**
 * Enough rows that the source, device and country lists are complete (they
 * must add up to the total). Pages and referrers are cut to 10 here.
 */
const LIST_LIMIT = 500;
const TOP_PAGES = 10;
const TOP_REFERRERS = 10;

/** The first real pageview (development rows have no country). Null when nothing was ever tracked. */
async function firstPageviewAt(): Promise<string | null> {
  const { data, error } = await requireDb()
    .from("events")
    .select("created_at")
    .eq("type", "pageview")
    .not("country", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("analytics first pageview", error);
  const at = (data as { created_at?: unknown } | null)?.created_at;
  return typeof at === "string" ? at : null;
}

async function readTraffic(bucket: AnalyticsBucket, count: number | null): Promise<Traffic> {
  const { data, error } = await requireDb().rpc("traffic_analytics", {
    p_bucket: bucket,
    p_count: count,
    p_tz: BUSINESS_TZ,
    p_limit: LIST_LIMIT,
  });
  if (error) throw dbError("analytics traffic_analytics", error);
  const parsed = zTraffic.safeParse(data);
  if (!parsed.success) throw dbError("analytics traffic_analytics shape", { message: parsed.error.message });
  return parsed.data;
}

/* ---------- labels ---------- */

const clock = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`;

/** "Sep 7", with the year when it is not the current one. */
function shortDay(date: string, currentYear: number): string {
  const d = parseDate(date);
  const base = `${MONTH_SHORT[d.month - 1]} ${d.day}`;
  return d.year === currentYear ? base : `${base}, ${d.year}`;
}

/**
 * A database bucket ("2026-09-30T14:00:00", Toronto wall time, no offset) as a
 * chart point. The text is read as text, never through Date.
 */
function point(raw: string, count: number, bucket: AnalyticsBucket, currentYear: number): AnalyticsPoint {
  const date = raw.slice(0, 10);
  const d = parseDate(date);
  const month = MONTH_SHORT[d.month - 1];
  if (bucket === "hour") {
    const hour = Number(raw.slice(11, 13)) || 0;
    const weekday = WEEKDAY_LONG[weekdayOf(date)].slice(0, 3);
    return { t: `${date}T${String(hour).padStart(2, "0")}:00:00`, count, label: clock(hour), title: `${weekday}, ${month} ${d.day}, ${clock(hour)}` };
  }
  if (bucket === "day") {
    const year = d.year === currentYear ? "" : `, ${d.year}`;
    return { t: date, count, label: `${month} ${d.day}`, title: `${WEEKDAY_LONG[weekdayOf(date)]}, ${MONTH_LONG[d.month - 1]} ${d.day}${year}` };
  }
  if (bucket === "week") {
    return {
      t: date,
      count,
      label: `Week of ${shortDay(date, currentYear)}`,
      title: `${shortDay(date, currentYear)} to ${shortDay(addDays(date, 6), currentYear)}`,
    };
  }
  return { t: date, count, label: `${month} ${d.year}`, title: `${MONTH_LONG[d.month - 1]} ${d.year}` };
}

/** The database folds referrers into lowercase source names; the app shows names. */
const SOURCE_LABELS: ReadonlyMap<string, string> = new Map([
  ["(direct)", "Direct"],
  ["direct", "Direct"],
  ["google", "Google"],
  ["bing", "Bing"],
  ["duckduckgo", "DuckDuckGo"],
  ["chatgpt.com", "ChatGPT"],
  ["chatgpt", "ChatGPT"],
  ["perplexity", "Perplexity"],
  ["gemini", "Gemini"],
  ["facebook", "Facebook"],
  ["fb", "Facebook"],
  ["instagram", "Instagram"],
  ["ig", "Instagram"],
  ["linkedin", "LinkedIn"],
  ["x", "X"],
  ["twitter", "X"],
  ["youtube", "YouTube"],
  ["reddit", "Reddit"],
  ["tiktok", "TikTok"],
  ["yelp", "Yelp"],
  ["meta", "Meta"],
  ["newsletter", "Newsletter"],
  ["email", "Email"],
]);

const DEVICE_LABELS: ReadonlyMap<string, string> = new Map([
  ["mobile", "Mobile"],
  ["desktop", "Desktop"],
  ["tablet", "Tablet"],
  ["unknown", "Unknown"],
]);

const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

function country(raw: string | null): { label: string; code?: string } {
  const code = (raw ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) {
    let name: string | undefined;
    try {
      name = regionNames.of(code);
    } catch {
      name = undefined;
    }
    if (name) return { label: name, code };
  }
  return { label: "Unknown" };
}

/** Highest first; ties by label so the order is stable. */
const byCount = <T extends LabelCount>(a: T, b: T) => b.count - a.count || a.label.localeCompare(b.label);

/** Rows relabelled and merged (two raw values can share a label), zero rows left out. */
function relabel<T extends LabelCount>(rows: readonly { label: string | null; count: number }[], map: (label: string | null) => T): T[] {
  const merged = new Map<string, T>();
  for (const row of rows) {
    if (row.count <= 0) continue;
    const next = map(row.label);
    const key = `${next.label}\u0000${"code" in next ? String((next as CountryCount).code ?? "") : ""}`;
    const prev = merged.get(key);
    if (prev) prev.count += row.count;
    else merged.set(key, { ...next, count: row.count });
  }
  return [...merged.values()].sort(byCount);
}

/** A list that must add up to the total gets the rest as one more row (only when the database list was cut short). */
function complete<T extends LabelCount>(rows: T[], total: number, rest: T): T[] {
  const sum = rows.reduce((a, r) => a + r.count, 0);
  if (total <= sum) return rows;
  const missing = total - sum;
  const same = rows.find((r) => r.label === rest.label && (r as CountryCount).code === (rest as CountryCount).code);
  if (same) same.count += missing;
  else rows.push({ ...rest, count: missing });
  return rows.sort(byCount);
}

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/* ---------- the response ---------- */

export async function getAnalytics(range: AnalyticsRange, nowMs: number = Date.now()): Promise<Analytics> {
  const { bucket, count } = RANGES[range];
  const [first, traffic] = await Promise.all([firstPageviewAt(), readTraffic(bucket, count)]);

  const currentYear = parseDate(torontoToday(nowMs)).year;
  const series = traffic.series.map((p) => point(p.t, p.n, bucket, currentYear));
  const total = series.reduce((a, p) => a + p.count, 0);
  const averagePer = bucket === "hour" ? "hour" : "day";

  // Nothing ever tracked: the chart keeps its empty buckets, every list is empty.
  if (first === null) {
    return {
      range,
      bucket,
      total,
      prevTotal: null,
      change: null,
      average: 0,
      averagePer,
      peak: null,
      trackingSince: null,
      series,
      topSources: [],
      devices: [],
      topPages: [],
      countries: [],
      topReferrers: [],
    };
  }

  const fromMs = Date.parse(traffic.from);
  const toMs = Date.parse(traffic.to);
  const firstMs = Date.parse(first);

  // Only compare against a window that was measured for the whole of it.
  const prevFromMs = fromMs - (toMs - fromMs);
  const prevTotal = count !== null && firstMs <= prevFromMs ? traffic.prev_total : null;
  const change = prevTotal ? round((total - prevTotal) / prevTotal, 4) : null;

  // Averaged over the time actually measured; today counts as the part of it gone by.
  const hours = Math.max((toMs - Math.max(fromMs, firstMs)) / 3_600_000, 1);
  const average = averagePer === "hour" ? round(total / hours, 1) : round(total / Math.max(hours / 24, 1), 1);

  let peak: AnalyticsPoint | null = null;
  for (const p of series) if (p.count > 0 && (!peak || p.count >= peak.count)) peak = p;

  const topSources = complete(
    relabel(traffic.sources, (label) => ({ label: SOURCE_LABELS.get(label ?? "") ?? (label || "Direct"), count: 0 })),
    total,
    { label: "Other", count: 0 },
  );
  const devices = complete(
    relabel(traffic.devices, (label) => ({ label: DEVICE_LABELS.get(label ?? "") ?? (label || "Unknown"), count: 0 })),
    total,
    { label: "Unknown", count: 0 },
  );
  const countries = complete(
    relabel<CountryCount>(traffic.countries, (label) => ({ ...country(label), count: 0 })),
    total,
    { label: "Unknown", count: 0 },
  );
  const topPages = relabel(traffic.pages, (label) => ({ label: label || "(unknown)", count: 0 })).slice(0, TOP_PAGES);
  const topReferrers = relabel(
    traffic.referrers.filter((r) => r.label !== null && r.label !== "(direct)"),
    (label) => ({ label: label ?? "", count: 0 }),
  ).slice(0, TOP_REFERRERS);

  return {
    range,
    bucket,
    total,
    prevTotal,
    change,
    average,
    averagePer,
    peak: peak ? { label: peak.label, count: peak.count } : null,
    trackingSince: torontoDateOf(first),
    series,
    topSources,
    devices,
    topPages,
    countries,
    topReferrers,
  };
}
