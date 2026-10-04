import { requireDb, route } from "@/lib/admin-api";
import { removeTeamMember } from "@/lib/admin-api/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /team/:email (URL-encoded; it may hold a "+") -> { email, deleted: true }.
 * Needs `team.remove`, owners only: managers and staff get 403 `owner_only`.
 * Also ends their client portal access (the sign-in is deleted), so their next
 * request answers 401. 422 `owner` for env owners (locked, never removable),
 * 422 `self` for yourself, 404 when not on the team.
 */
export const DELETE = route({ method: "DELETE", capability: "team.remove" }, async (ctx, { params }) => {
  return removeTeamMember(requireDb(), params.email ?? "", ctx.email, ctx.role);
});
