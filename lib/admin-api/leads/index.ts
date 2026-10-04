/**
 * The leads domain of the admin API: GET /leads, GET /leads/:id and the
 * outreach endpoints (POST /leads, PATCH /leads/:id, GET and POST
 * /leads/:id/touches, GET /leads/assignees). See docs/admin-api/outreach.md.
 */

export {
  LEAD_STATUSES,
  SETTABLE_STATUSES,
  LEAD_SOURCES,
  LEAD_NEEDS,
  LEAD_REVENUE_BANDS,
  OUTREACH_SOURCE,
  toLead,
  toLeadStatus,
  storedValuesFor,
} from "./shape";
export type { Lead, LeadRow, LeadStatus, LeadSource, SettableStatus, StaffRef } from "./shape";

export {
  MESSAGES as LEAD_MESSAGES,
  TOUCH_KINDS,
  CONTACT_KINDS,
  optionalText,
  instantInput,
  statusInput,
  followUpInput,
  assigneeInput,
  needInput,
  revenueInput,
  emailInput,
  phoneInput,
  touchKindInput,
  touchAtInput,
} from "./input";
export type { TouchKind } from "./input";

export { listLeads, getLead, createOutreachLead, updateLead, listTouches, logTouch, listAssignees } from "./data";
export type { LeadListQuery, FollowUpFilter, CreateLeadInput, LeadPatch, Touch, LogTouchInput, Assignee } from "./data";
