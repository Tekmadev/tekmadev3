/**
 * The leads domain of the admin API: GET /leads, GET /leads/:id and the
 * outreach endpoints (POST /leads, PATCH /leads/:id, GET and POST
 * /leads/:id/touches, GET /leads/assignees). See docs/admin-api/outreach.md
 * (section 1 "The booking" for `Lead.booking`, built in booking.ts).
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

export { BOOKING_STATUSES, BOOKING_HOW_KINDS, HOW_LABELS as BOOKING_HOW_LABELS, toBooking } from "./booking";
export type { Booking, BookingAnswer, BookingHow, BookingHowKind, BookingStatus } from "./booking";

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
  createLeadBody,
  leadDetailFields,
  LEAD_DETAIL_KEYS,
  leadListQuery,
  leadPatchBody,
  leadTouchBody,
  parseLeadInput,
} from "./input";
export type { TouchKind, LeadDetailKey } from "./input";

export { listLeads, getLead, createOutreachLead, updateLead, canEditLead, listTouches, logTouch, listAssignees } from "./data";
export type { LeadListQuery, FollowUpFilter, CreateLeadInput, LeadDetails, LeadPatch, Touch, LogTouchInput, Assignee } from "./data";
