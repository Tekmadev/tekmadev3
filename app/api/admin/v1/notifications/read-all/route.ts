import { route } from "@/lib/admin-api";
import { inboxSummary, inboxViewer, markInboxReadAll, readAllBody } from "@/lib/admin-api/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /notifications/read-all { seen? } -> { count, summary }. Marks read every
 * row the caller can see (test rows too, with `testdata.view`) with last_occurred_at <=
 * seen, or everything when `seen` is absent. `seen` is the newest
 * last_occurred_at the app showed, exactly as received, so a row that bumped
 * after the list loaded stays unread.
 */
export const POST = route({ method: "POST", capability: "notifications.view", body: readAllBody }, async (ctx, { body }) => {
  const viewer = inboxViewer(ctx);
  const count = await markInboxReadAll(viewer, body.seen ?? null);
  return { count, summary: await inboxSummary(viewer) };
});
