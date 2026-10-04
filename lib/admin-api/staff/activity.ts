import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { StaffDataNotReady } from "@/lib/staff-credit";
import { ACTIVITY_RANGES, loadStaffActivity, type ActivityRange, type StaffActivityRow, type StaffPerson } from "@/lib/staff-activity";
import type { ApiContext } from "../auth";
import { instant } from "../data";
import { notConfigured } from "../errors";
import { listTeam } from "../team";

/**
 * GET /team/activity and GET /me/activity (docs/admin-api/staff.md): the
 * staff activity scoreboard from lib/staff-activity.ts, shaped for the app.
 * Owners and managers (`team.activity`) read everyone on the team; everyone
 * (`activity.own`) reads their own row.
 */

export const ACTIVITY_NOT_READY = "The activity board needs a database update first. Ask the owner to apply the staff management migration.";

/** `?range=7d|30d|all`, 7d when absent or empty. 400 `range` otherwise. */
export const activityQuery = z.object({
  range: z.preprocess((v) => (v === undefined || v === "" ? "7d" : v), z.enum(ACTIVITY_RANGES, "Pick 7d, 30d or all.")),
});

export type ApiActivityCredit = { clientId: string; businessName: string; role: "finder" | "booker" | "other"; share: number; wonAt: string };

export type ApiStaffActivityRow = Omit<StaffActivityRow, "credits"> & { credits: ApiActivityCredit[] };

export type ApiStaffActivity = { range: ActivityRange; since: string | null; today: string; rows: ApiStaffActivityRow[] };

function apiRow(row: StaffActivityRow): ApiStaffActivityRow {
  return {
    email: row.email,
    name: row.name,
    role: row.role,
    paused: row.paused,
    leadsFound: row.leadsFound,
    touches: row.touches,
    followUps: row.followUps,
    callsBooked: row.callsBooked,
    clientsWon: row.clientsWon,
    clientsHelped: row.clientsHelped,
    credits: row.credits.map((c) => ({ clientId: c.clientId, businessName: c.businessName, role: c.role, share: c.share, wonAt: instant(c.wonAt) })),
  };
}

const display = (row: { name: string | null; email: string }) => (row.name ?? row.email).toLowerCase();

/** Most clients won first, then calls booked, touches and leads found; ties by name. */
function byScore(a: ApiStaffActivityRow, b: ApiStaffActivityRow): number {
  return (
    b.clientsWon - a.clientsWon ||
    b.callsBooked - a.callsBooked ||
    b.touches.total - a.touches.total ||
    b.leadsFound - a.leadsFound ||
    display(a).localeCompare(display(b), "en")
  );
}

async function report(people: StaffPerson[], range: ActivityRange): Promise<ApiStaffActivity> {
  try {
    const out = await loadStaffActivity(people, range);
    return { range: out.range, since: out.since, today: out.today, rows: out.rows.map(apiRow).sort(byScore) };
  } catch (err) {
    if (err instanceof StaffDataNotReady) throw notConfigured(ACTIVITY_NOT_READY);
    throw err;
  }
}

/** GET /team/activity: everyone on the team (env owners, owners, managers, staff; paused people too). */
export async function teamActivity(range: ActivityRange): Promise<ApiStaffActivity> {
  const team = await listTeam();
  return report(
    team.map((m) => ({ email: m.email, name: m.name, role: m.role, paused: m.paused })),
    range,
  );
}

/** GET /me/activity: the caller's own row (their name as the team list shows it). */
export async function myActivity(ctx: ApiContext, range: ActivityRange): Promise<ApiStaffActivity> {
  let name = ctx.name;
  const db = getSupabaseAdmin();
  if (db) {
    const { data } = await db.from("admins").select("name").eq("email", ctx.email).maybeSingle();
    const stored = (data as { name: string | null } | null)?.name?.trim();
    if (stored) name = stored;
  }
  return report([{ email: ctx.email, name, role: ctx.role, paused: false }], range);
}
