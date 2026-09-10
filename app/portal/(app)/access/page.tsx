import { ShieldCheck } from "lucide-react";
import { requireClient } from "@/lib/portal-auth";
import { listAccessGrants, type AccessGrant } from "@/lib/onboarding-data";
import { accessProvider } from "@/lib/access-providers";
import { Badge, EmptyState, Field, Notice, PageHeader, Panel, inputCls, fmtDate, type Tone } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { PortalForm } from "@/components/portal/PortalForm";
import { accessGrantAction } from "../actions";

export const dynamic = "force-dynamic";

const STATUS: Record<AccessGrant["status"], { label: string; tone: Tone }> = {
  requested: { label: "Requested", tone: "neutral" },
  pending_client: { label: "Waiting on you", tone: "gold" },
  client_says_done: { label: "Checking on our side", tone: "neutral" },
  granted: { label: "Granted", tone: "ok" },
  verified: { label: "Verified", tone: "ok" },
  revoked: { label: "Revoked", tone: "signal" },
  not_applicable: { label: "Not applicable", tone: "muted" },
};

export default async function AccessPage() {
  const { client } = await requireClient();
  const grants = await listAccessGrants(client.id);
  const open = grants.filter((g) => g.status === "pending_client" || g.status === "requested");
  const rest = grants.filter((g) => !open.includes(g));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Access" subtitle="Partner and manager access you grant from your own accounts. You stay the owner and can revoke any of it." />

      <Notice kind="info">
        <span className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <span>We never ask for passwords, here or anywhere. If anyone claiming to be Tekmadev does, do not share them and tell us.</span>
        </span>
      </Notice>

      {grants.length === 0 && <EmptyState title="Nothing to grant yet" body="Access requests appear here once your checklist is created." />}

      {open.map((g) => (
        <GrantCard key={g.id} grant={g} />
      ))}
      {rest.length > 0 && (
        <Panel title="Done">
          <ul className="divide-y divide-line">
            {rest.map((g) => {
              const def = accessProvider(g.provider);
              const st = STATUS[g.status];
              return (
                <li key={g.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">{g.label || def.label}</p>
                    {g.account_identifier && <p className="text-xs text-ink-4">{g.account_identifier}</p>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-ink-4">
                    {g.verified_at && <span>Verified {fmtDate(g.verified_at)}</span>}
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function GrantCard({ grant }: { grant: AccessGrant }) {
  const def = accessProvider(grant.provider);
  const st = STATUS[grant.status];
  return (
    <Panel title={grant.label || def.label} description={def.summary} action={<Badge tone={st.tone}>{st.label}</Badge>}>
      <ol className="flex flex-col gap-2 text-sm text-ink-2">
        {def.steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-semibold text-gold-deep">{i + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {grant.notes && <p className="mt-3 text-sm text-ink-3">Note from your strategist: {grant.notes}</p>}

      <PortalForm action={accessGrantAction} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="grant_id" value={grant.id} />
        {def.identifierLabel && (
          <Field label={def.identifierLabel} help={def.identifierHelp}>
            <input name="account_identifier" defaultValue={grant.account_identifier ?? ""} className={inputCls} placeholder={def.identifierHelp} />
          </Field>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton name="intent" value="done" pendingLabel="Saving" className="w-full sm:w-auto">
            I have done this
          </SubmitButton>
          <SubmitButton name="intent" value="na" variant="secondary" pendingLabel="Saving" className="w-full sm:w-auto">
            I do not have this account
          </SubmitButton>
        </div>
      </PortalForm>
    </Panel>
  );
}
