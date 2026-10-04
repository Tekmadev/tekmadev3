import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { resolveRole, type AdminRole } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Viewer } from "@/lib/admin-notifications-data";
import { ApiError, MESSAGES, notConfigured } from "./errors";
import { can, requireCapability, type Capability } from "./permissions";

/**
 * Who is calling the admin API. Bearer auth only: the app sends the Supabase
 * access token as `Authorization: Bearer <jwt>`. Cookies are never read, so a
 * browser session can not drive this API and no CSRF check is needed.
 *
 *   no token, or a token Supabase rejects   401 unauthorized "Sign in again."
 *   a valid account that is not on staff    403 not_staff "That account is not allowed here."
 *     (client portal users share the Supabase user pool and land here)
 *   Supabase unreachable                    500 unavailable (never a 401: the app would sign out)
 *
 * The role comes from lib/admin.ts resolveRole: owners named in ADMIN_EMAILS,
 * then the admins table (owner, manager or staff).
 */

export type ApiContext = {
  /** Supabase auth user id: the key every per-user table uses. */
  userId: string;
  /** Lowercased email; also the audit label for created_by / updated_by. */
  email: string;
  /** Display name (user metadata), or null: show the email then. */
  name: string | null;
  role: AdminRole;
  isOwner: boolean;
  /** The verified Supabase user. */
  user: User;
  /** X-App-Version as sent, or null. */
  appVersion: string | null;
  /** For lib/admin-notifications-data (the inbox functions take a viewer). */
  viewer: Viewer;
  /** Whether the caller may use a capability (see permissions.ts). */
  can: (capability: Capability) => boolean;
  /** Throws the 403 unless the caller holds every capability given. */
  require: (...capabilities: Capability[]) => void;
};

/** The bearer token, or null when the header is missing or malformed. */
export function bearerToken(authorization: string | null): string | null {
  const token = authorization?.match(/^Bearer\s+(\S+)\s*$/i)?.[1];
  return token && token.length < 8192 ? token : null;
}

const unauthorized = () => new ApiError(401, "unauthorized", MESSAGES.unauthorized);

/** Resolves the caller or throws the 401 / 403 / 500 described above. */
export async function authenticate(req: NextRequest): Promise<ApiContext> {
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) throw unauthorized();

  const db = getSupabaseAdmin();
  if (!db) throw notConfigured();

  let user: User | null = null;
  try {
    const { data, error } = await db.auth.getUser(token);
    if (error) {
      // 4xx from Supabase Auth: the token is bad, expired or its user is gone.
      // Anything else (network, 5xx) is an outage, and an outage must not sign the app out.
      const status = typeof error.status === "number" ? error.status : 0;
      if (status >= 400 && status < 500) throw unauthorized();
      console.error("[admin-api] auth.getUser failed", status, error.message);
      throw new ApiError(500, "unavailable", MESSAGES.unavailable);
    }
    user = data.user;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("[admin-api] auth.getUser threw", err instanceof Error ? err.message : String(err));
    throw new ApiError(500, "unavailable", MESSAGES.unavailable);
  }
  if (!user) throw unauthorized();

  const role = await resolveRole(user.email);
  if (!role) throw new ApiError(403, "not_staff", MESSAGES.notStaff);

  const email = (user.email ?? "").toLowerCase();
  const metaName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name.trim() : "";
  const isOwner = role === "owner";

  return {
    userId: user.id,
    email,
    name: metaName || null,
    role,
    isOwner,
    user,
    appVersion: req.headers.get("x-app-version"),
    viewer: { userId: user.id, isOwner },
    can: (capability) => can(role, capability),
    require: (...capabilities) => requireCapability(role, ...capabilities),
  };
}
