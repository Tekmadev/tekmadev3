"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncAdminRowName } from "@/lib/admin-profile";

/**
 * Updates the signed-in admin's own display name and (optionally) password.
 * Password change is skipped unless both fields are filled and match.
 */
export async function updateProfileAction(formData: FormData) {
  const { email } = await requireAdmin();

  const name = String(formData.get("name") || "").trim();
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/profile?e=config");

  const updates: { data?: { name: string | null }; password?: string } = {
    data: { name: name || null },
  };

  if (password || confirm) {
    if (password.length < 8) redirect("/admin/profile?e=short");
    if (password !== confirm) redirect("/admin/profile?e=mismatch");
    updates.password = password;
  }

  const { error } = await supabase.auth.updateUser(updates);
  if (error) redirect("/admin/profile?e=fail");

  // Keep the admins-table name in sync for managers (no-op for the env owner).
  await syncAdminRowName(email, name || null);

  revalidatePath("/admin/profile");
  redirect("/admin/profile?ok=1");
}
