import { route } from "@/lib/admin-api";
import { idsBody, inboxRowsByIds, inboxSummary, inboxViewer, markInboxUnread, toNotificationItems } from "@/lib/admin-api/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /notifications/unread { ids } -> { items, summary }. Any staff, for
 * themselves. The rows stay unread (on the web admin too) until read again.
 */
export const POST = route({ method: "POST", capability: "notifications.view", body: idsBody }, async (ctx, { body }) => {
  const viewer = inboxViewer(ctx);
  await markInboxUnread(viewer, body.ids);
  const [rows, summary] = await Promise.all([inboxRowsByIds(viewer, body.ids), inboxSummary(viewer)]);
  return { items: await toNotificationItems(viewer, rows), summary };
});
