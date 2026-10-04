import { notificationsMeta } from "../notifications/catalog";
import { defineMetaFragment } from "./types";

/**
 * The notifications slice of GET /meta: the keys of `metaFragment` in the app's
 * src/api/schemas/notifications.ts (see docs/api-requests/notifications.md section 6):
 *
 *   notificationCategories  { value, label, ownerOnly }   ownerOnly: false for all seven today
 *                                                         (owners and managers read every category)
 *   notificationSeverities  { value, label, tone }        info neutral, success ok, warning warn, critical signal
 *   notificationEvents      { key, label, category, severity, needsAction }  (lib/admin-notify.ts ADMIN_EVENTS)
 *
 * The same labels for every role: they are names, not data. What a role may
 * read is enforced by the Inbox endpoints.
 */
export const metaFragment = defineMetaFragment(() => notificationsMeta());
