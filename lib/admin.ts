import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ADMIN_CATEGORIES } from "@/lib/admin-notify";
import type { Viewer } from "@/lib/admin-notifications-data";
import { can, capabilitiesFor, inboxCategories, readsOwnerAudience, type Capability } from "@/lib/admin-api/permissions";

/**
 * Every staff role, widest first. What each one may do lives in ONE table,
 * lib/admin-api/permissions.ts: the web admin (cookie sessions, below) and the
 * admin API for the Android app (bearer tokens) both read it, so a role can
 * never do more on one than on the other.
 *
 * Owner: everything. Manager: everything except removing team members and
 * creating or promoting owners. Staff: leads and outreach, analytics and
 * onboarding help; marketing, pricing and coupons view only; never money.
 */
export type AdminRole = "owner" | "manager" | "staff";

export type { Capability };

export type AdminContext = {
  user: User;
  email: string;
  name: string | null;
  role: AdminRole;
};

/**
 * Emails always allowed as OWNER, from the ADMIN_EMAILS env (comma-separated).
 * This is the bootstrap so the founder can never be locked out, even if the
 * admins table is empty or misconfigured. Nobody can remove them.
 */
export function ownerEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Resolves the role for an email: env owners first, then the admins table.
 * Returns null when the email is not allowed into the dashboard at all (a
 * client portal login, for one).
 */
export async function resolveRole(email: string | null | undefined): Promise<AdminRole | null> {
  if (!email) return null;
  const e = email.toLowerCase();

  if (ownerEmails().includes(e)) return "owner";

  const db = getSupabaseAdmin();
  if (!db) return null; // no allowlist source available => deny

  const { data } = await db.from("admins").select("role").eq("email", e).maybeSingle();
  if (!data) return null;
  if (data.role === "owner") return "owner";
  if (data.role === "staff") return "staff";
  return "manager";
}

/**
 * Whether this email is on the team at all (any role). Signing in to the web
 * admin needs this; the portal uses it to keep team logins out of client
 * accounts.
 */
export async function isAllowedAdmin(email: string | null | undefined): Promise<boolean> {
  return (await resolveRole(email)) !== null;
}

function contextFor(user: User, role: AdminRole): AdminContext {
  const name = (typeof user.user_metadata?.name === "string" && user.user_metadata.name) || null;
  return { user, email: (user.email || "").toLowerCase(), name, role };
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

  return contextFor(user, role);
}

/**
 * The signed-in admin, or null. For API routes and checks that must not
 * redirect. Same two conditions as requireAdmin: a valid session AND an email
 * that resolves to a role.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = await resolveRole(user.email);
  if (!role) return null;
  return contextFor(user, role);
}

/**
 * The same check for a client that cannot hold cookies: a mobile app sends the
 * Supabase access token as `Authorization: Bearer <jwt>`. The token is verified
 * by Supabase (signature and expiry), then the email must still resolve to a
 * role, exactly as it must for a browser session.
 */
export async function getAdminContextFromBearer(authorization: string | null): Promise<AdminContext | null> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;
  const db = getSupabaseAdmin();
  if (!db) return null;
  const {
    data: { user },
  } = await db.auth.getUser(token);
  if (!user) return null;
  const role = await resolveRole(user.email);
  if (!role) return null;
  return contextFor(user, role);
}

/* ------------------------------------------------------------------ */
/* Capabilities for the web admin (the same table as the admin API)    */
/* ------------------------------------------------------------------ */

type HasRole = Pick<AdminContext, "role"> | AdminRole;
const roleOf = (who: HasRole): AdminRole => (typeof who === "string" ? who : who.role);

/** Whether the signed-in admin (or a role) may use a capability. */
export function adminCan(who: HasRole, capability: Capability): boolean {
  return can(roleOf(who), capability);
}

/** Every capability the signed-in admin holds: what client components show and hide from. */
export function adminCapabilities(who: HasRole): Capability[] {
  return capabilitiesFor(roleOf(who));
}

/** Where a page or action the role may not use sends them: Overview, with a one-line notice. */
export const FORBIDDEN_REDIRECT = "/admin?e=forbidden";

/**
 * requireAdmin, then every capability given. A role without one of them goes
 * back to the Overview with "Your role cannot do that." Use it at the top of
 * a page (its `.view` capability) and of every server action (the write it
 * performs): hiding a button is never the only guard.
 */
export async function requireAdminCapability(...capabilities: Capability[]): Promise<AdminContext> {
  const ctx = await requireAdmin();
  if (!capabilities.every((capability) => adminCan(ctx, capability))) redirect(FORBIDDEN_REDIRECT);
  return ctx;
}

/**
 * The inbox viewer for a cookie (or bearer) session, from the same table as
 * the admin API's Inbox: the categories this role may read (staff: Leads and
 * Clients), and the owner audience (team changes, subscribers, the CRM's
 * alerts) by the API's own rule, readsOwnerAudience: owners and managers.
 */
export function adminInboxViewer(ctx: AdminContext): Viewer {
  const categories = inboxCategories(ctx.role);
  return {
    userId: ctx.user.id,
    isOwner: readsOwnerAudience(ctx.role),
    // Every category: the database's audience rule is all it needs.
    categories: categories.length === ADMIN_CATEGORIES.length ? null : categories,
  };
}
