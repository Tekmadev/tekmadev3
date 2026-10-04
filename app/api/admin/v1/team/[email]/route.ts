import { requireDb, route } from "@/lib/admin-api";
import { removeTeamMember, teamPatchSchema, updateTeamMember } from "@/lib/admin-api/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /team/:email { role?, paused? } -> TeamMember (as GET /team shows them).
 * Staff management (docs/admin-api/staff.md): `role` needs `team.role`,
 * `paused` needs `team.pause` (owners and managers; staff get 403 `forbidden`).
 * Making someone an owner, or changing an owner at all, also needs
 * `team.owners` (owners only: 403 `owner_only`). 422 `locked` for env owners,
 * 422 `self` for your own role or pausing yourself, 404 when not on the team,
 * 400 `role` / `paused` for a bad value. A paused person's next request
 * answers 403 `paused`; resuming restores everything.
 */
export const PATCH = route(
  { method: "PATCH", anyCapability: ["team.role", "team.pause"], body: teamPatchSchema },
  async (ctx, { params, body }) => {
    requireDb();
    return updateTeamMember(params.email ?? "", body, ctx);
  },
);

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
