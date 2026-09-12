import Link from "next/link";
import { redirect } from "next/navigation";
import { portalGoogleAction, portalSignUpAction } from "../actions";
import { PasswordField } from "@/components/admin/PasswordField";
import { PortalForm } from "@/components/portal/PortalForm";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { getPortalSession } from "@/lib/portal-auth";
import { inputCls, Notice } from "@/components/portal/ui";
import { business } from "@/config/site";

export const dynamic = "force-dynamic";

const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "ttclid", "msclkid", "li_fat_id"] as const;

const ERRORS: Record<string, string> = {
  expired: "That confirmation link expired or was already used. If you already confirmed, sign in. Otherwise create the account again.",
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

/**
 * Self-serve sign-up. No card, no plan: the person becomes a lead who can
 * fill in their business profile, book a call, and pick a plan later. UTM
 * parameters on this page's URL ride along as hidden fields.
 */
export default async function PortalSignUp({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  const session = await getPortalSession();
  if (session) redirect("/");

  const e = params.e;

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink">Create your free account</h1>
      <p className="mt-2 text-sm text-ink-3">
        Tell us about your business, book a call, and pick a plan when you are ready. No card needed.
      </p>

      {e && ERRORS[e] && (
        <div className="mt-6">
          <Notice kind="err">{ERRORS[e]}</Notice>
        </div>
      )}

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

        <PortalForm action={portalSignUpAction} className="flex flex-col gap-3">
          {ATTRIBUTION_KEYS.map((k) => (params[k] ? <input key={k} type="hidden" name={k} value={params[k]} /> : null))}
          {/* Honeypot: hidden from people, filled by bots. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <input name="name" type="text" required placeholder="Your name" autoComplete="name" className={inputCls} />
          <input name="business_name" type="text" required placeholder="Business or startup name" autoComplete="organization" className={inputCls} />
          <input name="email" type="email" required placeholder="Work email" autoComplete="email" inputMode="email" className={inputCls} />
          <PasswordField name="password" placeholder="Password (8+ characters)" autoComplete="new-password" required minLength={8} />
          <label className="mt-1 flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-ink-3">
            <input type="checkbox" name="accept" required className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-gold)]" />
            <span>
              I agree to the{" "}
              <a href={`${business.url}/terms`} target="_blank" rel="noopener" className="text-ink underline-offset-2 hover:underline">
                Terms
              </a>{" "}
              and{" "}
              <a href={`${business.url}/privacy`} target="_blank" rel="noopener" className="text-ink underline-offset-2 hover:underline">
                Privacy Policy
              </a>
              .
            </span>
          </label>
          <SubmitButton className="mt-1 w-full" pendingLabel="Creating your account">
            Create account
          </SubmitButton>
        </PortalForm>
      </div>

      <div className="mt-6 flex flex-col gap-2 text-sm text-ink-3">
        <Link href="/login" className="transition-colors hover:text-ink">
          Already have an account? Sign in
        </Link>
        <a href={`mailto:${business.email}`} className="transition-colors hover:text-ink">
          Need help? {business.email}
        </a>
      </div>
    </>
  );
}
