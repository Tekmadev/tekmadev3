import Link from "next/link";
import { ArrowRight, Check, Circle, Clock, ExternalLink, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { portal } from "@/config/site";
import { STAGES, isTaskOpen, type OnboardingTask } from "@/lib/onboarding-data";
import { Badge, btnSecondary, fmtDate } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { PortalForm, type ActionResult } from "@/components/portal/PortalForm";
import { LinkPending } from "@/components/portal/LinkPending";

/** Where a task sends the client to do the thing. */
export function taskHref(t: OnboardingTask): string | null {
  switch (t.kind) {
    case "form":
      return "/intake";
    case "upload":
      return "/assets";
    case "access_grant":
      return "/access";
    case "approval":
      return "/approvals";
    case "esign":
      return "/agreements";
    default:
      return null;
  }
}

function ownerBadge(t: OnboardingTask) {
  return t.owner === "client" ? <Badge tone="gold">You</Badge> : <Badge tone="muted">Tekmadev</Badge>;
}

function statusIcon(t: OnboardingTask) {
  if (!isTaskOpen(t)) return <Check className="h-4 w-4 text-gold" />;
  if (t.status === "blocked") return <Lock className="h-4 w-4 text-signal" />;
  if (t.status === "in_progress" || t.status === "waiting_on_client") return <Clock className="h-4 w-4 text-ink-4" />;
  return <Circle className="h-4 w-4 text-ink-5" />;
}

export function TaskItem({
  task,
  completeAction,
  compact = false,
}: {
  task: OnboardingTask;
  /** Server action to mark a client-owned checklist/call task done. */
  completeAction?: (formData: FormData) => Promise<ActionResult>;
  compact?: boolean;
}) {
  const open = isTaskOpen(task);
  const href = taskHref(task);
  const isKickoff = task.key === "welcome.book_kickoff";
  const isBookable = task.owner === "client" && task.kind === "call";
  const canSelfComplete = task.owner === "client" && open && (task.kind === "checklist" || task.kind === "call");

  return (
    <li className={cn("flex gap-3 py-3", compact ? "" : "border-b border-line last:border-0")}>
      <span className="mt-0.5 shrink-0">{statusIcon(task)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-sm font-medium", open ? "text-ink" : "text-ink-3 line-through decoration-line-strong")}>{task.title}</p>
          {ownerBadge(task)}
          {!task.required && <Badge tone="muted">Optional</Badge>}
        </div>
        {task.description && !compact && <p className="mt-1 text-sm text-ink-3">{task.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-4">
          {task.due_at && open && <span>Due {fmtDate(task.due_at)}</span>}
          {task.completed_at && <span>Done {fmtDate(task.completed_at)}</span>}
        </div>
        {open && task.owner === "client" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isBookable && (
              <a href={portal.kickoffCalUrl} target="_blank" rel="noopener" className={btnSecondary}>
                Pick a time
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {href && (
              <Link href={href} className={btnSecondary}>
                {task.kind === "esign" ? "Review and accept" : task.kind === "approval" ? "Review" : "Open"}
                <LinkPending idle={<ArrowRight className="h-3.5 w-3.5" />} />
              </Link>
            )}
            {canSelfComplete && completeAction && (
              <PortalForm action={completeAction}>
                <input type="hidden" name="task_id" value={task.id} />
                <SubmitButton variant="secondary" pendingLabel="Saving">
                  {isKickoff ? "I booked it" : "Mark done"}
                </SubmitButton>
              </PortalForm>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** Tasks grouped by stage, in pipeline order. */
export function TaskList({
  tasks,
  completeAction,
}: {
  tasks: OnboardingTask[];
  completeAction?: (formData: FormData) => Promise<ActionResult>;
}) {
  const groups = STAGES.filter((s) => s.key !== "complete").map((s) => ({
    stage: s,
    items: tasks.filter((t) => t.stage === s.key),
  }));

  return (
    <div className="flex flex-col gap-6">
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => {
          const done = g.items.filter((t) => !isTaskOpen(t)).length;
          return (
            <section key={g.stage.key} id={`stage-${g.stage.key}`} className="scroll-mt-24">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">
                  {g.stage.label}
                  <span className="ml-2 text-xs font-normal text-ink-4">{g.stage.days}</span>
                </h3>
                <span className="text-xs text-ink-4">
                  {done}/{g.items.length}
                </span>
              </div>
              <ul className="mt-1">
                {g.items.map((t) => (
                  <TaskItem key={t.id} task={t} completeAction={completeAction} />
                ))}
              </ul>
            </section>
          );
        })}
    </div>
  );
}
