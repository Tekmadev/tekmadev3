import Link from "next/link";
import { redirect } from "next/navigation";
import { portalSignInAction, portalSignOutAction } from "../actions";
import { PasswordField } from "@/components/admin/PasswordField";
import { PortalForm } from "@/components/portal/PortalForm";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { getPortalSession } from "@/lib/portal-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inputCls, Notice } from "@/components/portal/ui";
import { business } from "@/config/site";

export const dynamic = "force-dynamic";

export default async function PortalLogin() {
  // Already signed in with a client account: straight to the dashboard.
  const session = await getPortalSession();
  if (session) redirect("/");

  // Signed in (e.g. as an admin) but with no client membership: offer sign out.
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink">Sign in</h1>
      <p className="mt-2 text-sm text-ink-3">Your onboarding, approvals, booked calls, and billing in one place.</p>

      {user ? (
        <div className="mt-8 flex flex-col gap-4">
          <Notice kind="info">
            You are signed in as <span className="font-medium text-ink">{user.email}</span>, but that login has no client
            account. Sign out and use the email your invite was sent to.
          </Notice>
          <PortalForm action={portalSignOutAction}>
            <SubmitButton variant="secondary" className="w-full" pendingLabel="Signing out">
              Sign out
            </SubmitButton>
          </PortalForm>
        </div>
      ) : (
        <PortalForm action={portalSignInAction} className="mt-8 flex flex-col gap-3">
          <input name="email" type="email" required placeholder="Email" autoComplete="email" inputMode="email" className={inputCls} />
          <PasswordField name="password" placeholder="Password" autoComplete="current-password" required />
          <SubmitButton className="mt-1 w-full" pendingLabel="Signing in">
            Sign in
          </SubmitButton>
        </PortalForm>
      )}

      <div className="mt-6 flex flex-col gap-2 text-sm text-ink-3">
        <Link href="/forgot" className="transition-colors hover:text-ink">
          Forgot password, or never set one?
        </Link>
        <a href={`mailto:${business.email}`} className="transition-colors hover:text-ink">
          Need help? {business.email}
        </a>
      </div>
    </>
  );
}
