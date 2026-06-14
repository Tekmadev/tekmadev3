import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Emails allowed into /admin, from the ADMIN_EMAILS env (comma-separated). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = adminEmails();
  if (allow.length === 0) return false; // no allowlist set => deny everyone
  return allow.includes(email.toLowerCase());
}

/**
 * Returns the signed-in admin, or redirects to the login page. Use at the top of
 * every protected server component. Defends in depth: a valid Supabase session
 * is not enough, the email must also be on the allowlist.
 */
export async function requireAdmin(): Promise<User> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/login?e=config");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) redirect("/admin/login");
  return user;
}
