import { route } from "@/lib/admin-api";
import { inboxRowOrNotFound, inboxViewer, toNotificationItems } from "@/lib/admin-api/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /notifications/:id -> one NotificationItem with the caller's is_read and
 * is_muted (a push tap, a deep link). 404 "That notification no longer exists."
 * when it is unknown or the caller may not see it (never 403, so staff cannot
 * probe for owner-audience rows). Owners and managers (`testdata.view`) may
 * open test rows by id.
 */
export const GET = route({ method: "GET", capability: "notifications.view" }, async (ctx, { params }) => {
  const viewer = inboxViewer(ctx);
  const row = await inboxRowOrNotFound(viewer, params.id);
  const [item] = await toNotificationItems(viewer, [row]);
  return item;
});
