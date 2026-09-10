import Link from "next/link";
import { redirect } from "next/navigation";
import { portalGoogleAction, portalSignInAction, portalSignOutAction } from "../actions";
import { PasswordField } from "@/components/admin/PasswordField";
import { PortalForm } from "@/components/portal/PortalForm";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { getPortalSession } from "@/lib/portal-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inputCls, Notice } from "@/components/portal/ui";
import { business } from "@/config/site";

export const dynamic = "force-dynamic";

// Errors that arrive by URL from the OAuth callback (route handlers redirect).
const ERRORS: Record<string, string> = {
  google: "Google sign-in did not complete. Try again, or use your email and password.",
  noaccount: "That Google account is not attached to a client account. Sign in with the email your invite was sent to, or contact us.",
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8C43.8 38 46.5 31.8 46.5 24.5z" />
      <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export default async function PortalLogin({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;

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

      {e && ERRORS[e] && (
        <div className="mt-6">
          <Notice kind="err">{ERRORS[e]}</Notice>
        </div>
      )}

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
        <div className="mt-8 flex flex-col gap-4">
          <PortalForm action={portalGoogleAction}>
            <SubmitButton variant="secondary" className="w-full" pendingLabel="Opening Google">
              <GoogleMark />
              Continue with Google
            </SubmitButton>
          </PortalForm>

          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-ink-4">
            <span className="h-px flex-1 bg-line-strong" />
            or
            <span className="h-px flex-1 bg-line-strong" />
          </div>

          <PortalForm action={portalSignInAction} className="flex flex-col gap-3">
            <input name="email" type="email" required placeholder="Email" autoComplete="email" inputMode="email" className={inputCls} />
            <PasswordField name="password" placeholder="Password" autoComplete="current-password" required />
            <SubmitButton className="mt-1 w-full" pendingLabel="Signing in">
              Sign in
            </SubmitButton>
          </PortalForm>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 text-sm text-ink-3">
        <Link href="/forgot" className="transition-colors hover:text-ink">
          Forgot password, or never set one?
        </Link>
        <a href={`mailto:${business.email}`} className="transition-colors hover:text-ink">
          Need help? {business.email}
        </a>
      </div>
      <p className="mt-4 text-xs text-ink-4">
        Google works with the same email your invite was sent to. Any other Google account will be turned away.
      </p>
    </>
  );
}
