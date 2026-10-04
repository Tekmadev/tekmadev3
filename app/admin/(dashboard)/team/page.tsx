import Link from "next/link";
import { Lock, Trophy } from "lucide-react";
import { adminCan, requireAdminCapability, type AdminContext, type AdminRole } from "@/lib/admin";
import { grantableRoles, listAdmins, type AdminUser } from "@/lib/admin-users";
import { readCommissionSplitStrict, type CommissionSplit } from "@/lib/site-settings";
import { PageHeader, Panel, DataTable, Notice, Badge, fmtDateTime, txt } from "@/components/admin/ui";
import { PasswordField } from "@/components/admin/PasswordField";
import { HoldSubmit } from "@/components/admin/HoldSubmit";
import { CommissionSplitForm } from "@/components/admin/CommissionSplitForm";
import { addManagerAction, changeRoleAction, removeAdminAction, saveCommissionSplitAction, setPausedAction } from "./actions";
import { PendingSubmit } from "@/components/PendingSubmit";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  added: "Team member added. Share the temporary password so they can sign in and change it.",
  removed: "Team member removed.",
  role: "Role changed. It applies from their next page or app screen.",
  paused: "Access paused. They cannot use the web admin or the app, and get no pushes, until someone resumes them.",
  resumed: "Access resumed. They can sign in again, with everything as they left it.",
  split: "Commission split saved. It applies to clients created from now on.",
  same: "Nothing changed.",
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

const smallBtn =
  "inline-flex min-h-9 items-center rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-3 transition-colors hover:border-gold hover:text-ink";
const smallSelect =
  "min-h-9 appearance-none rounded-full border border-line-strong bg-bg py-1.5 pl-3 pr-7 text-xs text-ink outline-none transition-colors focus:border-gold";

/**
 * What the signed-in person may do to one member, by the same rules the
 * server actions run (lib/admin-users.ts updateTeamAccess, removeAdmin):
 * env owners are locked, nobody acts on themselves, and a person without
 * `team.owners` (a manager) never touches an owner.
 */
