/**
 * Staff management and commission credit for the admin API
 * (docs/admin-api/staff.md): the activity scoreboard, a client's credits and
 * the default credit split. Role changes and pausing live with the team
 * (lib/admin-api/team), lead credit (found_by, booked_by) with the leads.
 */

export { activityQuery, teamActivity, myActivity, ACTIVITY_NOT_READY } from "./activity";
export type { ApiStaffActivity, ApiStaffActivityRow, ApiActivityCredit } from "./activity";
export { bundleCredits, getClientCredits, putClientCredits, CREDITS_NOT_READY } from "./credits";
export type { ApiCredit, ApiClientCredits } from "./credits";
export { commissionBody, readCommission, saveCommission, COMMISSION_MESSAGES } from "./commission";
