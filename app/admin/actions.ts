"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedAdmin } from "@/lib/admin";

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) redirect("/admin/login?e=1");

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/login?e=config");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect("/admin/login?e=1");

  // Even with valid credentials, only the owner or a team member gets in.
  if (!(await isAllowedAdmin(data.user.email))) {
    await supabase.auth.signOut();
    redirect("/admin/login?e=denied");
  }

  redirect("/admin");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/admin/login");
}
