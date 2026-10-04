/**
 * The Inbox domain of the admin API (app/api/admin/v1/notifications/**).
 * Push delivery lives in lib/admin-api/push.
 */

export {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_FILTERS,
  isNotificationCategory,
  categoryCapability,
  roleReadsCategory,
  categoryLabel,
  eventLabel,
  notificationsMeta,
} from "./catalog";
export type { NotificationFilter } from "./catalog";

export {
  INBOX_MESSAGES,
  MAX_IDS,
  notificationNotFound,
  inboxViewer,
  decodeInboxCursor,
  inboxCursorOf,
  listInboxRows,
  inboxRowsByIds,
  inboxRowOrNotFound,
  inboxSummary,
  markInboxRead,
  markInboxUnread,
  markInboxReadAll,
  resolveInboxRow,
  toNotificationItems,
  loadInboxPrefs,
  saveInboxPref,
} from "./inbox";
export type { InboxViewer, InboxRow, NotificationItem, NotificationSummary, NotificationPref } from "./inbox";

export { idsBody, readAllBody, resolveBody, testPushBody, parsePrefPatch } from "./bodies";
