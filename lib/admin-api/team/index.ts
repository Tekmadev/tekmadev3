import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerEmails, type AdminRole } from "@/lib/admin";
import { TEAM_MESSAGES, addManager, listAdmins, removeAdmin, updateTeamAccess, type AdminUser } from "@/lib/admin-users";
import type { ApiContext } from "../auth";
import {
  ApiError,
  MESSAGES as API_MESSAGES,
  badRequest,
  businessRule,
  conflict,
  notConfigured,
  notFound,
  unavailable,
  validationError,
} from "../errors";
import { dbError, instant } from "../data";
import { forbiddenError } from "../permissions";

/**
 * The team for the admin API (GET /team, POST /team, DELETE /team/:email),
 * on the website's own functions (lib/admin-users.ts): adding someone creates
 * their sign-in with a temporary password exactly like Admin, Team; removing
 * someone deletes their admins row and their sign-in. Owners named in the
 * ADMIN_EMAILS env are locked: never removable.
 *
 * Who may do what (docs/api-requests/team.md, owner decision 2026-10-03),
 * all in lib/admin-api/permissions.ts:
 *
 *   team.view    owners and managers: the list
 *   team.write   owners and managers: add members (managers add managers and staff)
 *   team.owners  owners only: add someone as an owner (POST /team role "owner")
 *   team.remove  owners only: remove members (DELETE /team/:email)
 *
 * The two owner-only rules answer 403 `owner_only` "That section is owner
 * only." to managers and staff; a missing `team.view` or `team.write` answers
 * 403 `forbidden`. Env owners (ADMIN_EMAILS) are locked: nobody removes them.
 *
 * Staff management (docs/admin-api/staff.md): PATCH /team/:email changes a
 * role (`team.role`) or pauses and resumes access (`team.pause`), by the rules
 * in lib/admin-users.ts updateTeamAccess.
 */

/**
 * The owner-only team rules on top of the route's capability: making an owner
 * (`team.owners`) and removing someone (`team.remove`). Throws the 403.
 */
export function requireOwnerCapability(ctx: ApiContext, capability: "team.remove" | "team.owners"): void {
  ctx.require(capability);
}

/**
 * POST /team: managers add managers and staff; only someone holding
 * `team.owners` adds an owner. Checked before the body is validated, like the
 * mock, so a manager asking for an owner always gets the 403.
 */
export function requireRoleGrant(ctx: ApiContext, raw: unknown): void {
  if (wantsOwner(raw)) requireOwnerCapability(ctx, "team.owners");
}

export type TeamMemberView = {
  email: string;
  name: string | null;
  role: AdminRole;
  lastSignInAt: string | null;
  addedAt: string;
  envOwner: boolean;
  /** Access paused: cannot sign in, gets no pushes (staff management). Always false for env owners. */
  paused: boolean;
  /** When it was paused; null when not paused. */
  pausedAt: string | null;
  /** Who paused them; null when not paused. */
  pausedBy: { email: string; name: string | null } | null;
};

/** Env owners, then other owners, then everyone else (managers and staff together). */
const GROUP: Record<AdminRole, number> = { owner: 1, manager: 2, staff: 2 };

function memberView(a: AdminUser, fallbackAddedAt: string, names: ReadonlyMap<string, string | null>): TeamMemberView {
  const pausedBy = a.paused ? a.pausedBy : null;
  return {
    email: a.email,
    name: a.name?.trim() || null,
    role: a.role,
    lastSignInAt: instant(a.lastSignInAt),
    // An env owner who never made an account has no add date; they sort first either way.
    addedAt: instant(a.createdAt) ?? fallbackAddedAt,
    envOwner: a.source === "env",
    paused: a.paused,
    pausedAt: a.paused ? instant(a.pausedAt) : null,
    pausedBy: pausedBy ? { email: pausedBy, name: names.get(pausedBy) ?? null } : null,
  };
}

const time = (value: string) => {
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
};

/** Env owners, then other owners, then managers and staff; oldest first inside each group. */
export async function listTeam(): Promise<TeamMemberView[]> {
  let admins: AdminUser[];
  try {
    admins = await listAdmins({ strict: true });
  } catch (err) {
    console.error("[admin-api] team list failed", err instanceof Error ? err.message : String(err));
    throw unavailable();
  }
  const now = new Date().toISOString();
  const names = new Map(admins.map((a) => [a.email, a.name?.trim() || null]));
  const rank = (m: TeamMemberView) => (m.envOwner ? 0 : GROUP[m.role]);
  return admins
    .map((a) => memberView(a, now, names))
    .sort((a, b) => rank(a) - rank(b) || time(a.addedAt) - time(b.addedAt) || a.email.localeCompare(b.email));
}

