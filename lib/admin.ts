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
 * What resolveRole answers for a team member whose access an owner or manager
 * paused (`admins.paused_at` set, docs/admin-api/staff.md). They stay on the
 * team with their role and everything they did, but cannot use the web admin
 * or the app and get no pushes until someone resumes them. Env owners can
 * never be paused.
 */
export const PAUSED = "paused" as const;

/** A role, "paused" (on the team, access paused), or null (not on the team). */
export type RoleResolution = AdminRole | typeof PAUSED | null;

/** The copy a paused person sees, on the web login and from the admin API (403 `paused`). */
export const PAUSED_MESSAGE = "Your access is paused. Ask an owner or manager.";

type AdminRow = { role: string | null; paused_at: string | null };

/** A missing column means the staff management migration is not applied yet: read without it. */
function missingPausedColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204" || /paused_at/.test(error.message ?? "")));
}

async function readAdminRow(db: NonNullable<ReturnType<typeof getSupabaseAdmin>>, email: string): Promise<AdminRow | null> {
  const full = await db.from("admins").select("role,paused_at").eq("email", email).maybeSingle();
  if (!full.error) return (full.data as AdminRow | null) ?? null;
  // Any other failure denies, as it always has: an unreadable allowlist lets nobody in.
  if (!missingPausedColumn(full.error)) return null;
  const basic = await db.from("admins").select("role").eq("email", email).maybeSingle();
  const row = basic.data as { role: string | null } | null;
  return row ? { role: row.role, paused_at: null } : null;
}

/**
 * Resolves the role for an email: env owners first, then the admins table.
 * Returns "paused" for a team member whose access is paused, and null when
 * the email is not allowed into the dashboard at all (a client portal login,
 * for one). Callers that let someone in must treat "paused" as a refusal
 * with PAUSED_MESSAGE.
 */
export async function resolveRole(email: string | null | undefined): Promise<RoleResolution> {
  if (!email) return null;
  const e = email.toLowerCase();

  // Env owners are locked: never paused, never removed.
  if (ownerEmails().includes(e)) return "owner";

  const db = getSupabaseAdmin();
  if (!db) return null; // no allowlist source available => deny

  const data = await readAdminRow(db, e);
  if (!data) return null;
  if (data.paused_at) return PAUSED;
  if (data.role === "owner") return "owner";
  if (data.role === "staff") return "staff";
  return "manager";
}

/**
 * Whether this email is on the team at all (any role, paused included). The
 * portal uses it to keep team logins out of client accounts, so a paused
 * member stays out of the portal too. Letting someone into the admin needs
 * resolveRole, which tells a paused member apart.
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
 * to a role (env owner or admins-table row). A paused member lands on the
 * login page with PAUSED_MESSAGE (`?e=paused`).
 */
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/login?e=config");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const role = await resolveRole(user.email);
  if (role === PAUSED) redirect("/admin/login?e=paused");
  if (!role) redirect("/admin/login?e=denied");

  return contextFor(user, role);
}

/**
 * The signed-in admin, or null. For API routes and checks that must not
 * redirect. Same two conditions as requireAdmin: a valid session AND an email
 * that resolves to a role (a paused member gets null).
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = await resolveRole(user.email);
  if (!role || role === PAUSED) return null;
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
  if (!role || role === PAUSED) return null;
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
