import { getSupabaseAdmin } from "@/lib/supabase";
import { ownerEmails, type AdminRole } from "@/lib/admin";
import { notifyAdmins } from "@/lib/admin-notify";
import { can } from "@/lib/admin-api/permissions";

/**
 * Who may change the team (owner decisions 2026-10-03), from the capability
 * table in lib/admin-api/permissions.ts, shared by the web Team page and the
 * admin API:
 *
 *   team.view / team.write   owners and managers: see the team, add members
 *   team.owners              owners only: add an owner, or change an owner's access
 *   team.remove              owners only: remove members
 *   team.role                owners and managers: change a role (managers: manager <-> staff)
 *   team.pause               owners and managers: pause or resume access (managers: never an owner)
 *
 * Env owners (ADMIN_EMAILS) are locked: nobody removes, re-roles or pauses
 * them. Nobody changes their own role or pauses themselves.
 */
export const TEAM_MESSAGES = {
  ownerGrant: "Only an owner can make someone an owner.",
  ownerChange: "Only an owner can change another owner's access.",
  remove: "Only an owner can remove team members.",
  locked: "The owner cannot be removed.",
  lockedChange: "This owner is locked. Nobody can change their role or pause them.",
  selfRole: "You cannot change your own role.",
  selfPause: "You cannot pause yourself.",
  forbidden: "Your role cannot do that.",
  /** The admin API's 403 `owner_only` copy: role and pause refusals read the same on the web. */
  ownerOnly: "That section is owner only.",
  notFound: "That team member no longer exists.",
  notReady: "Pausing needs a database update first. Ask the owner to apply the staff management migration.",
  failed: "Could not save that just now. Nothing changed. Try again.",
} as const;

/** The roles this person may give when adding someone: owners any, managers manager and staff, staff none. */
export function grantableRoles(actor: AdminRole): AdminRole[] {
  if (!can(actor, "team.write")) return [];
  const roles: AdminRole[] = ["staff", "manager"];
  return can(actor, "team.owners") ? [...roles, "owner"] : roles;
}

/** Whether this person may remove team members (`team.remove`, owners only). Env owners stay locked regardless. */
export function mayRemoveTeamMembers(actor: AdminRole): boolean {
  return can(actor, "team.remove");
}

export type AdminUser = {
  email: string;
  name: string | null;
  role: AdminRole;
  source: "env" | "db"; // env owners cannot be edited or removed from the UI
  createdAt: string | null;
  lastSignInAt: string | null;
  /** Access paused (admins.paused_at): cannot sign in, gets no pushes. Never true for env owners. */
  paused: boolean;
  /** When it was paused, as Postgres returned it; null when not paused. */
  pausedAt: string | null;
  /** Email of who paused them; null when not paused. */
  pausedBy: string | null;
};

type AuthMeta = { name: string | null; created_at: string | null; last_sign_in_at: string | null };

/** Pulls auth metadata (last sign in, name) for every user, keyed by email. */
async function authMetaByEmail(db: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const map = new Map<string, AuthMeta>();
  // The admin API paginates; one page of 1000 is plenty for a team this size.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`auth users: ${error.message}`);
  for (const u of data?.users ?? []) {
    if (!u.email) continue;
    const name = typeof u.user_metadata?.name === "string" ? u.user_metadata.name : null;
    map.set(u.email.toLowerCase(), {
      name,
      created_at: u.created_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
    });
  }
  return map;
}

/**
 * Everyone with dashboard access: env owners (the founder) plus admins-table rows.
 *
 * By default a failed read degrades (no sign-in details, or env owners only),
 * which suits the web page. `strict` throws instead, for the admin API, which
 * must answer an error rather than a list that looks complete but is not.
 */
