import { Lock } from "lucide-react";
import { adminCan, requireAdminCapability, type AdminRole } from "@/lib/admin";
import { grantableRoles, listAdmins } from "@/lib/admin-users";
import { PageHeader, Panel, DataTable, Notice, Badge, fmtDateTime, txt } from "@/components/admin/ui";
import { PasswordField } from "@/components/admin/PasswordField";
import { addManagerAction, removeAdminAction } from "./actions";
import { PendingSubmit } from "@/components/PendingSubmit";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  added: "Team member added. Share the temporary password so they can sign in and change it.",
  removed: "Team member removed.",
};

/** The same labels, badge tones and help lines as the Android app's Team screen. */
const ROLE_COPY: Record<AdminRole, { label: string; tone: "gold" | "neutral" | "muted"; help: string }> = {
  owner: { label: "Owner", tone: "gold", help: "Full access, can manage the team." },
  manager: { label: "Manager", tone: "neutral", help: "Everything except removing team members or making owners." },
  staff: {
    label: "Staff",
    tone: "muted",
    help: "Leads and outreach, analytics and onboarding help. Marketing, pricing and coupons are view only. No money.",
  },
};

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const ctx = await requireAdminCapability("team.view");
  const canAdd = adminCan(ctx, "team.write");
  const canRemove = adminCan(ctx, "team.remove");
  // Managers add managers and staff; only an owner may make an owner.
  const roles: AdminRole[] = grantableRoles(ctx.role);

  const admins = await listAdmins();
  const { ok, e } = await searchParams;
  const notice = ok ? { kind: "ok" as const, text: OK[ok] ?? "Done." } : e ? { kind: "err" as const, text: e } : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Team" subtitle="People who can manage your business in this dashboard" />

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {canAdd && (
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
            <label className="flex flex-col gap-1.5 text-sm text-ink-2 sm:col-span-2">
              Temporary password
              <PasswordField name="password" placeholder="At least 8 characters" autoComplete="new-password" required minLength={8} />
            </label>
            <fieldset className="flex flex-col gap-2 sm:col-span-2">
              <legend className="mb-1.5 text-sm text-ink-2">Role</legend>
              <div className={"grid grid-cols-1 gap-2 " + (roles.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                {roles.map((r) => (
                  <label
                    key={r}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-strong bg-bg px-4 py-3 transition-colors has-[:checked]:border-gold has-[:checked]:bg-gold/[0.06] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold"
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r}
                      defaultChecked={r === "staff"}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-gold)]"
                    />
                    <span className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-ink">{ROLE_COPY[r].label}</span>
                      <span className="text-xs leading-relaxed text-ink-3">{ROLE_COPY[r].help}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <PendingSubmit
              className="self-start rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg transition-colors hover:bg-ink-2 sm:col-span-2"
            >
              Add team member
            </PendingSubmit>
          </form>
        </Panel>
      )}

      <Panel title="Current team">
        <DataTable
          head={["Name", "Email", "Role", "Last sign in", "Added", ""]}
          rows={admins.map((a) => [
            txt(a.name),
            a.email,
            <Badge key="r" tone={ROLE_COPY[a.role].tone}>
              {ROLE_COPY[a.role].label}
            </Badge>,
            a.lastSignInAt ? fmtDateTime(a.lastSignInAt) : "never",
            a.createdAt ? fmtDateTime(a.createdAt) : "-",
            a.source === "env" ? (
              // Owners named in ADMIN_EMAILS can never be removed, by anyone.
              <span key="x" className="inline-flex items-center gap-1.5 text-xs text-ink-4" title="Locked: this owner cannot be removed">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Locked
              </span>
            ) : a.email === ctx.email ? (
              <span key="x" className="text-xs text-ink-4">
                You
              </span>
            ) : canRemove ? (
              <form key="x" action={removeAdminAction}>
                <input type="hidden" name="email" value={a.email} />
                <PendingSubmit
                  className="rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-3 transition-colors hover:border-signal hover:text-signal"
                >
                  Remove
                </PendingSubmit>
              </form>
            ) : (
              ""
            ),
          ])}
          empty="No team members yet."
        />
      </Panel>
    </div>
  );
}
