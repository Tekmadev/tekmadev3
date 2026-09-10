import { ACCESS_PROVIDERS, accessProvider } from "@/lib/access-providers";
import type { AccessGrant } from "@/lib/onboarding-data";
import { Badge, Field, inputCls, selectCls, fmtDate, type Tone } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { addAccessGrantAction, setAccessStatusAction } from "@/app/admin/(dashboard)/clients/actions";

const STATUSES: AccessGrant["status"][] = ["requested", "pending_client", "client_says_done", "granted", "verified", "revoked", "not_applicable"];
const TONE: Record<AccessGrant["status"], Tone> = {
  requested: "neutral",
  pending_client: "gold",
  client_says_done: "warn",
  granted: "ok",
  verified: "ok",
  revoked: "signal",
  not_applicable: "muted",
};

export function AccessPanel({ grants, clientId }: { grants: AccessGrant[]; clientId: string }) {
  return (
    <div className="flex flex-col gap-5">
      {grants.length === 0 && <p className="text-sm text-ink-4">No access requests yet.</p>}
      <ul className="divide-y divide-line">
        {grants.map((g) => {
          const def = accessProvider(g.provider);
          return (
            <li key={g.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-ink">{g.label ?? def.label}</p>
                <Badge tone={TONE[g.status]}>{g.status.replace(/_/g, " ")}</Badge>
                {g.account_identifier && <span className="text-xs text-ink-3">{g.account_identifier}</span>}
              </div>
              <p className="mt-0.5 text-xs text-ink-4">
                {g.method.replace(/_/g, " ")}
                {g.client_marked_done_at ? ` · client marked done ${fmtDate(g.client_marked_done_at)}` : ""}
                {g.verified_at ? ` · verified ${fmtDate(g.verified_at)} by ${g.verified_by}` : ""}
              </p>
              <form action={setAccessStatusAction} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input type="hidden" name="grant_id" value={g.id} />
                <select name="status" defaultValue={g.status} className={selectCls + " py-2 sm:w-48"}>
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <input name="notes" defaultValue={g.notes ?? ""} placeholder="Note shown to the client" className={inputCls + " py-2 sm:flex-1"} />
                <SubmitButton variant="secondary" pendingLabel="...">
                  Update
                </SubmitButton>
              </form>
            </li>
          );
        })}
      </ul>

      <details className="rounded-xl border border-line bg-bg-2 p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">Request another access</summary>
        <form action={addAccessGrantAction} className="mt-4 grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="client_id" value={clientId} />
          <Field label="Provider">
            <select name="provider" defaultValue="google_analytics" className={selectCls}>
              {Object.values(ACCESS_PROVIDERS).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label (optional)">
            <input name="label" className={inputCls} />
          </Field>
          <Field label="Note to client">
            <input name="notes" className={inputCls} />
          </Field>
          <div className="sm:col-span-3">
            <SubmitButton pendingLabel="Sending">Request access</SubmitButton>
          </div>
        </form>
      </details>
    </div>
  );
}
