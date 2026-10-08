import { createHash } from "node:crypto";
import { GROW_LEAD_SOURCE } from "@/config/grow";
import type { AdminContext } from "@/lib/admin";
import { addDays, torontoDayStart, torontoToday } from "@/lib/admin-api/analytics/calendar";
import type { Page } from "@/lib/admin-api/cursor";
import { ApiError, MESSAGES, notFound } from "@/lib/admin-api/errors";
import { isValidIdempotencyKey } from "@/lib/admin-api/idempotency";
import {
  LEAD_DETAIL_KEYS,
  getLead,
  leadListQuery,
  leadPatchBody,
  leadTouchBody,
  listAssignees,
  listLeads,
  listTouches,
  logTouch,
  parseLeadInput,
  updateLead,
  type Lead,
  type LeadDetailKey,
  type LeadListQuery,
} from "@/lib/admin-api/leads";
import { can } from "@/lib/admin-api/permissions";
import { myActivity } from "@/lib/admin-api/staff/activity";
import { webApiContext } from "@/lib/admin-web-context";
import {
  COPY,
  isMe,
  leadDetailDiffers,
  leadFormText,
  sanitizeLeadListParams,
  staffName,
  statusLabel,
  torontoLocalToInstant,
  type AssigneesResult,
  type LeadActionResult,
  type LeadListParams,
  type LeadPageResult,
  type LogTouchFormInput,
  type TouchPageResult,
} from "@/lib/leads-ui";

/**
 * The web admin's Leads workspace on the server: the cookie session (from
 * requireAdmin) runs the very functions the admin API routes call (listLeads,
 * getLead, listTouches, listAssignees, updateLead, logTouch, myActivity)
 * through webApiContext, with the routes' own schemas (lib/admin-api/leads/
 * input.ts) and copy. Every exported loader and write checks its capability
 * here, first thing, whoever calls it. Anything that came from a browser
 * (server action arguments) is untrusted: strings are type-checked, list
 * params re-sanitized, long cursors refused. Every lead passes through
 * redactLead before it leaves, so staff never receive a revenue band.
 *
 * No "use server" (lib code; app/admin/(dashboard)/leads/actions.ts holds the
 * actions) and no next/* imports (the actions revalidate).
 */

export type LeadDetail = { lead: Lead | null; touches: TouchPageResult; assignees: AssigneesResult | null };

const PAGE_SIZE = 30;
const MAX_CURSOR = 512;

/** Client input is untrusted: anything but a string is "". */
const str = (v: unknown): string => (typeof v === "string" ? v : "");

const forbidden = (): LeadActionResult => ({ ok: false, code: "forbidden", message: MESSAGES.forbidden });
const forbiddenError = () => new ApiError(403, "forbidden", MESSAGES.forbidden);

/** Money stays with owners and managers: without overview.revenue the revenue band is removed. */
export function redactLead(admin: AdminContext, lead: Lead): Lead {
  return can(admin.role, "overview.revenue") ? lead : { ...lead, revenue: null };
}

/** The message for a failed load: the API's own copy, a stale list, or the generic one (logged). */
export function loadProblem(err: unknown, what: string): string {
  if (err instanceof ApiError) return err.code === "cursor" ? COPY.staleList : err.message;
  console.error(`[leads] ${what} failed`, err instanceof Error ? err.message : err);
  return COPY.loadFailed;
}

/** A write's failure: the API's code, message and fields, or the generic one (logged). */
function actionProblem(err: unknown): LeadActionResult {
  if (err instanceof ApiError) {
    return err.fields
      ? { ok: false, code: err.code, message: err.message, fields: err.fields }
      : { ok: false, code: err.code, message: err.message };
  }
  console.error("[leads] web action failed", err instanceof Error ? err.message : err);
  return { ok: false, code: "unavailable", message: MESSAGES.unavailable };
}

/** A cursor from a browser: a non-empty string of at most 512 characters, else null. */
const cursorFrom = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length <= MAX_CURSOR ? v : null);

