import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, dbError, instant, isUuid, notFound, requireDb, type ApiContext } from "@/lib/admin-api";
import { logClientBookedCall, saveBookedCallReview } from "@/lib/client-sections-data";
import { logActivity, type Client } from "@/lib/clients-data";
import { countsTowardGuarantee, guaranteeSummary, type BookedCall, type BookedCallSource } from "@/lib/onboarding-data";
import { storedDate } from "@/lib/admin-api/clients/core/dates";
import {
  COPY,
  DAY_MS,
  FieldErrors,
  findSectionClient,
  isCheckViolation,
  isEmail,
  loadPeople,
  memberNames,
  msOf,
  parseBody,
  reloadClient,
  torontoDate,
  zInstantInput,
  zText,
  type People,
} from "./shared";

/**
 * Booked calls and the guarantee they count toward: the list and the
 * guarantee in the bundle, "Log a booked call" (POST /clients/:id/calls),
 * the edit sheet (PATCH /calls/:id) and the one-tap review
 * (POST /calls/:id/review). Every write answers `{ call, guarantee }` with the
 * guarantee recomputed by the server.
 *
 * Counting is the website's own (lib/onboarding-data countsTowardGuarantee and
 * guaranteeSummary), so the web admin, the portal and the app always show the
 * same number, and the "met" switch (refreshGuaranteeStatus) agrees with them.
 * A CRM appointment arrives unreviewed (reviewed_at null, qualified false):
 * that is "needs review", `qualified: null` in the app.
 */

export const CALL_STATUSES = ["booked", "confirmed", "showed", "no_show", "cancelled", "rescheduled"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];
export const APP_CALL_SOURCES = ["crm", "manual", "phone", "website", "referral", "other"] as const;
export type AppCallSource = (typeof APP_CALL_SOURCES)[number];
export const DISQUALIFY_REASONS = ["spam", "duplicate", "out_of_area", "wrong_service", "fake", "other"] as const;
export type DisqualifyReason = (typeof DISQUALIFY_REASONS)[number];
export const CALL_REVIEW_STATES = ["needs_review", "qualified", "disqualified", "outside_window"] as const;
export type CallReview = (typeof CALL_REVIEW_STATES)[number];
export const GUARANTEE_PACES = ["met", "on_pace", "behind", "not_started", "n/a"] as const;
export type GuaranteePace = (typeof GUARANTEE_PACES)[number];

const DISQUALIFY_LABELS: Record<DisqualifyReason, string> = {
  spam: "Spam",
  duplicate: "Duplicate",
  out_of_area: "Out of area",
  wrong_service: "Wrong service",
  fake: "Fake",
  other: "Other",
};

/** The website's sources read as the app's. CRM appointments are recognised by their external id. */
const SOURCE_FROM_DB: Record<BookedCallSource, AppCallSource> = {
  receptionist: "phone",
  missed_call_textback: "phone",
  web_form: "website",
  calendar: "website",
  chat: "website",
  ads: "other",
  manual: "manual",
  import: "other",
  other: "other",
  phone: "phone",
  website: "website",
  referral: "referral",
};

/** Before migration 20261003000040 is applied, the app-only sources are stored as the nearest website source. */
const LEGACY_SOURCE: Partial<Record<AppCallSource, BookedCallSource>> = { phone: "other", website: "web_form", referral: "other" };

const CRM_PREFIX = "ghl:";
const isCrmCall = (row: Pick<BookedCall, "external_id">) => Boolean(row.external_id?.startsWith(CRM_PREFIX));

