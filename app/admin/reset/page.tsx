import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PasswordField } from "@/components/admin/PasswordField";
import { updatePasswordAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  short: "New password must be at least 8 characters.",
  mismatch: "The two passwords do not match.",
  fail: "Could not update your password. Please request a new link.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;
  const error = e ? (ERRORS[e] ?? "Something went wrong.") : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  // Only reachable with a valid recovery session from the email link.
  if (!user) redirect("/admin/forgot?e=expired");

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-ink">Set a new password</h1>
        <p className="mt-2 text-sm text-ink-3">For {user.email}</p>

        <form action={updatePasswordAction} className="mt-8 flex flex-col gap-3">
          <PasswordField name="password" placeholder="New password" autoComplete="new-password" required minLength={8} />
          <PasswordField name="confirm" placeholder="Confirm new password" autoComplete="new-password" required minLength={8} />
          {error && <p className="text-sm text-signal">{error}</p>}
          <button
            type="submit"
            className="mt-1 rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
          >
            Update password
          </button>
        </form>
      </div>
    </main>
  );
}
