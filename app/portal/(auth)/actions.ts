"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { db, getMembershipsForUser, logActivity } from "@/lib/clients-data";
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
  const memberships = await getMembershipsForUser(data.user.id, data.user.email);
  if (memberships.length === 0) {
    await supabase.auth.signOut();
    return {
      ok: false,
      message: "That login exists but is not attached to a client account. Use the email your invite was sent to, or contact us.",
    };
  }

  return { ok: true, redirect: "/" };
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

  // Activate every membership for this person and remember their name.
  const memberships = await getMembershipsForUser(user.id, user.email);
  const now = new Date().toISOString();
  for (const m of memberships) {
    const patch: Record<string, unknown> = {};
    if (m.status === "invited") {
      patch.status = "active";
      patch.accepted_at = now;
    }
    if (name && !m.name) patch.name = name;
    if (Object.keys(patch).length) await db().from("client_members").update(patch).eq("id", m.id);
    if (m.status === "invited") {
      await logActivity({
        client_id: m.client_id,
        actor_type: "client",
        actor_email: user.email,
        event: "member.activated",
        entity_type: "member",
        entity_id: m.id,
        summary: `${name || user.email} joined the portal`,
        visibility: "client",
      });
    }
  }

  return { ok: true, redirect: welcome ? "/?welcome=1" : "/" };
}