export type ApiCall = {
  id: string;
  clientId: string;
  source: AppCallSource;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  serviceRequested: string | null;
  bookedAt: string;
  bookedFor: string | null;
  status: CallStatus;
  notes: string | null;
  qualified: boolean | null;
  disqualifiedReason: DisqualifyReason | null;
  review: CallReview;
  counts: boolean;
  reviewedAt: string | null;
  reviewedBy: string | null;
  crmAppointmentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiGuarantee = {
  eligible: boolean;
  counted: number;
  target: number;
  windowDays: number;
  countRule: "booked" | "showed";
  clockStarted: boolean;
  clockStartedOn: string | null;
  endsOn: string | null;
  daysIn: number;
  daysLeft: number;
  expectedByNow: number;
  status: GuaranteePace;
  needsReview: number;
};

/** The window the guarantee counts in, as the website computes it (start to start + window days). */
function windowOf(client: Client): { startMs: number; endMs: number } | null {
  const startMs = msOf(client.guarantee_started_at);
  if (startMs === null) return null;
  return { startMs, endMs: startMs + client.guarantee_window_days * DAY_MS };
}

/** Unreviewed: a CRM appointment nobody has confirmed or dismissed yet. */
const isUnreviewed = (row: Pick<BookedCall, "reviewed_at">) => !row.reviewed_at;

export function callView(row: BookedCall, client: Client, people: People): ApiCall {
  const window = windowOf(client);
  const bookedMs = msOf(row.booked_at);
  const inWindow = !!window && bookedMs !== null && bookedMs >= window.startMs && bookedMs <= window.endMs;
  const review: CallReview = isUnreviewed(row)
    ? "needs_review"
    : !row.qualified
      ? "disqualified"
      : client.guarantee_eligible && !inWindow
        ? "outside_window"
        : "qualified";
  return {
    id: row.id,
    clientId: row.client_id,
    source: isCrmCall(row) ? "crm" : SOURCE_FROM_DB[row.source] ?? "other",
    contactName: row.contact_name,
    phone: row.contact_phone,
    email: row.contact_email,
    serviceRequested: row.service_requested,
    bookedAt: instant(row.booked_at),
    bookedFor: instant(row.booked_for),
    status: row.status,
    notes: row.notes,
    qualified: isUnreviewed(row) ? null : row.qualified,
    disqualifiedReason: row.disqualified_reason,
    review,
    counts: countsTowardGuarantee(client, row, window ? window.endMs : null),
    reviewedAt: instant(row.reviewed_at),
    reviewedBy: people.display(row.reviewed_by),
    crmAppointmentId: isCrmCall(row) ? (row.external_id ?? "").slice(CRM_PREFIX.length) : null,
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
  };
}

/**
 * The guarantee card: counted, pace and the window in Toronto dates. Pace is
 * linear (`expectedByNow = floor(target * daysIn / windowDays)`). A waived or
 * ineligible guarantee is "n/a"; one already marked met stays met.
 */
export function guaranteeFor(client: Client, rows: readonly BookedCall[], now: number = Date.now()): ApiGuarantee {
  const summary = guaranteeSummary(client, [...rows], now);
  const target = client.guarantee_target;
  const windowDays = client.guarantee_window_days;
  const base = {
    eligible: client.guarantee_eligible,
    counted: summary.counted,
    target,
    windowDays,
    countRule: client.guarantee_count_rule,
    needsReview: rows.filter(isUnreviewed).length,
  };
  if (!client.guarantee_eligible || client.guarantee_status === "waived" || client.guarantee_status === "not_eligible") {
    return { ...base, clockStarted: false, clockStartedOn: null, endsOn: null, daysIn: 0, daysLeft: 0, expectedByNow: 0, status: "n/a" };
  }
  const window = windowOf(client);
  if (!window) {
    return { ...base, clockStarted: false, clockStartedOn: null, endsOn: null, daysIn: 0, daysLeft: windowDays, expectedByNow: 0, status: "not_started" };
  }
  const daysIn = summary.daysElapsed;
  const expectedByNow = Math.floor((target * daysIn) / Math.max(windowDays, 1));
  const met = client.guarantee_status === "met" || summary.counted >= target;
  return {
    ...base,
    clockStarted: true,
    // Read the way the account's guaranteeClockStartedOn is (a date saved by hand is midnight UTC).
    clockStartedOn: storedDate(client.guarantee_started_at) ?? torontoDate(window.startMs),
    // The last moment inside the window falls on this Toronto day.
    endsOn: torontoDate(window.endMs - 1),
    daysIn,
    daysLeft: Math.max(0, windowDays - daysIn),
    expectedByNow,
    status: met ? "met" : summary.counted >= expectedByNow ? "on_pace" : "behind",
  };
}

/** Every column but `raw` (the CRM's own payload, which can be large and is never sent). */
const CALL_COLUMNS =
  "id,client_id,external_id,source,contact_name,contact_phone,contact_email,service_requested,booked_at,booked_for,status,qualified,disqualified_reason,reviewed_by,reviewed_at,notes,created_at,updated_at";

const withoutRaw = (rows: unknown): BookedCall[] => ((rows ?? []) as Omit<BookedCall, "raw">[]).map((row) => ({ ...row, raw: null }));

/** Calls the guarantee reads, newest booking first (the website reads up to 2000). */
export async function listCallRows(clientId: string, limit = 2000): Promise<BookedCall[]> {
  const { data, error } = await requireDb()
    .from("client_booked_calls")
    .select(CALL_COLUMNS)
    .eq("client_id", clientId)
    .order("booked_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw dbError("booked calls list", error);
  return withoutRaw(data);
}

/** How many calls the bundle lists (the guarantee still counts every call it reads). */
export const BUNDLE_CALLS = 500;

/** The calls list and the guarantee for one client (bundle, go live). */
export async function loadCallsAndGuarantee(client: Client, people: People): Promise<{ calls: ApiCall[]; guarantee: ApiGuarantee }> {
  const rows = await listCallRows(client.id);
  return { calls: rows.slice(0, BUNDLE_CALLS).map((row) => callView(row, client, people)), guarantee: guaranteeFor(client, rows) };
}

/** Just the guarantee (go live answers it). */
export async function loadGuarantee(client: Client): Promise<ApiGuarantee> {
  return guaranteeFor(client, await listCallRows(client.id));
}

const CALL_MISSING = "That call";

/** A call on a client the caller may see, else 404 "That call no longer exists.". */
export async function findCall(ctx: ApiContext, id: string | undefined): Promise<{ row: BookedCall; client: Client }> {
  if (!isUuid(id)) throw notFound(CALL_MISSING);
  const { data, error } = await requireDb().from("client_booked_calls").select(CALL_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError("booked call lookup", error);
  const row = data ? withoutRaw([data])[0] : null;
  if (!row) throw notFound(CALL_MISSING);
  const client = await findSectionClient(ctx, row.client_id, CALL_MISSING);
  return { row, client };
}

/** `{ call, guarantee }` after a write: the client is read again because the guarantee may have just been met. */
async function callResult(ctx: ApiContext, callId: string, clientId: string): Promise<{ call: ApiCall; guarantee: ApiGuarantee }> {
  const [client, rows, members] = await Promise.all([reloadClient(clientId), listCallRows(clientId), memberNames(clientId)]);
  const people = await loadPeople(ctx, members);
  let row = rows.find((r) => r.id === callId);
  if (!row) {
    // Older than the 2000 calls the guarantee reads: fetch it on its own.
    const { data, error } = await requireDb().from("client_booked_calls").select(CALL_COLUMNS).eq("id", callId).maybeSingle();
    if (error) throw dbError("booked call reload", error);
    if (!data) throw notFound(CALL_MISSING);
    row = withoutRaw([data])[0];
  }
  return { call: callView(row, client, people), guarantee: guaranteeFor(client, rows) };
}

const who = (row: Pick<BookedCall, "contact_name" | "contact_phone" | "contact_email">) =>
  row.contact_name ?? row.contact_phone ?? row.contact_email ?? "unknown caller";

/* ------------------------------------------------------------------ */
/* POST /clients/:id/calls                                             */
/* ------------------------------------------------------------------ */

const logBody = z.object({
  contactName: zText(200),
  phone: zText(40),
  email: zText(200),
  serviceRequested: zText(200),
  bookedAt: zInstantInput,
  bookedFor: zInstantInput,
  status: z.enum(CALL_STATUSES, { error: COPY.status }).optional(),
  notes: zText(4000),
  source: z.enum(APP_CALL_SOURCES, { error: "Pick a source from the list." }).optional(),
});

/**
 * "Log a booked call". A call logged by hand is a real prospect by
 * definition: it is reviewed and qualified at once, so it counts when it is in
 * the window and its status passes the count rule. CRM calls only arrive
 * through the sync.
 */
export async function logCall(ctx: ApiContext, clientId: string | undefined, raw: unknown): Promise<{ call: ApiCall; guarantee: ApiGuarantee }> {
  const client = await findSectionClient(ctx, clientId);
  const body = parseBody(logBody, raw);

  const errors = new FieldErrors();
  if (body.email && !isEmail(body.email)) errors.add("email", "email", COPY.email);
  if (body.source === "crm") errors.add("source", "source", "CRM calls arrive through the sync. Pick another source.");
  if (errors.empty && !body.contactName && !body.phone && !body.email) {
    errors.add("contactName", "contact", "Add a name, phone or email for this call.");
  }
  errors.throwIfAny();

  const now = new Date().toISOString();
  const source: AppCallSource = body.source ?? "manual";
  const insert = (stored: BookedCallSource) =>
    logClientBookedCall(
      {
        client_id: client.id,
        external_id: `manual-${randomUUID()}`,
        source: stored,
        contact_name: body.contactName ?? null,
        contact_phone: body.phone ?? null,
        contact_email: body.email ?? null,
        service_requested: body.serviceRequested ?? null,
        booked_at: body.bookedAt ?? now,
        booked_for: body.bookedFor ?? null,
        status: body.status ?? "booked",
        notes: body.notes ?? null,
        qualified: true,
        disqualified_reason: null,
        reviewed_by: ctx.email,
        reviewed_at: now,
      },
      ctx.email,
    );
  let saved: BookedCall;
  try {
    saved = await insert(source === "crm" ? "other" : source);
  } catch (err) {
    const legacy = LEGACY_SOURCE[source];
    if (!legacy || !isCheckViolation(err)) throw err;
    saved = await insert(legacy);
  }
  return callResult(ctx, saved.id, client.id);
}

/* ------------------------------------------------------------------ */
/* PATCH /calls/:id                                                    */
/* ------------------------------------------------------------------ */

const patchBody = z.object({
  status: z.enum(CALL_STATUSES, { error: COPY.status }).optional(),
  qualified: z.boolean({ error: "Pick yes or no." }).nullable().optional(),
  disqualifiedReason: z.enum(DISQUALIFY_REASONS, { error: "Pick a reason from the list." }).nullable().optional(),
  notes: zText(4000),
});

/**
 * The edit sheet. `qualified: false` needs a reason (sent now or already
 * set); `qualified: null` puts the call back to "needs review"; `true`
 * clears the reason.
 */
export async function updateCall(ctx: ApiContext, id: string | undefined, raw: unknown): Promise<{ call: ApiCall; guarantee: ApiGuarantee }> {
  const { row, client } = await findCall(ctx, id);
  const body = parseBody(patchBody, raw);

  const current = isUnreviewed(row) ? null : row.qualified;
  const nextQualified = body.qualified === undefined ? current : body.qualified;
  const nextReason = nextQualified === true ? null : body.disqualifiedReason === undefined ? row.disqualified_reason : body.disqualifiedReason;
  if (nextQualified === false && !nextReason) {
    throw new ApiError(400, "reason", "Pick why it does not count.", { disqualifiedReason: "Pick why it does not count." });
  }

  const now = new Date().toISOString();
  const patch: Partial<BookedCall> = {};
  if (nextReason !== row.disqualified_reason) patch.disqualified_reason = nextReason;
  if (body.status && body.status !== row.status) patch.status = body.status;
  if (body.notes !== undefined && body.notes !== row.notes) patch.notes = body.notes;
  let decided = false;
  if (body.qualified !== undefined && body.qualified !== current) {
    if (body.qualified === null) {
      // Back to review: unreviewed calls never count (the CRM sync's own shape).
      patch.qualified = false;
      patch.reviewed_at = null;
      patch.reviewed_by = null;
    } else {
      patch.qualified = body.qualified;
      patch.reviewed_at = now;
      patch.reviewed_by = ctx.email;
      decided = true;
    }
  }
  // Nothing changed: answer the call as it is, without a write or an activity line.
  if (Object.keys(patch).length === 0) return callResult(ctx, row.id, client.id);
  await saveBookedCallReview({
    callId: row.id,
    clientId: client.id,
    patch,
    by: ctx.email,
    externalId: decided && isCrmCall(row) ? row.external_id : null,
  });
  await logActivity({
    client_id: client.id,
    actor_type: "admin",
    actor_email: ctx.email,
    event: "call.updated",
    entity_type: "booked_call",
    entity_id: row.id,
    summary: `Call updated: ${who(row)}`,
  });
  return callResult(ctx, row.id, client.id);
}

/* ------------------------------------------------------------------ */
/* POST /calls/:id/review                                              */
/* ------------------------------------------------------------------ */

const reviewBody = z.object({ counts: z.boolean() });

/**
 * "Real prospect, count it" (true) or "Agree, it does not count" (false,
 * keeping the reason the CRM sync preset, else `other`).
 */
export async function reviewCall(ctx: ApiContext, id: string | undefined, raw: unknown): Promise<{ call: ApiCall; guarantee: ApiGuarantee }> {
  const { row, client } = await findCall(ctx, id);
  const parsed = reviewBody.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "counts", "Say whether the call counts.", { counts: COPY.sendBool });
  const counts = parsed.data.counts;
  const reason: DisqualifyReason | null = counts ? null : row.disqualified_reason ?? "other";
  await saveBookedCallReview({
    callId: row.id,
    clientId: client.id,
    patch: { qualified: counts, disqualified_reason: reason, reviewed_at: new Date().toISOString(), reviewed_by: ctx.email },
    by: ctx.email,
    externalId: isCrmCall(row) ? row.external_id : null,
  });
  await logActivity({
    client_id: client.id,
    actor_type: "admin",
    actor_email: ctx.email,
    event: "call.reviewed",
    entity_type: "booked_call",
    entity_id: row.id,
    summary: counts ? `${who(row)}: counts toward the guarantee.` : `${who(row)}: does not count (${DISQUALIFY_LABELS[reason ?? "other"]}).`,
  });
  return callResult(ctx, row.id, client.id);
}
