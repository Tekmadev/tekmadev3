import Link from "next/link";
import { CircleDollarSign, Eye, MousePointerClick, ShoppingBag, UserRound, Users, CalendarCheck } from "lucide-react";
import { requireOwner } from "@/lib/admin";
import { ADS_RANGES, DEFAULT_ADS_RANGE, getAdsDashboard, type AdsDashboard } from "@/lib/ads-data";
import { PageHeader, Panel, Notice, StatCard, DataTable, fmtDateTime } from "@/components/admin/ui";
import { AreaChart, type DayPoint } from "@/components/admin/Charts";
import { cn } from "@/lib/cn";
import { RefreshButton } from "@/components/admin/PendingButton";
import { refreshMetaAdsAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Ads: what Meta says we spent, beside what our own site says we got.
 *
 * The two never share a number. Meta's column is its report; the site's column
 * is our first-party record for visitors who arrived with the campaign's utm
 * tags. Cost per lead and cost per sale divide the first by the second.
 */

const money = (n: number | null | undefined, currency = "CAD", digits = 2) =>
  n == null
    ? "-"
    : new Intl.NumberFormat("en-CA", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits === 0 ? 0 : 2 }).format(n);
const int = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toLocaleString("en-US"));
const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(2)}%` : "-");

function longDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function spendSeries(d: AdsDashboard): DayPoint[] {
  // Same day axis as the site chart (gap filled), so the two line up and a quiet day reads as zero.
  const spend = new Map(d.platform.days.map((x) => [x.day, Number(x.spend)]));
  return d.site.days.map((x) => {
    const v = spend.get(x.day) ?? 0;
    return { day: x.day, count: v, title: `${longDay(x.day)}, ${money(v)}` };
  });
}

function visitSeries(d: AdsDashboard): DayPoint[] {
  return d.site.days.map((x) => ({ day: x.day, count: x.visits, title: `${longDay(x.day)}, ${x.visits} visits, ${x.leads} leads` }));
}

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; synced?: string; e?: string }>;
}) {
  await requireOwner();
  const { range: rangeKey, synced, e } = await searchParams;
  const data = await getAdsDashboard(rangeKey);
  const range = data?.range ?? ADS_RANGES.find((r) => r.key === DEFAULT_ADS_RANGE)!;
  const currency = data?.platform.totals.currency ?? "CAD";
  const spend = Number(data?.platform.totals.spend ?? 0);
  const t = data?.platform.totals;
  const s = data?.site.totals;

  // Site outcomes by campaign, keyed by the utm_campaign the ad carried.
  const siteByCampaign = new Map((data?.site.campaigns ?? []).map((c) => [c.campaign ?? "", c]));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Ads" subtitle={`Meta spend beside what the site recorded, ${range.phrase}`} />

      <div className="-mt-3 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Time range" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
          {ADS_RANGES.map((r) => (
            <Link
              key={r.key}
              href={r.key === DEFAULT_ADS_RANGE ? "/admin/ads" : `/admin/ads?range=${r.key}`}
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
        {data?.connected && (
          <form action={refreshMetaAdsAction} className="flex items-center gap-3">
            <input type="hidden" name="range" value={range.key === DEFAULT_ADS_RANGE ? "" : range.key} />
            {data.lastSync && (
              <span className="text-xs text-ink-4">
                {data.lastSync.status === "error" ? "Last sync failed" : `Synced ${fmtDateTime(data.lastSync.finished_at ?? data.lastSync.started_at)}`}
              </span>
            )}
            <RefreshButton>Refresh from Meta</RefreshButton>
          </form>
        )}
      </div>

      {synced && <Notice kind="ok">Pulled {synced} ad-day rows from Meta.</Notice>}
      {e === "sync" && <Notice kind="err">Meta refused the pull. The bell has the reason; an expired token is the usual cause.</Notice>}

      {!data ? (
        <Notice kind="err">Could not load the Ads dashboard. Check the Supabase server env.</Notice>
      ) : (
        <>
          {!data.connected && (
            <Panel title="Connect Meta to see spend">
              <p className="text-sm text-ink-2">
                The site half of this page already works: visitors who arrive from an ad with the campaign&apos;s utm tags are
                counted below. To put Meta&apos;s spend beside them, add two variables in Vercel and redeploy:
              </p>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-3">
                <li>
                  <code className="text-ink">META_AD_ACCOUNT_ID</code>: the number after <code>act_</code> in Ads Manager&apos;s
                  address bar.
                </li>
                <li>
                  <code className="text-ink">META_ADS_ACCESS_TOKEN</code>: in Business Settings, Users, System users, pick the
                  system user, Add assets, give it the ad account with View performance, then Generate token with the{" "}
                  <code>ads_read</code> permission. The Conversions API token does not work here: it can send events, not read
                  reports.
                </li>
                <li>
                  <code className="text-ink">CRON_SECRET</code>: any long random string, so the nightly pull runs.
                </li>
              </ol>
            </Panel>
          )}

          {data.lastSync?.status === "error" && data.connected && (
            <Notice kind="err">Last pull from Meta failed: {data.lastSync.error}</Notice>
          )}

          <section>
            <p className="mb-3 text-xs uppercase tracking-wide text-ink-4">What Meta reports</p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Spend" value={money(spend, currency)} icon={CircleDollarSign} sub={t?.last_day ? `to ${longDay(t.last_day)}` : undefined} />
              <StatCard label="Impressions" value={int(t?.impressions)} icon={Eye} sub={t ? `reach ${int(t.reach)}` : undefined} />
              <StatCard
                label="Link clicks"
                value={int(t?.link_clicks)}
                icon={MousePointerClick}
                sub={t ? `CTR ${pct(Number(t.link_clicks), Number(t.impressions))}` : undefined}
              />
              <StatCard
                label="Cost per link click"
                value={t && Number(t.link_clicks) > 0 ? money(spend / Number(t.link_clicks), currency) : "-"}
                icon={CircleDollarSign}
                sub={t ? `${int(t.conversations)} conversations, ${int(t.leads)} leads, ${int(t.purchases)} purchases (Meta count)` : undefined}
              />
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs uppercase tracking-wide text-ink-4">What the site recorded from those ads</p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Visits" value={int(s?.visits)} icon={Users} sub={data.cost.perVisit != null ? `${money(data.cost.perVisit, currency)} each` : `${int(s?.pageviews)} pageviews`} />
              <StatCard label="Leads" value={int(s?.leads)} icon={UserRound} sub={data.cost.perLead != null ? `${money(data.cost.perLead, currency)} per lead` : `${int(s?.subscribers)} newsletter sign-ups`} />
              <StatCard label="Booked calls" value={int(s?.bookings)} icon={CalendarCheck} sub={data.cost.perBooking != null ? `${money(data.cost.perBooking, currency)} per booking` : undefined} />
              <StatCard
                label="Sales"
                value={int(s?.sales)}
                icon={ShoppingBag}
                sub={
                  s && s.sales > 0
                    ? `${money(Number(s.revenue), "CAD", 0)} revenue${data.cost.roas != null ? `, ${data.cost.roas.toFixed(1)}x return on spend` : ""}`
                    : data.cost.perSale == null && spend > 0
                      ? "No sale yet from ads"
                      : undefined
                }
              />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title={`Spend per day, ${range.phrase}`}>
              <AreaChart data={spendSeries(data)} height={240} />
            </Panel>
            <Panel title={`Visits from ads per day, ${range.phrase}`}>
              <AreaChart data={visitSeries(data)} height={240} />
            </Panel>
          </section>

          <Panel title="Campaigns">
            <DataTable
              head={["Campaign", "Spend", "Link clicks", "Visits", "Leads", "Booked", "Sales", "Revenue", "Cost / lead", "Cost / sale"]}
              empty={
                data.connected
                  ? "No campaign has spent in this range. Press Refresh from Meta after the first day of delivery."
                  : "Campaigns appear here once Meta is connected."
              }
              rows={data.platform.campaigns.map((c) => {
                // Meta's campaign name is what the ad's utm_campaign should carry; match on it,
                // then on the slug form, so a campaign named "Webline launch" still finds "webline-launch".
                const name = c.campaign_name ?? "";
                const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                const site = siteByCampaign.get(name) ?? siteByCampaign.get(slug) ?? siteByCampaign.get(name.toLowerCase());
                const cSpend = Number(c.spend);
                return [
                  <span key="n" className="text-ink" title={`${c.objective ?? ""} · ${longDay(c.first_day)} to ${longDay(c.last_day)}`}>
                    {name || c.campaign_id}
                  </span>,
                  money(cSpend, currency),
                  int(c.link_clicks),
                  int(site?.visits ?? 0),
                  int(site?.leads ?? 0),
                  int(site?.bookings ?? 0),
                  int(site?.sales ?? 0),
                  site && site.sales > 0 ? money(Number(site.revenue), "CAD", 0) : "-",
                  site && site.leads > 0 ? money(cSpend / site.leads, currency) : "-",
                  site && site.sales > 0 ? money(cSpend / site.sales, currency) : "-",
                ];
              })}
            />
            {data.site.campaigns.some((c) => !data.platform.campaigns.some((p) => (p.campaign_name ?? "") === (c.campaign ?? ""))) && (
              <div className="mt-5">
                <p className="mb-2 text-xs uppercase tracking-wide text-ink-4">Site visits tagged as paid Meta, by utm_campaign</p>
                <DataTable
                  head={["utm_campaign", "Visits", "Leads", "Booked", "Sales", "Revenue"]}
                  empty=""
                  rows={data.site.campaigns.map((c) => [
                    <span key="c" className="text-ink">{c.campaign ?? "(no campaign tag)"}</span>,
                    int(c.visits),
                    int(c.leads),
                    int(c.bookings),
                    int(c.sales),
                    c.sales > 0 ? money(Number(c.revenue), "CAD", 0) : "-",
                  ])}
                />
              </div>
            )}
          </Panel>

          {data.platform.ads.length > 0 && (
            <Panel title="Ads, by spend">
              <DataTable
                head={["Ad", "Ad set", "Spend", "Impressions", "Link clicks", "CTR", "Conversations", "Leads", "Purchases"]}
                empty=""
                rows={data.platform.ads.map((a) => [
                  <span key="a" className="text-ink" title={a.campaign_name ?? ""}>{a.ad_name ?? a.ad_id}</span>,
                  a.adset_name ?? "-",
                  money(Number(a.spend), currency),
                  int(a.impressions),
                  int(a.link_clicks),
                  pct(Number(a.link_clicks), Number(a.impressions)),
                  int(a.conversations),
                  int(a.leads),
                  int(a.purchases),
                ])}
              />
              <p className="mt-3 text-xs text-ink-4">Conversations, leads and purchases in this table are Meta&apos;s own counts.</p>
            </Panel>
          )}

          <p className="text-xs leading-relaxed text-ink-4">
            How to read this. Meta counts a lead or purchase only when the visitor accepted the cookie banner, so its results
            run low. The site counts every visitor who arrived with{" "}
            <code>utm_source=meta&amp;utm_medium=paid</code> on the link, so keep those on every ad. A lead is counted on the day
            it was recorded, by its own tags, even if the click came earlier. Meta reports in the ad account&apos;s time zone;
            set it to Toronto so the days line up. Test-mode orders never count.
          </p>
        </>
      )}
    </div>
  );
}
