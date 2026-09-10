import { redirect } from "next/navigation";
import { setPasswordAction } from "../actions";
import { PasswordField } from "@/components/admin/PasswordField";
import { PortalForm } from "@/components/portal/PortalForm";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inputCls } from "@/components/portal/ui";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  // Only reachable with a session from the invite or reset link.
  if (!user) redirect("/forgot?e=expired");

  const isWelcome = welcome === "1";
  const currentName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "";

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink">{isWelcome ? "Welcome. Set your password." : "Set a new password"}</h1>
      <p className="mt-2 text-sm text-ink-3">For {user.email}</p>

      <PortalForm action={setPasswordAction} className="mt-8 flex flex-col gap-3">
        <input type="hidden" name="welcome" value={isWelcome ? "1" : "0"} />
        {isWelcome && (
          <input name="name" type="text" placeholder="Your name" autoComplete="name" defaultValue={currentName} className={inputCls} />
        )}
        <PasswordField name="password" placeholder="New password" autoComplete="new-password" required minLength={8} />
        <PasswordField name="confirm" placeholder="Confirm new password" autoComplete="new-password" required minLength={8} />
        <SubmitButton className="mt-1 w-full" pendingLabel="Saving">
          {isWelcome ? "Save and start onboarding" : "Update password"}
        </SubmitButton>
      </PortalForm>
    </>
  );
}
