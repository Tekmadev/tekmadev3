import { route } from "@/lib/admin-api";
import { activityQuery, teamActivity } from "@/lib/admin-api/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /team/activity?range=7d|30d|all -> StaffActivity: one row per team
 * member (paused people included), most clients won first. Needs
 * `team.activity` (owners and managers); staff read their own row at
 * GET /me/activity. 400 `range` for an unknown range (default 7d). 503 before
 * the staff management migration is applied. docs/admin-api/staff.md.
 */
export const GET = route({ method: "GET", capability: "team.activity", query: activityQuery }, async (_ctx, { query }) =>
  teamActivity(query.range),
);
