import type { ClientActivity } from "@/lib/clients-data";
import { Badge, Field, inputCls, selectCls, fmtDateTime } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { addNoteAction } from "@/app/admin/(dashboard)/clients/actions";

export function ActivityPanel({ activity, clientId }: { activity: ClientActivity[]; clientId: string }) {
  return (
    <div className="flex flex-col gap-5">
      <form action={addNoteAction} className="grid gap-3 rounded-xl border border-line bg-bg-2 p-4 sm:grid-cols-[10rem_1fr]">
        <input type="hidden" name="client_id" value={clientId} />
        <Field label="Type">
          <select name="kind" defaultValue="note" className={selectCls}>
            <option value="note">Internal note</option>
            <option value="update">Update to client</option>
          </select>
        </Field>
        <Field label="Subject (updates only)">
          <input name="subject" placeholder="Website draft is ready" className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Text" required>
            <textarea name="text" rows={2} required className={inputCls} />
          </Field>
        </div>
        <Field label="Link (updates only)">
          <input name="action_url" placeholder="/approvals" className={inputCls} />
        </Field>
        <div className="flex items-end">
          <SubmitButton pendingLabel="Saving">Post</SubmitButton>
        </div>
      </form>

      <ul className="divide-y divide-line">
        {activity.length === 0 && <li className="py-3 text-sm text-ink-4">No activity yet.</li>}
        {activity.map((a) => (
          <li key={a.id} className="flex gap-3 py-2.5">
            <span className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (a.visibility === "client" ? "bg-gold" : "bg-ink-5")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">{a.summary ?? a.event}</p>
              <p className="text-xs text-ink-4">
                {fmtDateTime(a.created_at)} · {a.actor_type}
                {a.actor_email ? ` (${a.actor_email})` : ""} · <span className="font-mono">{a.event}</span>
                {a.visibility === "client" && (
                  <span className="ml-2">
                    <Badge tone="gold">client sees</Badge>
                  </span>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
