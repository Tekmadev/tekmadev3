import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export type AdminRole = "owner" | "manager";

export type AdminContext = {
  user: User;
  email: string;
  name: string | null;
  role: AdminRole;
};

/**
 * Emails always allowed as OWNER, from the ADMIN_EMAILS env (comma-separated).
 * This is the bootstrap so the founder can never be locked out, even if the
 * admins table is empty or misconfigured.
 */
export function ownerEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Resolves the role for an email: env owners first, then the admins table.
 * Returns null when the email is not allowed into the dashboard at all.
 */
export async function resolveRole(email: string | null | undefined): Promise<AdminRole | null> {
  if (!email) return null;
  const e = email.toLowerCase();

  if (ownerEmails().includes(e)) return "owner";

  const db = getSupabaseAdmin();
  if (!db) return null; // no allowlist source available => deny

  const { data } = await db.from("admins").select("role").eq("email", e).maybeSingle();
  if (!data) return null;
  return data.role === "owner" ? "owner" : "manager";
}

export async function isAllowedAdmin(email: string | null | undefined): Promise<boolean> {
  return (await resolveRole(email)) !== null;
}

/**
 * Returns the signed-in admin (user + role), or redirects to the login page.
 * Use at the top of every protected server component / action. Defends in
 * depth: a valid Supabase session is not enough, the email must also resolve
 * to a role (env owner or admins-table row).
 */
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/login?e=config");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const role = await resolveRole(user.email);
  if (!role) redirect("/admin/login?e=denied");

  const name = (typeof user.user_metadata?.name === "string" && user.user_metadata.name) || null;
  return { user, email: (user.email || "").toLowerCase(), name, role };
}

/** Like requireAdmin, but only owners pass. Managers bounce back to the overview. */
export async function requireOwner(): Promise<AdminContext> {
  const ctx = await requireAdmin();
  if (ctx.role !== "owner") redirect("/admin?e=forbidden");
  return ctx;
}
