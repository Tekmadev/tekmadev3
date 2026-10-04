import { route } from "@/lib/admin-api";
import { loadEmailOverview } from "@/lib/admin-api/email/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /email/overview -> { stats, campaigns (newest first), recentEvents (latest 25) }.
 * email.view (owner and staff): counters, campaigns and engagement only, never
 * a subscriber record.
 */
export const GET = route({ method: "GET", capability: "email.view" }, async () => loadEmailOverview());
