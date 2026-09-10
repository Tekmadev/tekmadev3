import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText, Rocket } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { CLIENT_STATUS_LABEL, getClientById, getLatestSubscriptionForClient, listActivity, listMembers } from "@/lib/clients-data";
import {
  derivedStage,
  getActiveOnboarding,
  getLatestIntake,
  listAccessGrants,
  listAgreements,
  listApprovals,
  listAssets,
  listBookedCalls,
  listTasks,
  signedAssetUrl,
  stageLabel,
  taskProgress,
} from "@/lib/onboarding-data";
import { getTierMeta } from "@/config/pricing";
import { portalUrl } from "@/lib/portal-host";
import { PageHeader, Panel, Notice, StatCard, fmtMoney } from "@/components/admin/ui";
import { Badge, btnSecondary, fmtBytes, fmtDate, fmtDateTime, humanize, type Tone } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { AccountForm } from "@/components/admin/clients/AccountForm";
import { OnboardingPanel } from "@/components/admin/clients/OnboardingPanel";
import { IntakePanel } from "@/components/admin/clients/IntakePanel";
import { AccessPanel } from "@/components/admin/clients/AccessPanel";
import { ApprovalsPanel } from "@/components/admin/clients/ApprovalsPanel";
import { CallsPanel } from "@/components/admin/clients/CallsPanel";
import { TeamPanel } from "@/components/admin/clients/TeamPanel";
import { ActivityPanel } from "@/components/admin/clients/ActivityPanel";
import { deleteClientAction, goLiveAction } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, Tone> = { pending: "neutral", onboarding: "gold", live: "ok", paused: "warn", churned: "muted" };

