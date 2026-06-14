import { requireAdmin } from "@/lib/admin";
import { PageHeader, Panel, Notice, Badge } from "@/components/admin/ui";
import { PasswordField } from "@/components/admin/PasswordField";
import { updateProfileAction } from "./actions";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { kind: "ok" | "err"; text: string }> = {
  ok: { kind: "ok", text: "Profile saved." },
  short: { kind: "err", text: "New password must be at least 8 characters." },
  mismatch: { kind: "err", text: "The two passwords do not match." },
  config: { kind: "err", text: "Auth is not configured." },
  fail: { kind: "err", text: "Could not save. Please try again." },
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const { email, name, role } = await requireAdmin();
  const { ok, e } = await searchParams;
  const notice = ok ? NOTICES.ok : e ? (NOTICES[e] ?? { kind: "err" as const, text: "Could not save." }) : null;

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHeader title="Profile" subtitle="Manage your account" />

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <Panel title="Account">
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-ink-3">Email</dt>
            <dd className="text-ink">{email}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-ink-3">Role</dt>
            <dd>
              <Badge tone="gold">{role}</Badge>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-ink-4">
          Your email is your login. To change it, ask an owner or update it in Supabase Authentication.
        </p>
      </Panel>

      <Panel title="Edit profile">
        <form action={updateProfileAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm text-ink-2">
            Display name
            <input
              name="name"
              type="text"
              defaultValue={name ?? ""}
              placeholder="Your name"
              autoComplete="name"
              className="rounded-xl border border-line-strong bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-gold"
            />
          </label>

          <div className="mt-2 border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">Change password</p>
            <p className="mt-1 text-xs text-ink-4">Leave blank to keep your current password.</p>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm text-ink-2">
                New password
                <PasswordField name="password" placeholder="New password" autoComplete="new-password" minLength={8} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-ink-2">
                Confirm new password
                <PasswordField name="confirm" placeholder="Confirm new password" autoComplete="new-password" minLength={8} />
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="mt-1 self-start rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
          >
            Save changes
          </button>
        </form>
      </Panel>
    </div>
  );
}
