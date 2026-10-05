import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText, Rocket } from "lucide-react";
import { adminCan, requireAdminCapability, type Capability } from "@/lib/admin";
import { hiddenActivityPrefixes } from "@/lib/admin-api/clients/sections/activity";
import { CLIENT_STATUS_LABEL, getClientById, getLatestSubscriptionForClient, listActivity, listMembers, subscriptionEndsAt } from "@/lib/clients-data";
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
import { offerName } from "@/config/products";
import { getLatestOrderForClient, paymentMethodLabel } from "@/lib/orders-data";
import { portalUrl } from "@/lib/portal-host";
import { PageHeader, Panel, Notice, StatCard, fmtMoney } from "@/components/admin/ui";
import { getProductMeta } from "@/config/products";
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
import { CrmLocationPanel } from "@/components/admin/clients/CrmLocationPanel";
import { getCrmLocationForClient } from "@/lib/crm/admin-data";
import { CreditPanel, type PanelCredit, type PanelPerson } from "@/components/admin/clients/CreditPanel";
import { StaffDataNotReady, defaultCredits, readClientCredits, teamMembers, type CreditInput, type CreditRow } from "@/lib/staff-credit";
import { getCommissionSplit } from "@/lib/site-settings";
import { leadCreditPeople } from "@/lib/staff-admin";
import { CREDITS_NOT_READY } from "@/lib/admin-api/staff";
import { DemoRequestsCard } from "@/components/admin/demos/DemoRequestsCard";
import { deleteClientAction, goLiveAction } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, Tone> = { lead: "muted", pending: "neutral", onboarding: "gold", live: "ok", paused: "warn", churned: "muted" };

