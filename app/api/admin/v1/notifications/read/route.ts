import { route } from "@/lib/admin-api";
import { idsBody, inboxRowsByIds, inboxSummary, inboxViewer, markInboxRead, toNotificationItems } from "@/lib/admin-api/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /notifications/read { ids } -> { items, summary }. Any staff, for
 * themselves. `items` are the rows they can see, in their new state (unknown
 * or hidden ids are left out); `summary` is the fresh badge.
 */
export const POST = route({ method: "POST", capability: "notifications.view", body: idsBody }, async (ctx, { body }) => {
  const viewer = inboxViewer(ctx);
  await markInboxRead(viewer, body.ids);
  const [rows, summary] = await Promise.all([inboxRowsByIds(viewer, body.ids), inboxSummary(viewer)]);
  return { items: await toNotificationItems(viewer, rows), summary };
});
