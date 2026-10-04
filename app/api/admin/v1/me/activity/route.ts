import { route } from "@/lib/admin-api";
import { activityQuery, myActivity } from "@/lib/admin-api/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /me/activity?range=7d|30d|all -> StaffActivity with exactly one row:
 * the caller's own counts and credit rows ("My activity"). Needs
 * `activity.own` (everyone). 400 `range` for an unknown range (default 7d).
 * 503 before the staff management migration is applied. docs/admin-api/staff.md.
 */
export const GET = route({ method: "GET", capability: "activity.own", query: activityQuery }, async (ctx, { query }) =>
  myActivity(ctx, query.range),
);
