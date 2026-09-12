import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import type { EmailOtpType, SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPortalHost } from "@/lib/portal-host";
import { activateMembershipsForUser } from "@/lib/clients-data";
import { ensureLeadAccount } from "@/lib/lead-accounts";
import { isAllowedAdmin } from "@/lib/admin";

const TYPES: EmailOtpType[] = ["invite", "recovery", "magiclink", "email", "signup", "email_change"];
const SIGNUP_TYPES: EmailOtpType[] = ["signup", "email", "magiclink"];

/**
 * Landing point for Supabase auth email links (invite, password reset, and
 * sign-up confirmation). Two link shapes are accepted:
 *
 *   {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite|recovery|signup
 *     verified server-side with verifyOtp (works on any device), and
 *   {{ .ConfirmationURL }} style links, which Supabase verifies itself and
 *     then sends here with ?code=... (PKCE; same browser as the sign-up).
 *
 * Either way the session cookie lands on THIS host. On the portal subdomain
 * invites and resets go to the set-password screen; a confirmed sign-up gets
 * its free account created and lands on the dashboard. On the marketing host
 * it is the admin reset flow. Both https://account.tekmadev.com/auth/confirm
 * and the admin reset URL must be allowed under Auth, URL Configuration,
 * Redirect URLs.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = searchParams.get("type") as EmailOtpType | null;
  const onPortal = isPortalHost(request.headers.get("host"));

  const isSignup = Boolean(code) || (type !== null && SIGNUP_TYPES.includes(type));
  const fail = onPortal ? (isSignup ? "/signup?e=expired" : "/forgot?e=expired") : "/admin/forgot?e=expired";

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(fail);

  let user: User | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      console.error("[auth/confirm] code exchange failed", error?.message);
      redirect(fail);
    }
    user = data.user;
  } else {
    if (!tokenHash || !type || !TYPES.includes(type)) redirect(fail);
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      console.error("[auth/confirm] verifyOtp failed", error.message);
      redirect(fail);
    }
    user = data.user;
  }

  if (!onPortal) redirect(type === "recovery" ? "/admin/reset" : "/admin");

  if (type === "invite") redirect("/set-password?welcome=1");
  if (type === "recovery") redirect("/set-password");

  // Confirmed sign-up (or a magic link): open the account.
  if (!user) redirect(fail);
  await landOnPortal(supabase, user);
}

/** Existing members go home; anyone else (not staff) gets a free lead account. */
async function landOnPortal(supabase: SupabaseClient, user: User): Promise<never> {
  const name =
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
    null;
  const memberships = await activateMembershipsForUser(user.id, user.email, name);
  if (memberships.length > 0) redirect(memberships.some((m) => m.status === "invited") ? "/?welcome=1" : "/");

  if (await isAllowedAdmin(user.email)) {
    await supabase.auth.signOut();
    redirect("/login?e=noaccount");
  }

  const created = await ensureLeadAccount(user);
  if (created.length === 0) {
    await supabase.auth.signOut();
    redirect("/login?e=link");
  }
  redirect("/?welcome=lead");
}
