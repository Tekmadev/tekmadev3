import { requireAdmin } from "@/lib/admin";
import { getDashboardData } from "@/lib/admin-data";
import { PageHeader, Panel, Notice } from "@/components/admin/ui";
import { AreaChart, Donut, HBars } from "@/components/admin/Charts";

export const dynamic = "force-dynamic";

export default async function Analytics() {
  await requireAdmin();
  const data = await getDashboardData();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Analytics" subtitle="First-party, cookieless traffic for the last 30 days" />

      {!data ? (
        <Notice kind="err">Connect the Supabase server env to load analytics.</Notice>
      ) : (
        <>
          <Panel title="Pageviews (last 30 days)">
            <AreaChart data={data.byDay} height={280} />
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
