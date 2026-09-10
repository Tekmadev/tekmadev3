import type { ClientApproval, OnboardingTask } from "@/lib/onboarding-data";
import { Badge, Field, inputCls, selectCls, fmtDateTime, humanize, type Tone } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { requestApprovalAction } from "@/app/admin/(dashboard)/clients/actions";

const KINDS = ["website", "receptionist_script", "ad_creative", "landing_page", "follow_up_sequence", "social_content", "other"];
const TONE: Record<ClientApproval["status"], Tone> = { pending: "gold", approved: "ok", changes_requested: "warn", superseded: "muted" };

export function ApprovalsPanel({ approvals, tasks, clientId }: { approvals: ClientApproval[]; tasks: OnboardingTask[]; clientId: string }) {
  const approvalTasks = tasks.filter((t) => t.kind === "approval");
  return (
    <div className="flex flex-col gap-5">
      {approvals.length === 0 ? (
        <p className="text-sm text-ink-4">Nothing requested yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {approvals.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {a.title} <span className="text-xs font-normal text-ink-4">v{a.version} · {humanize(a.kind)}</span>
                </p>
                {a.preview_url && (
                  <a href={a.preview_url} target="_blank" rel="noopener" className="text-xs text-gold-deep hover:text-gold">
                    {a.preview_url}
                  </a>
                )}
                {a.feedback && <p className="mt-1 text-sm text-ink-3">&ldquo;{a.feedback}&rdquo;</p>}
                <p className="mt-0.5 text-xs text-ink-4">
                  Requested {fmtDateTime(a.requested_at)}
                  {a.decided_at ? ` · decided ${fmtDateTime(a.decided_at)} by ${a.decided_by}` : ""}
                </p>
              </div>
              <Badge tone={TONE[a.status]}>{humanize(a.status)}</Badge>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-xl border border-line bg-bg-2 p-4" open={approvals.length === 0}>
        <summary className="cursor-pointer text-sm font-medium text-ink">Request an approval</summary>
        <form action={requestApprovalAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="client_id" value={clientId} />
          <Field label="Title" required>
            <input name="title" required placeholder="Homepage and service pages" className={inputCls} />
          </Field>
          <Field label="Kind">
            <select name="kind" defaultValue="website" className={selectCls}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {humanize(k)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Preview URL">
            <input name="preview_url" type="url" placeholder="https://" className={inputCls} />
          </Field>
          <Field label="Linked checklist task" help="Marks the task waiting on the client, done when approved.">
            <select name="task_id" defaultValue="" className={selectCls}>
              <option value="">None</option>
              {approvalTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="What to look at">
              <textarea name="description" rows={2} className={inputCls} />
            </Field>
          </div>
          <Field label="Attachment label">
            <input name="attachment_label" placeholder="Script PDF" className={inputCls} />
          </Field>
          <Field label="Attachment URL">
            <input name="attachment_url" type="url" placeholder="https://" className={inputCls} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Sending">Send for approval</SubmitButton>
          </div>
        </form>
      </details>
    </div>
  );
}
