import Link from "next/link";
import { Eye, Gauge, TrendingUp } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { ANALYTICS_RANGES, DEFAULT_RANGE, getTrafficAnalytics, resolveRange } from "@/lib/analytics-data";
import { PageHeader, Panel, Notice, StatCard, fmtDate } from "@/components/admin/ui";
import { AreaChart, Donut, HBars } from "@/components/admin/Charts";
import { InternalDeviceNote } from "@/components/admin/InternalDevice";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const BUCKET_NOUN = { hour: "hour", day: "day", week: "week", month: "month" } as const;

export default async function Analytics({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdmin();
  const { range: rangeKey } = await searchParams;
  const range = resolveRange(rangeKey);
  const data = await getTrafficAnalytics(range.key);

  // A comparison is only shown when the period before was fully measured.
  // Otherwise say when measuring began, so an empty stretch is not read as a dead one.
  let trend: string | undefined;
  if (data?.change != null) {
    trend = `${data.change >= 0 ? "Up" : "Down"} ${Math.abs(data.change)}% on the period before (${data.prevTotal?.toLocaleString("en-US")})`;
  } else if (data?.trackingSince) {
    trend = `Tracking started ${fmtDate(data.trackingSince)}`;
  } else if (data?.prevTotal === 0 && data.total > 0) {
    trend = "Nothing in the period before";
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Analytics" subtitle={`First-party, cookieless traffic, ${range.phrase}`} />

      {/* The range lives in the URL, so a view can be bookmarked or shared and the back button works. */}
      <nav aria-label="Time range" className="-mx-1 -mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {ANALYTICS_RANGES.map((r) => (
          <Link
            key={r.key}
            href={r.key === DEFAULT_RANGE ? "/admin/analytics" : `/admin/analytics?range=${r.key}`}
            aria-current={r.key === range.key ? "page" : undefined}
            className={cn(
              "shrink-0 snap-start rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              r.key === range.key ? "border-gold bg-gold/15 text-gold-deep" : "border-line-strong text-ink-3 hover:text-ink",
            )}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <InternalDeviceNote />

      {!data ? (
        <Notice kind="err">Connect the Supabase server env to load analytics.</Notice>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Pageviews" value={data.total} sub={trend} icon={Eye} />
            <StatCard label={`Average per ${data.average.per}`} value={data.average.value} icon={Gauge} />
            <StatCard
              label={`Busiest ${BUCKET_NOUN[data.bucket]}`}
              value={data.peak ? data.peak.count : 0}
              sub={data.peak?.label}
              icon={TrendingUp}
            />
          </section>

          <Panel title={`Pageviews by ${BUCKET_NOUN[data.bucket]}, ${range.phrase}`}>
            <AreaChart data={data.series} height={280} />
          </Panel>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Traffic sources">
              <Donut data={data.topSources} label="views" />
            </Panel>
            <Panel title="Devices">
              <Donut data={data.devices} label="views" />
            </Panel>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Top pages">
              <HBars items={data.topPages} />
            </Panel>
            <Panel title="Top countries">
              <HBars items={data.countries} />
            </Panel>
          </section>

          <Panel title="Referrers">
            <HBars items={data.topReferrers} />
          </Panel>
        </>
      )}
    </div>
  );
}
