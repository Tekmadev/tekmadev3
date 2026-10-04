import { route } from "@/lib/admin-api";
import { getToolStats } from "@/lib/admin-api/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /tools/stats -> { submissions, last30d, optIns, leakReported: Money }. */
export const GET = route({ method: "GET", capability: "tools.view" }, async () => getToolStats());
