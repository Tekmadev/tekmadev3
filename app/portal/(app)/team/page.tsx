import { requireClient } from "@/lib/portal-auth";
import { listMembers } from "@/lib/clients-data";
import { Badge, Field, PageHeader, Panel, inputCls, selectCls, fmtDate, type Tone } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { PortalForm } from "@/components/portal/PortalForm";
import { disableMemberAction, inviteTeamMemberAction, resendMemberInviteAction } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, Tone> = { active: "ok", invited: "gold", disabled: "muted" };

export default async function TeamPage() {
  const { client, member } = await requireClient();
  const members = await listMembers(client.id);
  const canManage = member.role === "owner" || member.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Team" subtitle="Who can sign in to this account. Add your office manager so nothing waits on one person." />

      <Panel title={`People (${members.filter((m) => m.status !== "disabled").length})`}>
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-sm font-bold text-gold-deep">
                  {(m.name || m.email).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {m.name || m.email}
                    {m.id === member.id && <span className="ml-2 text-xs font-normal text-ink-4">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-ink-4">
                    {m.email}
                    {m.title ? ` · ${m.title}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
                <Badge tone="neutral">{m.role}</Badge>
                <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>{m.status}</Badge>
                {m.last_seen_at && <span className="text-xs text-ink-4">Seen {fmtDate(m.last_seen_at)}</span>}
                {canManage && m.status === "invited" && (
                  <PortalForm action={resendMemberInviteAction}>
                    <input type="hidden" name="member_id" value={m.id} />
                    <button type="submit" className="min-h-9 rounded-full px-3 text-xs text-ink-3 hover:text-ink">
                      Resend invite
                    </button>
                  </PortalForm>
                )}
                {canManage && m.id !== member.id && m.status !== "disabled" && (
                  <PortalForm action={disableMemberAction}>
                    <input type="hidden" name="member_id" value={m.id} />
                    <button type="submit" className="min-h-9 rounded-full px-3 text-xs text-ink-3 hover:text-signal">
                      Remove
                    </button>
                  </PortalForm>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {canManage && (
        <Panel title="Invite someone" description="They get their own login. Admins can approve deliverables and manage billing; members can see everything and complete tasks.">
          <PortalForm action={inviteTeamMemberAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" required htmlFor="inv-email">
              <input id="inv-email" name="email" type="email" required inputMode="email" autoComplete="off" className={inputCls} />
            </Field>
            <Field label="Name" htmlFor="inv-name">
              <input id="inv-name" name="name" className={inputCls} />
            </Field>
            <Field label="Title" htmlFor="inv-title">
              <input id="inv-title" name="title" placeholder="Office manager" className={inputCls} />
            </Field>
            <Field label="Role" htmlFor="inv-role">
              <select id="inv-role" name="role" defaultValue="member" className={selectCls}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Sending" className="w-full sm:w-auto">
                Send invite
              </SubmitButton>
            </div>
          </PortalForm>
        </Panel>
      )}
    </div>
  );
}
