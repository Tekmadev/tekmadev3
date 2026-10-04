import { route } from "@/lib/admin-api";
import { adsQuery, getAdsReport } from "@/lib/admin-api/ads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /ads?range=7d|14d|30d|3m|all (default 30d; "all" is the last 12 months).
 * Owners and managers. Not connected (no Meta ad account id or token on the server):
 * `{ connected: false, range, lastSync: null }` and nothing else.
 * Unknown range: 400 `range`.
 */
export const GET = route({ method: "GET", capability: "ads.view", query: adsQuery }, async (_ctx, { query }) =>
  getAdsReport(query.range),
);
