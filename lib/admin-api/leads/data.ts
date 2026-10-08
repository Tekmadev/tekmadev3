import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerEmails } from "@/lib/admin";
import { staffSchemaMissing } from "@/lib/staff-constants";
import type { ApiContext } from "../auth";
import { decodeCursor, keysetFilter, pgQuote, toPage, type Page } from "../cursor";
import { dbError, instant, isUuid, requireDb } from "../data";
import { ApiError, badRequest, conflict, notConfigured, notFound } from "../errors";
import { CONTACT_KINDS, LEAD_DETAIL_KEYS, MESSAGES, type LeadDetailKey, type TouchKind } from "./input";
import {
  LEAD_BASE_COLUMNS,
  LEAD_COLUMNS,
  LEAD_OUTREACH_ONLY_COLUMNS,
  OUTREACH_SOURCE,
  assigneeEmail,
  finderEmail,
  formBusiness,
  isCalendarLead,
  storedValuesFor,
  storedValuesNotNew,
  toLead,
  toLeadStatus,
  type Lead,
  type LeadRow,
  type LeadStatus,
  type SettableStatus,
  type StaffRef,
} from "./shape";

/**
 * Reads and writes behind /leads (contract v1 plus the outreach endpoints in
 * docs/admin-api/outreach.md). Everything here runs under `route()`: failures
 * are thrown as ApiError and never carry a database message.
 */

type DbError = { code?: string; message?: string } | null | undefined;

/**
 * The outreach columns and lead_touches arrive with 20261003000004_lead_outreach.sql.
 * Until it is applied, reads fall back to the base columns and outreach writes
 * answer 503 instead of a vague 500.
 */
function outreachSchemaMissing(error: DbError): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "42P01" || error.code === "PGRST204" || error.code === "PGRST205") return true;
  return /follow_up_at|assigned_to|lead_touches/.test(error.message ?? "");
}

const OUTREACH_NOT_READY = "Outreach needs a database update first. Ask the owner to apply the lead outreach migration.";

/**
 * Reads lead columns, newest schema first: without the staff management
 * migration (found_by, booked_by) it reads the outreach columns, and without
 * the outreach migration the base columns (or answers 503 when the request
 * needs outreach).
 */
async function selectLeadColumns<T>(
  run: (columns: string) => PromiseLike<{ data: T; error: DbError }>,
  opts: { needsOutreach?: boolean } = {},
): Promise<{ data: T; error: DbError }> {
  let res = await run(LEAD_COLUMNS);
  if (res.error && staffSchemaMissing(res.error)) res = await run(LEAD_OUTREACH_ONLY_COLUMNS);
  if (res.error && outreachSchemaMissing(res.error)) {
    if (opts.needsOutreach) throw notConfigured(OUTREACH_NOT_READY);
    res = await run(LEAD_BASE_COLUMNS);
  }
  return res;
}

/** The staff management columns a write may carry; dropped (and not recorded) before that migration. */
const STAFF_WRITE_KEYS = ["found_by", "booked_by", "booked_at"] as const;

function withoutStaffKeys<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of STAFF_WRITE_KEYS) delete out[key];
  return out as T;
}

