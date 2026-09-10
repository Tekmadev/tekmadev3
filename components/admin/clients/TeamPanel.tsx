import type { ClientMember } from "@/lib/clients-data";
import { Badge, Field, inputCls, selectCls, fmtDate, type Tone } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { addMemberAction, resendInviteAction, setMemberStatusAction } from "@/app/admin/(dashboard)/clients/actions";

const TONE: Record<string, Tone> = { active: "ok", invited: "gold", disabled: "muted" };

export function TeamPanel({ members, clientId }: { members: ClientMember[]; clientId: string }) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="divide-y divide-line">
        {members.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {m.name || m.email} <Badge tone={TONE[m.status] ?? "neutral"}>{m.status}</Badge>
              </p>
              <p className="text-xs text-ink-4">
                {m.email}
                {m.title ? ` · ${m.title}` : ""} · invited {fmtDate(m.invited_at)}
                {m.accepted_at ? ` · joined ${fmtDate(m.accepted_at)}` : ""}
                {m.last_seen_at ? ` · seen ${fmtDate(m.last_seen_at)}` : ""}
                {m.user_id ? "" : " · no auth account yet"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <form action={setMemberStatusAction} className="flex items-center gap-2">
                <input type="hidden" name="member_id" value={m.id} />
                <select name="role" defaultValue={m.role} className={selectCls + " py-2"}>
                  <option value="owner">owner</option>
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                </select>
                <select name="status" defaultValue={m.status} className={selectCls + " py-2"}>
                  <option value="invited">invited</option>
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </select>
                <SubmitButton variant="secondary" pendingLabel="...">
                  Save
                </SubmitButton>
              </form>
              <form action={resendInviteAction}>
                <input type="hidden" name="member_id" value={m.id} />
                <SubmitButton variant="secondary" pendingLabel="Sending">
                  {m.status === "invited" ? "Resend invite" : "Send reset link"}
                </SubmitButton>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <details className="rounded-xl border border-line bg-bg-2 p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">Add a person</summary>
        <form action={addMemberAction} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="client_id" value={clientId} />
          <Field label="Email" required>
            <input name="email" type="email" required className={inputCls} />
          </Field>
          <Field label="Name">
            <input name="name" className={inputCls} />
          </Field>
          <Field label="Title">
            <input name="title" className={inputCls} />
          </Field>
          <Field label="Role">
            <select name="role" defaultValue="member" className={selectCls}>
              <option value="owner">owner</option>
              <option value="admin">admin</option>
              <option value="member">member</option>
            </select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <SubmitButton pendingLabel="Inviting">Invite</SubmitButton>
          </div>
        </form>
      </details>
    </div>
  );
}