/**
 * The Idempotency-Key of a web write (Add lead, Log outreach): the page's key
 * per intent (a UUID the form sends) plus a hash of the details, like the
 * app's key per intent. A double tap or a retry writes once, while different
 * details under the same page key (Back, then another lead) are a new write.
 * Null without a valid page key: then every call writes.
 */
export function webIdempotencyKey(pageKey: unknown, details: unknown): string | null {
  if (typeof pageKey !== "string" || !isValidIdempotencyKey(pageKey)) return null;
  const hash = createHash("sha256").update(JSON.stringify(details)).digest("hex").slice(0, 32);
  return `web:${pageKey.slice(0, 80)}:${hash}`;
}

/** A datetime-local value (Toronto) to an instant; "" and null clear; anything malformed fails the shared schema. */
function instantFrom(v: unknown): string | null {
  if (v === null || v === "") return null;
  if (typeof v !== "string") return String(v);
  return torontoLocalToInstant(v) ?? v;
}

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

/**
 * The listLeads query for a web list, checked by the route's own schema (an
 * unknown source, status or need is the route's 400). "Follow-ups due" is the
 * follow-up queue (soonest first) cut at the end of today in Toronto, the same
 * boundary as the staff activity board: `followUp: "due"` would stop at this
 * minute and hide a call planned for later today. Like the app it lists
 * everyone's follow-ups; "Show only mine" (who=mine) adds `assigned: "me"`.
 */
export function leadListQueryFor(params: LeadListParams, cursor?: string, limit: number = PAGE_SIZE, nowMs: number = Date.now()): LeadListQuery {
  const due = params.view === "due";
  const wanted: Record<string, string | number | undefined> = {
    q: params.q || undefined,
    source: params.source || undefined,
    status: params.status || undefined,
    need: params.need || undefined,
    assigned: params.view === "mine" || (due && !params.everyone) ? "me" : undefined,
    followUp: due || params.sort === "followup" ? "any" : undefined,
    cursor: cursor || undefined,
    limit,
  };
  // Only the keys a URL would carry, like the route's query object.
  const raw = Object.fromEntries(Object.entries(wanted).filter(([, v]) => v !== undefined));
  const parsed: LeadListQuery = parseLeadInput(leadListQuery, raw);
  return due ? { ...parsed, dueBefore: torontoDayStart(addDays(torontoToday(nowMs), 1)) } : parsed;
}

/** One page of a web list (leads.view). */
export async function loadLeadList(admin: AdminContext, params: LeadListParams, cursor?: string): Promise<Page<Lead>> {
  if (!can(admin.role, "leads.view")) throw forbiddenError();
  const page = await listLeads(webApiContext(admin), leadListQueryFor(params, cursor));
  return { items: page.items.map((lead) => redactLead(admin, lead)), nextCursor: page.nextCursor };
}

/** "Lead forms" on top of the list: the newest 3 /grow leads with the same search and filters (leads.view). */
export async function loadLeadFormsPreview(admin: AdminContext, params: LeadListParams): Promise<{ items: Lead[]; more: boolean }> {
  if (!can(admin.role, "leads.view")) throw forbiddenError();
  const query = leadListQueryFor({ ...params, source: GROW_LEAD_SOURCE, view: "all", sort: "newest" }, undefined, 3);
  const page = await listLeads(webApiContext(admin), query);
  return { items: page.items.map((lead) => redactLead(admin, lead)), more: page.nextCursor !== null };
}

/** "Show more leads": the next page, from what the browser sent (leads.view). */
export async function loadMoreLeads(admin: AdminContext, params: unknown, cursor: unknown): Promise<LeadPageResult> {
  if (!can(admin.role, "leads.view")) return { ok: false, message: MESSAGES.forbidden };
  const after = cursorFrom(cursor);
  if (!after) return { ok: false, message: COPY.staleList };
  try {
    const page = await loadLeadList(admin, sanitizeLeadListParams(params), after);
    return { ok: true, items: page.items, nextCursor: page.nextCursor };
  } catch (err) {
    return { ok: false, message: loadProblem(err, "leads more") };
  }
}

