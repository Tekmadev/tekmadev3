import { requireOwner } from "@/lib/admin";
import { listAdmins } from "@/lib/admin-users";
import { PageHeader, Panel, DataTable, Notice, Badge, fmtDateTime, txt } from "@/components/admin/ui";
import { PasswordField } from "@/components/admin/PasswordField";
import { addManagerAction, removeAdminAction } from "./actions";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  added: "Team member added. Share the temporary password so they can sign in and change it.",
  removed: "Team member removed.",
};

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  await requireOwner();
  const admins = await listAdmins();
  const { ok, e } = await searchParams;
  const notice = ok ? { kind: "ok" as const, text: OK[ok] ?? "Done." } : e ? { kind: "err" as const, text: e } : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Team" subtitle="People who can manage your business in this dashboard" />

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <Panel title="Add a team member">
        <p className="mb-4 text-sm text-ink-3">
          Create a login for someone who manages your business. They sign in with this email and the temporary
          password, then change it from their Profile page.
        </p>
        <form action={addManagerAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm text-ink-2">
            Name
            <input
              name="name"
              type="text"
              placeholder="Full name"
              autoComplete="off"
              className="rounded-xl border border-line-strong bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-ink-2">
            Email
            <input
              name="email"
              type="email"
              required
              placeholder="name@company.com"
              autoComplete="off"
              className="rounded-xl border border-line-strong bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-ink-2">
            Temporary password
            <PasswordField name="password" placeholder="At least 8 characters" autoComplete="new-password" required minLength={8} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-ink-2">
            Role
            <select
              name="role"
              defaultValue="manager"
              className="rounded-xl border border-line-strong bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-gold"
            >
              <option value="manager">Manager (view + own profile)</option>
              <option value="owner">Owner (full access, can manage team)</option>
            </select>
          </label>
          <button
            type="submit"
            className="self-start rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg transition-colors hover:bg-ink-2 sm:col-span-2"
          >
            Add team member
          </button>
        </form>
      </Panel>

      <Panel title="Current team">
        <DataTable
          head={["Name", "Email", "Role", "Last sign in", "Added", ""]}
          rows={admins.map((a) => [
            txt(a.name),
            a.email,
            <Badge key="r" tone={a.role === "owner" ? "gold" : "neutral"}>
              {a.role}
            </Badge>,
            a.lastSignInAt ? fmtDateTime(a.lastSignInAt) : "never",
            a.createdAt ? fmtDateTime(a.createdAt) : "-",
            a.source === "env" ? (
              <span className="text-xs text-ink-4">owner</span>
            ) : (
              <form action={removeAdminAction}>
                <input type="hidden" name="email" value={a.email} />
                <button
                  type="submit"
                  className="rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-3 transition-colors hover:border-signal hover:text-signal"
                >
                  Remove
                </button>
              </form>
            ),
          ])}
          empty="No team members yet."
        />
      </Panel>
    </div>
  );
}
