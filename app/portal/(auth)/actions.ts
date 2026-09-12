"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { activateMembershipsForUser } from "@/lib/clients-data";
import { ensureLeadAccount } from "@/lib/lead-accounts";
import { isAllowedAdmin } from "@/lib/admin";
import { portalUrl } from "@/lib/portal-host";
import type { ActionResult } from "@/components/portal/PortalForm";

const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "ttclid", "msclkid", "li_fat_id", "referrer", "landing_page"] as const;

function s(v: FormDataEntryValue | null, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

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
  if (error && /not confirmed/i.test(error.message)) {
    return { ok: false, message: "Confirm your email first: open the link we sent you, then sign in." };
  }
  if (error || !data.user) return { ok: false, message: "Wrong email or password." };

  // A first successful sign-in activates any invited membership. Someone with
  // a verified login but no client account gets a free lead account, unless
  // the login belongs to staff (admins use the admin app, not the portal).
  const metaName = typeof data.user.user_metadata?.name === "string" ? data.user.user_metadata.name : null;
  let memberships = await activateMembershipsForUser(data.user.id, data.user.email, metaName);
  if (memberships.length === 0) {
    if (await isAllowedAdmin(data.user.email)) {
      await supabase.auth.signOut();
      return { ok: false, message: "That is a Tekmadev staff login. Use the admin dashboard, or sign in with a client email." };
    }
    memberships = await ensureLeadAccount(data.user);
    if (memberships.length === 0) {
      await supabase.auth.signOut();
      return { ok: false, message: "We could not open an account for that login. Email us and we will sort it out." };
    }
    return { ok: true, redirect: "/?welcome=lead" };
  }

  return { ok: true, redirect: "/" };
}

/**
 * Self-serve sign-up. Supabase sends the confirmation email; the account
 * (client + owner membership) is only created once the email is verified,
 * in /auth/confirm, so nobody can pre-register someone else's address.
 */
export async function portalSignUpAction(formData: FormData): Promise<ActionResult> {
  // Honeypot: real people never fill a hidden field.
  if (s(formData.get("website"))) return { ok: true, message: "Check your inbox to confirm your email." };

  const name = s(formData.get("name"), 120);
  const businessName = s(formData.get("business_name"), 200);
  const email = s(formData.get("email"), 200).toLowerCase();
  const password = String(formData.get("password") || "");
  const accepted = formData.get("accept") === "on";

  if (!name) return { ok: false, message: "Tell us your name." };
  if (!businessName) return { ok: false, message: "Tell us your business or startup name. A working name is fine." };
  if (!email.includes("@")) return { ok: false, message: "Enter a valid email address." };
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (!accepted) return { ok: false, message: "Please accept the Terms and Privacy Policy to continue." };

  const attribution: Record<string, string> = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = s(formData.get(k), 480);
    if (v) attribution[k] = v;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Sign-up is not configured yet." };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: portalUrl("/auth/confirm"),
      data: { name, business_name: businessName, attribution, terms_accepted_at: new Date().toISOString() },
    },
  });

  if (error) {
    console.error("[portal signup]", error.message);
    if (/rate limit|too many/i.test(error.message)) return { ok: false, message: "Too many sign-ups from this network. Try again in a few minutes." };
    if (/already|exists|registered/i.test(error.message)) return { ok: false, message: "An account with that email already exists. Sign in instead, or reset your password." };
    if (/sending confirmation email/i.test(error.message)) return { ok: false, message: "We could not send the confirmation email to that address. Check it and try again, or use Google." };
    return { ok: false, message: "Could not create your account. Try again, or use Google." };
  }

  // Confirmations off: the session is live, open the account now.
  if (data.session && data.user) {
    await ensureLeadAccount(data.user);
    return { ok: true, redirect: "/?welcome=lead" };
  }

  // Supabase answers an already-registered email with an empty identities list.
  if (data.user && data.user.identities?.length === 0) {
    return { ok: false, message: "An account with that email already exists. Sign in instead, or reset your password." };
  }

  return {
    ok: true,
    message: `Almost there. We sent a confirmation link to ${email}. Open it to finish creating your account. Check spam if it is not there in a minute.`,
  };
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
