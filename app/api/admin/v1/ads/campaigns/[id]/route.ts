import { route } from "@/lib/admin-api";
import { adsQuery, getAdsCampaign } from "@/lib/admin-api/ads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /ads/campaigns/:id?range= : one campaign card and the ads inside it for
 * the range (`{ range, lastSync, campaign, ads }`, the same shapes as GET /ads).
 * Owners and managers. The app drills down from GET /ads locally today; this is the
 * same data for a deep link. Unknown campaign: 404. Not connected: 503.
 */
export const GET = route({ method: "GET", capability: "ads.view", query: adsQuery }, async (_ctx, { params, query }) =>
  getAdsCampaign(params.id ?? "", query.range),
);
