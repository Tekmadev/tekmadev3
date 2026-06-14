import Link from "next/link";
import { sendResetAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; e?: string }>;
}) {
  const { sent, e } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
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
              className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-gold"
            />
            {e && <p className="text-sm text-signal">Enter a valid email address.</p>}
            <button
              type="submit"
              className="mt-1 rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
            >
              Send reset link
            </button>
          </form>
        )}

        <Link
          href="/admin/login"
          className="mt-4 inline-block text-sm text-ink-3 transition-colors hover:text-ink"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