export async function listAdmins(opts: { strict?: boolean } = {}): Promise<AdminUser[]> {
  const db = getSupabaseAdmin();
  if (!db) {
    if (opts.strict) throw new Error("Supabase is not configured.");
    return [];
  }

  const meta = await authMetaByEmail(db).catch((err: unknown) => {
    if (opts.strict) throw err;
    return new Map<string, AuthMeta>();
  });
  const owners = ownerEmails();
  const seen = new Set<string>();
  const out: AdminUser[] = [];

  for (const email of owners) {
    seen.add(email);
    const m = meta.get(email);
    out.push({
      email,
      name: m?.name ?? null,
      role: "owner",
      source: "env",
      createdAt: m?.created_at ?? null,
      lastSignInAt: m?.last_sign_in_at ?? null,
      paused: false,
      pausedAt: null,
      pausedBy: null,
    });
  }

  const { data, error } = await readAdminRows(db);
  if (error && opts.strict) throw new Error(`admins: ${error.message}`);
  for (const row of data) {
    const email = row.email.toLowerCase();
    if (seen.has(email)) continue; // env owner already listed
    seen.add(email);
    const m = meta.get(email);
    out.push({
      email,
      name: row.name ?? m?.name ?? null,
      role: roleOfRow(row.role),
      source: "db",
      createdAt: row.created_at ?? null,
      lastSignInAt: m?.last_sign_in_at ?? null,
      paused: Boolean(row.paused_at),
      pausedAt: row.paused_at ?? null,
      pausedBy: row.paused_at ? row.paused_by?.trim().toLowerCase() || null : null,
    });
  }

  return out;
}

type AdminTableRow = {
  email: string;
  role: string | null;
  name: string | null;
  created_at: string;
  paused_at?: string | null;
  paused_by?: string | null;
};

const roleOfRow = (role: string | null | undefined): AdminRole => (role === "owner" ? "owner" : role === "staff" ? "staff" : "manager");

/** A missing paused column: the staff management migration (20261003000400) is not applied yet. */
function pausedColumnsMissing(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204") && /paused_(at|by)/.test(error.message ?? ""));
}

/** Every admins row, oldest first, with the paused columns when they exist. */
async function readAdminRows(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
): Promise<{ data: AdminTableRow[]; error: { message: string } | null }> {
  const full = await db.from("admins").select("email,role,name,created_at,paused_at,paused_by").order("created_at");
  if (!full.error || !pausedColumnsMissing(full.error)) {
    return { data: (full.data ?? []) as AdminTableRow[], error: full.error };
  }
  const basic = await db.from("admins").select("email,role,name,created_at").order("created_at");
  return { data: (basic.data ?? []) as AdminTableRow[], error: basic.error };
}

/* ------------------------------------------------------------------ */
/* Role change and pause                                               */
/* ------------------------------------------------------------------ */

export type TeamChangeCode = "forbidden" | "owner_only" | "locked" | "not_found" | "self" | "not_ready" | "failed";

export type TeamChangeResult =
  | { ok: true; email: string; role: AdminRole; paused: boolean; changed: { role?: { from: AdminRole; to: AdminRole }; paused?: boolean } }
  | { ok: false; code: TeamChangeCode; error: string };

const ROLE_LABEL: Record<AdminRole, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };

/**
 * Changes a member's role and/or pauses or resumes their access, by the team
 * rules (owner decisions 2026-10-03). Checked in this order, the first
 * refusal wins:
 *
 *   forbidden   role without `team.role`, paused without `team.pause`
 *   owner_only  role "owner" without `team.owners`
 *   locked      the target is an env owner (ADMIN_EMAILS): never changed
 *   not_found   the target is not on the team
 *   self        your own role, or pausing yourself
 *   owner_only  the target is an owner and you lack `team.owners` (managers never touch owners)
 *
 * Only what is sent changes; sending what is already true writes nothing.
 * Pausing keeps the first paused_at and paused_by; resuming clears both.
 * Nothing else about the person changes: their sign-in, leads, touches,
 * credits and phones all stay. Each change is an owner-audience Inbox row.
 */