function allowedOn(ctx: AdminContext, member: AdminUser) {
  const locked = member.source === "env";
  const self = member.email === ctx.email;
  const reachable = !locked && !self && (member.role !== "owner" || adminCan(ctx, "team.owners"));
  return {
    locked,
    self,
    role: reachable && adminCan(ctx, "team.role"),
    pause: reachable && adminCan(ctx, "team.pause"),
    remove: !locked && !self && adminCan(ctx, "team.remove"),
  };
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const ctx = await requireAdminCapability("team.view");
  const canAdd = adminCan(ctx, "team.write");
  // Managers add managers and staff; only an owner may make an owner.
  const roles: AdminRole[] = grantableRoles(ctx.role);
  // The same list decides what a role can be changed to.
  const changeTo: AdminRole[] = adminCan(ctx, "team.owners") ? ["owner", "manager", "staff"] : ["manager", "staff"];
  const seesSplit = adminCan(ctx, "clients.credits.view");
  const editsSplit = adminCan(ctx, "commission.settings");

  const [admins, split] = await Promise.all([
    listAdmins(),
    seesSplit ? readCommissionSplitStrict().catch((): CommissionSplit | null => null) : Promise.resolve(null),
  ]);
  const nameOf = new Map(admins.map((a) => [a.email, a.name]));
  const { ok, e } = await searchParams;
  const notice = ok ? { kind: "ok" as const, text: OK[ok] ?? "Done." } : e ? { kind: "err" as const, text: e } : null;
  const pausedCount = admins.filter((a) => a.paused).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Team" subtitle="People who can manage your business in this dashboard">
        {adminCan(ctx, "team.activity") && (
          <Link href="/admin/activity" className={smallBtn + " gap-1.5 px-4 py-2 text-sm"}>
            <Trophy className="h-4 w-4 text-gold" aria-hidden />
            Team activity
          </Link>
        )}
      </PageHeader>

      {notice && (
        <div role="status" aria-live="polite">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

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

      <Panel title={pausedCount > 0 ? `Current team (${pausedCount} paused)` : "Current team"}>
        <DataTable
          head={["Name", "Email", "Role", "Last sign in", "Added", ""]}
          rows={admins.map((a) => {
            const may = allowedOn(ctx, a);
            const who = a.name || a.email;
            return [
              txt(a.name),
              a.email,
              <span key="r" className="flex flex-col items-start gap-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={ROLE_COPY[a.role].tone}>{ROLE_COPY[a.role].label}</Badge>
                  {a.paused && <Badge tone="neutral">Paused</Badge>}
                </span>
                {a.paused && (
                  <span className="text-xs text-ink-4">
                    {a.pausedAt ? fmtDateTime(a.pausedAt) : "Paused"}
                    {a.pausedBy ? ` by ${nameOf.get(a.pausedBy) || a.pausedBy}` : ""}
                  </span>
                )}
              </span>,
              a.lastSignInAt ? fmtDateTime(a.lastSignInAt) : "never",
              a.createdAt ? fmtDateTime(a.createdAt) : "-",
              may.locked ? (
                // Owners named in ADMIN_EMAILS can never be re-roled, paused or removed, by anyone.
                <span
                  key="x"
                  className="inline-flex items-center gap-1.5 text-xs text-ink-4"
                  title="Locked: nobody can change this owner's role, pause or remove them"
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                  Locked
                </span>
              ) : may.self ? (
                <span key="x" className="text-xs text-ink-4">
                  You
                </span>
              ) : (
                <div key="x" className="flex flex-wrap items-center gap-2">
                  {may.role && (
                    <form action={changeRoleAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="email" value={a.email} />
                      <label className="sr-only" htmlFor={`role-${a.email}`}>
                        Role for {who}
                      </label>
                      <select id={`role-${a.email}`} name="role" defaultValue={a.role} className={smallSelect}>
                        {changeTo.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_COPY[r].label}
                          </option>
                        ))}
                      </select>
                      <PendingSubmit pendingLabel="Saving" className={smallBtn} aria-label={`Change role for ${who}`}>
                        Change
                      </PendingSubmit>
                    </form>
                  )}
                  {may.pause &&
                    (a.paused ? (
                      <form action={setPausedAction}>
                        <input type="hidden" name="email" value={a.email} />
                        <input type="hidden" name="paused" value="false" />
                        <PendingSubmit pendingLabel="Resuming" className={smallBtn} aria-label={`Resume access for ${who}`}>
                          Resume
                        </PendingSubmit>
                      </form>
                    ) : (
                      <form action={setPausedAction}>
                        <input type="hidden" name="email" value={a.email} />
                        <input type="hidden" name="paused" value="true" />
                        <HoldSubmit label="Hold to pause" pendingLabel="Pausing" accessibleLabel={`Pause access for ${who}`} />
                      </form>
                    ))}
                  {may.remove && (
                    <form action={removeAdminAction}>
                      <input type="hidden" name="email" value={a.email} />
                      <PendingSubmit
                        aria-label={`Remove ${who}`}
                        className="inline-flex min-h-9 items-center rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-3 transition-colors hover:border-signal hover:text-signal"
                      >
                        Remove
                      </PendingSubmit>
                    </form>
                  )}
                </div>
              ),
            ];
          })}
          empty="No team members yet."
        />
        {adminCan(ctx, "team.pause") && (
          <p className="mt-4 text-xs text-ink-4">
            A paused person cannot sign in to the web admin or the app and gets no pushes. Nothing is deleted: Resume
            restores everything.
          </p>
        )}
      </Panel>

      {seesSplit && (
        <div id="commission" className="scroll-mt-24">
          <Panel title="Commission split">
            <p className="mb-4 text-sm text-ink-3">
              How credit is shared when a client is created from a lead: the person who found the lead and the person
              who booked the call. The same person in both roles gets 100. Changes apply to clients created from now on;
              existing credits never change.{editsSplit ? "" : " Only an owner can change it."}
            </p>
            {split ? (
              <CommissionSplitForm finder={split.finder} booker={split.booker} canEdit={editsSplit} action={saveCommissionSplitAction} />
            ) : (
              <Notice kind="err">Could not read the split just now. Reload to try again.</Notice>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
