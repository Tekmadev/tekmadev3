import { z } from "zod";
import { requireDb, route } from "@/lib/admin-api";
import { addTeamMember, listTeam, parseNewMember, requireRoleGrant } from "@/lib/admin-api/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /team -> TeamMember[]: env owners (locked), then other owners, then
 * managers and staff; oldest first inside each group. Needs `team.view`
 * (owners and managers).
 */
export const GET = route({ method: "GET", capability: "team.view" }, async () => {
  requireDb();
  return listTeam();
});

/**
 * POST /team { name?, email, tempPassword, role: "owner" | "manager" | "staff" }
 * (Idempotency-Key) -> 201 TeamMember. Needs `team.write` (owners and
 * managers); making an owner also needs `team.owners`, owners only (a manager
 * gets 403 `owner_only`). Creates their sign-in with the temporary password,
 * like Admin, Team. 400 name | email | password | role (with `fields`), 409 dupe.
 */
export const POST = route(
  { method: "POST", capability: "team.write", body: z.unknown(), idempotent: true, status: 201 },
  async (ctx, { body }) => {
    // Managers add managers and staff; only an owner makes an owner.
    requireRoleGrant(ctx, body);
    return addTeamMember(requireDb(), parseNewMember(body), ctx.email, ctx.role);
  },
);
