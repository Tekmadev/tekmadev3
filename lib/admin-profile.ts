import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * A staff member's display name. It lives in the Supabase user metadata
 * (`name`, what the admin shows) and is mirrored on the admins row so the Team
 * list shows it for people who never signed in. Owners named in ADMIN_EMAILS
 * have no admins row, so the mirror is a no-op for them.
 */

export const DISPLAY_NAME_MAX = 80;

/** Mirror a display name onto the admins row (no-op when there is none). */
export async function syncAdminRowName(email: string, name: string | null): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  const { error } = await db.from("admins").update({ name }).eq("email", email.toLowerCase());
  if (error) console.error("[admin profile] could not mirror the name on admins", error.message);
}

/**
 * Saves the display name with the service role (the API has no cookie
 * session): user metadata first, then the admins row. `name` null clears it.
 * Returns false when the user metadata could not be saved.
 */
export async function saveStaffDisplayName(
  user: { id: string; email: string; metadata: Record<string, unknown> | null | undefined },
  name: string | null,
): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;
  const { error } = await db.auth.admin.updateUserById(user.id, {
    user_metadata: { ...(user.metadata ?? {}), name },
  });
  if (error) {
    console.error("[admin profile] could not save the display name", error.status, error.message);
    return false;
  }
  await syncAdminRowName(user.email, name);
  return true;
}
