import { z } from "zod";
import { badRequest } from "../errors";
import { INBOX_MESSAGES, MAX_IDS } from "./inbox";

/**
 * Request bodies of the Inbox endpoints, with the contract's copy
 * (docs/api-requests/notifications.md section 5). A body that is not a JSON
 * object reads as `{}`, so a missing field answers with that field's code,
 * like the mock does.
 */

const objectOrEmpty = (value: unknown): unknown =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};

/** POST /notifications/read and /unread: `{ ids }`, 1 to 500 ids. */
export const idsBody = z.preprocess(
  objectOrEmpty,
  z.object({
    ids: z
      .array(z.string(INBOX_MESSAGES.idsMin).min(1, INBOX_MESSAGES.idsMin), INBOX_MESSAGES.idsMin)
      .min(1, INBOX_MESSAGES.idsMin)
      .max(MAX_IDS, INBOX_MESSAGES.idsMax),
  }),
);

/** An ISO 8601 instant with an offset, any fraction (the app sends last_occurred_at as received). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/** POST /notifications/read-all: `{ seen? }` (absent or null: everything up to now). */
export const readAllBody = z.preprocess(
  objectOrEmpty,
  z.object({
    seen: z.string(INBOX_MESSAGES.seen).regex(ISO_INSTANT, INBOX_MESSAGES.seen).nullish(),
  }),
);

/** POST /notifications/:id/resolve: `{ resolved }`. */
export const resolveBody = z.preprocess(
  objectOrEmpty,
  z.object({ resolved: z.boolean(INBOX_MESSAGES.resolved) }),
);

/** POST /notifications/test-push: `{ deviceId? }` (the id POST /devices answered). */
export const testPushBody = z.preprocess(
  objectOrEmpty,
  z.object({
    deviceId: z.string("Send the id this phone registered with.").trim().max(100, "Send the id this phone registered with.").nullish(),
  }),
);

const prefPatchShape = z.object({
  muted: z.boolean().optional(),
  push: z.boolean().optional(),
});

/**
 * PATCH /notifications/prefs/:category `{ muted?, push? }`. Parsed inside the
 * handler, after the 404 and 403, in the mock's order. 400 `input` with
 * `fields.muted` / `fields.push`.
 */
export function parsePrefPatch(body: unknown): { muted?: boolean; push?: boolean } {
  const parsed = prefPatchShape.safeParse(objectOrEmpty(body));
  if (parsed.success) return parsed.data;
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field === "muted" || field === "push") fields[field] = INBOX_MESSAGES.prefField;
  }
  throw badRequest("input", INBOX_MESSAGES.prefInput, fields);
}
