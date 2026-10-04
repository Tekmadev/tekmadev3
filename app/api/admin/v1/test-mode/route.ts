import { requireDb, route } from "@/lib/admin-api";
import { getTestMode } from "@/lib/admin-api/testMode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /test-mode -> { keysConfigured, webhookSecretConfigured, catalog, counts,
 * recentPurchases }. Owner. Recent purchases are the latest six sandbox orders.
 */
export const GET = route({ method: "GET", capability: "testmode.view" }, async () => getTestMode(requireDb()));
