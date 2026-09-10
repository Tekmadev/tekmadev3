import { ExternalLink } from "lucide-react";
import { AGREEMENTS } from "@/config/agreements";
import { requireClient } from "@/lib/portal-auth";
import { listAgreements } from "@/lib/onboarding-data";
import { Badge, EmptyState, Field, Notice, PageHeader, Panel, btnSecondary, inputCls, fmtDateTime } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { PortalForm } from "@/components/portal/PortalForm";
import { acceptAgreementAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AgreementsPage() {
  const { client, member } = await requireClient();
  const agreements = await listAgreements(client.id);
  const open = agreements.filter((a) => a.status === "sent" || a.status === "viewed");
  const done = agreements.filter((a) => !open.includes(a));
  const canSign = member.role === "owner" || member.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Agreements" subtitle="What we deliver, what counts as a booked call, and when your guarantee starts. In writing." />

      {agreements.length === 0 && <EmptyState title="No agreements yet" body="Your service agreement appears here once onboarding starts." />}

      {open.map((a) => {
        const def = Object.values(AGREEMENTS).find((d) => d.kind === a.kind);
        return (
          <Panel key={a.id} title={a.title} description={`Version ${a.version}`} action={<Badge tone="gold">Needs your acceptance</Badge>}>
            {def && (
              <ul className="flex flex-col gap-2 text-sm text-ink-2">
                {def.summary.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-4">The summary above is for convenience. The document linked below is what you are accepting.</p>
            {a.document_url && (
              <a href={a.document_url} target="_blank" rel="noopener" className={btnSecondary + " mt-4"}>
                Read the full document
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}

            {canSign ? (
              <PortalForm action={acceptAgreementAction} className="mt-6 flex flex-col gap-4 border-t border-line pt-5">
                <input type="hidden" name="agreement_id" value={a.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Your full name" required htmlFor={`name-${a.id}`}>
                    <input id={`name-${a.id}`} name="signer_name" required defaultValue={member.name ?? ""} autoComplete="name" className={inputCls} />
                  </Field>
                  <Field label="Your title" htmlFor={`title-${a.id}`}>
                    <input id={`title-${a.id}`} name="signer_title" defaultValue={member.title ?? ""} placeholder="Owner" className={inputCls} />
                  </Field>
                </div>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink-2">
                  <input type="checkbox" name="accept" required className="mt-1 h-4 w-4 accent-[var(--color-gold)]" />
                  <span>{def?.acceptLabel ?? "I have read and accept this agreement"} on behalf of {client.business_name}.</span>
                </label>
                <SubmitButton pendingLabel="Recording" className="w-full sm:w-auto">
                  Accept agreement
                </SubmitButton>
              </PortalForm>
            ) : (
              <Notice kind="info">Only an account owner or admin can accept agreements. Ask {client.primary_email}.</Notice>
            )}
          </Panel>
        );
      })}

      {done.length > 0 && (
        <Panel title="Accepted">
          <ul className="divide-y divide-line">
            {done.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {a.title} <span className="text-xs font-normal text-ink-4">v{a.version}</span>
                  </p>
                  {a.signed_at && (
                    <p className="text-xs text-ink-4">
                      Accepted {fmtDateTime(a.signed_at)} by {a.signer_name}
                      {a.signer_title ? `, ${a.signer_title}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {a.document_url && (
                    <a href={a.document_url} target="_blank" rel="noopener" className="text-xs text-ink-3 hover:text-ink">
                      View
                    </a>
                  )}
                  <Badge tone={a.status === "signed" ? "ok" : "muted"}>{a.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
