import { route } from "@/lib/admin-api";
import { listAssignees } from "@/lib/admin-api/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /leads/assignees -> { email, name }[]: everyone a lead can be assigned
 * to (the whole team, any role), for the "Assigned to" picker. Names only, no
 * roles: staff may not read the Team screen.
 */
export const GET = route({ method: "GET", anyCapability: ["leads.update", "leads.create"] }, async (ctx) => listAssignees(ctx));
