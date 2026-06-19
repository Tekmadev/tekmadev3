import { getSupabaseAdmin } from "@/lib/supabase";

export type Row = Record<string, unknown>;
export type Tally = { label: string; count: number };
export type DayPoint = { day: string; count: number };

export type DashboardData = {
  counts: {
    leads: number;
    bookings: number;
    activeSubs: number;
    pageviews30: number;
  };
  recentLeads: Row[];
  recentSubs: Row[];
  recentEvents: Row[];
  topSources: Tally[];
  topPages: Tally[];
  topReferrers: Tally[];
  devices: Tally[];
  countries: Tally[];
  byDay: DayPoint[];
};

function tally(items: string[], limit = 10): Tally[] {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Counts events per day across the trailing `days` window, filling empty days
 * with zero so charts render a continuous line instead of skipping gaps.
 */
function byDayCounts(dates: string[], days = 30): DayPoint[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const day = d.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const out: DayPoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

/**
 * Reads everything the dashboard shows via the service-role client (server-only,
 * bypasses RLS). Counts use head queries; aggregations run in JS over a bounded
 * recent window, which is fine at this scale. Returns null if env is absent.
 */
export async function getDashboardData(): Promise<DashboardData | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [leadsC, bookingsC, subsC, pvC, recentLeads, recentSubs, recentEvents, eventsWindow] =
    await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "booked"),
      supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("events").select("*", { count: "exact", head: true }).gte("created_at", since30),
      supabase
        .from("leads")
        .select("created_at,name,email,status,booking_start,utm_source,utm_medium,utm_campaign")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("subscriptions")
        .select("created_at,email,tier,status,amount_total,currency,utm_source")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("events")
        .select("created_at,path,referrer,utm_source,country,device")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("events")
        .select("created_at,utm_source,path,referrer,country,device")
        .gte("created_at", since30)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

  const ev = (eventsWindow.data ?? []) as {
    created_at: string;
    utm_source: string | null;
    path: string | null;
    referrer: string | null;
    country: string | null;
    device: string | null;
  }[];

  return {
    counts: {
      leads: leadsC.count ?? 0,
      bookings: bookingsC.count ?? 0,
      activeSubs: subsC.count ?? 0,
      pageviews30: pvC.count ?? 0,
    },
    recentLeads: (recentLeads.data ?? []) as Row[],
    recentSubs: (recentSubs.data ?? []) as Row[],
    recentEvents: (recentEvents.data ?? []) as Row[],
    topSources: tally(ev.map((e) => e.utm_source || "(direct)")),
    topPages: tally(ev.map((e) => e.path || "(unknown)")),
    topReferrers: tally(ev.map((e) => referrerHost(e.referrer))),
    devices: tally(ev.map((e) => e.device || "unknown")),
    countries: tally(ev.map((e) => e.country || "unknown")),
    byDay: byDayCounts(ev.map((e) => e.created_at)),
  };
}

function referrerHost(ref: string | null): string {
  if (!ref) return "(direct)";
  try {
    return new URL(ref).hostname.replace(/^www\./, "");
  } catch {
    return ref;
  }
}

/** Full leads list for the Leads page. */
export async function getLeads(limit = 200): Promise<Row[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("leads")
    .select("created_at,name,email,phone,status,booking_start,utm_source,utm_medium,utm_campaign,referrer")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Row[];
}

/** Full subscriptions list for the Subscriptions page. */
export async function getSubscriptions(limit = 200): Promise<Row[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("subscriptions")
    .select("created_at,email,tier,status,amount_total,currency,stripe_customer_id,utm_source,utm_campaign")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Row[];
}
