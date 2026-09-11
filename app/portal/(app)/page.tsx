import Link from "next/link";
import { ArrowRight, CalendarCheck, Mail, Phone, Target } from "lucide-react";
import { business, portal } from "@/config/site";
import { getTierMeta } from "@/config/pricing";
import { requireClient } from "@/lib/portal-auth";
import { listInAppNotifications } from "@/lib/clients-data";
import {
  derivedStage,
  getActiveOnboarding,
  guaranteeSummary,
  listBookedCalls,
  listTasks,
  taskProgress,
} from "@/lib/onboarding-data";
import { StageTracker } from "@/components/portal/StageTracker";
import { TaskItem } from "@/components/portal/TaskList";
import { LinkPending } from "@/components/portal/LinkPending";
import { Badge, EmptyState, Notice, PageHeader, Panel, ProgressBar, btnSecondary, fmtDate, fmtDateTime } from "@/components/portal/ui";
import { completeTaskAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ welcome?: string; e?: string }> }) {
  const [{ client, member }, params] = await Promise.all([requireClient(), searchParams]);
  const onboarding = await getActiveOnboarding(client.id);
  const [tasks, calls, notifications] = await Promise.all([
    onboarding ? listTasks(onboarding.id) : Promise.resolve([]),
    listBookedCalls(client.id, 500),
    listInAppNotifications(client.id, member.id, 5),
  ]);

  const progress = taskProgress(tasks);
  const stage = onboarding ? derivedStage(onboarding, tasks) : "complete";
  const needFromYou = progress.clientOpen.slice(0, 5);
  const guarantee = guaranteeSummary(client, calls);
  const tier = client.plan_id ? getTierMeta(client.plan_id) : undefined;
  const firstName = (member.name || "").split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : `Welcome, ${client.business_name}`}
        subtitle={
          <>
            {tier ? `${tier.name} plan` : "Your plan"}
            {onboarding?.target_live_date ? ` · target go-live ${fmtDate(onboarding.target_live_date)}` : ""}
            {client.live_at ? ` · live since ${fmtDate(client.live_at)}` : ""}
          </>
        }
      />

      {params.welcome === "1" && (
        <Notice kind="ok">
          You are in. Two things to do today: accept your agreement and book your kickoff call. Everything else we handle.
        </Notice>
      )}
      {params.e === "forbidden" && <Notice kind="err">That page is for account admins.</Notice>}

      {onboarding ? (
        <Panel>
          <StageTracker current={stage} percent={progress.percent} />
        </Panel>
      ) : (
        <Panel title="Onboarding">
          <p className="text-sm text-ink-3">Your onboarding is complete. Your growth system is running.</p>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <Panel
            title="What we need from you"
            description={needFromYou.length ? "Short list. Each one unblocks the build." : undefined}
            action={
              <Link href="/onboarding" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
                Full checklist
                <LinkPending />
              </Link>
            }
          >
            {needFromYou.length === 0 ? (
              <EmptyState title="Nothing waiting on you" body="We are building. You will hear from us at the next checkpoint." />
            ) : (
              <ul>
                {needFromYou.map((t) => (
                  <TaskItem key={t.id} task={t} completeAction={completeTaskAction} />
                ))}
              </ul>
            )}
          </Panel>

          {guarantee.eligible ? (
            <Panel
              title="Your guarantee"
              description={`${guarantee.target} booked calls in ${guarantee.windowDays} days, or we work free until you hit it.`}
              action={
                <Link href="/calls" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
                  See every call
                  <LinkPending />
                </Link>
              }
            >
              {guarantee.startedAt ? (
                <div>
                  <div className="flex items-end justify-between gap-4">
                    <p className="font-display text-3xl font-bold text-ink">
                      {guarantee.counted}
                      <span className="text-base font-medium text-ink-4"> / {guarantee.target}</span>
                    </p>
                    <div className="text-right text-sm text-ink-3">
                      <p>{guarantee.daysLeft} days left</p>
                      <Badge tone={guarantee.onTrack ? "ok" : "warn"}>{guarantee.onTrack ? "On pace" : "Behind pace"}</Badge>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ProgressBar percent={guarantee.percent} tone={guarantee.onTrack ? "ok" : "gold"} />
                  </div>
                  <p className="mt-2 text-xs text-ink-4">
                    Clock started {fmtDate(guarantee.startedAt)}, ends {fmtDate(guarantee.endsAt)}.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <Target className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                  <p className="text-sm text-ink-3">
                    The {guarantee.windowDays}-day clock starts the day we go live, not the day you paid. Right now: building.
                  </p>
                </div>
              )}
            </Panel>
          ) : (
            <Panel title="Your plan">
              <p className="text-sm text-ink-3">
                {tier?.name ?? "Convert"} captures and converts every lead that reaches you. The booked-call guarantee and
                done-for-you ads are part of Grow. Ask your strategist about upgrading when you are ready for more volume.
              </p>
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Panel title="Your strategist">
            <p className="text-sm text-ink-3">Questions, ideas, anything unclear. Reach us directly.</p>
            <div className="mt-4 flex flex-col gap-2">
              <a href={`mailto:${client.assigned_strategist || business.email}`} className="flex min-h-11 items-center gap-2.5 text-sm text-ink-2 hover:text-gold">
                <Mail className="h-4 w-4 text-gold" />
                {client.assigned_strategist || business.email}
              </a>
              <a href={`tel:${business.phone.tel}`} className="flex min-h-11 items-center gap-2.5 text-sm text-ink-2 hover:text-gold">
                <Phone className="h-4 w-4 text-gold" />
                {business.phone.display}
              </a>
              <a href={portal.kickoffCalUrl} target="_blank" rel="noopener" className={btnSecondary + " mt-1"}>
                <CalendarCheck className="h-4 w-4" />
                Book a call
              </a>
            </div>
          </Panel>

          <Panel
            title="Updates"
            action={
              <Link href="/settings#notifications" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
                All
                <LinkPending />
              </Link>
            }
          >
            {notifications.length === 0 ? (
              <p className="text-sm text-ink-4">No updates yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {notifications.map((n) => (
                  <li key={n.id} className="py-2.5">
                    <p className="text-sm font-medium text-ink">{n.subject}</p>
                    {n.body && <p className="mt-0.5 text-sm text-ink-3">{n.body}</p>}
                    <div className="mt-1 flex items-center gap-3 text-xs text-ink-4">
                      <span>{fmtDateTime(n.created_at)}</span>
                      {n.action_url && (
                        <Link href={n.action_url} className="inline-flex items-center gap-1 text-gold-deep hover:text-gold">
                          Open <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
