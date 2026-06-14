import { getSupabaseAdmin } from "@/lib/supabase";

export type Row = Record<string, unknown>;
export type Tally = { label: string; count: number };

export type DashboardData = {
  counts: {
    leads: number;
    bookings: number;
    activeSubs: number;
    pageviews30: number;
    consentGranted30: number;
    consentDenied30: number;
  };
  recentLeads: Row[];
  recentSubs: Row[];
  recentEvents: Row[];
  topSources: Tally[];
  topPages: Tally[];
  byDay: { day: string; count: number }[];
};

function tally(items: string[], limit = 10): Tally[] {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function byDayCounts(dates: string[]): { day: string; count: number }[] {
  const m = new Map<string, number>();
  for (const d of dates) {
    const day = d.slice(0, 10);
    m.set(day, (m.get(day) ?? 0) + 1);
  }
  return [...m.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => (a.day < b.day ? -1 : 1));
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

  const [leadsC, bookingsC, subsC, pvC, consentRows, recentLeads, recentSubs, recentEvents, eventsWindow] =
    await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "booked"),
      supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("events").select("*", { count: "exact", head: true }).gte("created_at", since30),
      supabase.from("consent_log").select("choice").gte("created_at", since30),
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
        .select("created_at,utm_source,path")
        .gte("created_at", since30)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

  const consent = (consentRows.data ?? []) as { choice: string }[];
  const ev = (eventsWindow.data ?? []) as { created_at: string; utm_source: string | null; path: string | null }[];

  return {
    counts: {
      leads: leadsC.count ?? 0,
      bookings: bookingsC.count ?? 0,
      activeSubs: subsC.count ?? 0,
      pageviews30: pvC.count ?? 0,
      consentGranted30: consent.filter((c) => c.choice === "granted").length,
      consentDenied30: consent.filter((c) => c.choice === "denied").length,
    },
    recentLeads: (recentLeads.data ?? []) as Row[],
    recentSubs: (recentSubs.data ?? []) as Row[],
    recentEvents: (recentEvents.data ?? []) as Row[],
    topSources: tally(ev.map((e) => e.utm_source || "(direct)")),
    topPages: tally(ev.map((e) => e.path || "(unknown)")),
    byDay: byDayCounts(ev.map((e) => e.created_at)),
  };
}