export async function updateTeamAccess(opts: {
  email: string;
  role?: AdminRole;
  paused?: boolean;
  actorEmail: string;
  actorRole: AdminRole;
}): Promise<TeamChangeResult> {
  const refuse = (code: TeamChangeCode, error: string): TeamChangeResult => ({ ok: false, code, error });
  const actor = opts.actorEmail.trim().toLowerCase();
  const target = opts.email.trim().toLowerCase();

  if (opts.role !== undefined && !can(opts.actorRole, "team.role")) return refuse("forbidden", TEAM_MESSAGES.forbidden);
  if (opts.paused !== undefined && !can(opts.actorRole, "team.pause")) return refuse("forbidden", TEAM_MESSAGES.forbidden);
  if (opts.role === "owner" && !can(opts.actorRole, "team.owners")) return refuse("owner_only", TEAM_MESSAGES.ownerOnly);
  if (ownerEmails().includes(target)) return refuse("locked", TEAM_MESSAGES.lockedChange);

  const db = getSupabaseAdmin();
  if (!db) return refuse("failed", "Supabase is not configured.");

  // The paused columns arrive with the staff management migration: a role change works without them.
  let read = await db.from("admins").select("email,role,paused_at").eq("email", target).maybeSingle();
  if (read.error && pausedColumnsMissing(read.error)) {
    if (opts.paused !== undefined) return refuse("not_ready", TEAM_MESSAGES.notReady);
    read = await db.from("admins").select("email,role").eq("email", target).maybeSingle();
  }
  if (read.error) {
    console.error("[team] member read failed", read.error.message);
    return refuse("failed", TEAM_MESSAGES.failed);
  }
  const row = read.data as { email: string; role: string | null; paused_at?: string | null } | null;
  if (!target || !row) return refuse("not_found", TEAM_MESSAGES.notFound);

  if (target === actor) {
    if (opts.role !== undefined) return refuse("self", TEAM_MESSAGES.selfRole);
    if (opts.paused !== undefined) return refuse("self", TEAM_MESSAGES.selfPause);
  }

  const current = roleOfRow(row.role);
  const isPaused = Boolean(row.paused_at);
  const touchesSomething = opts.role !== undefined || opts.paused !== undefined;
  if (touchesSomething && current === "owner" && !can(opts.actorRole, "team.owners")) {
    return refuse("owner_only", TEAM_MESSAGES.ownerOnly);
  }

  const update: Record<string, string | null> = {};
  const changed: { role?: { from: AdminRole; to: AdminRole }; paused?: boolean } = {};
  if (opts.role !== undefined && opts.role !== current) {
    update.role = opts.role;
    changed.role = { from: current, to: opts.role };
  }
  if (opts.paused === true && !isPaused) {
    update.paused_at = new Date().toISOString();
    update.paused_by = actor;
    changed.paused = true;
  } else if (opts.paused === false && isPaused) {
    update.paused_at = null;
    update.paused_by = null;
    changed.paused = false;
  }

  if (Object.keys(update).length > 0) {
    const { error } = await db.from("admins").update(update).eq("email", target);
    if (error) {
      if (pausedColumnsMissing(error)) return refuse("not_ready", TEAM_MESSAGES.notReady);
      console.error("[team] member update failed", error.message);
      return refuse("failed", TEAM_MESSAGES.failed);
    }
  }

  // Owner audience (owners and managers, never staff): who can get into the admin is a security matter.
  if (changed.role) {
    await notifyAdmins({
      event: "team.admin_role_changed",
      title: `${target} is now ${ROLE_LABEL[changed.role.to]}`,
      body: `Was ${ROLE_LABEL[changed.role.from]}. Changed by ${actor}`,
      url: "/admin/team",
      actor: { type: "staff", label: actor },
      data: { email: target, from: changed.role.from, to: changed.role.to },
    });
  }
  if (changed.paused !== undefined) {
    await notifyAdmins({
      event: changed.paused ? "team.admin_paused" : "team.admin_resumed",
      title: changed.paused ? `${target}'s access is paused` : `${target}'s access is back`,
      body: changed.paused ? `Paused by ${actor}` : `Resumed by ${actor}`,
      url: "/admin/team",
      actor: { type: "staff", label: actor },
      data: { email: target, paused: changed.paused },
    });
  }

  return {
    ok: true,
    email: target,
    role: changed.role?.to ?? current,
    paused: changed.paused ?? isPaused,
    changed,
  };
}

export type AddManagerResult = { ok: true } | { ok: false; error: string };

