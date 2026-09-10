import { STAGES, isTaskOpen, stageLabel, type ClientOnboarding, type OnboardingTask } from "@/lib/onboarding-data";
import { Badge, Field, inputCls, selectCls, fmtDate } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { StageTracker } from "@/components/portal/StageTracker";
import {
  addTaskAction,
  completeOnboardingAction,
  setBlockedAction,
  setOnboardingDatesAction,
  setStageAction,
  setTaskStatusAction,
} from "@/app/admin/(dashboard)/clients/actions";

const TASK_STATUSES = ["todo", "in_progress", "waiting_on_client", "done", "skipped", "blocked"];
const KINDS = ["checklist", "call", "internal", "form", "upload", "access_grant", "approval", "esign"];

function dtLocal(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OnboardingPanel({
  onboarding,
  tasks,
  stage,
  percent,
}: {
  onboarding: ClientOnboarding;
  tasks: OnboardingTask[];
  stage: ClientOnboarding["stage"];
  percent: number;
}) {
  const groups = STAGES.filter((s) => s.key !== "complete").map((s) => ({ stage: s, items: tasks.filter((t) => t.stage === s.key) }));

  return (
    <div className="flex flex-col gap-6">
      <StageTracker current={stage} percent={percent} />

      <div className="grid gap-4 lg:grid-cols-3">
        <form action={setStageAction} className="flex flex-col gap-2 rounded-xl border border-line bg-bg-2 p-4">
          <input type="hidden" name="onboarding_id" value={onboarding.id} />
          <Field label="Stored stage" help={`Derived from tasks: ${stageLabel(stage)}`}>
            <select name="stage" defaultValue={onboarding.stage} className={selectCls}>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <SubmitButton variant="secondary" pendingLabel="Saving">
            Set stage
          </SubmitButton>
        </form>

        <form action={setOnboardingDatesAction} className="flex flex-col gap-2 rounded-xl border border-line bg-bg-2 p-4">
          <input type="hidden" name="onboarding_id" value={onboarding.id} />
          <Field label="Target go-live">
            <input name="target_live_date" type="date" defaultValue={onboarding.target_live_date ?? ""} className={inputCls} />
          </Field>
          <Field label="Kickoff call">
            <input name="kickoff_at" type="datetime-local" defaultValue={dtLocal(onboarding.kickoff_at)} className={inputCls} />
          </Field>
          <SubmitButton variant="secondary" pendingLabel="Saving">
            Save dates
          </SubmitButton>
        </form>

        <form action={setBlockedAction} className="flex flex-col gap-2 rounded-xl border border-line bg-bg-2 p-4">
          <input type="hidden" name="onboarding_id" value={onboarding.id} />
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="blocked" defaultChecked={onboarding.blocked} className="h-4 w-4 accent-[var(--color-gold)]" />
            Blocked
          </label>
          <input name="blocked_reason" defaultValue={onboarding.blocked_reason ?? ""} placeholder="Waiting on domain access" className={inputCls} />
          <SubmitButton variant="secondary" pendingLabel="Saving">
            Save
          </SubmitButton>
        </form>
      </div>

      <div className="flex flex-col gap-5">
        {groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <div key={g.stage.key}>
              <p className="mb-1 text-sm font-semibold text-ink">
                {g.stage.label} <span className="text-xs font-normal text-ink-4">{g.stage.days}</span>
              </p>
              <ul className="divide-y divide-line">
                {g.items.map((t) => (
                  <li key={t.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className={"text-sm " + (isTaskOpen(t) ? "text-ink" : "text-ink-3 line-through")}>
                        {t.title}
                        {!t.required && <span className="ml-2 text-xs text-ink-4">optional</span>}
                      </p>
                      <p className="text-xs text-ink-4">
                        {t.owner === "client" ? "Client" : "Tekmadev"} · {t.kind}
                        {t.due_at && isTaskOpen(t) ? ` · due ${fmtDate(t.due_at)}` : ""}
                        {t.completed_at ? ` · done ${fmtDate(t.completed_at)} by ${t.completed_by ?? "?"}` : ""}
                      </p>
                    </div>
                    <form action={setTaskStatusAction} className="flex items-center gap-2">
                      <input type="hidden" name="task_id" value={t.id} />
                      <select name="status" defaultValue={t.status} className={selectCls + " min-w-40 py-2"}>
                        {TASK_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                      <SubmitButton variant="secondary" pendingLabel="...">
                        Set
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>

      <details className="rounded-xl border border-line bg-bg-2 p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">Add a task to this run</summary>
        <form action={addTaskAction} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="onboarding_id" value={onboarding.id} />
          <div className="sm:col-span-2">
            <Field label="Title" required>
              <input name="title" required className={inputCls} />
            </Field>
          </div>
          <Field label="Stage">
            <select name="stage" defaultValue={onboarding.stage === "complete" ? "optimizing" : onboarding.stage} className={selectCls}>
              {STAGES.filter((s) => s.key !== "complete").map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Owner">
            <select name="owner" defaultValue="tekmadev" className={selectCls}>
              <option value="tekmadev">Tekmadev</option>
              <option value="client">Client</option>
            </select>
          </Field>
          <Field label="Kind">
            <select name="kind" defaultValue="checklist" className={selectCls}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due">
            <input name="due_at" type="date" className={inputCls} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <input name="description" className={inputCls} />
            </Field>
          </div>
          <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-4">
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" name="required" defaultChecked className="h-4 w-4 accent-[var(--color-gold)]" />
              Required
            </label>
            <SubmitButton pendingLabel="Adding">Add task</SubmitButton>
          </div>
        </form>
      </details>

      {!onboarding.completed_at && (
        <form action={completeOnboardingAction} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
          <input type="hidden" name="onboarding_id" value={onboarding.id} />
          <p className="text-sm text-ink-3">
            Started {fmtDate(onboarding.created_at)}. <Badge tone="neutral">{onboarding.kind}</Badge>
          </p>
          <SubmitButton variant="secondary" pendingLabel="Saving">
            Mark onboarding complete
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
