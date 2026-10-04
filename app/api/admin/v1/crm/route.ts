import { route } from "@/lib/admin-api";
import { loadCrmStatus } from "@/lib/admin-api/crm/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /crm -> { connection, switches, app, mergeFields, queue, runs (latest 6),
 * lastReconcile, attention }. Owners and managers (crm.view).
 */
export const GET = route({ method: "GET", capability: "crm.view" }, async () => loadCrmStatus());
