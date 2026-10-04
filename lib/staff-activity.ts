import { getSupabaseAdmin } from "@/lib/supabase";
import type { AdminRole } from "@/lib/admin";
import { addDays, torontoDayStart, torontoToday } from "@/lib/admin-api/analytics/calendar";
import { CREDIT_ROLES, StaffDataNotReady, staffSchemaMissing, type ActivityRange, type CreditRole } from "@/lib/staff-constants";

/**
 * The staff activity scoreboard (owner decision 2026-10-03,
 * docs/admin-api/staff.md): per person, for the last 7 days, the last 30
 * days or all time. Counted in the database by `admin_api_staff_activity`
 * and `admin_api_staff_credits` (migration 20261003000400), so a long history
 * is never pulled into the server. Shared by the admin API (GET /team/activity,
 * GET /me/activity) and the web admin.
 *
 * Ranges are Toronto calendar days: "7d" is today and the six days before it
 * (from midnight), "30d" today and the 29 before it, "all" everything.
 * Follow-ups ignore the range: due today (Toronto) and overdue (before today).
 */

export { ACTIVITY_RANGES, ACTIVITY_RANGE_LABELS } from "@/lib/staff-constants";
export type { ActivityRange } from "@/lib/staff-constants";

const RANGE_DAYS: Record<Exclude<ActivityRange, "all">, number> = { "7d": 7, "30d": 30 };

/** One credit row of a person, on a client won in the range. */
export type ActivityCredit = {
  clientId: string;
  businessName: string;
  role: CreditRole;
  share: number;
  /** When the client was created (won), as Postgres returned it. */
  wonAt: string;
};

export type StaffActivityCounts = {
  /** Leads they added by hand (found_by), created in the range. */
  leadsFound: number;
  /** Touches they logged in the range, by kind, and all of them. */
  touches: { call: number; email: number; dm: number; meeting: number; other: number; total: number };
  /** Leads assigned to them with a follow-up today (Toronto) or before today. Not ranged. */
  followUps: { dueToday: number; overdue: number };
  /** Leads they booked (booked_by), booked in the range. */
  callsBooked: number;
  /** Their credit shares / 100 over clients won in the range (1.5 = one whole client and a half). */
  clientsWon: number;
  /** Distinct clients where they changed or added a task, logged a call or wrote a note or an update. */
  clientsHelped: number;
};

export type StaffPerson = { email: string; name: string | null; role: AdminRole; paused: boolean };

export type StaffActivityRow = StaffPerson & StaffActivityCounts & { credits: ActivityCredit[] };

export type StaffActivityReport = {
  range: ActivityRange;
  /** Start of the range (Toronto midnight, ISO UTC), or null for all time. */
  since: string | null;
  /** Today in Toronto (YYYY-MM-DD): what "due today" means. */
  today: string;
  rows: StaffActivityRow[];
};

/** Where the range starts and what today is, for a moment (now by default). */
export function activityWindow(range: ActivityRange, nowMs: number = Date.now()): { since: string | null; today: string; dayStart: string; dayEnd: string } {
  const today = torontoToday(nowMs);
  const since = range === "all" ? null : torontoDayStart(addDays(today, 1 - RANGE_DAYS[range]));
  return { since, today, dayStart: torontoDayStart(today), dayEnd: torontoDayStart(addDays(today, 1)) };
}

type CountsRow = {
  email: string;
  leads_found: number | string;
  touches_call: number | string;
  touches_email: number | string;
  touches_dm: number | string;
  touches_meeting: number | string;
  touches_other: number | string;
  follow_ups_due_today: number | string;
  follow_ups_overdue: number | string;
  calls_booked: number | string;
  clients_won: number | string;
  clients_helped: number | string;
};

type CreditLineRow = {
  staff_email: string;
  client_id: string;
  business_name: string | null;
  role: string;
  share: number | string;
  won_at: string;
};

const int = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const twoDecimals = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

const ZERO: StaffActivityCounts = {
  leadsFound: 0,
  touches: { call: 0, email: 0, dm: 0, meeting: 0, other: 0, total: 0 },
  followUps: { dueToday: 0, overdue: 0 },
  callsBooked: 0,
  clientsWon: 0,
  clientsHelped: 0,
};

function countsOf(row: CountsRow | undefined): StaffActivityCounts {
  if (!row) return { ...ZERO, touches: { ...ZERO.touches }, followUps: { ...ZERO.followUps } };
  const touches = {
    call: int(row.touches_call),
    email: int(row.touches_email),
    dm: int(row.touches_dm),
    meeting: int(row.touches_meeting),
    other: int(row.touches_other),
  };
  return {
    leadsFound: int(row.leads_found),
    touches: { ...touches, total: touches.call + touches.email + touches.dm + touches.meeting + touches.other },
    followUps: { dueToday: int(row.follow_ups_due_today), overdue: int(row.follow_ups_overdue) },
    callsBooked: int(row.calls_booked),
    clientsWon: twoDecimals(row.clients_won),
    clientsHelped: int(row.clients_helped),
  };
}

const isRole = (v: string): v is CreditRole => (CREDIT_ROLES as readonly string[]).includes(v);

/**
 * The scoreboard for these people, in the order given (the API sorts). Throws
 * StaffDataNotReady before the migration is applied, and an Error on any
 * other failed read (never a board of zeros that is really a failure).
 */
export async function loadStaffActivity(people: readonly StaffPerson[], range: ActivityRange, nowMs: number = Date.now()): Promise<StaffActivityReport> {
  const window = activityWindow(range, nowMs);
  const emails = [...new Set(people.map((p) => p.email.trim().toLowerCase()).filter(Boolean))];
  const report: StaffActivityReport = { range, since: window.since, today: window.today, rows: [] };
  if (emails.length === 0) return report;

  const db = getSupabaseAdmin();
  if (!db) throw new Error("Supabase is not configured.");
  const [counts, credits] = await Promise.all([
    db.rpc("admin_api_staff_activity", { p_emails: emails, p_since: window.since, p_day_start: window.dayStart, p_day_end: window.dayEnd }),
    db.rpc("admin_api_staff_credits", { p_emails: emails, p_since: window.since }),
  ]);
  for (const res of [counts, credits]) {
    if (res.error) {
      if (staffSchemaMissing(res.error)) throw new StaffDataNotReady("staff activity functions");
      throw new Error(`staff activity: ${res.error.message}`);
    }
  }

  const countsByEmail = new Map(((counts.data ?? []) as CountsRow[]).map((r) => [r.email.toLowerCase(), r]));
  const creditsByEmail = new Map<string, ActivityCredit[]>();
  for (const r of (credits.data ?? []) as CreditLineRow[]) {
    if (!isRole(r.role)) continue;
    const email = r.staff_email.toLowerCase();
    const list = creditsByEmail.get(email) ?? [];
    list.push({ clientId: r.client_id, businessName: r.business_name?.trim() || "Client", role: r.role, share: twoDecimals(r.share), wonAt: r.won_at });
    creditsByEmail.set(email, list);
  }

  report.rows = people.map((p) => {
    const email = p.email.trim().toLowerCase();
    return { ...p, email, ...countsOf(countsByEmail.get(email)), credits: creditsByEmail.get(email) ?? [] };
  });
  return report;
}
