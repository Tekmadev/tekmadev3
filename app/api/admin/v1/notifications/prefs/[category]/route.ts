import { z } from "zod";
import { ApiError, route } from "@/lib/admin-api";
import {
  INBOX_MESSAGES,
  categoryCapability,
  inboxViewer,
  isNotificationCategory,
  parsePrefPatch,
  saveInboxPref,
} from "@/lib/admin-api/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /notifications/prefs/:category { muted?, push? } -> the full row
 * { category, label, muted, push }. Partial: only the keys sent change.
 *
 *   404 not_found   That notification category does not exist.
 *   403 forbidden   Your role cannot do that. (staff changing a category they do not read)
 *   403 owner_only  That section is owner only. (only if a category ever becomes owner only again)
 *   400 input       Send quiet and push as true or false. (fields.muted, fields.push)
 *
 * The body is checked after the category (the mock's order), so it is parsed
 * in the handler.
 */
export const PATCH = route({ method: "PATCH", capability: "notifications.view", body: z.unknown() }, async (ctx, { params, body }) => {
  const category = params.category;
  if (!isNotificationCategory(category)) throw new ApiError(404, "not_found", INBOX_MESSAGES.prefNotFound);
  ctx.require(categoryCapability(category));
  const patch = parsePrefPatch(body);
  return saveInboxPref(inboxViewer(ctx), category, patch);
});
