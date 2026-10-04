import { route } from "@/lib/admin-api";
import { inboxSummary, inboxViewer } from "@/lib/admin-api/notifications";
import { schedulePushMaintenance } from "@/lib/admin-api/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /notifications/summary -> { unread, needsAction, criticalUnread }. Any
 * staff, their own badge (test rows excluded, quiet categories not unread).
 * The app polls it, so it also gives push receipts a chance to be read after
 * the response (throttled, see lib/admin-api/push).
 */
export const GET = route({ method: "GET", capability: "notifications.view" }, async (ctx) => {
  schedulePushMaintenance();
  return inboxSummary(inboxViewer(ctx));
});
