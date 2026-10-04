import { scrubVendor } from "../crm/copy";
import { NOTIFICATION_CATEGORIES, eventLabel } from "../notifications/catalog";
import { MAX_PAYLOAD_BYTES, type ExpoMessage } from "./expo";

/**
 * What a phone receives for an Inbox row (docs/api-requests/notifications.md
 * section 7 in the app repo). The app reads `data` the same way whether the
 * push arrives in the foreground or is tapped from the shade:
 *
 *   data       exactly notificationId, url (action_url or null), category, severity
 *   channelId  the category, or "<category>-critical" for critical rows: the app
 *              creates these 14 channels at startup, and a push on a channel the
 *              phone does not have is not shown, so an unknown category uses system
 *   tag        the row id: a bump replaces the entry already in the Android shade
 *   collapseId the row id: an offline phone only gets the newest bump
 *   priority   high for every push (heads-up comes from the -critical channel)
 */

/** A row as the push sender reads it. */
export type PushRow = {
  id: string;
  event_key: string;
  category: string;
  severity: string;
  title: string;
  body: string | null;
  action_url: string | null;
};

/** The categories the app has channels for. */
const KNOWN_CHANNELS = new Set<string>(NOTIFICATION_CATEGORIES);

/** A day: after that a notification about this row is old news. */
const TTL_SECONDS = 86_400;

/** Leave room under Expo's 4 KiB for the push service's own envelope. */
const PAYLOAD_BUDGET = MAX_PAYLOAD_BYTES - 400;

/** The smaller budget for the one resend after MessageTooBig. */
const RESEND_PAYLOAD_BUDGET = 1800;
/** On that resend the body is cut to this many characters whatever its size. */
const RESEND_BODY_MAX = 160;
const RESEND_TITLE_MAX = 100;

export function channelFor(category: string, severity: string): string {
  const base = KNOWN_CHANNELS.has(category) ? category : "system";
  return severity === "critical" ? `${base}-critical` : base;
}

const bytes = (message: ExpoMessage) => Buffer.byteLength(JSON.stringify(message), "utf8");

/** Cut by code points (never in the middle of an emoji), with an ellipsis. */
function cut(text: string, maxChars: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `${chars.slice(0, Math.max(0, maxChars - 1)).join("").trimEnd()}…`;
}

/**
 * Trims the body, then the title, until the whole message fits the budget.
 * Title and body are always set: the app does not show data-only pushes while
 * it is in the background.
 */
export function fitPayload(message: ExpoMessage, budget: number = PAYLOAD_BUDGET): ExpoMessage {
  let out = message;
  let guard = 0;
  while (bytes(out) > budget && guard < 40) {
    guard += 1;
    const over = bytes(out) - budget;
    const bodyChars = Array.from(out.body).length;
    if (bodyChars > 40) {
      // At least a quarter of what is left, so a long multi-byte body converges fast.
      out = { ...out, body: cut(out.body, Math.max(40, bodyChars - Math.max(over, Math.ceil(bodyChars / 4)))) };
      continue;
    }
    const titleChars = Array.from(out.title).length;
    if (titleChars > 40) {
      out = { ...out, title: cut(out.title, Math.max(40, titleChars - Math.max(over, Math.ceil(titleChars / 4)))) };
      continue;
    }
    // Only a huge action_url can still be too big: open the Inbox detail instead.
    out = { ...out, data: { ...out.data, url: null } };
    break;
  }
  return out;
}

/** The push for one Inbox row, to one phone. */
export function rowMessage(row: PushRow, token: string, budget: number = PAYLOAD_BUDGET): ExpoMessage {
  const label = eventLabel(row.event_key);
  // Never the CRM vendor's name on a lock screen (rows written by lib/crm may carry it).
  const title = scrubVendor(row.title).trim() || label;
  const body = scrubVendor(row.body ?? "").trim() || label;
  return fitPayload(
    {
      to: token,
      title,
      body,
      data: {
        notificationId: row.id,
        url: row.action_url ?? null,
        category: row.category,
        severity: row.severity,
      },
      channelId: channelFor(row.category, row.severity),
      tag: row.id,
      collapseId: row.id,
      priority: "high",
      sound: "default",
      ttl: TTL_SECONDS,
      threadId: KNOWN_CHANNELS.has(row.category) ? row.category : "system",
    },
    budget,
  );
}

/**
 * The one resend after the push service answered MessageTooBig: always
 * shorter than the first try (body and title cut), within a smaller budget.
 */
export function shortRowMessage(row: PushRow, token: string): ExpoMessage {
  const full = rowMessage(row, token);
  return fitPayload({ ...full, title: cut(full.title, RESEND_TITLE_MAX), body: cut(full.body, RESEND_BODY_MAX) }, RESEND_PAYLOAD_BUDGET);
}

/** The id test pushes carry instead of a row id (no Inbox row behind them). */
export const TEST_NOTIFICATION_ID = "test";

/**
 * The category and channel a test push uses: Leads, the one category every
 * role reads. The app deletes the Android channels of categories a person
 * cannot read (staff phones have no "system" channel), and a push on a
 * missing channel is not shown at all.
 */
export const TEST_PUSH_CATEGORY = "leads";

/** "Send a test notification" (POST /notifications/test-push), on the Leads channel. */
export function testMessage(token: string): ExpoMessage {
  return {
    to: token,
    title: "Test notification",
    body: "Push works on this phone.",
    data: { notificationId: TEST_NOTIFICATION_ID, url: "/admin/notifications", category: TEST_PUSH_CATEGORY, severity: "info" },
    channelId: channelFor(TEST_PUSH_CATEGORY, "info"),
    tag: TEST_NOTIFICATION_ID,
    priority: "high",
    sound: "default",
  };
}
