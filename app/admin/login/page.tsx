import Link from "next/link";
import { signInAction } from "@/app/admin/actions";
import { PasswordField } from "@/components/admin/PasswordField";

const ERRORS: Record<string, string> = {
  "1": "Wrong email or password.",
  denied: "That account is not allowed here.",
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
    <main className="flex min-h-screen items-center justify-center px-5">
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
            className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-gold"
          />
          <PasswordField name="password" placeholder="Password" autoComplete="current-password" required />
          {error && <p className="text-sm text-signal">{error}</p>}
          <button
            type="submit"
            className="mt-1 rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
          >
            Sign in
          </button>
        </form>

        <Link
          href="/admin/forgot"
          className="mt-4 inline-block text-sm text-ink-3 transition-colors hover:text-ink"
        >
          Forgot password?
        </Link>
      </div>
    </main>
  );
}
