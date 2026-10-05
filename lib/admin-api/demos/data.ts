import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerEmails } from "@/lib/admin";
import { notifyAdmins } from "@/lib/admin-notify";
import { decodeCursor, keysetFilter, toPage } from "../cursor";
import { dbError, isUuid, requireDb } from "../data";
import { MESSAGES, badRequest, businessRule, conflict, notConfigured, notFound, type ApiError } from "../errors";
import { canonicalJson } from "../idempotency";
import { forbiddenError } from "../permissions";
import { DEMO_MESSAGES, type DemoCreateInput, type DemoPatchInput } from "./input";
import { demoSchemaMissing } from "./link";
import {
  DEMO_COLUMNS,
  DEMO_EVENT_COLUMNS,
  MANAGE_MOVES,
  OPEN_STATUSES,
  REQUESTER_EDITABLE,
  REQUESTER_MOVES,
  isClosed,
  isRequester,
  monthDay,
  toDemo,
  toDemoStatus,
  toEvent,
  type DemoActor,
  type DemoBusiness,
  type DemoEventRow,
  type DemoEventType,
  type DemoLinks,
  type DemoRequest,
  type DemoRow,
  type DemoStatus,
  type DemoStatusFilter,
} from "./shape";

/**
 * Reads and writes behind /demos (docs/admin-api/demos.md), shared by the
 * admin API routes (app/api/admin/v1/demos/**) and the web admin
 * (app/admin/(dashboard)/demos/**). Failures are thrown as ApiError and never
 * carry a database message; before the migration every call answers 503
 * `not_configured`.
 */

type DbError = { code?: string; message?: string } | null | undefined;

const notReady = () => notConfigured(DEMO_MESSAGES.notReady);

/** A failed query: 503 before the migration, else the logged 500. */
function failed(what: string, error: DbError): ApiError {
  if (demoSchemaMissing(error)) return notReady();
  return dbError(what, error);
}

const THAT_DEMO = "That demo request";