/* ------------------------------------------------------------------ */
/* POST /team                                                          */
/* ------------------------------------------------------------------ */

const NAME_MAX = 80;
const PASSWORD_MIN = 8;
/** Supabase Auth hashes at most 72 bytes of a password. */
const PASSWORD_MAX = 72;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = ["owner", "manager", "staff"] as const satisfies readonly AdminRole[];

const MESSAGES = {
  name: `Keep the name to ${NAME_MAX} characters or fewer.`,
  email: "Enter a valid email.",
  password: `The temporary password must be at least ${PASSWORD_MIN} characters.`,
  passwordLong: `Keep the temporary password to ${PASSWORD_MAX} characters or fewer.`,
  passwordWeak: "Sign-in refused that temporary password. Use a longer mix of letters, numbers and symbols.",
  role: "Pick Owner, Manager or Staff.",
  dupe: "That email is already on the team.",
  owner: "The owner cannot be removed.",
  self: "You cannot remove yourself. Ask another owner.",
} as const;

/** The Add a team member sheet. zod reports the fields in this order, so the first bad one is the code. */
const newMemberSchema = z.object({
  /** Trimmed; blank means none. */
  name: z.string({ error: MESSAGES.name }).trim().max(NAME_MAX, MESSAGES.name).nullish(),
  /** Trimmed and lowercased: the login. */
  email: z.string({ error: MESSAGES.email }).trim().toLowerCase().max(254, MESSAGES.email).regex(EMAIL_RE, MESSAGES.email),
  tempPassword: z.string({ error: MESSAGES.password }).min(PASSWORD_MIN, MESSAGES.password).max(PASSWORD_MAX, MESSAGES.passwordLong),
  role: z.enum(ROLES, { error: MESSAGES.role }),
});

export type NewTeamMember = { name: string | null; email: string; tempPassword: string; role: AdminRole };

/**
 * `{ name?, email, tempPassword, role }`. Every bad field in `fields`; code and
 * message are the first, in that order (`tempPassword` answers code `password`).
 */
export function parseNewMember(raw: unknown): NewTeamMember {
  const parsed = newMemberSchema.safeParse(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {});
  if (!parsed.success) throw validationError(parsed.error, { tempPassword: "password" });
  const { name, email, tempPassword, role } = parsed.data;
  return { name: name || null, email, tempPassword, role };
}

/** Whether the body asks for an owner (checked before anything else, like the 403 it may cause). */
export function wantsOwner(raw: unknown): boolean {
  return Boolean(raw && typeof raw === "object" && (raw as Record<string, unknown>).role === "owner");
}

async function onTeam(db: SupabaseClient, email: string): Promise<boolean> {
  if (ownerEmails().includes(email)) return true;
  const { data, error } = await db.from("admins").select("email").eq("email", email).maybeSingle();
  if (error) throw dbError("team member check", error);
  return Boolean(data);
}

/** lib/admin-users.ts refusing a team change the caller's role may not make (the route checks first). */
const isTeamRuleRefusal = (error: string) =>
  error === TEAM_MESSAGES.ownerGrant || error === TEAM_MESSAGES.ownerChange || error === TEAM_MESSAGES.remove;

/**
 * Adds a team member: their sign-in (email confirmed, the temporary password
 * set) and their admins row, with an inbox line for owners and managers. They
 * sign in at once and change the password in Profile. 409 `dupe` when already
 * on the team. `actorRole` (the caller's role) applies the team rules again in
 * lib/admin-users.ts: only an owner gives the owner role.
 */
export async function addTeamMember(db: SupabaseClient, input: NewTeamMember, by: string, actorRole?: AdminRole): Promise<TeamMemberView> {
  if (await onTeam(db, input.email)) throw conflict("dupe", MESSAGES.dupe, { email: MESSAGES.dupe });

  const res = await addManager({ email: input.email, password: input.tempPassword, name: input.name, role: input.role, invitedBy: by, actorRole });
  if (!res.ok) {
    if (isTeamRuleRefusal(res.error)) throw new ApiError(403, "owner_only", API_MESSAGES.ownerOnly);
    console.error("[admin-api] team add failed", res.error);
    if (/password/i.test(res.error)) throw badRequest("password", MESSAGES.passwordWeak, { tempPassword: MESSAGES.passwordWeak });
    throw new ApiError(500, "unavailable", "Could not add them just now. Try again in a moment.");
  }
  revalidatePath("/admin/team");

  const team = await listTeam();
  const added = team.find((m) => m.email === input.email);
  if (!added) throw new ApiError(500, "unavailable", "They were added, but the team could not be read back. Pull to refresh.");
  return added;
}