const SECTIONS = [
  ["onboarding", "Onboarding"],
  ["intake", "Intake"],
  ["access", "Access"],
  ["files", "Files"],
  ["approvals", "Approvals"],
  ["agreements", "Agreements"],
  ["calls", "Calls"],
  ["team", "Team"],
  ["account", "Account"],
  ["activity", "Activity"],
] as const;

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; saved?: string; live?: string; invite?: string; e?: string; invited?: string }>;
}) {
  const ctx = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const client = await getClientById(id);
  if (!client || client.deleted_at) notFound();

  const onboarding = await getActiveOnboarding(client.id);
  const [tasks, intake, grants, assets, approvals, agreements, calls, members, activity, subscription] = await Promise.all([
    onboarding ? listTasks(onboarding.id) : Promise.resolve([]),
    getLatestIntake(client.id),
    listAccessGrants(client.id),
    listAssets(client.id),
    listApprovals(client.id),
    listAgreements(client.id),
    listBookedCalls(client.id),
    listMembers(client.id),
    listActivity(client.id, { visibility: "all", limit: 100 }),
    getLatestSubscriptionForClient(client),
  ]);
  const assetsWithUrls = await Promise.all(assets.map(async (a) => ({ ...a, url: await signedAssetUrl(a.storage_path, 60 * 30) })));

  const progress = taskProgress(tasks);
  const stage = onboarding ? derivedStage(onboarding, tasks) : null;
  const tier = client.plan_id ? getTierMeta(client.plan_id) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={client.business_name}
        subtitle={`${tier?.name ?? client.plan_id ?? "No plan"} · ${client.primary_email}${client.primary_phone ? ` · ${client.primary_phone}` : ""}`}
      >
        <Badge tone={STATUS_TONE[client.status] ?? "neutral"}>{CLIENT_STATUS_LABEL[client.status]}</Badge>
        {onboarding?.blocked && <Badge tone="signal">Blocked</Badge>}
        {client.status !== "live" && (
          <form action={goLiveAction}>
            <input type="hidden" name="client_id" value={client.id} />
            <SubmitButton pendingLabel="Switching on">
              <Rocket className="h-4 w-4" />
              Go live
            </SubmitButton>
          </form>
        )}
        <a href={portalUrl("/")} target="_blank" rel="noopener" className={btnSecondary}>
          Portal
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </PageHeader>

      {sp.created === "1" && <Notice kind="ok">Client created{sp.invite === "failed" ? ", but the invite email failed. Use Resend invite under Team." : " and invited."}</Notice>}
      {sp.saved === "1" && <Notice kind="ok">Saved.</Notice>}
      {sp.live === "1" && <Notice kind="ok">Live. {client.guarantee_eligible ? "Guarantee clock started." : ""}</Notice>}
      {sp.invited === "1" && <Notice kind="ok">Invite sent.</Notice>}
      {sp.e === "invite" && <Notice kind="err">Invite email failed. Check the Supabase auth email settings.</Notice>}
      {sp.e === "email" && <Notice kind="err">Enter a valid email.</Notice>}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Stage" value={stage ? stageLabel(stage) : client.status === "live" ? "Live" : "-"} sub={onboarding?.target_live_date ? `target ${fmtDate(onboarding.target_live_date)}` : undefined} />
        <StatCard label="Checklist" value={`${progress.done}/${progress.total}`} sub={`${progress.clientOpen.length} waiting on client`} />
        <StatCard label="Booked calls" value={calls.filter((c) => c.qualified).length} sub={client.guarantee_eligible ? `target ${client.guarantee_target}` : "no guarantee"} />
        <StatCard
          label="Billing"
          value={subscription ? humanize(subscription.status) : "-"}
          sub={subscription ? `${fmtMoney(subscription.amount_total, subscription.currency)} · ${subscription.current_period_end ? fmtDate(subscription.current_period_end) : ""}` : "no subscription"}
        />
      </section>

      <nav className="sticky top-0 z-20 -mx-5 flex snap-x gap-2 overflow-x-auto border-b border-line bg-bg/90 px-5 py-2 backdrop-blur sm:-mx-8 sm:px-8">
        {SECTIONS.map(([key, label]) => (
          <a key={key} href={`#${key}`} className="shrink-0 snap-start rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-3 hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <Panel title="Onboarding">
        <div id="onboarding" className="scroll-mt-28">
          {onboarding ? (
            <OnboardingPanel onboarding={onboarding} tasks={tasks} stage={stage ?? onboarding.stage} percent={progress.percent} />
          ) : (
            <p className="text-sm text-ink-4">No active onboarding run.</p>
          )}
        </div>
      </Panel>

      <Panel title="Intake">
        <div id="intake" className="scroll-mt-28">
          <IntakePanel intake={intake} clientId={client.id} />
        </div>
      </Panel>

      <Panel title="Access">
        <div id="access" className="scroll-mt-28">
          <AccessPanel grants={grants} clientId={client.id} />
        </div>
      </Panel>

      <Panel title={`Files (${assets.length})`}>
        <div id="files" className="scroll-mt-28">
          {assetsWithUrls.length === 0 ? (
            <p className="text-sm text-ink-4">Nothing uploaded yet.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {assetsWithUrls.map((a) => (
                <li key={a.id} className="overflow-hidden rounded-xl border border-line bg-bg-2">
                  <a href={a.url ?? "#"} target="_blank" rel="noopener" className="block aspect-square bg-bg-3">
                    {(a.mime_type || "").startsWith("image/") && a.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.file_name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-ink-4">
                        <FileText className="h-6 w-6" />
                      </div>
                    )}
                  </a>
                  <div className="p-2">
                    <p className="truncate text-xs text-ink" title={a.file_name}>
                      {a.file_name}
                    </p>
                    <p className="text-[11px] text-ink-4">
                      {humanize(a.kind)} · {fmtBytes(a.size_bytes)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel title="Approvals">
        <div id="approvals" className="scroll-mt-28">
          <ApprovalsPanel approvals={approvals} tasks={tasks} clientId={client.id} />
        </div>
      </Panel>

      <Panel title="Agreements">
        <div id="agreements" className="scroll-mt-28">
          {agreements.length === 0 ? (
            <p className="text-sm text-ink-4">No agreements.</p>
          ) : (
            <ul className="divide-y divide-line">
              {agreements.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {a.title} <span className="text-xs font-normal text-ink-4">v{a.version}</span>
                    </p>
                    <p className="text-xs text-ink-4">
                      {a.signed_at ? `Accepted ${fmtDateTime(a.signed_at)} by ${a.signer_name} (${a.signer_email})` : `Sent ${fmtDateTime(a.sent_at)}`}
                      {a.content_hash ? ` · hash ${a.content_hash.slice(0, 12)}` : ""}
                    </p>
                  </div>
                  <Badge tone={a.status === "signed" ? "ok" : a.status === "sent" || a.status === "viewed" ? "gold" : "muted"}>{a.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel title="Booked calls">
        <div id="calls" className="scroll-mt-28">
          <CallsPanel client={client} calls={calls} />
        </div>
      </Panel>

      <Panel title="Team">
        <div id="team" className="scroll-mt-28">
          <TeamPanel members={members} clientId={client.id} />
        </div>
      </Panel>

      <Panel title="Account">
        <div id="account" className="scroll-mt-28">
          <AccountForm client={client} />
        </div>
      </Panel>

      <Panel title="Activity">
        <div id="activity" className="scroll-mt-28">
          <ActivityPanel activity={activity} clientId={client.id} />
        </div>
      </Panel>

      {ctx.role === "owner" && (
        <form action={deleteClientAction} className="flex items-center justify-between rounded-2xl border border-signal/30 p-5">
          <input type="hidden" name="client_id" value={client.id} />
          <p className="text-sm text-ink-3">Move this client to trash. Data is kept; the portal stops working for them.</p>
          <SubmitButton variant="secondary" pendingLabel="Removing">
            Move to trash
          </SubmitButton>
        </form>
      )}

      <p className="text-xs text-ink-4">
        <Link href="/admin/clients" className="hover:text-ink">
          Back to clients
        </Link>
        {" · "}created {fmtDateTime(client.created_at)}
        {client.created_by ? ` by ${client.created_by}` : ""}
        {" · "}id <span className="font-mono">{client.id}</span>
      </p>
    </div>
  );
}
