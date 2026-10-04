import Link from "next/link";
import { UserRound, CalendarCheck, CreditCard, Eye } from "lucide-react";
import { adminCan, requireAdmin } from "@/lib/admin";
import { getDashboardData } from "@/lib/admin-data";
import { PageHeader, StatCard, Panel, DataTable, Notice, fmtDateTime, fmtMoney, txt } from "@/components/admin/ui";
import { AreaChart, Donut, HBars } from "@/components/admin/Charts";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  // Not requireAdminCapability: a refused page lands here, so this one must never redirect to itself.
  const ctx = await requireAdmin();
  const { e } = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { dateStyle: "full" });
  if (!adminCan(ctx, "overview.view")) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Overview" subtitle={today} />
        {e === "forbidden" && <Notice kind="err">Your role cannot do that.</Notice>}
        <Notice kind="err">Your role has no overview. Pick a page from the menu.</Notice>
      </div>
    );
  }
  // Revenue, active subscriptions and recent subscriptions: never for staff.
  const revenue = adminCan(ctx, "overview.revenue");
  const data = await getDashboardData();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Overview" subtitle={today} />

      {e === "forbidden" && <Notice kind="err">Your role cannot do that.</Notice>}

      {!data ? (
        <Notice kind="err">
          Connect the Supabase server env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) to load data.
        </Notice>
      ) : (
        <>
          <section className={"grid grid-cols-2 gap-4 " + (revenue ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
            <StatCard label="Total leads" value={data.counts.leads} icon={UserRound} />
            <StatCard label="Booked calls" value={data.counts.bookings} icon={CalendarCheck} />
            {revenue && <StatCard label="Active subs" value={data.counts.activeSubs} icon={CreditCard} />}
            <StatCard label="Pageviews 30d" value={data.counts.pageviews30} icon={Eye} />
          </section>

          <Panel title="Pageviews (last 30 days)">
            <AreaChart data={data.byDay} />
          </Panel>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Traffic sources (30d)">
              <Donut data={data.topSources} label="views" />
            </Panel>
            <Panel title="Top pages (30d)">
              <HBars items={data.topPages} />
            </Panel>
          </section>

          {data.topLinks.length > 0 && (
            <Panel title="Top tracking links (30d)">
              <HBars items={data.topLinks} />
            </Panel>
          )}

          <Panel
            title="Recent leads"
            action={
              <Link href="/admin/leads" className="text-xs text-ink-3 transition-colors hover:text-ink">
                View all
              </Link>
            }
          >
            <DataTable
              head={["When", "Name", "Email", "Status", "Source", "Campaign"]}
              rows={data.recentLeads.slice(0, 8).map((r) => [
                fmtDateTime(r.created_at),
                txt(r.name),
                txt(r.email),
                txt(r.status),
                txt(r.utm_source),
                txt(r.utm_campaign),
              ])}
              empty="No bookings yet. They appear here once the Cal.com webhook is connected."
            />
          </Panel>

          {revenue && (
            <Panel
              title="Recent subscriptions"
              action={
                <Link href="/admin/subscriptions" className="text-xs text-ink-3 transition-colors hover:text-ink">
                  View all
                </Link>
              }
            >
              <DataTable
                head={["When", "Email", "Tier", "Status", "Amount", "Source"]}
                rows={data.recentSubs.slice(0, 8).map((r) => [
                  fmtDateTime(r.created_at),
                  txt(r.email),
                  txt(r.tier),
                  txt(r.status),
                  fmtMoney(r.amount_total, r.currency),
                  txt(r.utm_source),
                ])}
                empty="No subscriptions yet. They appear here once the Stripe webhook is connected."
              />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
