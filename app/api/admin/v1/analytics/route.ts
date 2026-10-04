import { route } from "@/lib/admin-api";
import { analyticsQuery, getAnalytics } from "@/lib/admin-api/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /analytics?range=24h|7d|30d|3m|6m|1y|all (default 30d): first-party,
 * cookieless pageviews for one range. Owner, manager and staff.
 * Unknown range: 400 `range`.
 */
export const GET = route({ method: "GET", capability: "analytics.view", query: analyticsQuery }, async (_ctx, { query }) =>
  getAnalytics(query.range),
);
