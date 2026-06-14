"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sends a password reset email. We always report success regardless of whether
 * the account exists, to avoid leaking which emails are registered. The reset
 * link (and its token) is defined by the Supabase "Reset password" template,
 * which points at /admin/reset/confirm with a token_hash.
 */
export async function sendResetAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email || !email.includes("@")) redirect("/admin/forgot?e=1");

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.resetPasswordForEmail(email);
  }

  redirect("/admin/forgot?sent=1");
}