/**
 * Who gets the follow-up count (and Overview's Follow-ups panel): it runs
 * myActivity, so GET /me/activity's `activity.own`, and it counts leads, so
 * `leads.view`.
 */
export function canCountFollowUps(admin: AdminContext): boolean {
  return can(admin.role, "leads.view") && can(admin.role, "activity.own");
}

/**
 * My follow-ups due today and overdue (activity.own and leads.view): the same
 * database count as My activity and GET /me/activity, with no row limit.
 * Errors propagate (the 503 before the staff migration carries its own message).
 */
export async function countMyDueFollowUps(admin: AdminContext): Promise<{ overdue: number; today: number }> {
  if (!canCountFollowUps(admin)) throw forbiddenError();
  const report = await myActivity(webApiContext(admin), "7d");
  const f = report.rows[0]?.followUps;
  return { overdue: f?.overdue ?? 0, today: f?.dueToday ?? 0 };
}

/* ------------------------------------------------------------------ */
/* One lead                                                            */
/* ------------------------------------------------------------------ */

/**
 * The lead page (leads.view): the lead (null when it does not exist; any
 * other failure throws), its newest 30 touches and the assignee list (only
 * for people who can assign), each settling on its own.
 */
export async function loadLeadDetail(admin: AdminContext, id: string): Promise<LeadDetail> {
  if (!can(admin.role, "leads.view")) throw forbiddenError();
  const api = webApiContext(admin);
  const leadId = str(id);
  const wantsAssignees = can(admin.role, "leads.update") || can(admin.role, "leads.create");
  const [lead, touches, assignees] = await Promise.allSettled([
    getLead(api, leadId),
    listTouches(api, leadId, undefined, PAGE_SIZE),
    wantsAssignees ? listAssignees(api) : Promise.resolve(null),
  ]);
  if (lead.status === "rejected") throw lead.reason;
  if (!lead.value) return { lead: null, touches: { ok: false, message: COPY.notFound }, assignees: null };
  return {
    lead: redactLead(admin, lead.value),
    touches:
      touches.status === "fulfilled"
        ? { ok: true, items: touches.value.items, nextCursor: touches.value.nextCursor }
        : { ok: false, message: loadProblem(touches.reason, "lead touches") },
    assignees: !wantsAssignees
      ? null
      : assignees.status === "fulfilled"
        ? { ok: true, items: assignees.value ?? [] }
        : { ok: false, message: loadProblem(assignees.reason, "lead assignees") },
  };
}

/**
 * The Edit lead page (leads.update): the lead alone (null when it does not
 * exist; any other failure throws), with its canEdit for the signed-in person.
 */
export async function loadLeadForEdit(admin: AdminContext, id: string): Promise<Lead | null> {
  if (!can(admin.role, "leads.update")) throw forbiddenError();
  const lead = await getLead(webApiContext(admin), str(id));
  return lead ? redactLead(admin, lead) : null;
}

/** Older touches on the lead page (leads.view). */
export async function loadMoreTouches(admin: AdminContext, leadId: unknown, cursor: unknown): Promise<TouchPageResult> {
  if (!can(admin.role, "leads.view")) return { ok: false, message: MESSAGES.forbidden };
  const after = cursorFrom(cursor);
  if (!after) return { ok: false, message: COPY.staleList };
  try {
    const page = await listTouches(webApiContext(admin), str(leadId), after, PAGE_SIZE);
    return { ok: true, items: page.items, nextCursor: page.nextCursor };
  } catch (err) {
    return { ok: false, message: loadProblem(err, "lead touches more") };
  }
}

/* ------------------------------------------------------------------ */
/* Writes (PATCH /leads/:id and POST /leads/:id/touches rules)         */
/* ------------------------------------------------------------------ */

/** Status (leads.update). Booked on a calendar lead is refused with the API's copy. */
export async function setLeadStatus(admin: AdminContext, input: { leadId: string; status: string }): Promise<LeadActionResult> {
  if (!can(admin.role, "leads.update")) return forbidden();
  try {
    const patch = parseLeadInput(leadPatchBody, { status: str(input?.status) });
    const lead = await updateLead(webApiContext(admin), str(input?.leadId), patch);
    return { ok: true, message: `Marked ${statusLabel(lead.status).toLowerCase()}.`, lead: redactLead(admin, lead) };
  } catch (err) {
    return actionProblem(err);
  }
}

