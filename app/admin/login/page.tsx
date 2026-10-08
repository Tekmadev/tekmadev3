import Link from "next/link";
import { signInAction } from "@/app/admin/actions";
import { PAUSED_MESSAGE } from "@/lib/admin";
import { PasswordField } from "@/components/admin/PasswordField";
import { PendingSubmit } from "@/components/PendingSubmit";

const ERRORS: Record<string, string> = {
  "1": "Wrong email or password.",
  denied: "That account is not allowed here.",
  paused: PAUSED_MESSAGE,
  config: "Login is not configured yet.",
};

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;
  const error = e ? (ERRORS[e] ?? "Could not sign in.") : null;

  return (
    // dvh and safe-area padding: the home-screen app draws under the status bar.
    <main className="flex min-h-dvh items-center justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))]">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-ink">Tekmadev admin</h1>
        <p className="mt-2 text-sm text-ink-3">Sign in to your dashboard.</p>

        <form action={signInAction} className="mt-8 flex flex-col gap-3">
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
          <PasswordField name="password" placeholder="Password" autoComplete="current-password" required />
          {error && <p className="text-sm text-signal">{error}</p>}
          <PendingSubmit
            className="mt-1 min-h-11 rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
          >
            Sign in
          </PendingSubmit>
        </form>

        <Link
          href="/admin/forgot"
          className="mt-2 inline-flex min-h-11 items-center text-sm text-ink-3 transition-colors hover:text-ink"
        >
          Forgot password?
        </Link>
      </div>
    </main>
  );
}
