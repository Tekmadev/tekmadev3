import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPortalHost } from "@/lib/portal-host";

const TYPES: EmailOtpType[] = ["invite", "recovery", "magiclink", "email", "signup", "email_change"];

/**
 * Landing point for Supabase auth email links (invite, password reset). The
 * email templates link here with a token_hash; we verify it server-side, which
 * sets the session cookie on THIS host, then send the person to the right
 * page. On the portal subdomain that is the set-password screen; on the
 * marketing host it is the admin reset flow.
 *
 * Supabase templates should use:
 *   {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite      (Invite)
 *   {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery    (Reset)
 * with both https://account.tekmadev.com/auth/confirm and the admin reset
 * URL allowed under Auth, URL Configuration, Redirect URLs.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const onPortal = isPortalHost(request.headers.get("host"));
  const fail = onPortal ? "/forgot?e=expired" : "/admin/forgot?e=expired";

  if (!tokenHash || !type || !TYPES.includes(type)) redirect(fail);

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(fail);

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    console.error("[auth/confirm] verifyOtp failed", error.message);
    redirect(fail);
  }

  if (onPortal) {
    if (type === "invite") redirect("/set-password?welcome=1");
    if (type === "recovery") redirect("/set-password");
    redirect("/");
  }

  redirect(type === "recovery" ? "/admin/reset" : "/admin");
}
