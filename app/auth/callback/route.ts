import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { activateMembershipsForUser } from "@/lib/clients-data";
import { ensureLeadAccount } from "@/lib/lead-accounts";
import { isAllowedAdmin } from "@/lib/admin";
import { isPortalHost } from "@/lib/portal-host";

/**
 * OAuth (Google) return leg. Supabase sends the browser here with a PKCE
 * `code`; we exchange it for a session on THIS host. Existing members go to
 * their dashboard; a Google account with no client yet gets a free lead
 * account (Google has verified the email), unless it is a staff login. The
 * URL must be in Supabase's Redirect URLs allowlist
 * (https://account.tekmadev.com/auth/callback and the localhost one).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const onPortal = isPortalHost(request.headers.get("host"));
  const fail = onPortal ? "/login?e=google" : "/admin/login?e=1";

  if (!code) {
    const reason = searchParams.get("error_description") || searchParams.get("error");
    if (reason) console.error("[auth/callback] provider error", reason);
    redirect(fail);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(fail);

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("[auth/callback] exchange failed", error?.message);
    redirect(fail);
  }

  if (!onPortal) redirect("/admin");

  const user = data.user;
  const name =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
    null;
  const memberships = await activateMembershipsForUser(user.id, user.email, name);
  if (memberships.length > 0) {
    const firstTime = memberships.some((m) => m.status === "invited");
    redirect(firstTime ? "/?welcome=1" : "/");
  }

  if (await isAllowedAdmin(user.email)) {
    await supabase.auth.signOut();
    redirect("/login?e=noaccount");
  }

  const created = await ensureLeadAccount(user);
  if (created.length === 0) {
    await supabase.auth.signOut();
    redirect(fail);
  }
  redirect("/?welcome=lead");
}
