import { Badge, Notice, fmtDateTime } from "@/components/portal/ui";
import { CREDIT_ROLE_HELP, CREDIT_ROLE_LABELS, type CreditRole } from "@/lib/staff-constants";
import { CreditsEditor, type EditorCredit, type EditorPerson } from "@/components/admin/clients/CreditsEditor";

export type PanelCredit = { email: string; name: string | null; role: CreditRole; share: number };
export type PanelPerson = { email: string; name: string | null };

/** 50 -> "50", 33.333 -> "33.33". */
const pct = (n: number) => `${Math.round(n * 100) / 100}%`;
const who = (p: PanelPerson) => p.name || p.email;

/**
 * The client's commission credit (docs/admin-api/staff.md section 4). Owners
 * and managers (`clients.credits.view`, scope "all") see every row; everyone
 * else (`activity.own`, scope "own") sees only their own rows and shares,
 * never anyone else's. `canEdit` (`clients.credits.edit`) adds the editor.
 * Found by and Booked by come from the lead the client was created from.
 */
export function CreditPanel({
  clientId,
  scope,
  credits,
  updatedAt,
  lead,
  notReady,
  canEdit,
  team,
  suggestion,
}: {
  clientId: string;
  scope: "all" | "own";
  credits: PanelCredit[];
  updatedAt: string | null;
  lead: { label: string; foundBy: PanelPerson | null; bookedBy: PanelPerson | null } | null;
  /** The copy for "the staff management migration is not applied yet", or a read failure; null when credits loaded. */
  notReady: string | null;
  canEdit: boolean;
  team: EditorPerson[];
  suggestion: EditorCredit[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-bg-2 px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-ink-4">Source lead</dt>
          <dd className="mt-1 text-sm text-ink">{lead ? lead.label : "Not created from a lead"}</dd>
        </div>
        <div className="rounded-xl border border-line bg-bg-2 px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-ink-4">Found by</dt>
          <dd className="mt-1 text-sm text-ink" title={CREDIT_ROLE_HELP.finder}>
            {lead?.foundBy ? who(lead.foundBy) : <span className="text-ink-4">Nobody recorded</span>}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-bg-2 px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-ink-4">Booked by</dt>
          <dd className="mt-1 text-sm text-ink" title={CREDIT_ROLE_HELP.booker}>
            {lead?.bookedBy ? who(lead.bookedBy) : <span className="text-ink-4">Nobody recorded</span>}
          </dd>
        </div>
      </dl>

      {notReady ? (
        <Notice kind="info">{notReady}</Notice>
      ) : (
        <>
          {credits.length === 0 ? (
            <p className="text-sm text-ink-4">{scope === "own" ? "You have no credit on this client." : "Nobody has credit on this client."}</p>
          ) : (
            <ul className="divide-y divide-line">
              {credits.map((c) => (
                <li key={`${c.email}-${c.role}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{scope === "own" ? "You" : who(c)}</p>
                    {scope === "all" && c.name && <p className="text-xs text-ink-4">{c.email}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span title={CREDIT_ROLE_HELP[c.role]}>
                      <Badge tone={c.role === "other" ? "muted" : "neutral"}>{CREDIT_ROLE_LABELS[c.role]}</Badge>
                    </span>
                    <span className="min-w-14 text-right font-display text-lg font-bold tabular-nums text-ink">{pct(c.share)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {updatedAt && <p className="text-xs text-ink-4">Last changed {fmtDateTime(updatedAt)}</p>}

          {canEdit && (
            <details className="rounded-xl border border-line bg-bg-2 p-4">
              <summary className="cursor-pointer text-sm font-medium text-ink">Edit credits</summary>
              <div className="mt-4">
                <CreditsEditor
                  clientId={clientId}
                  initial={credits.map((c) => ({ email: c.email, role: c.role, share: c.share }))}
                  team={team}
                  suggestion={suggestion}
                />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