/** A path email: Next.js hands dynamic segments over decoded; decode again only if a %xx survived. */
function pathEmail(raw: string): string {
  let email = raw;
  if (/%[0-9a-f]{2}/i.test(email)) {
    try {
      email = decodeURIComponent(email);
    } catch {
      /* keep it as sent */
    }
  }
  return email.trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/* PATCH /team/:email                                                  */
/* ------------------------------------------------------------------ */

const PAUSED_INPUT = "Send paused as true or false.";

/** `{ role?, paused? }`: only what is sent changes. Unknown keys are ignored. */
export const teamPatchSchema = z.object({
  role: z.enum(ROLES, { error: MESSAGES.role }).optional(),
  paused: z.boolean({ error: PAUSED_INPUT }).optional(),
});
export type TeamPatch = z.output<typeof teamPatchSchema>;

/**
 * PATCH /team/:email: change a role and/or pause or resume access, by the
 * team rules (lib/admin-users.ts updateTeamAccess), then answer the member as
 * GET /team shows them. A body with neither key changes nothing and answers
 * the member (404 when not on the team).
 *
 *   403 forbidden   role without team.role, paused without team.pause
 *   403 owner_only  role "owner", or any change to an owner, without team.owners
 *   422 locked      an env owner (ADMIN_EMAILS)
 *   404 not_found   not on the team
 *   422 self        your own role, or pausing yourself
 *   503             pausing before the staff management migration is applied
 */
export async function updateTeamMember(rawEmail: string, patch: TeamPatch, ctx: ApiContext): Promise<TeamMemberView> {
  const email = pathEmail(rawEmail);
  if (patch.role !== undefined || patch.paused !== undefined) {
    const res = await updateTeamAccess({ email, role: patch.role, paused: patch.paused, actorEmail: ctx.email, actorRole: ctx.role });
    if (!res.ok) {
      switch (res.code) {
        case "forbidden":
          throw forbiddenError(patch.role !== undefined && !ctx.can("team.role") ? "team.role" : "team.pause");
        case "owner_only":
          throw new ApiError(403, "owner_only", API_MESSAGES.ownerOnly);
        case "locked":
          throw businessRule("locked", res.error);
        case "not_found":
          throw notFound("That team member");
        case "self":
          throw businessRule("self", res.error);
        case "not_ready":
          throw notConfigured(res.error);
        default:
          throw new ApiError(500, "unavailable", res.error);
      }
    }
    revalidatePath("/admin/team");
  }

  const team = await listTeam();
  const member = team.find((m) => m.email === email);
  if (!member) throw notFound("That team member");
  return member;
}

/* ------------------------------------------------------------------ */
/* DELETE /team/:email                                                 */
/* ------------------------------------------------------------------ */

/**
 * Removes a team member: their admins row and their sign-in, which also ends
 * any client portal access on that login. Env owners answer 422 `owner`,
 * removing yourself 422 `self`, someone not on the team 404. `actorRole` (the
 * caller's role) applies `team.remove` again in lib/admin-users.ts.
 */
export async function removeTeamMember(
  db: SupabaseClient,
  rawEmail: string,
  by: string,
  actorRole?: AdminRole,
): Promise<{ email: string; deleted: true }> {
  const email = pathEmail(rawEmail);

  if (ownerEmails().includes(email)) throw businessRule("owner", MESSAGES.owner);
  if (!email || !(await onTeam(db, email))) throw notFound("That team member");
  if (email === by.toLowerCase()) throw businessRule("self", MESSAGES.self);

  const res = await removeAdmin(email, { actorRole });
  if (!res.ok) {
    if (isTeamRuleRefusal(res.error)) throw new ApiError(403, "owner_only", API_MESSAGES.ownerOnly);
    console.error("[admin-api] team remove failed", res.error);
    throw new ApiError(500, "unavailable", "Could not remove them just now. Nothing changed. Try again.");
  }
  revalidatePath("/admin/team");
  return { email, deleted: true };
}