/**
 * Adds (or re-grants) a dashboard user. Creates the Supabase auth account with
 * a temporary password the owner sets, marks it confirmed, and records the row
 * in the admins table. If the auth account already exists, it still grants
 * access by writing the admins row.
 *
 * With `actorRole` (the person doing it), the team rules apply: only someone
 * holding `team.owners` (owners) may give the owner role or change an
 * existing owner's row; managers add managers and staff.
 */
export async function addManager(opts: {
  email: string;
  password: string;
  name: string | null;
  role: AdminRole;
  invitedBy: string;
  actorRole?: AdminRole;
}): Promise<AddManagerResult> {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, error: "Supabase is not configured." };

  const email = opts.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email." };
  if (opts.password.length < 8) return { ok: false, error: "Temporary password must be at least 8 characters." };
  if (ownerEmails().includes(email)) return { ok: false, error: "That email is already the owner." };
  // Re-granting yourself would change your own role, which nobody may do (updateTeamAccess "self").
  if (opts.actorRole && email === opts.invitedBy.trim().toLowerCase()) return { ok: false, error: TEAM_MESSAGES.selfRole };

  if (opts.actorRole && !can(opts.actorRole, "team.owners")) {
    if (opts.role === "owner") return { ok: false, error: TEAM_MESSAGES.ownerGrant };
    // A re-grant must not demote an owner either.
    const { data: existing, error: existingErr } = await db.from("admins").select("role").eq("email", email).maybeSingle();
    if (existingErr) return { ok: false, error: "Could not check the team just now. Nothing changed. Try again." };
    if ((existing as { role: string } | null)?.role === "owner") return { ok: false, error: TEAM_MESSAGES.ownerChange };
  }

  const { error: createErr } = await db.auth.admin.createUser({
    email,
    password: opts.password,
    email_confirm: true,
    user_metadata: { name: opts.name },
  });

  // "already registered" is fine: we still grant access via the admins row.
  if (createErr && !/already|exist|registered/i.test(createErr.message)) {
    return { ok: false, error: createErr.message };
  }

  const { error: rowErr } = await db
    .from("admins")
    .upsert(
      { email, role: opts.role, name: opts.name, invited_by: opts.invitedBy },
      { onConflict: "email" },
    );
  if (rowErr) return { ok: false, error: rowErr.message };

  // Owner audience (owners and managers, never staff): who can get into the admin is a security matter.
  await notifyAdmins({
    event: "team.admin_added",
    title: `${opts.name || email} now has admin access as ${opts.role}`,
    body: opts.invitedBy ? `Added by ${opts.invitedBy}` : null,
    url: "/admin/team",
    actor: { type: "staff", label: opts.invitedBy ?? null },
    dedupeKey: `admin:${email}:${opts.role}:${new Date().toISOString().slice(0, 10)}`,
    data: { email, role: opts.role },
  });

  return { ok: true };
}

/**
 * Removes a dashboard user: deletes the admins row and the auth account. Env
 * owners are locked. With `actorRole`, only someone holding `team.remove`
 * (owners) may do it.
 */
export async function removeAdmin(email: string, opts: { actorRole?: AdminRole } = {}): Promise<AddManagerResult> {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, error: "Supabase is not configured." };

  if (opts.actorRole && !mayRemoveTeamMembers(opts.actorRole)) return { ok: false, error: TEAM_MESSAGES.remove };
  const target = email.trim().toLowerCase();
  if (ownerEmails().includes(target)) return { ok: false, error: TEAM_MESSAGES.locked };

  const { error: deleteErr } = await db.from("admins").delete().eq("email", target);
  if (deleteErr) return { ok: false, error: "Could not remove them. Nothing changed. Try again." };
  await notifyAdmins({
    event: "team.admin_removed",
    title: `${target} no longer has admin access`,
    url: "/admin/team",
    actor: { type: "staff" },
    data: { email: target },
  });

  // Best effort: also delete the auth account so they can no longer sign in.
  try {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = (data?.users ?? []).find((u) => u.email?.toLowerCase() === target);
    if (found) await db.auth.admin.deleteUser(found.id);
  } catch {
    /* row removal already revokes dashboard access */
  }

  return { ok: true };
}
