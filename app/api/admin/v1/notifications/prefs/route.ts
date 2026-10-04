import { route } from "@/lib/admin-api";
import { inboxViewer, loadInboxPrefs } from "@/lib/admin-api/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /notifications/prefs -> { category, label, muted, push }[]: one row per
 * category the caller may read (managers: no Audience or Team; staff: Leads
 * and Clients). Defaults: not quiet, push on.
 */
export const GET = route({ method: "GET", capability: "notifications.view" }, async (ctx) => loadInboxPrefs(inboxViewer(ctx)));
