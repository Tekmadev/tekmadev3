import Link from "next/link";
import { UserRound, CalendarCheck, CreditCard, Eye } from "lucide-react";
import { adminCan, requireAdmin, type AdminContext } from "@/lib/admin";
import { getDashboardData } from "@/lib/admin-data";
import { canCountFollowUps, countMyDueFollowUps, loadProblem } from "@/lib/leads-web";
import { DEFAULT_LEAD_LIST_PARAMS, leadListHref } from "@/lib/leads-ui";
import { PageHeader, StatCard, Panel, DataTable, Notice, fmtDateTime, fmtMoney, txt } from "@/components/admin/ui";
import { btnPrimary, btnSecondary } from "@/components/portal/ui";
import { RetryNotice } from "@/components/admin/leads/RetryNotice";
import { AreaChart, Donut, HBars } from "@/components/admin/Charts";

export const dynamic = "force-dynamic";

type FollowUpCount = { ok: true; overdue: number; today: number } | { ok: false; message: string };

/** The count is per person, so the button opens "Show only mine": /admin/leads?view=due&who=mine. */
const MY_FOLLOW_UPS_HREF = leadListHref({ ...DEFAULT_LEAD_LIST_PARAMS, view: "due", everyone: false });

/**
 * My follow-ups due today or earlier: the same database count as My activity
 * and GET /me/activity. A failed count is an error with a Retry, never a 0.
 */
function loadFollowUpCount(ctx: AdminContext): Promise<FollowUpCount> {
  return Promise.resolve()
    .then(() => countMyDueFollowUps(ctx))
    .then(
      (c): FollowUpCount => ({ ok: true, overdue: c.overdue, today: c.today }),
      (err): FollowUpCount => ({ ok: false, message: loadProblem(err, "follow-up count") }),
    );
}

function FollowUpsPanel({ count, canCreate }: { count: FollowUpCount; canCreate: boolean }) {
  return (
    <Panel title="Follow-ups">
      <p className="-mt-1 mb-4 text-sm text-ink-3">Leads assigned to you, due today or earlier.</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {count.ok ? (
          <p className="text-base text-ink-2">
            {count.overdue === 0 && count.today === 0 ? (
              "None due"
            ) : (
              <>
                {count.overdue > 0 && <span className="font-semibold text-signal">{count.overdue} overdue</span>}
                {count.overdue > 0 && count.today > 0 && " · "}
                {count.today > 0 && <span className="font-semibold text-gold-deep">{count.today} today</span>}
              </>
            )}
          </p>
        ) : (
          <div className="min-w-0 flex-1">
            <RetryNotice compact message={count.message} />
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link href={MY_FOLLOW_UPS_HREF} className={`${btnPrimary} w-full sm:w-auto`}>
            Open follow-ups
          </Link>
          {canCreate && (
            <Link href="/admin/leads/new" className={`${btnSecondary} w-full sm:w-auto`}>
              Add lead
            </Link>
          )}
        </div>
      </div>
    </Panel>
  );
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  // Not requireAdminCapability: a refused page lands here, so this one must never redirect to itself.
  const ctx = await requireAdmin();
  const { e } = await searchParams;
  // Toronto's date, not the server's: Vercel runs in UTC, so after 8 PM Toronto it showed tomorrow.
  const today = new Date().toLocaleDateString("en-CA", { dateStyle: "full", timeZone: "America/Toronto" });
  // Started now, so it loads alongside the dashboard data. The same check as the count itself (activity.own and leads.view).
  const followUps = canCountFollowUps(ctx) ? loadFollowUpCount(ctx) : null;
  const canCreateLead = adminCan(ctx, "leads.create");
  if (!adminCan(ctx, "overview.view")) {
    const count = followUps ? await followUps : null;
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Overview" subtitle={today} />
        {e === "forbidden" && <Notice kind="err">Your role cannot do that.</Notice>}
        {count && <FollowUpsPanel count={count} canCreate={canCreateLead} />}
        <Notice kind="err">Your role has no overview. Pick a page from the menu.</Notice>
      </div>
    );
  }
  // Revenue, active subscriptions and recent subscriptions: never for staff.
  const revenue = adminCan(ctx, "overview.revenue");
  const [data, count] = await Promise.all([getDashboardData(), followUps]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Overview" subtitle={today} />

      {e === "forbidden" && <Notice kind="err">Your role cannot do that.</Notice>}

      {count && <FollowUpsPanel count={count} canCreate={canCreateLead} />}

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