/** Follow-up (leads.update): a Toronto datetime-local value, or null (or "") to clear it. */
export async function setLeadFollowUp(admin: AdminContext, input: { leadId: string; followUpAt: string | null }): Promise<LeadActionResult> {
  if (!can(admin.role, "leads.update")) return forbidden();
  try {
    const patch = parseLeadInput(leadPatchBody, { followUpAt: instantFrom(input?.followUpAt) });
    const lead = await updateLead(webApiContext(admin), str(input?.leadId), patch);
    return { ok: true, message: patch.followUpAt ? "Follow-up set." : "Follow-up cleared.", lead: redactLead(admin, lead) };
  } catch (err) {
    return actionProblem(err);
  }
}

/** Owner (leads.update): a teammate's email, or null (or "") for nobody. */
export async function setLeadAssignee(admin: AdminContext, input: { leadId: string; assignedTo: string | null }): Promise<LeadActionResult> {
  if (!can(admin.role, "leads.update")) return forbidden();
  try {
    const raw: unknown = input?.assignedTo;
    const assignedTo = raw === null || raw === "" ? null : typeof raw === "string" ? raw : String(raw);
    const patch = parseLeadInput(leadPatchBody, { assignedTo });
    const lead = await updateLead(webApiContext(admin), str(input?.leadId), patch);
    return {
      ok: true,
      message: lead.assignedTo ? `Assigned to ${staffName(lead.assignedTo)}.` : "Nobody owns this lead now.",
      lead: redactLead(admin, lead),
    };
  } catch (err) {
    return actionProblem(err);
  }
}

/** The Edit lead form's values: every detail as typed ("" is empty). */
export type LeadDetailValues = Record<LeadDetailKey, string>;

/** Edit lead's success copy (the app says the same). */
export const LEAD_UPDATED = "Lead updated.";

/**
 * The details the person changed on the Edit lead form, against what the
 * form showed when it opened. Only those go in the PATCH: a detail left alone
 * is absent, so it keeps what the lead has (a business from a free tool's
 * form, a booked call's notes, an old need value, a teammate's edit made
 * meanwhile). An email in another casing is not a change (leadDetailDiffers,
 * the form's own rule for Save). "" clears.
 */
export function changedLeadDetails(values: unknown, shown: unknown): Partial<LeadDetailValues> {
  const now = values && typeof values === "object" ? (values as Record<string, unknown>) : {};
  const was = shown && typeof shown === "object" ? (shown as Record<string, unknown>) : {};
  const changed: Partial<LeadDetailValues> = {};
  for (const key of LEAD_DETAIL_KEYS) {
    if (leadDetailDiffers(key, now[key], was[key])) changed[key] = leadFormText(now[key]);
  }
  return changed;
}

/**
 * Edit lead (leads.update): the changed details through PATCH /leads/:id's
 * own schema and updateLead, so the web accepts and refuses exactly what the
 * app does, with the same codes, copy and field errors (the 403 for a lead
 * the person may not edit, a name or a business, an email or a phone, one
 * email per lead). One failure writes nothing. With nothing changed nothing
 * is written either, and the lead is still read (gone is the 404); then
 * editLeadAction opens the lead without "Lead updated.", like the app.
 */
export async function editLeadDetails(admin: AdminContext, input: { leadId: string; values: unknown; shown: unknown }): Promise<LeadActionResult> {
  if (!can(admin.role, "leads.update")) return forbidden();
  try {
    const patch = parseLeadInput(leadPatchBody, changedLeadDetails(input?.values, input?.shown));
    const lead = await updateLead(webApiContext(admin), str(input?.leadId), patch);
    return { ok: true, message: LEAD_UPDATED, lead: redactLead(admin, lead) };
  } catch (err) {
    return actionProblem(err);
  }
}

