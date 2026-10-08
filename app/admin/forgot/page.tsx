import Link from "next/link";
import { sendResetAction } from "./actions";
import { PendingSubmit } from "@/components/PendingSubmit";

export const dynamic = "force-dynamic";

export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; e?: string }>;
}) {
  const { sent, e } = await searchParams;
  // The reset page sends an expired or used link back here with e=expired.
  const error = e === "expired" ? "That reset link has expired. Send a new one." : e ? "Enter a valid email address." : null;

  return (
    // dvh and safe-area padding: the home-screen app draws under the status bar.
    <main className="flex min-h-dvh items-center justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))]">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-ink">Reset your password</h1>
        <p className="mt-2 text-sm text-ink-3">Enter your email and we will send you a reset link.</p>

        {sent ? (
          <div className="mt-8 rounded-xl border border-gold/40 bg-gold/[0.08] px-4 py-3 text-sm text-ink">
            If an account exists for that email, a reset link is on its way. Check your inbox.
          </div>
        ) : (
          <form action={sendResetAction} className="mt-8 flex flex-col gap-3">
            <input
              name="email"
              type="email"
              required
              placeholder="Email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold lg:text-sm"
            />
            {error && <p className="text-sm text-signal">{error}</p>}
            <PendingSubmit
              className="mt-1 min-h-11 rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
            >
              Send reset link
            </PendingSubmit>
          </form>
        )}

        <Link
          href="/admin/login"
          className="mt-2 inline-flex min-h-11 items-center text-sm text-ink-3 transition-colors hover:text-ink"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
