import { ExternalLink } from "lucide-react";
import { requireClient } from "@/lib/portal-auth";
import { listApprovals, type ClientApproval } from "@/lib/onboarding-data";
import { Badge, EmptyState, Field, PageHeader, Panel, btnSecondary, inputCls, fmtDateTime, humanize, type Tone } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { PortalForm } from "@/components/portal/PortalForm";
import { decideApprovalAction } from "../actions";

export const dynamic = "force-dynamic";

const TONE: Record<ClientApproval["status"], Tone> = {
  pending: "gold",
  approved: "ok",
  changes_requested: "warn",
  superseded: "muted",
};

export default async function ApprovalsPage() {
  const { client } = await requireClient();
  const approvals = await listApprovals(client.id);
  const pending = approvals.filter((a) => a.status === "pending");
  const history = approvals.filter((a) => a.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Approvals" subtitle="Nothing goes live until you have seen it. Approve, or tell us what to change." />

      {pending.length === 0 ? (
        <EmptyState title="Nothing to approve right now" body="When your website, receptionist script, or ad creative is ready, it lands here." />
      ) : (
        pending.map((a) => (
          <Panel key={a.id} title={a.title} description={a.description ?? undefined} action={<Badge tone="gold">Version {a.version}</Badge>}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="muted">{humanize(a.kind)}</Badge>
              {a.preview_url && (
                <a href={a.preview_url} target="_blank" rel="noopener" className={btnSecondary}>
                  Open preview
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {a.attachments?.map((att) => (
                <a key={att.url} href={att.url} target="_blank" rel="noopener" className={btnSecondary}>
                  {att.label}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
            <PortalForm action={decideApprovalAction} className="mt-5 flex flex-col gap-4">
              <input type="hidden" name="approval_id" value={a.id} />
              <Field label="Comments or changes" help="Required if you are requesting changes. Specific beats vague.">
                <textarea name="feedback" rows={3} className={inputCls + " min-h-24"} placeholder="Looks great, but change the headline to..." />
              </Field>
              <div className="flex flex-col gap-2 sm:flex-row">
                <SubmitButton name="decision" value="approve" pendingLabel="Saving" className="w-full sm:w-auto">
                  Approve
                </SubmitButton>
                <SubmitButton name="decision" value="changes" variant="secondary" pendingLabel="Saving" className="w-full sm:w-auto">
                  Request changes
                </SubmitButton>
              </div>
            </PortalForm>
          </Panel>
        ))
      )}

      {history.length > 0 && (
        <Panel title="History">
          <ul className="divide-y divide-line">
            {history.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {a.title} <span className="text-xs font-normal text-ink-4">v{a.version}</span>
                  </p>
                  {a.feedback && <p className="mt-0.5 text-sm text-ink-3">&ldquo;{a.feedback}&rdquo;</p>}
                  <p className="mt-0.5 text-xs text-ink-4">
                    {a.decided_at ? `${fmtDateTime(a.decided_at)} by ${a.decided_by}` : fmtDateTime(a.requested_at)}
                  </p>
                </div>
                <Badge tone={TONE[a.status]}>{humanize(a.status)}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
