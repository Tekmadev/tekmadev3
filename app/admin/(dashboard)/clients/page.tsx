import Link from "next/link";
import { Building2, Hammer, Lock, Rocket, Settings2, UserPlus } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { CLIENT_STATUS_LABEL, listClients, type ClientStatus } from "@/lib/clients-data";
import {
  derivedStage,
  guaranteeSummary,
  isTaskOpen,
  listActiveOnboardings,
  listBookedCallsForClients,
  listTasksForOnboardings,
  stageLabel,
} from "@/lib/onboarding-data";
import { offerName } from "@/config/products";
import { PageHeader, StatCard, Panel, Notice } from "@/components/admin/ui";
import { Badge, btnPrimary, btnSecondary, fmtDate, type Tone } from "@/components/portal/ui";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<ClientStatus, Tone> = {
  lead: "muted",
  pending: "neutral",
  onboarding: "gold",
  live: "ok",
  paused: "warn",
  churned: "muted",
};

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Active" },
  { key: "lead", label: "Leads" },
  { key: "onboarding", label: "Onboarding" },
  { key: "live", label: "Live" },
  { key: "pending", label: "Pending" },
  { key: "paused", label: "Paused" },
  { key: "churned", label: "Churned" },
  { key: "all", label: "All" },
];

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ status?: string; deleted?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const filter = params.status ?? "";

  const all = await listClients();
  const clients = all.filter((c) => {
    if (filter === "all") return true;
    if (filter === "") return c.status !== "churned" && c.status !== "lead";
    return c.status === filter;
  });

  const onboardings = await listActiveOnboardings();
  const tasks = await listTasksForOnboardings(onboardings.map((o) => o.id));
  const guaranteeClients = all.filter((c) => c.guarantee_eligible && c.guarantee_status === "running");
  const calls = await listBookedCallsForClients(guaranteeClients.map((c) => c.id));

  const rows = clients.map((c) => {
    const ob = onboardings.find((o) => o.client_id === c.id) ?? null;
    const t = ob ? tasks.filter((x) => x.onboarding_id === ob.id) : [];
    const stage = ob ? derivedStage(ob, t) : null;
    const clientOpen = t.filter((x) => x.owner === "client" && isTaskOpen(x)).length;
    const ourOpen = t.filter((x) => x.owner === "tekmadev" && isTaskOpen(x)).length;
    const g = guaranteeSummary(c, calls.filter((x) => x.client_id === c.id));
    return { c, ob, stage, clientOpen, ourOpen, g, daysToLive: daysUntil(ob?.target_live_date ?? null) };
  });

  const counts = {
    leads: all.filter((c) => c.status === "lead").length,
    onboarding: all.filter((c) => c.status === "onboarding" || c.status === "pending").length,
    live: all.filter((c) => c.status === "live").length,
    blocked: onboardings.filter((o) => o.blocked).length,
    behind: rows.filter((r) => r.g.eligible && r.g.startedAt && !r.g.onTrack && r.c.guarantee_status === "running").length,
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Clients" subtitle={`${all.length} accounts`}>
        <Link href="/admin/clients/templates" className={btnSecondary}>
          <Settings2 className="h-4 w-4" />
          Checklist templates
        </Link>
        <Link href="/admin/clients/new" className={btnPrimary}>
          Add client
        </Link>
      </PageHeader>

      {params.deleted === "1" && <Notice kind="ok">Client moved to trash.</Notice>}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Leads" value={counts.leads} icon={UserPlus} sub="signed up, not paid" />
        <StatCard label="Onboarding" value={counts.onboarding} icon={Hammer} />
        <StatCard label="Live" value={counts.live} icon={Rocket} />
        <StatCard label="Blocked" value={counts.blocked} icon={Lock} sub="waiting on something" />
        <StatCard label="Behind pace" value={counts.behind} icon={Building2} sub="guarantee running" />
      </section>

      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/admin/clients?status=${f.key}` : "/admin/clients"}
            className={cn(
              "shrink-0 snap-start rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              filter === f.key ? "border-gold bg-gold/15 text-gold-deep" : "border-line-strong text-ink-3 hover:text-ink",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Panel title="Accounts">
        {rows.length === 0 ? (
          <p className="text-sm text-ink-4">No clients here yet. Paid checkouts create them automatically, or add one by hand.</p>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="flex flex-col divide-y divide-line md:hidden">
              {rows.map(({ c, ob, stage, clientOpen, ourOpen, g, daysToLive }) => (
                <li key={c.id} className="py-3">
                  <Link href={`/admin/clients/${c.id}`} className="block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{c.business_name}</p>
                        <p className="truncate text-xs text-ink-4">
                          {offerName(c.plan_id) ?? c.plan_id ?? "No plan"} · {c.primary_email}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONE[c.status]}>{CLIENT_STATUS_LABEL[c.status]}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                      {stage && <span>Stage: {stageLabel(stage)}</span>}
                      {ob?.blocked && <Badge tone="signal">Blocked</Badge>}
                      {clientOpen > 0 && <span>{clientOpen} on client</span>}
                      {ourOpen > 0 && <span>{ourOpen} on us</span>}
                      {daysToLive != null && ob && <span>{daysToLive >= 0 ? `${daysToLive}d to live` : `${-daysToLive}d late`}</span>}
                      {g.eligible && g.startedAt && (
                        <span>
                          {g.counted}/{g.target} calls, {g.daysLeft}d left
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-4">
                    <th className="py-2 pr-4 font-medium">Client</th>
                    <th className="py-2 pr-4 font-medium">Plan</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Stage</th>
                    <th className="py-2 pr-4 font-medium">Open</th>
                    <th className="py-2 pr-4 font-medium">Go-live</th>
                    <th className="py-2 pr-4 font-medium">Guarantee</th>
                    <th className="py-2 pr-4 font-medium">Strategist</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ c, ob, stage, clientOpen, ourOpen, g, daysToLive }) => (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-4">
                        <Link href={`/admin/clients/${c.id}`} className="font-medium text-ink hover:text-gold">
                          {c.business_name}
                        </Link>
                        <p className="text-xs text-ink-4">{c.primary_email}</p>
                      </td>
                      <td className="py-2.5 pr-4 text-ink-2">{offerName(c.plan_id) ?? c.plan_id ?? "-"}</td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={STATUS_TONE[c.status]}>{CLIENT_STATUS_LABEL[c.status]}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-ink-2">
                        {stage ? stageLabel(stage) : "-"}
                        {ob?.blocked && (
                          <span className="ml-2">
                            <Badge tone="signal">Blocked</Badge>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-ink-2">
                        {ob ? (
                          <span>
                            <span className={clientOpen ? "text-gold-deep" : ""}>{clientOpen} client</span> · {ourOpen} us
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-ink-2">
                        {c.live_at ? fmtDate(c.live_at) : ob?.target_live_date ? (
                          <span className={daysToLive != null && daysToLive < 0 ? "text-signal" : ""}>
                            {fmtDate(ob.target_live_date)} ({daysToLive}d)
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        {g.eligible ? (
                          g.startedAt ? (
                            <span className="inline-flex items-center gap-2 text-ink-2">
                              {g.counted}/{g.target} · {g.daysLeft}d
                              <Badge tone={g.status === "met" ? "ok" : g.onTrack ? "ok" : "warn"}>{g.status === "met" ? "Met" : g.onTrack ? "On pace" : "Behind"}</Badge>
                            </span>
                          ) : (
                            <span className="text-ink-4">Not started</span>
                          )
                        ) : (
                          <span className="text-ink-4">n/a</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-ink-2">{c.assigned_strategist ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
