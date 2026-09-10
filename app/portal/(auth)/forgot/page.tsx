import Link from "next/link";
import { portalForgotAction } from "../actions";
import { PortalForm } from "@/components/portal/PortalForm";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { inputCls, Notice } from "@/components/portal/ui";

export const dynamic = "force-dynamic";

export default async function PortalForgot({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink">Reset your password</h1>
      <p className="mt-2 text-sm text-ink-3">
        Enter the email your invite was sent to. We will email you a link to set a new password.
      </p>

      {e === "expired" && (
        <div className="mt-6">
          <Notice kind="err">That link has expired or was already used. Request a new one below.</Notice>
        </div>
      )}

      <PortalForm action={portalForgotAction} className="mt-8 flex flex-col gap-3">
        <input name="email" type="email" required placeholder="Email" autoComplete="email" inputMode="email" className={inputCls} />
        <SubmitButton className="mt-1 w-full" pendingLabel="Sending">
          Send reset link
        </SubmitButton>
      </PortalForm>

      <Link href="/login" className="mt-6 inline-block text-sm text-ink-3 transition-colors hover:text-ink">
        Back to sign in
      </Link>
    </>
  );
}
