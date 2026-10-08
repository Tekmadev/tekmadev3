"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PAUSED, resolveRole } from "@/lib/admin";
import { can } from "@/lib/admin-api/permissions";

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) redirect("/admin/login?e=1");

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/login?e=config");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect("/admin/login?e=1");

  // Even with valid credentials, only a team member (owner, manager or staff)
  // gets in; a client portal login is signed straight back out, and so is a
  // member whose access is paused (with its own message). What each role may
  // then open is decided page by page (lib/admin.ts requireAdminCapability).
  const role = await resolveRole(data.user.email);
  if (!role || role === PAUSED) {
    await supabase.auth.signOut();
    redirect(role === PAUSED ? "/admin/login?e=paused" : "/admin/login?e=denied");
  }

  // Staff land on Leads, where their day starts; owners and managers (who see
  // the team's activity) keep Overview.
  redirect(can(role, "team.activity") ? "/admin" : "/admin/leads");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/admin/login");
}
