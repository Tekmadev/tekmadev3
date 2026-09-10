import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireClient } from "@/lib/portal-auth";
import { listInAppNotifications } from "@/lib/clients-data";
import { PasswordField } from "@/components/admin/PasswordField";
import { Field, PageHeader, Panel, inputCls, fmtDateTime } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { PortalForm } from "@/components/portal/PortalForm";
import { changePasswordAction, markNotificationsReadAction, updateNotificationsAction, updateProfileAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { client, member, email } = await requireClient();
  const notifications = await listInAppNotifications(client.id, member.id, 30);
  const unread = notifications.filter((n) => !n.read_at).length;
  const emailOn = member.notifications?.email !== false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" subtitle={email} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Profile">
          <PortalForm action={updateProfileAction} className="flex flex-col gap-4">
            <Field label="Name" htmlFor="p-name">
              <input id="p-name" name="name" defaultValue={member.name ?? ""} autoComplete="name" className={inputCls} />
            </Field>
            <Field label="Title" htmlFor="p-title">
              <input id="p-title" name="title" defaultValue={member.title ?? ""} placeholder="Owner" className={inputCls} />
            </Field>
            <SubmitButton pendingLabel="Saving" className="w-full sm:w-auto">
              Save profile
            </SubmitButton>
          </PortalForm>
        </Panel>

        <Panel title="Password">
          <PortalForm action={changePasswordAction} className="flex flex-col gap-4">
            <PasswordField name="password" placeholder="New password" autoComplete="new-password" required minLength={8} />
            <PasswordField name="confirm" placeholder="Confirm new password" autoComplete="new-password" required minLength={8} />
            <SubmitButton variant="secondary" pendingLabel="Updating" className="w-full sm:w-auto">
              Update password
            </SubmitButton>
          </PortalForm>
        </Panel>
      </div>

      <Panel title="Email notifications" description="Reminders when something needs you, and updates when we hit a milestone.">
        <PortalForm action={updateNotificationsAction} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-2">
            <input type="checkbox" name="email" defaultChecked={emailOn} className="h-4 w-4 accent-[var(--color-gold)]" />
            Email me about tasks, approvals, and milestones
          </label>
          <SubmitButton variant="secondary" pendingLabel="Saving">
            Save
          </SubmitButton>
        </PortalForm>
      </Panel>

      <Panel
        id="notifications"
        title={`Updates${unread ? ` (${unread} new)` : ""}`}
        action={
          unread ? (
            <PortalForm action={markNotificationsReadAction}>
              <SubmitButton variant="secondary" pendingLabel="Saving">
                Mark all read
              </SubmitButton>
            </PortalForm>
          ) : undefined
        }
      >
        {notifications.length === 0 ? (
          <p className="text-sm text-ink-4">No updates yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {notifications.map((n) => (
              <li key={n.id} className="flex gap-3 py-3">
                <span className={"mt-2 h-2 w-2 shrink-0 rounded-full " + (n.read_at ? "bg-transparent" : "bg-gold")} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{n.subject}</p>
                  {n.body && <p className="mt-0.5 text-sm text-ink-3">{n.body}</p>}
                  <div className="mt-1 flex items-center gap-3 text-xs text-ink-4">
                    <span>{fmtDateTime(n.created_at)}</span>
                    {n.action_url && (
                      <Link href={n.action_url} className="inline-flex items-center gap-1 text-gold-deep hover:text-gold">
                        Open <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
