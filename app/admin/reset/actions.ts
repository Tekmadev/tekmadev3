"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sets a new password for the user in the current (recovery) session, created
 * by /admin/reset/confirm. Requires a valid session, so a stale or missing
 * recovery link cannot change anyone's password.
 */
export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (password.length < 8) redirect("/admin/reset?e=short");
  if (password !== confirm) redirect("/admin/reset?e=mismatch");

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/reset?e=fail");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/forgot?e=expired");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/admin/reset?e=fail");

  redirect("/admin");
}
