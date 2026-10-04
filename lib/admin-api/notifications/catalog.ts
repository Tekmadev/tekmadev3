import { ADMIN_CATEGORIES, ADMIN_EVENTS, type AdminCategory, type AdminSeverity } from "@/lib/admin-notify";
import { can, isOwnerOnly, type Capability } from "../permissions";
import type { AdminRole } from "@/lib/admin";

/**
 * The Inbox catalogue as the app sees it: categories, severities and event
 * labels. One place, read by GET /meta, the item serializer and the push
 * sender, so a label on a row, in meta and on a phone notification is always
 * the same text. The event catalogue itself lives in lib/admin-notify.ts.
 */

export const NOTIFICATION_CATEGORIES: readonly AdminCategory[] = ADMIN_CATEGORIES.map((c) => c.key);

export const NOTIFICATION_SEVERITIES: readonly AdminSeverity[] = ["info", "success", "warning", "critical"];

export const NOTIFICATION_FILTERS = ["all", "unread", "action"] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

type Tone = "neutral" | "gold" | "ok" | "warn" | "muted" | "signal";

const SEVERITY_META: Record<AdminSeverity, { label: string; tone: Tone }> = {
  info: { label: "Info", tone: "neutral" },
  success: { label: "Success", tone: "ok" },
  warning: { label: "Warning", tone: "warn" },
  critical: { label: "Critical", tone: "signal" },
};

export function isNotificationCategory(value: string | null | undefined): value is AdminCategory {
  return NOTIFICATION_CATEGORIES.includes(value as AdminCategory);
}

/** The capability that lets a role read a category's rows. */
export function categoryCapability(category: AdminCategory): Capability {
  return `inbox.${category}` as Capability;
}

/** Whether a role may read a category at all (the permission matrix). */
export function roleReadsCategory(role: AdminRole, category: AdminCategory): boolean {
  return can(role, categoryCapability(category));
}

/** "Leads", "Audience", ... */
export function categoryLabel(category: string): string {
  return ADMIN_CATEGORIES.find((c) => c.key === category)?.label ?? humanizeKey(category);
}

/** "lead.booked" -> "Lead booked": only for a key the catalogue does not know (an old row). */
function humanizeKey(key: string): string {
  const s = key.replace(/[._-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}

/** The catalogue label every row carries ("New booking"). */
export function eventLabel(eventKey: string): string {
  const def = (ADMIN_EVENTS as Record<string, { label: string } | undefined>)[eventKey];
  return def?.label ?? humanizeKey(eventKey);
}

/** The Inbox slice of GET /meta (src/api/schemas/notifications.ts `metaFragment`). */
export function notificationsMeta() {
  return {
    notificationCategories: ADMIN_CATEGORIES.map((c) => ({
      value: c.key,
      label: c.label,
      // True only when owners alone hold the category's `inbox.*` capability:
      // none since managers read every category (owner decision 2026-10-03).
      ownerOnly: isOwnerOnly(categoryCapability(c.key)),
    })),
    notificationSeverities: NOTIFICATION_SEVERITIES.map((value) => ({ value, ...SEVERITY_META[value] })),
    notificationEvents: Object.entries(ADMIN_EVENTS).map(([key, def]) => {
      const d = def as { label: string; category: AdminCategory; severity: AdminSeverity; needsAction?: boolean };
      return { key, label: d.label, category: d.category, severity: d.severity, needsAction: d.needsAction ?? false };
    }),
  };
}
