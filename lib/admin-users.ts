import { getSupabaseAdmin } from "@/lib/supabase";
import { ownerEmails, type AdminRole } from "@/lib/admin";
import { notifyAdmins } from "@/lib/admin-notify";
import { can } from "@/lib/admin-api/permissions";

/**
 * Who may change the team (owner decision 2026-10-03), from the capability
 * table in lib/admin-api/permissions.ts, shared by the web Team page and the
 * admin API:
 *
 *   team.view / team.write   owners and managers: see the team, add members
 *   team.owners              owners only: add an owner, or change an owner's access
 *   team.remove              owners only: remove members
 *
 * Env owners (ADMIN_EMAILS) are locked: nobody removes or changes them.
 */
export const TEAM_MESSAGES = {
  ownerGrant: "Only an owner can make someone an owner.",
  ownerChange: "Only an owner can change another owner's access.",
  remove: "Only an owner can remove team members.",
  locked: "The owner cannot be removed.",
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
    });
  }

  const { data, error } = await db.from("admins").select("email,role,name,created_at").order("created_at");
  if (error && opts.strict) throw new Error(`admins: ${error.message}`);
  for (const row of (data ?? []) as { email: string; role: AdminRole; name: string | null; created_at: string }[]) {
    const email = row.email.toLowerCase();
    if (seen.has(email)) continue; // env owner already listed
    seen.add(email);
    const m = meta.get(email);
    out.push({
      email,
      name: row.name ?? m?.name ?? null,
      role: row.role === "owner" ? "owner" : row.role === "staff" ? "staff" : "manager",
      source: "db",
      createdAt: row.created_at ?? null,
      lastSignInAt: m?.last_sign_in_at ?? null,
    });
  }

  return out;
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
