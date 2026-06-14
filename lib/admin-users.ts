import { getSupabaseAdmin } from "@/lib/supabase";
import { ownerEmails, type AdminRole } from "@/lib/admin";

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
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
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

/** Everyone with dashboard access: env owners (the founder) plus admins-table rows. */
export async function listAdmins(): Promise<AdminUser[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const meta = await authMetaByEmail(db).catch(() => new Map<string, AuthMeta>());
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

  const { data } = await db.from("admins").select("email,role,name,created_at").order("created_at");
  for (const row of (data ?? []) as { email: string; role: AdminRole; name: string | null; created_at: string }[]) {
    const email = row.email.toLowerCase();
    if (seen.has(email)) continue; // env owner already listed
    seen.add(email);
    const m = meta.get(email);
    out.push({
      email,
      name: row.name ?? m?.name ?? null,
      role: row.role === "owner" ? "owner" : "manager",
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
 */
export async function addManager(opts: {
  email: string;
  password: string;
  name: string | null;
  role: AdminRole;
  invitedBy: string;
}): Promise<AddManagerResult> {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, error: "Supabase is not configured." };

  const email = opts.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email." };
  if (opts.password.length < 8) return { ok: false, error: "Temporary password must be at least 8 characters." };
  if (ownerEmails().includes(email)) return { ok: false, error: "That email is already the owner." };

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

  return { ok: true };
}

/** Removes a dashboard user: deletes the admins row and the auth account. */
export async function removeAdmin(email: string): Promise<AddManagerResult> {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, error: "Supabase is not configured." };

  const target = email.trim().toLowerCase();
  if (ownerEmails().includes(target)) return { ok: false, error: "The owner cannot be removed." };

  await db.from("admins").delete().eq("email", target);

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
