import type { AdminContext } from "@/lib/admin";
import type { ApiContext } from "@/lib/admin-api/auth";
import { can, requireCapability } from "@/lib/admin-api/permissions";

/**
 * A web admin session (cookie, lib/admin.ts requireAdmin) as the admin API's
 * caller, so a web page or server action can run the same shared domain code
 * as the app's routes (the same permission table, the same rules and copy):
 * the New client form through createClientByStaff, the lead prefill through
 * getLead. Capability errors are thrown as the API's ApiError; callers turn
 * them into a notice.
 */
export function webApiContext(ctx: AdminContext): ApiContext {
  const role = ctx.role;
  const isOwner = role === "owner";
  return {
    userId: ctx.user.id,
    email: ctx.email,
    name: ctx.name,
    role,
    isOwner,
    user: ctx.user,
    appVersion: null,
    viewer: { userId: ctx.user.id, isOwner },
    can: (capability) => can(role, capability),
    require: (...capabilities) => requireCapability(role, ...capabilities),
  };
}