const SECTIONS = [
  ["onboarding", "Onboarding"],
  ["intake", "Intake"],
  ["access", "Access"],
  ["files", "Files"],
  ["approvals", "Approvals"],
  ["agreements", "Agreements"],
  ["calls", "Calls"],
  ["demos", "Demos"],
  ["crm", "CRM"],
  ["credit", "Credit"],
  ["team", "Team"],
  ["account", "Account"],
  ["activity", "Activity"],
] as const;

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; saved?: string; live?: string; invite?: string; e?: string; invited?: string; reused?: string }>;
}) {
  const ctx = await requireAdminCapability("clients.view");
  const can = (capability: Capability) => adminCan(ctx, capability);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const client = await getClientById(id);
  // A test account is not there for a role without test data, exactly as in the admin API.
  if (!client || client.deleted_at || (client.is_test && !can("testdata.view"))) notFound();

  // Billing (amounts, subscription, order) only with clients.billing: never for staff.
  const seesBilling = can("clients.billing");
  // Which CRM sub-account decides what counts toward a guarantee: clients.crm.
  const seesCrm = can("clients.crm");
  const onboarding = await getActiveOnboarding(client.id);
  const crmLocation = seesCrm ? await getCrmLocationForClient(client.id) : null;
  const [tasks, intake, grants, assets, approvals, agreements, calls, members, activity, subscription, order] = await Promise.all([
    onboarding ? listTasks(onboarding.id) : Promise.resolve([]),
    getLatestIntake(client.id),
    listAccessGrants(client.id),
    listAssets(client.id),
    listApprovals(client.id),
    listAgreements(client.id),
    listBookedCalls(client.id),
    listMembers(client.id),
    listActivity(client.id, { visibility: "all", limit: 100 }),
    seesBilling ? getLatestSubscriptionForClient(client) : Promise.resolve(null),
    seesBilling ? getLatestOrderForClient(client) : Promise.resolve(null),
  ]);
  // The same entries the admin API leaves out for this role (billing and care plan amounts, CRM plumbing).
  const hidden = hiddenActivityPrefixes({ can });
  const visibleActivity = activity.filter((a) => !hidden.some((prefix) => a.event.startsWith(prefix)));
  const assetsWithUrls = await Promise.all(assets.map(async (a) => ({ ...a, url: await signedAssetUrl(a.storage_path, 60 * 30) })));

  // Commission credit: every row with clients.credits.view, else only your own (activity.own).
  const seesAllCredit = can("clients.credits.view");
  const seesCredit = seesAllCredit || can("activity.own");
  const editsCredit = can("clients.credits.edit");
  const credit = seesCredit ? await loadCredit(client.id, client.lead_id, { all: seesAllCredit, viewer: ctx.email, edits: editsCredit }) : null;

  const progress = taskProgress(tasks);
  const planEnds = subscriptionEndsAt(subscription);
  const stage = onboarding ? derivedStage(onboarding, tasks) : null;
  const planName = offerName(client.plan_id);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={client.business_name}
        subtitle={`${planName ?? client.plan_id ?? "No plan"} · ${client.primary_email}${client.primary_phone ? ` · ${client.primary_phone}` : ""}`}
      >
        <Badge tone={STATUS_TONE[client.status] ?? "neutral"}>{CLIENT_STATUS_LABEL[client.status]}</Badge>
        {onboarding?.blocked && <Badge tone="signal">Blocked</Badge>}
        {client.status !== "live" && can("clients.go_live") && (
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

      {sp.created === "1" && (
        <Notice kind="ok">
          {sp.reused === "1" ? "That email is already this client." : "Client created"}
          {sp.invite === "failed"
            ? `${sp.reused === "1" ? " The" : ", but the"} invite email failed. Use Resend invite under Team.`
            : sp.invite === "sent"
              ? `${sp.reused === "1" ? " Invite sent." : " and invited."}`
              : sp.reused === "1"
                ? ""
                : "."}
        </Notice>
      )}
      {sp.saved === "1" && <Notice kind="ok">Saved.</Notice>}
      {sp.live === "1" && <Notice kind="ok">Live. {client.guarantee_eligible ? "Guarantee clock started." : ""}</Notice>}
      {sp.invited === "1" && <Notice kind="ok">Invite sent.</Notice>}
      {sp.e === "invite" && <Notice kind="err">Invite email failed. Check the Supabase auth email settings.</Notice>}
      {sp.e === "email" && <Notice kind="err">Enter a valid email.</Notice>}
      {sp.e?.startsWith("crm_") && (
        <Notice kind="err">
          {{
            crm_location: "That does not look like a sub-account location id. It is letters and numbers only, copied from the CRM.",
            crm_calendar: "One of the calendar ids does not look right. Paste only the ids, separated by commas or new lines.",
            crm_taken: "That sub-account is already mapped to another client, or it is our own. Unlink it there first.",
            crm_own: "That is Tekmadev's own sub-account. Its appointments are our sales calls and never count for a client.",
            crm_db: "The CRM account could not be saved. Try again.",
          }[sp.e] ?? "The CRM account could not be saved."}
        </Notice>
      )}
      {sp.e === "care" && can("clients.go_live") && (
        <Notice kind="err">
          <span className="block">
            Not switched on: this client has not set up {getProductMeta(client.plan_id)?.care?.name ?? "their care plan"} yet. It is
            the first step in their portal checklist. Go live only once it shows as set up, or override for a comped or invoiced site.
          </span>
          <form action={goLiveAction} className="mt-3">
            <input type="hidden" name="client_id" value={client.id} />
            <input type="hidden" name="override" value="1" />
            <SubmitButton variant="secondary" pendingLabel="Switching on">
              Go live without a care plan
            </SubmitButton>
          </form>
        </Notice>
      )}

      <section className={"grid grid-cols-2 gap-4 " + (seesBilling ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <StatCard label="Stage" value={stage ? stageLabel(stage) : client.status === "live" ? "Live" : "-"} sub={onboarding?.target_live_date ? `target ${fmtDate(onboarding.target_live_date)}` : undefined} />
        <StatCard label="Checklist" value={`${progress.done}/${progress.total}`} sub={`${progress.clientOpen.length} waiting on client`} />
        <StatCard label="Booked calls" value={calls.filter((c) => c.qualified).length} sub={client.guarantee_eligible ? `target ${client.guarantee_target}` : "no guarantee"} />
        {seesBilling && (
          <StatCard
            label="Billing"
            value={subscription ? (planEnds ? "Ending" : humanize(subscription.status)) : order ? humanize(order.status) : "-"}
            sub={
              subscription
                ? `${fmtMoney(subscription.amount_total, subscription.currency)} · ${planEnds ? `ends ${fmtDate(planEnds)}` : subscription.current_period_end ? fmtDate(subscription.current_period_end) : ""}`
                : order
                  ? `${fmtMoney(order.amount_total, order.currency)} one-time · ${paymentMethodLabel(order.payment_method_type)}`
                  : "no billing record"
            }
          />
        )}
      </section>

      <nav className="sticky top-0 z-20 -mx-5 flex snap-x gap-2 overflow-x-auto border-b border-line bg-bg/90 px-5 py-2 backdrop-blur sm:-mx-8 sm:px-8">
        {SECTIONS.filter(([key]) => (key !== "crm" || seesCrm) && (key !== "credit" || credit) && (key !== "demos" || can("demos.view"))).map(([key, label]) => (
          <a key={key} href={`#${key}`} className="shrink-0 snap-start rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-3 hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <Panel title="Onboarding">
        <div id="onboarding" className="scroll-mt-28">
          {onboarding ? (
            <OnboardingPanel
              onboarding={onboarding}
              tasks={tasks}
              stage={stage ?? onboarding.stage}
              percent={progress.percent}
              canRun={can("clients.onboarding")}
              canAddTask={can("clients.tasks.create")}
              canSetTaskStatus={can("clients.tasks.status")}
            />
          ) : (
            <p className="text-sm text-ink-4">No active onboarding run.</p>
          )}
        </div>
      </Panel>

      <Panel title="Intake">
        <div id="intake" className="scroll-mt-28">
          <IntakePanel intake={intake} clientId={client.id} canReview={can("clients.intake.review")} />
        </div>
      </Panel>

      <Panel title="Access">
        <div id="access" className="scroll-mt-28">
          <AccessPanel
            grants={grants}
            clientId={client.id}
            canRequest={can("clients.access.request")}
            canUpdate={can("clients.access.update")}
          />
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
          <ApprovalsPanel approvals={approvals} tasks={tasks} clientId={client.id} canRequest={can("clients.approvals.request")} />
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
          <CallsPanel client={client} calls={calls} canLog={can("clients.calls.log")} canReview={can("clients.calls.review")} />
        </div>
      </Panel>

      <DemoRequestsCard clientId={client.id} businessName={client.business_name} area={client.service_area} />

      {seesCrm && (
        <Panel title="CRM account">
          <div id="crm" className="scroll-mt-28">
            <CrmLocationPanel clientId={client.id} location={crmLocation} />
          </div>
        </Panel>
      )}

      {credit && (
        <Panel title={credit.scope === "all" ? "Credit" : "Your credit"}>
          <div id="credit" className="scroll-mt-28">
            <CreditPanel
              clientId={client.id}
              scope={credit.scope}
              credits={credit.credits}
              updatedAt={credit.updatedAt}
              lead={credit.lead}
              notReady={credit.notReady}
              canEdit={editsCredit && !credit.notReady}
              team={credit.team}
              suggestion={credit.suggestion}
            />
          </div>
        </Panel>
      )}

      <Panel title="Team">
        <div id="team" className="scroll-mt-28">
          <TeamPanel members={members} clientId={client.id} canManage={can("clients.members")} />
        </div>
      </Panel>

      <Panel title="Account">
        <div id="account" className="scroll-mt-28">
          <AccountForm client={client} canEdit={can("clients.edit")} />
        </div>
      </Panel>

      <Panel title="Activity">
        <div id="activity" className="scroll-mt-28">
          <ActivityPanel activity={visibleActivity} clientId={client.id} canWrite={can("clients.activity.write")} />
        </div>
      </Panel>

      {can("clients.trash") && (
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

/**
 * The Credit card's data, by the admin API's rules (lib/admin-api/staff/credits.ts):
 * every row for `clients.credits.view`, only the viewer's own rows otherwise.
 * Before the staff management migration the card says so instead of failing.
 */
async function loadCredit(
  clientId: string,
  leadId: string | null,
  opts: { all: boolean; viewer: string; edits: boolean },
): Promise<{
  scope: "all" | "own";
  credits: PanelCredit[];
  updatedAt: string | null;
  lead: { label: string; foundBy: PanelPerson | null; bookedBy: PanelPerson | null } | null;
  notReady: string | null;
  team: PanelPerson[];
  suggestion: CreditInput[];
}> {
  const [rowsOrProblem, names, leads] = await Promise.all([
    readClientCredits(clientId).catch((err: unknown): string => {
      if (err instanceof StaffDataNotReady) return CREDITS_NOT_READY;
      console.error("[credits] read failed", err instanceof Error ? err.message : String(err));
      return "Could not load the credits just now. Reload to try again.";
    }),
    teamMembers().catch(() => new Map<string, string | null>()),
    leadId ? leadCreditPeople([leadId]) : Promise.resolve(new Map<string, never>()),
  ]);
  const person = (email: string | null): PanelPerson | null => (email ? { email, name: names.get(email) ?? null } : null);
  const source = leadId ? leads.get(leadId) : undefined;
  const lead = source ? { label: source.label, foundBy: person(source.foundBy), bookedBy: person(source.bookedBy) } : null;
  const scope = opts.all ? "all" : "own";

  if (typeof rowsOrProblem === "string") {
    return { scope, credits: [], updatedAt: null, lead, notReady: rowsOrProblem, team: [], suggestion: [] };
  }
  const visible: CreditRow[] = opts.all ? rowsOrProblem : rowsOrProblem.filter((r) => r.staff_email === opts.viewer);
  const updatedAt = visible.reduce<string | null>((best, r) => (!best || Date.parse(r.updated_at) >= Date.parse(best) ? r.updated_at : best), null);
  const team = opts.edits
    ? [...names.entries()]
        .map(([email, name]) => ({ email, name }))
        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "en"))
    : [];
  // Offered in the editor when the client has no credits: what creating it from the lead would have set.
  const suggestion = opts.edits && visible.length === 0 && source ? defaultCredits(source.foundBy, source.bookedBy, await getCommissionSplit()) : [];

  return {
    scope,
    credits: visible.map((r) => ({ email: r.staff_email, name: names.get(r.staff_email) ?? null, role: r.role, share: r.share })),
    updatedAt,
    lead,
    notReady: null,
    team,
    suggestion,
  };
}
