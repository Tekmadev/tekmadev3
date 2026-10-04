import { route } from "@/lib/admin-api";
import { buildOverview } from "@/lib/admin-api/overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /overview -> { kpis, attention, attentionClients, traffic, topLinks,
 * recentLeads, recentSubscriptions, inbox }. Any staff (no 403); the inbox
 * block is the caller's, topLinks is null for managers, and subscription data
 * is null for staff (see lib/admin-api/overview). No error codes beyond the
 * shared ones: a part that cannot be read fails the whole answer (500
 * `unavailable`), never a zero.
 */
export const GET = route({ method: "GET", capability: "overview.view" }, async (ctx) => buildOverview(ctx));
