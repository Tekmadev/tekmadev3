import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Phones registered for push by the admin app (table admin_devices,
 * migration 20261003000003). One row per Expo push token: registering a token
 * that already exists moves it to the caller and refreshes it, so a token
 * refresh, a second sign-in, or another staff member signing in on the same
 * phone never leaves a stale row pushing to the wrong person.
 *
 * Server only. Callers check who is asking (the admin API does).
 */

export type AdminDevicePlatform = "android" | "ios";

export type AdminDevice = {
  id: string;
  user_id: string;
  user_email: string;
  token: string;
  platform: AdminDevicePlatform;
  app_version: string;
  device_name: string;
  created_at: string;
  last_seen_at: string;
  last_push_at: string | null;
  last_push_error: string | null;
};

/** ExponentPushToken[...] or ExpoPushToken[...]. */
export const EXPO_PUSH_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]\s]{1,4096}\]$/;

export const DEVICE_NAME_MAX = 120;

/** What an empty device name is stored as. */
export function defaultDeviceName(platform: AdminDevicePlatform): string {
  return platform === "ios" ? "iPhone" : "Android phone";
}

export type RegisterDeviceInput = {
  userId: string;
  email: string;
  token: string;
  platform: AdminDevicePlatform;
  appVersion: string;
  /** Empty keeps the stored name (or the default for a new row). */
  deviceName: string;
};

/**
 * Registers (or refreshes) a phone. `created` is true for a new token.
 * Returns null when the database could not be reached or written.
 */
export async function registerAdminDevice(input: RegisterDeviceInput): Promise<{ id: string; created: boolean } | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const now = new Date().toISOString();
  const name = input.deviceName.trim().slice(0, DEVICE_NAME_MAX);

  const refresh = async (): Promise<{ id: string; created: boolean } | null | undefined> => {
    const { data, error } = await db
      .from("admin_devices")
      .update({
        user_id: input.userId,
        user_email: input.email,
        platform: input.platform,
        app_version: input.appVersion,
        last_seen_at: now,
        ...(name ? { device_name: name } : {}),
      })
      .eq("token", input.token)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[admin devices] refresh failed", error.code, error.message);
      return null;
    }
    return data ? { id: String(data.id), created: false } : undefined;
  };

  const existing = await refresh();
  if (existing !== undefined) return existing;

  const { data, error } = await db
    .from("admin_devices")
    .insert({
      user_id: input.userId,
      user_email: input.email,
      token: input.token,
      platform: input.platform,
      app_version: input.appVersion,
      device_name: name || defaultDeviceName(input.platform),
      created_at: now,
      last_seen_at: now,
    })
    .select("id")
    .single();
  if (!error && data) return { id: String(data.id), created: true };
  if (error?.code === "23505") {
    // Registered by a parallel request a moment ago: that row is ours now.
    return (await refresh()) ?? null;
  }
  console.error("[admin devices] insert failed", error?.code, error?.message);
  return null;
}

/**
 * Removes one of the caller's phones. "missing" when the id is unknown or
 * belongs to someone else (the API answers 404 for both).
 */
export async function removeAdminDevice(userId: string, id: string): Promise<"removed" | "missing" | "failed"> {
  const db = getSupabaseAdmin();
  if (!db) return "failed";
  const { data, error } = await db.from("admin_devices").delete().eq("id", id).eq("user_id", userId).select("id");
  if (error) {
    console.error("[admin devices] delete failed", error.code, error.message);
    return "failed";
  }
  return (data ?? []).length > 0 ? "removed" : "missing";
}

/** Every phone a staff member registered (for pushes and the test push). Null on failure. */
export async function listAdminDevices(userIds: string[]): Promise<AdminDevice[] | null> {
  if (userIds.length === 0) return [];
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data, error } = await db.from("admin_devices").select("*").in("user_id", userIds).order("last_seen_at", { ascending: false });
  if (error) {
    console.error("[admin devices] list failed", error.code, error.message);
    return null;
  }
  return (data ?? []) as AdminDevice[];
}
