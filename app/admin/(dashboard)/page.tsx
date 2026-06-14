import Link from "next/link";
import { UserRound, CalendarCheck, CreditCard, Eye, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { getDashboardData } from "@/lib/admin-data";
import { PageHeader, StatCard, Panel, DataTable, Notice, fmtDateTime, fmtMoney, txt } from "@/components/admin/ui";
import { AreaChart, Donut, HBars } from "@/components/admin/Charts";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireAdmin();
  const data = await getDashboardData();
  const { e } = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { dateStyle: "full" });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Overview" subtitle={today} />

      {e === "forbidden" && <Notice kind="err">That section is owner only.</Notice>}

      {!data ? (
        <Notice kind="err">
          Connect the Supabase server env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) to load data.
        </Notice>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total leads" value={data.counts.leads} icon={UserRound} />
            <StatCard label="Booked calls" value={data.counts.bookings} icon={CalendarCheck} />
            <StatCard label="Active subs" value={data.counts.activeSubs} icon={CreditCard} />
            <StatCard label="Pageviews 30d" value={data.counts.pageviews30} icon={Eye} />
            <StatCard
              label="Consent 30d"
              value={`${data.counts.consentGranted30} / ${data.counts.consentDenied30}`}
              sub={acceptRate(data.counts.consentGranted30, data.counts.consentDenied30)}
              icon={ShieldCheck}
            />
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
        </>
      )}
    </div>
  );
}

function acceptRate(granted: number, denied: number): string {
  const total = granted + denied;
  if (total === 0) return "no choices yet";
  return `${Math.round((granted / total) * 100)}% accept`;
}
