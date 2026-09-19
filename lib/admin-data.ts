import { getSupabaseAdmin } from "@/lib/supabase";
import { getTrafficAnalytics } from "@/lib/analytics-data";

export type Row = Record<string, unknown>;
export type Tally = { label: string; count: number };
/**
 * One point on a traffic chart. `day` is the bucket's start in local time and
 * doubles as the key; `label` (axis) and `title` (tooltip) are set when the
 * bucket is not a plain day, e.g. "3 PM" or "Week of Sep 14".
 */
export type DayPoint = { day: string; count: number; label?: string; title?: string };

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
  topLinks: Tally[];
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
 * Reads everything the dashboard shows via the service-role client (server-only,
 * bypasses RLS). Traffic comes from the same database function the Analytics
 * page uses, so the two screens can never disagree. Returns null if env is absent.
 */
export async function getDashboardData(): Promise<DashboardData | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [leadsC, bookingsC, subsC, traffic, recentLeads, recentSubs, recentEvents, linkClicksWindow] =
    await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "booked"),
      supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active").eq("livemode", true),
      getTrafficAnalytics("30d"),
      supabase
        .from("leads")
        .select("created_at,name,email,status,booking_start,utm_source,utm_medium,utm_campaign")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("subscriptions")
        .select("created_at,email,tier,status,amount_total,currency,utm_source")
        .eq("livemode", true)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("events")
        .select("created_at,path,referrer,utm_source,country,device")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase.from("link_clicks").select("slug").gte("created_at", since30).limit(5000),
    ]);

  const lc = (linkClicksWindow.data ?? []) as { slug: string | null }[];

  return {
    counts: {
      leads: leadsC.count ?? 0,
      bookings: bookingsC.count ?? 0,
      activeSubs: subsC.count ?? 0,
      pageviews30: traffic?.total ?? 0,
    },
    recentLeads: (recentLeads.data ?? []) as Row[],
    recentSubs: (recentSubs.data ?? []) as Row[],
    recentEvents: (recentEvents.data ?? []) as Row[],
    topSources: traffic?.topSources ?? [],
    topPages: traffic?.topPages ?? [],
    topReferrers: traffic?.topReferrers ?? [],
    devices: traffic?.devices ?? [],
    countries: traffic?.countries ?? [],
    topLinks: tally(lc.map((c) => (c.slug ? `/${c.slug}` : "(unknown)"))),
    byDay: traffic?.series ?? [],
  };
}

/** Full leads list for the Leads page. */
export async function getLeads(limit = 200): Promise<Row[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("leads")
    .select("created_at,source,name,email,phone,status,booking_start,utm_source,utm_medium,utm_campaign,referrer")
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
    .eq("livemode", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Row[];
}