/** A uuid that is the same for the same caller and Idempotency-Key, so a retried create can never write twice. */
function idFor(kind: string, ctx: ApiContext, key: string | null): string {
  if (!key) return randomUUID();
  const h = createHash("sha256").update(`${kind}:${ctx.userId}:${key}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** LIKE pattern for "contains", with the user's own % _ \ taken literally. */
function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

export type Assignee = StaffRef;

/**
 * Everyone a lead can be assigned to: the env owners, then every admins row
 * (owner, manager or staff), names from the admins table.
 */
export async function listAssignees(ctx: ApiContext): Promise<Assignee[]> {
  const db = requireDb();
  const { data, error } = await db.from("admins").select("email,name");
  if (error) throw dbError("lead assignees", error);
  const byEmail = new Map<string, string | null>();
  for (const email of ownerEmails()) byEmail.set(email, null);
  for (const row of (data ?? []) as { email: string | null; name: string | null }[]) {
    const email = row.email?.trim().toLowerCase();
    if (!email) continue;
    const name = row.name?.trim() || null;
    byEmail.set(email, name ?? byEmail.get(email) ?? null);
  }
  if (byEmail.has(ctx.email) && !byEmail.get(ctx.email) && ctx.name) byEmail.set(ctx.email, ctx.name);
  return [...byEmail.entries()]
    .map(([email, name]) => ({ email, name }))
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, "en", { sensitivity: "base" }));
}

/** 400 `assigned_to` unless the email belongs to someone on the team. */
async function assertAssignable(ctx: ApiContext, email: string): Promise<void> {
  const team = await listAssignees(ctx);
  if (!team.some((m) => m.email === email)) throw badRequest("assigned_to", MESSAGES.assignedTo, { assignedTo: MESSAGES.assignedTo });
}

/** Display names for staff emails (admins table; the caller's own name as a fallback). */
async function staffNames(db: SupabaseClient, ctx: ApiContext, emails: Iterable<string>): Promise<Map<string, string | null>> {
  const wanted = [...new Set([...emails].map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const names = new Map<string, string | null>();
  if (wanted.length === 0) return names;
  const { data, error } = await db.from("admins").select("email,name").in("email", wanted);
  if (error) throw dbError("lead staff names", error);
  for (const row of (data ?? []) as { email: string; name: string | null }[]) {
    names.set(row.email.toLowerCase(), row.name?.trim() || null);
  }
  if (wanted.includes(ctx.email) && !names.get(ctx.email)) names.set(ctx.email, ctx.name);
  return names;
}

/* ------------------------------------------------------------------ */
/* Who may edit a lead's details                                       */
/* ------------------------------------------------------------------ */

/**
 * Edit lead (owner decision 2026-10-08), under `leads.update`: owners and
 * managers edit the details of any lead; staff only of a lead they found
 * (`found_by`, or `form.added_by` on an outreach lead before the staff
 * migration) or that is assigned to them (`assigned_to`). Status, follow-up
 * and assignee keep the plain `leads.update` rule. No capability of its own:
 * the role table stays as it is (permissions.ts).
 */
export function canEditLead(ctx: ApiContext, row: Pick<LeadRow, "source" | "found_by" | "added_by" | "assigned_to">): boolean {
  if (!ctx.can("leads.update")) return false;
  if (ctx.role === "owner" || ctx.role === "manager") return true;
  const me = ctx.email.trim().toLowerCase();
  return !!me && (finderEmail(row) === me || assigneeEmail(row) === me);
}

/* ------------------------------------------------------------------ */
/* Lead rows to API leads                                              */
/* ------------------------------------------------------------------ */

type ClientLink = { id: string; lead_id: string; business_name: string | null; is_test: boolean | null };

/**
 * Rows to API leads: the client each became (test clients only for
 * testdata.view), staff names, and whether the caller may edit each one.
 */
async function hydrate(db: SupabaseClient, ctx: ApiContext, rows: LeadRow[]): Promise<Lead[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [clients, names] = await Promise.all([
    db
      .from("clients")
      .select("id,lead_id,business_name,is_test")
      .in("lead_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    staffNames(
      db,
      ctx,
      rows.flatMap((r) => [r.assigned_to ?? "", r.source === OUTREACH_SOURCE ? r.added_by ?? "" : "", r.found_by ?? "", r.booked_by ?? ""]),
    ),
  ]);
  if (clients.error) throw dbError("lead clients", clients.error);
  const includeTest = ctx.can("testdata.view");
  const clientFor = new Map<string, ClientLink>();
  for (const c of (clients.data ?? []) as ClientLink[]) {
    if (c.is_test && !includeTest) continue;
    if (!clientFor.has(c.lead_id)) clientFor.set(c.lead_id, c);
  }
  return rows.map((row) => {
    const client = clientFor.get(row.id);
    return toLead(row, {
      client: client ? { id: client.id, businessName: client.business_name } : null,
      names,
      canEdit: canEditLead(ctx, row),
    });
  });
}

/** One row by id with every column, falling back to older column sets before the newer migrations. */
async function readLeadRow(db: SupabaseClient, id: string): Promise<LeadRow | null> {
  const res = await selectLeadColumns((columns) => db.from("leads").select(columns).eq("id", id).maybeSingle());
  if (res.error) throw dbError("lead read", res.error);
  return (res.data as unknown as LeadRow | null) ?? null;
}

/** GET /leads/:id. Null for an unknown or malformed id (the route answers 404). */
export async function getLead(ctx: ApiContext, id: string): Promise<Lead | null> {
  if (!isUuid(id)) return null;
  const db = requireDb();
  const row = await readLeadRow(db, id);
  if (!row) return null;
  const [lead] = await hydrate(db, ctx, [row]);
  return lead ?? null;
}

async function requireLead(ctx: ApiContext, id: string): Promise<Lead> {
  const lead = await getLead(ctx, id);
  if (!lead) throw notFound("That lead");
  return lead;
}

/* ------------------------------------------------------------------ */
/* GET /leads                                                          */
/* ------------------------------------------------------------------ */

export type FollowUpFilter = "due" | "upcoming" | "any";

export type LeadListQuery = {
  q?: string;
  source?: string;
  status?: LeadStatus;
  need?: string;
  /** "me", "none" or a staff email. */
  assigned?: string;
  followUp?: FollowUpFilter;
  /** Web due view only (never set by a route): with a follow-up filter, only follow-ups before this instant. */
  dueBefore?: string;
  cursor?: string;
  limit: number;
};

/** Phone digits with a little punctuation between them ("613 555 0199" matches "6135550199"). */
const digitsRegex = (digits: string) => digits.split("").join("[^0-9]?[^0-9]?[^0-9]?");

/**
 * Newest first by created_at (the contract). With a follow-up filter the list
 * is the follow-up queue instead: soonest follow-up first. Each order has its
 * own cursor, so a cursor from one never pages the other.
 */
export async function listLeads(ctx: ApiContext, query: LeadListQuery): Promise<Page<Lead>> {
  const db = requireDb();
  const byFollowUp = query.followUp !== undefined;
  const sortColumn = byFollowUp ? "follow_up_at" : "created_at";
  const mode = byFollowUp ? "f" : "c";
  const after = decodeCursor(query.cursor, z.tuple([z.literal(mode), z.string().min(1), z.string().min(1)]));
  const usesOutreach = byFollowUp || query.assigned !== undefined;

  // One `or` holds every OR group (search words, the "new" status, the
  // keyset), as and(or(..),or(..)): PostgREST ANDs the groups inside it.
  const groups: string[] = [];
  const q = query.q?.trim();
  if (q) {
    const like = pgQuote(containsPattern(q));
    const parts = ["name", "email", "business_name", "phone", "raw->>company"].map((c) => `${c}.ilike.${like}`);
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 4 && !/[a-z]/i.test(q)) parts.push(`phone.imatch.${pgQuote(digitsRegex(digits))}`);
    groups.push(parts.join(","));
  }
  if (query.status === "new") {
    groups.push(`status.is.null,status.not.in.(${storedValuesNotNew().map(pgQuote).join(",")})`);
  }
  if (after) {
    groups.push(keysetFilter([sortColumn, "id"], [after[1], after[2]], byFollowUp ? "asc" : "desc"));
  }

  const run = (columns: string) => {
    let req = db.from("leads").select(columns);
    if (query.source) req = req.eq("source", query.source);
    if (query.status && query.status !== "new") req = req.in("status", storedValuesFor(query.status));
    if (query.need) req = req.eq("need", query.need);
    if (query.assigned === "none") req = req.is("assigned_to", null);
    else if (query.assigned) req = req.eq("assigned_to", query.assigned === "me" ? ctx.email : query.assigned);
    if (byFollowUp) {
      req = req.not("follow_up_at", "is", null);
      const now = new Date().toISOString();
      if (query.followUp === "due") req = req.lte("follow_up_at", now);
      else if (query.followUp === "upcoming") req = req.gt("follow_up_at", now);
      if (query.dueBefore) req = req.lt("follow_up_at", query.dueBefore);
    }
    if (groups.length === 1) req = req.or(groups[0]);
    else if (groups.length > 1) req = req.or(`and(${groups.map((g) => `or(${g})`).join(",")})`);
    return req
      .order(sortColumn, { ascending: byFollowUp })
      .order("id", { ascending: byFollowUp })
      .limit(query.limit + 1);
  };

  const res = await selectLeadColumns(run, { needsOutreach: usesOutreach });
  if (res.error) throw dbError("leads list", res.error);

  const rows = (res.data ?? []) as unknown as LeadRow[];
  const page = toPage(rows, query.limit, (row) => [mode, (byFollowUp ? row.follow_up_at : row.created_at) ?? "", row.id]);
  return { items: await hydrate(db, ctx, page.items), nextCursor: page.nextCursor };
}

/* ------------------------------------------------------------------ */
/* POST /leads                                                         */
/* ------------------------------------------------------------------ */

/**
 * One email is one lead: 409 `duplicate` when another lead (any casing) has
 * this lowercased email. `exceptId` is the lead being edited. ILIKE finds the
 * casing the Cal webhook kept; the exact check drops `_` wildcard matches
 * (the same approach as lib/crm/outbox.ts).
 */
async function assertEmailFree(db: SupabaseClient, email: string, exceptId?: string): Promise<void> {
  const { data, error } = await db.from("leads").select("id,email").ilike("email", email).limit(50);
  if (error) throw dbError("lead duplicate check", error);
  const rows = (data ?? []) as { id: string; email: string | null }[];
  if (rows.some((r) => r.id !== exceptId && (r.email ?? "").trim().toLowerCase() === email)) {
    throw conflict("duplicate", MESSAGES.duplicate, { email: MESSAGES.duplicate });
  }
}

export type CreateLeadInput = {
  name?: string | null;
  business?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  need?: string | null;
  revenue?: string | null;
  message?: string | null;
  status?: SettableStatus;
  followUpAt?: string | null;
  /** Absent: the person adding the lead. Null: nobody. */
  assignedTo?: string | null;
};

/**
 * A lead added by hand (source "outreach"). One email is one lead: an email
 * already on a lead is a 409, so touches land on the lead that exists. The
 * caller found it (`found_by`, their finder credit), and booked it too when
 * it is added as "booked" (`booked_by`).
 */
export async function createOutreachLead(ctx: ApiContext, input: CreateLeadInput, idempotencyKey: string | null): Promise<Lead> {
  const db = requireDb();
  const id = idFor("lead", ctx, idempotencyKey);

  // A retry of a create that already went through answers with that lead.
  if (idempotencyKey) {
    const already = await readLeadRow(db, id);
    if (already) return (await hydrate(db, ctx, [already]))[0];
  }

  const email = input.email ?? null;
  if (email) await assertEmailFree(db, email);

  const assignedTo = input.assignedTo === undefined ? ctx.email : input.assignedTo;
  if (assignedTo) await assertAssignable(ctx, assignedTo);

  const status = input.status ?? "new";
  const row: Record<string, unknown> = {
    id,
    source: OUTREACH_SOURCE,
    status,
    name: input.name ?? null,
    email,
    phone: input.phone ?? null,
    business_name: input.business ?? null,
    website: input.website ?? null,
    need: input.need ?? null,
    revenue_band: input.revenue ?? null,
    message: input.message ?? null,
    form: { added_by: ctx.email, via: "admin_app" },
    follow_up_at: input.followUpAt ?? null,
    assigned_to: assignedTo,
    found_by: ctx.email,
    ...(status === "booked" ? { booked_by: ctx.email, booked_at: new Date().toISOString() } : {}),
  };
  let { error } = await db.from("leads").insert(row);
  if (error && staffSchemaMissing(error)) {
    // Before the staff management migration: the lead still goes in, without who found or booked it.
    console.warn("[admin-api] lead create without found_by: the staff management migration is not applied");
    ({ error } = await db.from("leads").insert(withoutStaffKeys(row)));
  }
  if (error) {
    if (error.code === "23505") {
      // Two retries raced: the other one wrote it.
      const row = await readLeadRow(db, id);
      if (row) return (await hydrate(db, ctx, [row]))[0];
    }
    // 23514: a CHECK on source from before the outreach migration.
    if (outreachSchemaMissing(error) || error.code === "23514") throw notConfigured(OUTREACH_NOT_READY);
    throw dbError("lead create", error);
  }
  return requireLead(ctx, id);
}

/* ------------------------------------------------------------------ */
/* PATCH /leads/:id                                                    */
/* ------------------------------------------------------------------ */

/** The details PATCH /leads/:id may edit (leadDetailFields): null clears one, absent leaves it. */
export type LeadDetails = { [K in LeadDetailKey]?: string | null };

export type LeadPatch = LeadDetails & {
  status?: SettableStatus;
  followUpAt?: string | null;
  assignedTo?: string | null;
};

/** The column behind each detail key. */
const DETAIL_COLUMNS: Record<LeadDetailKey, keyof LeadRow & string> = {
  name: "name",
  business: "business_name",
  email: "email",
  phone: "phone",
  website: "website",
  need: "need",
  message: "message",
};

/** Trimmed text, or null when blank. */
const stored = (v: string | null | undefined): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Whether the patch carries any detail (an edit, which needs canEditLead). */
const editsDetails = (patch: LeadPatch): boolean => LEAD_DETAIL_KEYS.some((key) => patch[key] !== undefined);

/**
 * The detail columns a patch changes. A value the lead already has is left
 * out (an email in another casing too), so a form that sends every field
 * writes only what was edited and never checks the lead's own email.
 */
function detailColumns(current: LeadRow, patch: LeadPatch): Record<string, string | null> {
  const update: Record<string, string | null> = {};
  for (const key of LEAD_DETAIL_KEYS) {
    const next = patch[key];
    if (next === undefined) continue;
    const column = DETAIL_COLUMNS[key];
    const was = stored(current[column] as string | null | undefined);
    const same = key === "email" ? (was?.toLowerCase() ?? null) === next : was === next;
    if (!same) update[column] = next;
  }
  return update;
}

/**
 * After an edit the lead must still have a name or a business, and an email
 * or a phone: POST /leads's two rules, with the same codes and copy. A key
 * not sent keeps what the lead shows (a business from the form counts).
 */
function assertComplete(current: LeadRow, patch: LeadPatch): void {
  const after = <K extends LeadDetailKey>(key: K, shown: string | null) => (patch[key] !== undefined ? patch[key] ?? null : shown);
  const fields: Record<string, string> = {};
  if (!after("name", stored(current.name)) && !after("business", stored(current.business_name) ?? formBusiness(current))) {
    fields.name = MESSAGES.name;
  }
  if (!after("email", stored(current.email)) && !after("phone", stored(current.phone))) fields.email = MESSAGES.contact;
  if (fields.name) throw badRequest("name", MESSAGES.name, fields);
  if (fields.email) throw badRequest("email", MESSAGES.contact, fields);
}

/**
 * 400 `status` for "booked" on a lead the booking calendar owns (a Cal
 * booking, or a lead a booking was attached to) that does not already show
 * booked: its status drives the CRM's booked-call reminders. Sending "booked"
 * to a lead that already shows it changes nothing but records the booker.
 */
function assertBookable(current: LeadRow, status: SettableStatus | undefined): void {
  if (status === "booked" && isCalendarLead(current) && toLeadStatus(current.status) !== "booked") {
    throw badRequest("status", MESSAGES.bookedByCalendar, { status: MESSAGES.bookedByCalendar });
  }
}

/**
 * The columns a patch writes, leaving out a status the lead already shows (so
 * "rescheduled" stays). The booker is not one of them: recordBooker writes it.
 */
function patchColumns(current: LeadRow, patch: LeadPatch): Record<string, string | null> {
  const update: Record<string, string | null> = {};
  if (patch.status !== undefined && patch.status !== toLeadStatus(current.status)) update.status = patch.status;
  if (patch.followUpAt !== undefined) update.follow_up_at = patch.followUpAt;
  if (patch.assignedTo !== undefined) update.assigned_to = patch.assignedTo;
  return update;
}

/**
 * "booked" records the caller as the booker when nobody is yet: the first
 * person to book the lead keeps the credit. The write only lands while
 * booked_by is still empty, so when two people book at once the later one
 * changes nothing, and the lead read back afterwards shows who holds the
 * credit. booked_by is undefined (not read) before the staff management
 * migration: nothing to record then.
 */
async function recordBooker(db: SupabaseClient, id: string, current: LeadRow, status: SettableStatus | undefined, by: string): Promise<void> {
  if (status !== "booked" || current.booked_by !== null) return;
  const { error } = await db.from("leads").update({ booked_by: by, booked_at: new Date().toISOString() }).eq("id", id).is("booked_by", null);
  if (error && !staffSchemaMissing(error)) throw dbError("lead booker", error);
}

async function writeLead(db: SupabaseClient, id: string, update: Record<string, string | null>): Promise<void> {
  if (Object.keys(update).length === 0) return;
  const { data, error } = await db.from("leads").update(update).eq("id", id).select("id");
  if (error) {
    if (outreachSchemaMissing(error)) throw notConfigured(OUTREACH_NOT_READY);
    throw dbError("lead update", error);
  }
  if (!data || data.length === 0) throw notFound("That lead");
}

/**
 * Partial: only the keys sent change; null clears the follow-up, the assignee
 * or a detail. "booked" records the caller as the booker the first time.
 *
 * Details (name, business, email, phone, website, need, message) on any lead,
 * whatever its source: sending any of them needs canEditLead (else 403
 * `forbidden`, nothing written), the lead must still have a name or a
 * business and an email or a phone (400 `name` / `email`), and a new email
 * must not be on another lead (409 `duplicate`). The whole patch is checked
 * before anything is written.
 */
export async function updateLead(ctx: ApiContext, id: string, patch: LeadPatch): Promise<Lead> {
  if (!isUuid(id)) throw notFound("That lead");
  const db = requireDb();
  const current = await readLeadRow(db, id);
  if (!current) throw notFound("That lead");
  let details: Record<string, string | null> = {};
  if (editsDetails(patch)) {
    if (!canEditLead(ctx, current)) throw new ApiError(403, "forbidden", MESSAGES.editNotYours);
    assertComplete(current, patch);
    details = detailColumns(current, patch);
  }
  assertBookable(current, patch.status);
  if (details.email) await assertEmailFree(db, details.email, id);
  if (patch.assignedTo) await assertAssignable(ctx, patch.assignedTo);
  await writeLead(db, id, { ...details, ...patchColumns(current, patch) });
  await recordBooker(db, id, current, patch.status, ctx.email);
  return requireLead(ctx, id);
}

/* ------------------------------------------------------------------ */
/* Touches                                                             */
/* ------------------------------------------------------------------ */

export type Touch = {
  id: string;
  leadId: string;
  kind: TouchKind;
  outcome: string | null;
  note: string | null;
  by: StaffRef;
  /** When it happened (ISO instant). */
  at: string;
};

type TouchRow = {
  id: string;
  lead_id: string;
  by_email: string;
  kind: string;
  outcome: string | null;
  note: string | null;
  created_at: string;
};

const TOUCH_COLUMNS = "id,lead_id,by_email,kind,outcome,note,created_at";

function toTouch(row: TouchRow, names: Map<string, string | null>): Touch {
  const email = row.by_email.trim().toLowerCase();
  return {
    id: row.id,
    leadId: row.lead_id,
    kind: (["call", "email", "dm", "meeting"].includes(row.kind) ? row.kind : "other") as TouchKind,
    outcome: row.outcome?.trim() || null,
    note: row.note && row.note.trim() ? row.note : null,
    by: { email, name: names.get(email) ?? null },
    at: instant(row.created_at),
  };
}

async function leadExists(db: SupabaseClient, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { data, error } = await db.from("leads").select("id").eq("id", id).maybeSingle();
  if (error) throw dbError("lead exists", error);
  return !!data;
}

/** GET /leads/:id/touches: newest first. */
export async function listTouches(ctx: ApiContext, leadId: string, cursor: string | undefined, limit: number): Promise<Page<Touch>> {
  const db = requireDb();
  if (!(await leadExists(db, leadId))) throw notFound("That lead");
  const after = decodeCursor(cursor, z.tuple([z.string().min(1), z.string().min(1)]));
  let req = db.from("lead_touches").select(TOUCH_COLUMNS).eq("lead_id", leadId);
  if (after) req = req.or(keysetFilter(["created_at", "id"], after, "desc"));
  const { data, error } = await req.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (error) {
    if (outreachSchemaMissing(error)) throw notConfigured(OUTREACH_NOT_READY);
    throw dbError("lead touches", error);
  }
  const page = toPage((data ?? []) as TouchRow[], limit, (row) => [row.created_at, row.id]);
  const names = await staffNames(db, ctx, page.items.map((t) => t.by_email));
  return { items: page.items.map((row) => toTouch(row, names)), nextCursor: page.nextCursor };
}

export type LogTouchInput = {
  kind: TouchKind;
  outcome?: string | null;
  note?: string | null;
  /** When it happened; absent means now. */
  at?: string;
  status?: SettableStatus;
  followUpAt?: string | null;
};

/**
 * POST /leads/:id/touches. Writes the touch, then the lead: the status sent,
 * or "contacted" when a call, email, DM or meeting is logged on a "new" lead,
 * and the follow-up when one is sent. Answers the touch and the updated lead.
 * A touch with status "booked" is the booking: the caller becomes the booker
 * when nobody is yet.
 *
 * The touch id comes from the Idempotency-Key, so a retry after a timeout finds
 * the touch it already wrote instead of logging the call twice.
 */
export async function logTouch(
  ctx: ApiContext,
  leadId: string,
  input: LogTouchInput,
  idempotencyKey: string | null,
): Promise<{ touch: Touch; lead: Lead }> {
  if (!isUuid(leadId)) throw notFound("That lead");
  const db = requireDb();
  const current = await readLeadRow(db, leadId);
  if (!current) throw notFound("That lead");
  assertBookable(current, input.status);

  const id = idFor("touch", ctx, idempotencyKey);
  const { error } = await db.from("lead_touches").insert({
    id,
    lead_id: leadId,
    by_email: ctx.email,
    kind: input.kind,
    outcome: input.outcome ?? null,
    note: input.note ?? null,
    ...(input.at ? { created_at: input.at } : {}),
  });
  if (error) {
    if (outreachSchemaMissing(error)) throw notConfigured(OUTREACH_NOT_READY);
    if (error.code === "23503") throw notFound("That lead"); // deleted in between
    if (error.code !== "23505") throw dbError("lead touch create", error);
    // Already written by an earlier try with this key: it must be for this lead.
    const { data: existing, error: readError } = await db.from("lead_touches").select("lead_id").eq("id", id).maybeSingle();
    if (readError) throw dbError("lead touch replay", readError);
    if ((existing as { lead_id: string } | null)?.lead_id !== leadId) {
      throw new ApiError(409, "idempotency_conflict", "That request was already sent with different details. Start again.");
    }
  }

  const status = input.status ?? (CONTACT_KINDS.includes(input.kind) && toLeadStatus(current.status) === "new" ? "contacted" : undefined);
  await writeLead(db, leadId, patchColumns(current, { status, followUpAt: input.followUpAt }));
  await recordBooker(db, leadId, current, status, ctx.email);

  const [touchRes, lead] = await Promise.all([
    db.from("lead_touches").select(TOUCH_COLUMNS).eq("id", id).single(),
    requireLead(ctx, leadId),
  ]);
  if (touchRes.error) throw dbError("lead touch read", touchRes.error);
  const row = touchRes.data as TouchRow;
  const names = await staffNames(db, ctx, [row.by_email]);
  return { touch: toTouch(row, names), lead };
}