/** A uuid that is the same for the same person and idempotency key, so a retried create can never write twice. */
function demoIdFor(userId: string, key: string): string {
  const h = createHash("sha256").update(`demo:${userId}:${key}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** sha256 of what a create asked for (the idempotency key left out), to refuse a reused key with a different body. */
function requestHashOf(input: DemoCreateInput): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

/** Test client requests are only there for roles that see test data, like the client. */
const hiddenFrom = (actor: DemoActor, row: Pick<DemoRow, "is_test">) => Boolean(row.is_test) && !actor.can("testdata.view");

const lower = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/* ------------------------------------------------------------------ */
/* Names and links                                                     */
/* ------------------------------------------------------------------ */

/** Everyone on the team (env owners, then the admins table), email to name. */
export async function demoTeam(actor: Pick<DemoActor, "email" | "name">): Promise<Map<string, string | null>> {
  const db = requireDb();
  const { data, error } = await db.from("admins").select("email,name");
  if (error) throw dbError("demo team", error);
  const team = new Map<string, string | null>();
  for (const email of ownerEmails()) team.set(email, null);
  for (const row of (data ?? []) as { email: string | null; name: string | null }[]) {
    const email = lower(row.email);
    if (!email) continue;
    team.set(email, row.name?.trim() || team.get(email) || null);
  }
  if (team.has(actor.email) && !team.get(actor.email) && actor.name) team.set(actor.email, actor.name);
  return team;
}

/** Display names for team emails (admins table; the caller's own name as a fallback). */
async function namesFor(db: SupabaseClient, actor: DemoActor, emails: Iterable<string>): Promise<Map<string, string | null>> {
  const wanted = [...new Set([...emails].map(lower).filter(Boolean))];
  const names = new Map<string, string | null>();
  if (wanted.length === 0) return names;
  const { data, error } = await db.from("admins").select("email,name").in("email", wanted);
  if (error) throw dbError("demo names", error);
  for (const row of (data ?? []) as { email: string; name: string | null }[]) names.set(lower(row.email), row.name?.trim() || null);
  if (wanted.includes(actor.email) && !names.get(actor.email)) names.set(actor.email, actor.name);
  return names;
}

/** Client and lead display names, and the names of everyone in `emails`. */
async function linksFor(db: SupabaseClient, actor: DemoActor, rows: readonly DemoRow[], emails: Iterable<string>): Promise<DemoLinks> {
  const clientIds = [...new Set(rows.map((r) => r.client_id).filter((v): v is string => !!v))];
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter((v): v is string => !!v))];
  const [clients, leads, names] = await Promise.all([
    clientIds.length ? db.from("clients").select("id,business_name").in("id", clientIds) : Promise.resolve({ data: [], error: null }),
    leadIds.length ? db.from("leads").select("id,business_name,name,email").in("id", leadIds) : Promise.resolve({ data: [], error: null }),
    namesFor(db, actor, [...rows.map((r) => r.requested_by), ...emails]),
  ]);
  if (clients.error) throw dbError("demo clients", clients.error);
  if (leads.error) throw dbError("demo leads", leads.error);
  const clientNames = new Map<string, string | null>();
  for (const c of (clients.data ?? []) as { id: string; business_name: string | null }[]) clientNames.set(c.id, c.business_name?.trim() || null);
  const leadNames = new Map<string, string | null>();
  for (const l of (leads.data ?? []) as { id: string; business_name: string | null; name: string | null; email: string | null }[]) {
    leadNames.set(l.id, l.business_name?.trim() || l.name?.trim() || l.email?.trim() || null);
  }
  return { clients: clientNames, leads: leadNames, names };
}

async function readRow(db: SupabaseClient, id: string): Promise<DemoRow | null> {
  const { data, error } = await db.from("demo_requests").select(DEMO_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw failed("demo read", error);
  return (data as unknown as DemoRow | null) ?? null;
}

async function readEvents(db: SupabaseClient, id: string): Promise<DemoEventRow[]> {
  const { data, error } = await db.from("demo_request_events").select(DEMO_EVENT_COLUMNS).eq("demo_id", id).order("id", { ascending: true }).limit(500);
  if (error) throw failed("demo events", error);
  return (data ?? []) as DemoEventRow[];
}

/* ------------------------------------------------------------------ */
/* GET /demos/:id                                                      */
/* ------------------------------------------------------------------ */

/** One request with its events, or null (unknown, malformed, or a test request the caller may not see). */
export async function getDemo(actor: DemoActor, id: string): Promise<DemoRequest | null> {
  if (!isUuid(id)) return null;
  const db = requireDb();
  const row = await readRow(db, id);
  if (!row || hiddenFrom(actor, row)) return null;
  const events = await readEvents(db, id);
  const links = await linksFor(db, actor, [row], events.map((e) => e.by_email));
  return toDemo(row, actor, links, events.map((e) => toEvent(e, links.names)));
}

async function requireDemo(actor: DemoActor, id: string): Promise<DemoRequest> {
  const demo = await getDemo(actor, id);
  if (!demo) throw notFound(THAT_DEMO);
  return demo;
}

/* ------------------------------------------------------------------ */
/* GET /demos                                                          */
/* ------------------------------------------------------------------ */

export type DemoListQuery = {
  status: DemoStatusFilter;
  /** Only requests the caller asked for. */
  mine: boolean;
  clientId?: string;
  leadId?: string;
  cursor?: string;
  limit: number;
};

export type DemoCounts = { open: number; requested: number; building: number; ready: number; mine: number };

export type DemoList = { items: DemoRequest[]; nextCursor: string | null; counts: DemoCounts };

/** The rows behind a status filter: open is requested, building and ready; all is everything. */
function statusesFor(filter: DemoStatusFilter): readonly DemoStatus[] | null {
  if (filter === "all") return null;
  if (filter === "open") return OPEN_STATUSES;
  return [filter];
}

/**
 * Newest first by createdAt (ties by id), an opaque keyset cursor. `counts`
 * ignore the status and mine filters but respect clientId and leadId: open,
 * requested, building and ready are counts of open requests, and mine is the
 * caller's own open requests.
 */
export async function listDemos(actor: DemoActor, query: DemoListQuery): Promise<DemoList> {
  const db = requireDb();
  const after = decodeCursor(query.cursor, z.tuple([z.string().min(1), z.string().min(1)]));
  const seesTest = actor.can("testdata.view");

  // The same scope for the page and the counts: client, lead, test data.
  let list = db.from("demo_requests").select(DEMO_COLUMNS);
  let counting = db.from("demo_requests").select("status,requested_by").in("status", [...OPEN_STATUSES]);
  if (query.clientId) {
    list = list.eq("client_id", query.clientId);
    counting = counting.eq("client_id", query.clientId);
  }
  if (query.leadId) {
    list = list.eq("lead_id", query.leadId);
    counting = counting.eq("lead_id", query.leadId);
  }
  if (!seesTest) {
    list = list.eq("is_test", false);
    counting = counting.eq("is_test", false);
  }

  const statuses = statusesFor(query.status);
  if (statuses) list = statuses.length === 1 ? list.eq("status", statuses[0]) : list.in("status", [...statuses]);
  if (query.mine) list = list.eq("requested_by", actor.email);
  if (after) list = list.or(keysetFilter(["created_at", "id"], [after[0], after[1]], "desc"));
  const listing = list.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(query.limit + 1);

  const [rowsRes, countRes] = await Promise.all([listing, counting.limit(10_000)]);
  if (rowsRes.error) throw failed("demos list", rowsRes.error);
  if (countRes.error) throw failed("demo counts", countRes.error);

  const counts: DemoCounts = { open: 0, requested: 0, building: 0, ready: 0, mine: 0 };
  for (const r of (countRes.data ?? []) as unknown as { status: string; requested_by: string }[]) {
    const status = toDemoStatus(r.status);
    if (status !== "requested" && status !== "building" && status !== "ready") continue;
    counts.open += 1;
    counts[status] += 1;
    if (lower(r.requested_by) === actor.email) counts.mine += 1;
  }

  const page = toPage((rowsRes.data ?? []) as unknown as DemoRow[], query.limit, (row) => [row.created_at, row.id]);
  const links = await linksFor(db, actor, page.items, []);
  return { items: page.items.map((row) => toDemo(row, actor, links, [])), nextCursor: page.nextCursor, counts };
}

/* ------------------------------------------------------------------ */
/* Events and notifications                                            */
/* ------------------------------------------------------------------ */

type NewEvent = { type: DemoEventType; from?: string | null; to?: string | null };

/** History rows, in order. A failed write is logged, never thrown: the change itself went through. */
async function writeEvents(db: SupabaseClient, demoId: string, by: string, events: readonly NewEvent[]): Promise<void> {
  if (events.length === 0) return;
  const clip = (v: string | null | undefined) => (v == null ? null : v.slice(0, 2000));
  const { error } = await db.from("demo_request_events").insert(
    events.map((e) => ({ demo_id: demoId, type: e.type, by_email: by, from_value: clip(e.from), to_value: clip(e.to) })),
  );
  if (error) console.error("[demos] history not written", demoId, error.code, error.message);
}

/**
 * "Demo requested: {business}" for the people who build demos (demos.manage:
 * owners and managers, the owner audience). Pushed to their phones, except
 * the person who asked.
 */
async function notifyRequested(demo: DemoRequest, row: Pick<DemoRow, "is_test">): Promise<void> {
  const who = demo.requestedByName || demo.requestedBy;
  await notifyAdmins({
    event: "demo.requested",
    title: `Demo requested: ${demo.business.name}`,
    body: `${who} asked for a demo${demo.neededBy ? `, needed by ${monthDay(demo.neededBy)}` : ""}.`,
    url: `/admin/demos/${demo.id}`,
    entity: { type: "demo_request", id: demo.id },
    clientId: demo.clientId,
    actor: { type: "staff", label: who },
    isTest: Boolean(row.is_test),
    dedupeKey: `demo.requested:${demo.id}`,
    data: { demoId: demo.id, clientId: demo.clientId, leadId: demo.leadId, requestedBy: demo.requestedBy, neededBy: demo.neededBy },
    push: { except: [demo.requestedBy] },
  });
}

/**
 * "Demo ready: {business}". Every role reads it in Clients; only the person
 * who asked gets the push (not when they marked it ready themselves). Each
 * time it becomes ready is news, so a rework that is ready again notifies again.
 */
async function notifyReady(demo: DemoRequest, row: Pick<DemoRow, "is_test">, by: DemoActor): Promise<void> {
  await notifyAdmins({
    event: "demo.ready",
    title: `Demo ready: ${demo.business.name}`,
    body: "Open the link and show it to the client.",
    url: `/admin/demos/${demo.id}`,
    entity: { type: "demo_request", id: demo.id },
    clientId: demo.clientId,
    actor: { type: "staff", label: by.name || by.email },
    isTest: Boolean(row.is_test),
    dedupeKey: `demo.ready:${demo.id}:${demo.readyAt ?? ""}`,
    data: { demoId: demo.id, clientId: demo.clientId, leadId: demo.leadId, requestedBy: demo.requestedBy, demoUrl: demo.demoUrl },
    push: { only: [demo.requestedBy], except: [by.email] },
  });
}

/* ------------------------------------------------------------------ */
/* POST /demos                                                         */
/* ------------------------------------------------------------------ */

type ClientRef = { id: string; business_name: string | null; is_test: boolean | null; deleted_at: string | null };

/** The client a demo may be for: live (not trashed), and a test client only for roles that see test data. */
const usableClient = (actor: DemoActor, c: ClientRef | null) => !!c && !c.deleted_at && (!c.is_test || actor.can("testdata.view"));

/** A retried create: the same request answers the first result; a different one is 409 `idempotency_conflict`. */
async function replay(actor: DemoActor, existing: DemoRow, hash: string): Promise<DemoRequest> {
  if (lower(existing.requested_by) !== actor.email || (existing.request_hash && existing.request_hash !== hash)) {
    throw conflict("idempotency_conflict", MESSAGES.idempotencyConflict);
  }
  return requireDemo(actor, existing.id);
}

/**
 * A new request, status requested, for a client or a lead (404 when it does
 * not exist). A lead that already became a client gets that client too. With
 * an idempotency key the id comes from the key, so a retry after a timeout
 * finds the request it already wrote. Tells the builders (Inbox and push).
 */
export async function createDemo(actor: DemoActor, input: DemoCreateInput, idempotencyKey: string | null): Promise<DemoRequest> {
  const db = requireDb();
  const hash = requestHashOf(input);
  const id = idempotencyKey ? demoIdFor(actor.userId, idempotencyKey) : randomUUID();

  if (idempotencyKey) {
    const existing = await readRow(db, id);
    if (existing) return replay(actor, existing, hash);
  }

  let clientId: string | null = null;
  let leadId: string | null = null;
  let isTest = false;
  if (input.clientId) {
    if (!isUuid(input.clientId)) throw notFound("That client");
    const { data, error } = await db.from("clients").select("id,business_name,is_test,deleted_at").eq("id", input.clientId).maybeSingle();
    if (error) throw dbError("demo client read", error);
    const client = data as ClientRef | null;
    if (!client || !usableClient(actor, client)) throw notFound("That client");
    clientId = client.id;
    isTest = Boolean(client.is_test);
  } else {
    if (!isUuid(input.leadId)) throw notFound("That lead");
    const { data, error: leadError } = await db.from("leads").select("id").eq("id", input.leadId).maybeSingle();
    if (leadError) throw dbError("demo lead read", leadError);
    const lead = data as { id: string } | null;
    if (!lead) throw notFound("That lead");
    leadId = lead.id;
    // Already a client: the request shows there too (the same link a conversion makes later).
    const { data: clients, error } = await db
      .from("clients")
      .select("id,business_name,is_test,deleted_at")
      .eq("lead_id", lead.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(5);
    if (error) throw dbError("demo lead client read", error);
    const client = ((clients ?? []) as ClientRef[]).find((c) => usableClient(actor, c)) ?? null;
    if (client) {
      clientId = client.id;
      isTest = Boolean(client.is_test);
    }
  }

  const b = input.business;
  const { error } = await db.from("demo_requests").insert({
    id,
    status: "requested",
    client_id: clientId,
    lead_id: leadId,
    business_name: b.name,
    business_type: b.type,
    area: b.area,
    offer: b.offer,
    website: b.website,
    brand: b.brand,
    customers: b.customers,
    wants: input.wants,
    needed_by: input.neededBy,
    requested_by: actor.email,
    is_test: isTest,
    request_hash: hash,
  });
  if (error) {
    if (error.code === "23505" && idempotencyKey) {
      // Two retries raced: the other one wrote it.
      const existing = await readRow(db, id);
      if (existing) return replay(actor, existing, hash);
    }
    // The client or lead went away in between.
    if (error.code === "23503") throw notFound(input.clientId ? "That client" : "That lead");
    throw failed("demo create", error);
  }

  await writeEvents(db, id, actor.email, [{ type: "created", from: null, to: "requested" }]);
  const demo = await requireDemo(actor, id);
  await notifyRequested(demo, { is_test: isTest });
  return demo;
}

/* ------------------------------------------------------------------ */
/* PATCH /demos/:id                                                    */
/* ------------------------------------------------------------------ */

const BUSINESS_COLUMNS: Record<keyof DemoBusiness, keyof DemoRow> = {
  name: "business_name",
  type: "business_type",
  area: "area",
  offer: "offer",
  website: "website",
  brand: "brand",
  customers: "customers",
};

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null);

/**
 * Partial: only the keys sent change, null clears an optional one. Who may do what:
 *   - nobody but `demos.manage` and the person who asked: 403 `forbidden`
 *   - nothing changes on a shown or cancelled request: 409 `demo_closed`
 *     (sending what it already says is not a change, so a retried PATCH answers 200)
 *   - the person who asked (without demos.manage): details while requested or
 *     building, cancelled from requested or building, shown from ready; the
 *     link, the builder, the note and anything else: 403 `forbidden`
 *   - demos.manage: any detail, link, builder or note while open; status moves
 *     in MANAGE_MOVES, else 422 `status_change`
 *   - ready (or staying ready) needs the demo link: 400 `demo_url` "Add the demo link first."
 *   - the builder must be on the team: 400 `validation` { builderEmail }
 * Moving to building with nobody building it makes the caller the builder.
 * Answers the full request with its events; becoming ready tells the person who asked.
 */
export async function updateDemo(actor: DemoActor, id: string, patch: DemoPatchInput): Promise<DemoRequest> {
  return applyPatch(actor, id, patch, 0);
}

async function applyPatch(actor: DemoActor, id: string, patch: DemoPatchInput, attempt: number): Promise<DemoRequest> {
  if (!isUuid(id)) throw notFound(THAT_DEMO);
  const db = requireDb();
  const row = await readRow(db, id);
  if (!row || hiddenFrom(actor, row)) throw notFound(THAT_DEMO);

  const manages = actor.can("demos.manage");
  const own = actor.can("demos.request") && isRequester(actor, row);
  if (!manages && !own) throw forbiddenError("demos.manage");

  const status = toDemoStatus(row.status);
  const update: Record<string, string | null> = {};

  let detailsChanged = false;
  for (const [key, value] of Object.entries(patch.business ?? {}) as [keyof DemoBusiness, string | null][]) {
    const column = BUSINESS_COLUMNS[key];
    if (!same(row[column] as string | null, value)) {
      update[column] = value;
      detailsChanged = true;
    }
  }
  if (patch.wants !== undefined && !same(row.wants, patch.wants)) {
    update.wants = patch.wants;
    detailsChanged = true;
  }
  const currentNeededBy = row.needed_by ? row.needed_by.slice(0, 10) : null;
  if (patch.neededBy !== undefined && !same(currentNeededBy, patch.neededBy)) {
    update.needed_by = patch.neededBy;
    detailsChanged = true;
  }
  const noteChanged = patch.builderNote !== undefined && !same(row.builder_note, patch.builderNote);
  if (noteChanged) update.builder_note = patch.builderNote ?? null;
  const linkChanged = patch.demoUrl !== undefined && !same(row.demo_url, patch.demoUrl);
  if (linkChanged) update.demo_url = patch.demoUrl ?? null;
  let builderChanged = patch.builderEmail !== undefined && !same(lower(row.builder_email) || null, patch.builderEmail);
  if (builderChanged) update.builder_email = patch.builderEmail ?? null;
  const next = patch.status ?? status;
  const statusChanged = next !== status;

  if (!detailsChanged && !noteChanged && !linkChanged && !builderChanged && !statusChanged) return requireDemo(actor, id);
  if (isClosed(status)) throw conflict("demo_closed", DEMO_MESSAGES.closed);

  if (!manages) {
    if (noteChanged || linkChanged || builderChanged) throw forbiddenError("demos.manage");
    if (detailsChanged && !REQUESTER_EDITABLE.includes(status)) throw forbiddenError("demos.manage");
    if (statusChanged && !REQUESTER_MOVES[status].includes(next)) throw forbiddenError("demos.manage");
  } else if (statusChanged && !MANAGE_MOVES[status].includes(next)) {
    throw businessRule("status_change", DEMO_MESSAGES.statusChange, { status: DEMO_MESSAGES.statusChange });
  }

  const nextUrl = linkChanged ? (patch.demoUrl ?? null) : row.demo_url;
  if ((next === "ready" || next === "shown") && !nextUrl) {
    throw badRequest("demo_url", DEMO_MESSAGES.demoUrlFirst, { demoUrl: DEMO_MESSAGES.demoUrlFirst });
  }
  if (builderChanged && patch.builderEmail) {
    const team = await demoTeam(actor);
    if (!team.has(patch.builderEmail)) {
      throw badRequest("validation", DEMO_MESSAGES.builderEmail, { builderEmail: DEMO_MESSAGES.builderEmail });
    }
  }

  // Starting to build with nobody on it: the caller is building it.
  if (statusChanged && next === "building" && !builderChanged && !row.builder_email) {
    update.builder_email = actor.email;
    builderChanged = true;
  }
  const now = new Date().toISOString();
  if (statusChanged) {
    update.status = next;
    if (next === "ready") update.ready_at = now;
    if (next === "shown") update.shown_at = now;
    if (next === "cancelled") update.cancelled_at = now;
  }

  // Guarded by the status read above, so two people moving it at once cannot both win.
  const { data, error } = await db.from("demo_requests").update(update).eq("id", id).eq("status", row.status).select("id");
  if (error) throw failed("demo update", error);
  if (!data || data.length === 0) {
    // Changed (or removed) since it was read: decide again on what is there now, once.
    if (attempt === 0) return applyPatch(actor, id, patch, 1);
    if (!(await readRow(db, id))) throw notFound(THAT_DEMO);
    throw conflict("demo_changed", DEMO_MESSAGES.changed);
  }

  const events: NewEvent[] = [];
  if (detailsChanged || noteChanged) events.push({ type: "edited" });
  if (builderChanged) events.push({ type: "builder", from: lower(row.builder_email) || null, to: (update.builder_email as string | null) ?? null });
  if (linkChanged) events.push({ type: "link", from: row.demo_url, to: patch.demoUrl ?? null });
  if (statusChanged) events.push({ type: "status", from: status, to: next });
  await writeEvents(db, id, actor.email, events);

  const demo = await requireDemo(actor, id);
  if (statusChanged && next === "ready") await notifyReady(demo, row, actor);
  return demo;
}
