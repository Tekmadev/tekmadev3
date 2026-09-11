"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { activateMembershipsForUser } from "@/lib/clients-data";
import { portalUrl } from "@/lib/portal-host";
import type { ActionResult } from "@/components/portal/PortalForm";

/**
 * Auth actions for the portal. They return results instead of redirecting;
 * <PortalForm> performs the navigation. See PortalForm for why.
 */

export async function portalSignInAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { ok: false, message: "Enter your email and password." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Login is not configured yet." };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, message: "Wrong email or password." };

  // Valid credentials are not enough: the account must belong to a client.
  // A first successful sign-in also activates any invited membership.
  const metaName = typeof data.user.user_metadata?.name === "string" ? data.user.user_metadata.name : null;
  const memberships = await activateMembershipsForUser(data.user.id, data.user.email, metaName);
  if (memberships.length === 0) {
    await supabase.auth.signOut();
    return {
      ok: false,
      message: "That login exists but is not attached to a client account. Use the email your invite was sent to, or contact us.",
    };
  }

  return { ok: true, redirect: "/" };
}

/**
 * Starts Google sign-in. Supabase (PKCE) sends the person to Google and back
 * to /auth/callback on this host, which exchanges the code for a session and
 * applies the same membership gate as password login.
 */
export async function portalGoogleAction(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Login is not configured yet." };

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: portalUrl("/auth/callback"),
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) return { ok: false, message: "Could not start Google sign-in. Try again or use your email and password." };
  return { ok: true, redirect: data.url };
}

export async function portalSignOutAction(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  return { ok: true, redirect: "/login" };
}

/** Always reports success so we never reveal which emails have accounts. */
export async function portalForgotAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") || "").trim();
  if (!email || !email.includes("@")) return { ok: false, message: "Enter a valid email address." };

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: portalUrl("/auth/confirm") });
  }
  return { ok: true, message: "If an account exists for that email, a link is on its way. Check your inbox and spam folder." };
}

/**
 * Sets the password for the signed-in user (from an invite or reset link),
 * activates their memberships, and drops them on the dashboard.
 */
export async function setPasswordAction(formData: FormData): Promise<ActionResult> {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const welcome = formData.get("welcome") === "1";

  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (password !== confirm) return { ok: false, message: "The two passwords do not match." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Login is not configured yet." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, redirect: "/forgot?e=expired" };

  const { error } = await supabase.auth.updateUser({
    password,
    ...(name ? { data: { name } } : {}),
  });
  if (error) return { ok: false, message: "Could not save your password. Request a new link and try again." };

  await activateMembershipsForUser(user.id, user.email, name || null);

  return { ok: true, redirect: welcome ? "/?welcome=1" : "/" };
}
