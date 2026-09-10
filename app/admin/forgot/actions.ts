"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sends a password reset email. We always report success regardless of whether
 * the account exists, to avoid leaking which emails are registered. The reset
 * link is built by the Supabase "Reset password" template from RedirectTo, so
 * we pass this host's confirm route explicitly (the client portal passes its
 * own on the account subdomain).
 */
export async function sendResetAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email || !email.includes("@")) redirect("/admin/forgot?e=1");

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "www.tekmadev.com";
    const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${proto}://${host}/admin/reset/confirm` });
  }

  redirect("/admin/forgot?sent=1");
}
