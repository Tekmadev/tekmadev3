import { GROW_LEAD_SOURCE, growNeeds, revenueBands } from "@/config/grow";
import { defineMetaFragment } from "./types";

/**
 * Whether `leadSources` lists `outreach` (a lead added by hand in the app).
 * On: the app's outreach screens ship in the same release as this server
 * (docs/admin-api/outreach.md section 7), and its `zLeadSource` lists
 * `outreach` from that release on. Older app builds only log schema drift
 * for it in dev; production builds are unaffected.
 */
export const LIST_OUTREACH_SOURCE = true;

/**
 * The leads slice of GET /meta: the keys of `metaFragment` in the app's
 * src/api/schemas/leads.ts (docs/api-requests/leads.md), plus
 * `leadTouchKinds` for outreach (docs/admin-api/outreach.md).
 *
 * Labels for needs and revenue bands come from config/grow.ts, the copy the
 * /grow form shows.
 */
export const metaFragment = defineMetaFragment(() => ({
  leadSources: [
    { value: "cal_booking", label: "Booked call" },
    { value: GROW_LEAD_SOURCE, label: "Lead form" },
    { value: "lead_magnet", label: "Free tool" },
    { value: "portal_signup", label: "Portal sign-up" },
    ...(LIST_OUTREACH_SOURCE ? [{ value: "outreach", label: "Outreach" }] : []),
  ],
  leadStatuses: [
    { value: "new", label: "New", tone: "gold" },
    { value: "booked", label: "Booked", tone: "ok" },
    { value: "contacted", label: "Contacted", tone: "muted" },
    { value: "qualified", label: "Qualified", tone: "muted" },
    { value: "won", label: "Won", tone: "muted" },
    { value: "lost", label: "Lost", tone: "muted" },
    { value: "cancelled", label: "Cancelled", tone: "muted" },
  ],
  leadNeeds: growNeeds.map(({ value, label }) => ({ value, label })),
  leadRevenueBands: revenueBands.map(({ value, label }) => ({ value, label })),
  leadTouchKinds: [
    { value: "call", label: "Call" },
    { value: "email", label: "Email" },
    { value: "dm", label: "DM" },
    { value: "meeting", label: "Meeting" },
    { value: "other", label: "Other" },
  ],
}));