/** "I booked this call" on a lead that does not show booked (a stale page, or a call that skips the button). */
export const CLAIM_NOT_BOOKED = "This lead no longer shows booked. Refresh to see the latest.";
/** Before the staff management migration there is nowhere to record the booking credit (trying again cannot help). */
export const CLAIM_NOT_READY = "The booking credit needs a database update first. Ask the owner to apply the staff management migration.";

/** Who holds the booking credit: the caller (ok) or someone else (refused, with who). */
function bookingCreditResult(admin: AdminContext, lead: Lead, booker: NonNullable<Lead["bookedBy"]>): LeadActionResult {
  if (isMe(booker, admin.email)) return { ok: true, message: "Booking recorded. The booking credit is yours.", lead };
  return { ok: false, code: "booked_by_other", message: `${staffName(booker)} already has the booking credit.`, lead };
}

/**
 * "I booked this call" (leads.update): only on a lead that shows booked with
 * nobody holding the booking credit. The lead is read first and refused
 * without a write when it is gone, does not show booked (a claim never moves a
 * won, lost or contacted lead back to booked) or someone else has the credit;
 * when the credit is already the caller's, nothing is written either. Then it
 * sends booked, which records the caller as the booker when nobody is yet (the
 * first person keeps the credit, also when two people claim at once: the
 * booker is written only while nobody holds it, and the lead read back after
 * that write says who does).
 */
export async function claimLeadBooking(admin: AdminContext, input: { leadId: string }): Promise<LeadActionResult> {
  if (!can(admin.role, "leads.update")) return forbidden();
  try {
    const api = webApiContext(admin);
    const leadId = str(input?.leadId);
    const current = await getLead(api, leadId);
    if (!current) throw notFound("That lead");
    const shown = redactLead(admin, current);
    if (current.status !== "booked") return { ok: false, code: "not_booked", message: CLAIM_NOT_BOOKED, lead: shown };
    if (current.bookedBy) return bookingCreditResult(admin, shown, current.bookedBy);
    const patch = parseLeadInput(leadPatchBody, { status: "booked" });
    const lead = redactLead(admin, await updateLead(api, leadId, patch));
    if (lead.bookedBy) return bookingCreditResult(admin, lead, lead.bookedBy);
    return { ok: false, code: "not_recorded", message: CLAIM_NOT_READY, lead };
  } catch (err) {
    return actionProblem(err);
  }
}

const LOGGED: Record<string, string> = {
  call: "Call logged.",
  email: "Email logged.",
  dm: "DM logged.",
  meeting: "Meeting logged.",
  other: "Outreach logged.",
};

/**
 * Log outreach (leads.outreach): the touch, then the lead (a call, email, DM
 * or meeting on a "new" lead moves it to contacted; the follow-up only when
 * sent). No status is sent: the server rule decides, like the app. The key is
 * webIdempotencyKey: a double tap logs once while different details are a new
 * touch.
 */
export async function logLeadTouch(admin: AdminContext, input: LogTouchFormInput): Promise<LeadActionResult> {
  if (!can(admin.role, "leads.outreach")) return forbidden();
  try {
    const leadId = str(input?.leadId);
    const rawAt: unknown = input?.at;
    const at = rawAt === undefined || rawAt === "" ? undefined : (instantFrom(rawAt) ?? undefined);
    const hasFollowUp = !!input && typeof input === "object" && "followUpAt" in input && input.followUpAt !== undefined;
    const body: Record<string, unknown> = {
      kind: str(input?.kind),
      outcome: str(input?.outcome),
      note: str(input?.note),
      at,
    };
    if (hasFollowUp) body.followUpAt = instantFrom(input.followUpAt);
    const parsed = parseLeadInput(leadTouchBody, body);
    const key = webIdempotencyKey(input?.idempotencyKey, { leadId, ...parsed });
    const result = await logTouch(webApiContext(admin), leadId, parsed, key);
    return { ok: true, message: LOGGED[parsed.kind] ?? LOGGED.other, lead: redactLead(admin, result.lead), touch: result.touch };
  } catch (err) {
    return actionProblem(err);
  }
}
