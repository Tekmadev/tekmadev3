/**
 * The vocabulary of staff management and commission credit
 * (docs/admin-api/staff.md), and how to tell that its migration is not
 * applied yet, with no imports: GET /meta, the lead routes and client code
 * read it without loading the data modules (lib/staff-credit.ts,
 * lib/staff-activity.ts).
 */

/** Credit roles on a client: who found the lead, who booked the call, anyone else who helped. */
export const CREDIT_ROLES = ["finder", "booker", "other"] as const;
export type CreditRole = (typeof CREDIT_ROLES)[number];

export const CREDIT_ROLE_LABELS: Record<CreditRole, string> = { finder: "Finder", booker: "Booker", other: "Other" };

/** The help line under each credit role in the credits editor. */
export const CREDIT_ROLE_HELP: Record<CreditRole, string> = {
  finder: "Found the lead and added it.",
  booker: "Booked the call.",
  other: "Helped win the client another way.",
};

/** The activity board's ranges: Toronto calendar days (today and the 6 or 29 before it), or everything. */
export const ACTIVITY_RANGES = ["7d", "30d", "all"] as const;
export type ActivityRange = (typeof ACTIVITY_RANGES)[number];

export const ACTIVITY_RANGE_LABELS: Record<ActivityRange, string> = { "7d": "7 days", "30d": "30 days", all: "All time" };

/** The staff management migration (20261003000400) is not applied yet. */
export class StaffDataNotReady extends Error {
  constructor(what: string) {
    super(`staff management data is not set up yet (${what})`);
    this.name = "StaffDataNotReady";
  }
}

const STAFF_SCHEMA_NAMES = /found_by|booked_by|booked_at|paused_at|paused_by|client_credits|admin_api_set_client_credits|admin_api_staff_activity|admin_api_staff_credits/;
const MISSING_CODES = new Set(["42703", "42P01", "42883", "PGRST202", "PGRST204", "PGRST205"]);

/** Whether a database error says a column, table or function of the staff management migration is missing. */
export function staffSchemaMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return MISSING_CODES.has(error.code ?? "") && STAFF_SCHEMA_NAMES.test(error.message ?? "");
}
