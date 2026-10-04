import { route } from "@/lib/admin-api";
import {
  inboxRowOrNotFound,
  inboxSummary,
  inboxViewer,
  resolveBody,
  resolveInboxRow,
  toNotificationItems,
} from "@/lib/admin-api/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /notifications/:id/resolve { resolved } -> { item, summary }.
 * "Mark as handled" (true) or "Reopen" (false). Resolution is shared by all
 * staff; resolving a row that is already resolved keeps the first resolver.
 * Also marks the row read for the caller.
 *
 *   400 resolved        Send resolved as true or false.
 *   404 not_found       That notification no longer exists.
 *   422 not_actionable  This notification does not need action.
 */
export const POST = route({ method: "POST", capability: "notifications.view", body: resolveBody }, async (ctx, { params, body }) => {
  const viewer = inboxViewer(ctx);
  await resolveInboxRow(viewer, params.id, body.resolved);
  const [row, summary] = await Promise.all([inboxRowOrNotFound(viewer, params.id), inboxSummary(viewer)]);
  const [item] = await toNotificationItems(viewer, [row]);
  return { item, summary };
});
