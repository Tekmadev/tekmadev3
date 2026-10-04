import { z } from "zod";
import { pageQuery, route, toPage } from "@/lib/admin-api";
import {
  INBOX_MESSAGES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_FILTERS,
  decodeInboxCursor,
  inboxCursorOf,
  inboxSummary,
  inboxViewer,
  listInboxRows,
  toNotificationItems,
} from "@/lib/admin-api/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listQuery = z.object({
  filter: z.enum(NOTIFICATION_FILTERS, INBOX_MESSAGES.filter).optional(),
  // An empty category means "Everything".
  category: z.preprocess((v) => (v === "" ? undefined : v), z.enum(NOTIFICATION_CATEGORIES, INBOX_MESSAGES.category).optional()),
  test: z.string().optional(),
  ...pageQuery,
});

/**
 * GET /notifications?filter=all|unread|action&category=&test=1&cursor=&limit=
 * -> { summary, items, nextCursor }. Any staff, each seeing their own Inbox:
 * newest first by last_occurred_at (ties by id), keyset cursor, default 30,
 * max 100. A category the caller may not read answers an empty page. `test=1`
 * adds test rows for owners and managers (`testdata.view`; counted in this
 * `summary` too); staff get no test rows and no error.
 */
export const GET = route({ method: "GET", capability: "notifications.view", query: listQuery }, async (ctx, { query }) => {
  const viewer = inboxViewer(ctx);
  const after = decodeInboxCursor(query.cursor);
  const includeTest = (query.test === "1" || query.test === "true") && viewer.seesTest;
  const [rows, summary] = await Promise.all([
    listInboxRows(viewer, { filter: query.filter ?? "all", category: query.category ?? null, includeTest, after, limit: query.limit }),
    inboxSummary(viewer, includeTest),
  ]);
  const page = toPage(rows, query.limit, inboxCursorOf);
  return { summary, items: await toNotificationItems(viewer, page.items), nextCursor: page.nextCursor };
});
