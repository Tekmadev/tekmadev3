import { getCrmProbeSetting, patchCrmProbeSetting, type CrmConfig } from "@/lib/crm/config";
import { writeEmailDnd } from "@/lib/crm/dnd";

/**
 * A thin typed HTTP client for the CRM's API 2.0.
 *
 * It never throws. Every call returns a discriminated result, because this is
 * only ever driven by the outbox worker and a thrown error there would take
 * down a whole pass instead of failing one job. A visitor's request never
 * reaches this module at all.
 *
 * Four rules here are load-bearing facts rather than preferences:
 *
 *  1. `Version: v3` on every request. It is required and its enum has exactly
 *     one member, so a request without it is refused.
 *  2. The token travels in the Authorization header, never in a URL, so it
 *     cannot land in a log or an error string. Same rule as lib/meta-ads.ts.
 *  3. An upsert NEVER carries `tags`. A supplied array overwrites the
 *     contact's entire tag set, including tags the owner's own workflows
 *     applied. `UpsertContactInput` has no such field, so it cannot be sent by
 *     accident. Tags move only through the dedicated add and remove
 *     endpoints, which return the resulting full list, so one call also gives
 *     the post-state to cache.
 *  4. Custom fields are asymmetric: written as [{ id, fieldValue }], read back
 *     as [{ id, value }]. This module owns that asymmetry and hands every
 *     caller a plain id-to-string map, because a round-trip equality check
 *     written the obvious way concludes that every field is empty.
 */

const BASE = "https://services.leadconnectorhq.com";
const VERSION = "v3";

/** Outbox jobs, so a slow CRM costs latency and nothing else. */
export const TIMEOUT_MS = 10_000;
/** The probe runs inside the owner's click on /admin/crm, so it waits less. */
export const PROBE_TIMEOUT_MS = 6_000;

const BODY_LOG_CHARS = 400;

export type CrmErrorCode =
  | "rate_limit_burst"
  | "rate_limit_daily"
  | "auth"
  | "not_found"
  | "bad_request"
  | "server"
  | "network";

export type CrmRateLimit = {
  /** Requests left in the current burst interval. */
  remaining: number | null;
  /** Length of the burst interval, which is also how long to wait out a burst 429. */
  intervalMs: number | null;
  dailyRemaining: number | null;
  /** Milliseconds from now until the daily quota resets, normalised. */
  dailyResetMs: number | null;
};

export type CrmError = {
  /** 0 for a network failure or a timeout, where there was no response. */
  status: number;
  code: CrmErrorCode;
  message: string;
  /** Always a delay in milliseconds, never an absolute time. */
  retryAfterMs: number | null;
  traceId: string | null;
};

export type CrmResponse<T> = { ok: true; data: T; rateLimit: CrmRateLimit } | { ok: false; error: CrmError };

export type GhlContact = {
  id: string;
  locationId: string | null;
  /** As the CRM holds it, which is not necessarily lowercase. Compare on a key. */
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  phone: string | null;
  source: string | null;
  /** The global switch. Unambiguous, which is why dnd.ts corroborates against it. */
  dnd: boolean | null;
  /** Raw, because the casing differs by direction. Hand it to readEmailDnd(). */
  dndSettings: unknown;
  tags: string[];
  dateAdded: string | null;
  dateUpdated: string | null;
  /** Field id to value. The `value` / `fieldValue` split never gets this far. */
  customFields: Record<string, string>;
  /** Everything the CRM sent, untouched, for an inbox row or a bug report. */
  raw: Record<string, unknown>;
};

export type GhlCustomField = {
  id: string;
  name: string | null;
  /** Fully qualified, e.g. "contact.tmd_lead_source". */
  fieldKey: string | null;
  dataType: string | null;
  model: string | null;
};

/**
 * What an upsert may carry.
 *
 * There is deliberately no `tags` member: see rule 3 above. Every field is
 * omitted from the request when it is null, undefined or empty, because the
 * CRM treats most of them as nullable and would happily overwrite a name the
 * owner typed by hand with a blank.
 */
export type UpsertContactInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  phone?: string | null;
  source?: string | null;
  companyName?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  website?: string | null;
  timezone?: string | null;
  /** Keyed by custom field id. Sent as `fieldValue`; no caller says so. */
  customFields?: Record<string, string | number | null | undefined>;
  /** Build it with writeEmailDnd(). Omit to leave DND alone. */
  dndSettings?: { email: { status: string; code?: string } };
};

const num = (v: string | null): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const truncate = (v: string, max: number) => (v.length > max ? `${v.slice(0, max)}...` : v);

/**
 * The daily-reset header is not in the documented table, so its units are a
 * guess until we see one. Epoch milliseconds, epoch seconds and a plain delay
 * are all read into the same thing: a delay from now. Clamped to a day so a
 * misread cannot park the queue for a week.
 */
function dailyResetDelay(h: Headers): number | null {
  const raw = num(h.get("x-ratelimit-daily-reset"));
  if (raw == null || raw < 0) return null;
  const now = Date.now();
  const ms = raw >= 1e12 ? raw - now : raw >= 1e9 ? raw * 1000 - now : raw;
  return Math.min(Math.max(ms, 0), 86_400_000);
}

/** Next midnight UTC, the backstop when the reset header is absent. */
function msUntilUtcMidnight(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(next - now.getTime(), 60_000);
}

/** The docs call these headers authoritative, so nothing counts requests itself. */
function readRateLimit(h: Headers): CrmRateLimit {
  return {
    remaining: num(h.get("x-ratelimit-remaining")),
    intervalMs: num(h.get("x-ratelimit-interval-milliseconds")),
    dailyRemaining: num(h.get("x-ratelimit-daily-remaining")),
    dailyResetMs: dailyResetDelay(h),
  };
}

const EMPTY_RATE_LIMIT: CrmRateLimit = { remaining: null, intervalMs: null, dailyRemaining: null, dailyResetMs: null };

/**
 * There is no Retry-After header on this API, so nothing reads one.
 *
 * A 429 is told apart by `x-ratelimit-daily-remaining`: at or below zero it is
 * the daily limit, which must never be retried today because the retries burn
 * tomorrow's quota. Anything else is the burst limit, which is over in one
 * interval. A 429 with no daily header at all is read as a burst, because the
 * cost of guessing wrong that way is one short wait, and a daily limit will say
 * so on the next attempt.
 */
function classify(status: number, rl: CrmRateLimit): { code: CrmErrorCode; retryAfterMs: number | null } {
  if (status === 429) {
    if (rl.dailyRemaining != null && rl.dailyRemaining <= 0) {
      return { code: "rate_limit_daily", retryAfterMs: rl.dailyResetMs ?? msUntilUtcMidnight() };
    }
    return { code: "rate_limit_burst", retryAfterMs: rl.intervalMs ?? 10_000 };
  }
  if (status === 401 || status === 403) return { code: "auth", retryAfterMs: null };
  if (status === 404) return { code: "not_found", retryAfterMs: null };
  // A request timeout is the server saying "try again", not a malformed body.
  if (status === 408 || status >= 500) return { code: "server", retryAfterMs: null };
  return { code: "bad_request", retryAfterMs: null };
}

function errorMessage(parsed: unknown, text: string): string {
  if (parsed && typeof parsed === "object") {
    const o = parsed as { message?: unknown; error?: unknown };
    if (typeof o.message === "string" && o.message) return truncate(o.message, BODY_LOG_CHARS);
    if (Array.isArray(o.message)) return truncate(o.message.filter((m) => typeof m === "string").join("; "), BODY_LOG_CHARS);
    if (typeof o.error === "string" && o.error) return truncate(o.error, BODY_LOG_CHARS);
  }
  return truncate(text || "request failed", BODY_LOG_CHARS);
}

function traceOf(parsed: unknown, h: Headers): string | null {
  if (parsed && typeof parsed === "object") {
    const t = (parsed as { traceId?: unknown }).traceId;
    if (typeof t === "string" && t) return t;
  }
  return h.get("x-trace-id") ?? h.get("trace-id");
}

/** Thrown only inside this module, so `request` can stay a plain value-or-throw. */
class CrmRequestError extends Error {
  readonly info: CrmError;
  constructor(info: CrmError) {
    super(info.message);
    this.name = "CrmRequestError";
    this.info = info;
  }
}

export type CrmRequestInit = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Sent on DELETE too: tag removal requires a body. */
  body?: unknown;
  query?: Record<string, string | undefined>;
  timeoutMs?: number;
};

async function request<T>(cfg: CrmConfig, path: string, init?: CrmRequestInit): Promise<{ data: T; rateLimit: CrmRateLimit }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(init?.query ?? {})) if (v != null && v !== "") qs.set(k, v);
  const query = qs.toString();
  const hasBody = init?.body !== undefined;

  const res = await fetch(`${BASE}${path}${query ? `?${query}` : ""}`, {
    method: init?.method ?? "GET",
    headers: {
      // Never in the URL, so a logged request line cannot leak it.
      Authorization: `Bearer ${cfg.token}`,
      Version: VERSION,
      Accept: "application/json",
      ...(hasBody ? { "content-type": "application/json" } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(init?.body) } : {}),
    signal: AbortSignal.timeout(init?.timeoutMs ?? TIMEOUT_MS),
    cache: "no-store",
  });

  const rateLimit = readRateLimit(res.headers);
  const text = await res.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const { code, retryAfterMs } = classify(res.status, rateLimit);
    throw new CrmRequestError({
      status: res.status,
      code,
      message: errorMessage(parsed, text),
      retryAfterMs,
      traceId: traceOf(parsed, res.headers),
    });
  }
  // A 204 or an empty 200 is a success with nothing to read, not a failure.
  return { data: (parsed ?? {}) as T, rateLimit };
}

/** The one door out. Never throws, whatever the network does. */
export async function crmFetch<T>(cfg: CrmConfig, path: string, init?: CrmRequestInit): Promise<CrmResponse<T>> {
  try {
    const { data, rateLimit } = await request<T>(cfg, path, init);
    return { ok: true, data, rateLimit };
  } catch (err) {
    if (err instanceof CrmRequestError) {
      console.error("[crm]", init?.method ?? "GET", path, err.info.status, err.info.message);
      return { ok: false, error: err.info };
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[crm]", init?.method ?? "GET", path, message);
    return {
      ok: false,
      error: { status: 0, code: "network", message: truncate(message, BODY_LOG_CHARS), retryAfterMs: null, traceId: null },
    };
  }
}

/** A local failure that never reached the network, shaped like any other. */
function localError(code: CrmErrorCode, message: string): { ok: false; error: CrmError } {
  return { ok: false, error: { status: 0, code, message, retryAfterMs: null, traceId: null } };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/**
 * The read side of the custom field asymmetry.
 *
 * `value` is what a read returns and `fieldValue` is what a write sends. Both
 * names are accepted here so that no caller has to know which one it got: a
 * comparison written against only one of them reports every field as empty,
 * which looks exactly like a contact nobody has filled in.
 */
function readCustomFields(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { id?: unknown; value?: unknown; fieldValue?: unknown };
    const id = str(row.id);
    if (!id) continue;
    const v = row.value ?? row.fieldValue;
    if (v == null) continue;
    out[id] = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
  }
  return out;
}

function normalizeContact(raw: unknown): GhlContact | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const id = str(c.id);
  if (!id) return null;
  return {
    id,
    locationId: str(c.locationId),
    email: str(c.email) ?? str(c.emailLowerCase),
    firstName: str(c.firstName),
    lastName: str(c.lastName),
    name: str(c.name),
    phone: str(c.phone),
    source: str(c.source),
    dnd: typeof c.dnd === "boolean" ? c.dnd : null,
    dndSettings: c.dndSettings ?? null,
    tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === "string") : [],
    dateAdded: str(c.dateAdded),
    dateUpdated: str(c.dateUpdated),
    customFields: readCustomFields(c.customFields),
    raw: c,
  };
}

/** Drops anything blank, so an upsert cannot blank a field it was not given. */
function bodyFrom(input: UpsertContactInput, locationId: string): Record<string, unknown> {
  const body: Record<string, unknown> = { locationId, email: input.email.trim().toLowerCase() };
  const optional: (keyof UpsertContactInput)[] = [
    "firstName",
    "lastName",
    "name",
    "phone",
    "source",
    "companyName",
    "address1",
    "city",
    "state",
    "postalCode",
    "country",
    "website",
    "timezone",
  ];
  for (const k of optional) {
    const v = input[k];
    if (typeof v === "string" && v.trim() !== "") body[k] = v.trim();
  }
  if (input.dndSettings) body.dndSettings = input.dndSettings;
  const fields = Object.entries(input.customFields ?? {})
    // The write side is `fieldValue`. This is the only place that name appears.
    .filter(([id, v]): boolean => Boolean(id) && v != null && v !== "")
    .map(([id, v]) => ({ id, fieldValue: v }));
  if (fields.length) body.customFields = fields;
  return body;
}

export async function upsertContact(
  cfg: CrmConfig,
  input: UpsertContactInput,
): Promise<CrmResponse<{ isNew: boolean; contact: GhlContact; traceId: string | null }>> {
  const email = typeof input?.email === "string" ? input.email.trim() : "";
  if (!email) return localError("bad_request", "upsert needs an email");

  // "new" is quoted so it cannot be read as a construct signature, and it is
  // renamed to `isNew` on the way out because the caller compares it, not the CRM.
  const res = await crmFetch<{ "new"?: unknown; contact?: unknown; traceId?: unknown }>(cfg, "/contacts/upsert", {
    method: "POST",
    body: bodyFrom({ ...input, email }, cfg.locationId),
  });
  if (!res.ok) return res;

  const contact = normalizeContact(res.data.contact);
  // A 200 with no contact in it would otherwise be recorded as a successful
  // sync with no id to show for it, and every later job would upsert again.
  if (!contact) return localError("server", "upsert returned no contact");
  return {
    ok: true,
    data: { isNew: res.data["new"] === true, contact, traceId: str(res.data.traceId) },
    rateLimit: res.rateLimit,
  };
}

export async function getContact(cfg: CrmConfig, contactId: string): Promise<CrmResponse<GhlContact>> {
  if (!contactId?.trim()) return localError("bad_request", "getContact needs a contact id");
  const res = await crmFetch<{ contact?: unknown }>(cfg, `/contacts/${encodeURIComponent(contactId)}`);
  if (!res.ok) return res;
  const contact = normalizeContact(res.data.contact);
  if (!contact) return localError("not_found", "no contact in the response");
  return { ok: true, data: contact, rateLimit: res.rateLimit };
}

/**
 * Which endpoint answers an email lookup, remembered across calls.
 *
 * The lookup endpoint's description says "OAuth channel only" while its own
 * security scheme permits a Private Integration Token, so the docs contradict
 * themselves and the code has to survive either answer. It tries lookup, falls
 * back to the duplicate search on a 401 or 403, and remembers the winner so
 * the wrong one is not paid for on every contact. Only a fallback that
 * actually worked is remembered: a rotated token also produces 401 here, and
 * writing "duplicate" on the strength of that would hide a real auth failure.
 */
let lookupPath: "lookup" | "duplicate" | null = null;
let loggedDuplicateShape = false;

function pickContact(list: unknown, emailKey: string): GhlContact | null {
  if (!Array.isArray(list)) return null;
  const contacts = list.map(normalizeContact).filter((c): c is GhlContact => c !== null);
  // The lookup also matches a contact's additional email addresses, so prefer
  // the one whose primary address is the one we asked about.
  const exact = contacts.find((c) => (c.email ?? "").trim().toLowerCase() === emailKey);
  if (exact) return exact;
  return contacts.length > 0 ? contacts[0] : null;
}

async function viaLookup(cfg: CrmConfig, emailKey: string, timeoutMs?: number): Promise<CrmResponse<GhlContact | null>> {
  const res = await crmFetch<{ contacts?: unknown }>(cfg, "/contacts/lookup", {
    query: { locationId: cfg.locationId, email: emailKey, limit: "20" },
    timeoutMs,
  });
  // Absent is an answer, and reconciliation depends on being able to tell
  // "not in the CRM" from "we could not ask".
  if (!res.ok) return res.error.code === "not_found" ? { ok: true, data: null, rateLimit: EMPTY_RATE_LIMIT } : res;
  return { ok: true, data: pickContact(res.data.contacts, emailKey), rateLimit: res.rateLimit };
}

async function viaDuplicate(cfg: CrmConfig, emailKey: string, timeoutMs?: number): Promise<CrmResponse<GhlContact | null>> {
  const res = await crmFetch<Record<string, unknown>>(cfg, "/contacts/search/duplicate", {
    query: { locationId: cfg.locationId, email: emailKey },
    timeoutMs,
  });
  if (!res.ok) return res.error.code === "not_found" ? { ok: true, data: null, rateLimit: EMPTY_RATE_LIMIT } : res;

  const body = res.data;
  const shape = Object.keys(body).sort().join(",") || "empty";
  // The success body is documented with an empty description, so the shape is
  // discovered on first use and written down. Without this the fallback path
  // silently returns null for everyone and looks like an empty sub-account.
  if (!loggedDuplicateShape) {
    loggedDuplicateShape = true;
    console.error("[crm] duplicate search returned keys:", shape);
    // One write per shape we have not seen, not one per cold start.
    if ((await getCrmProbeSetting()).duplicateShape !== shape) await patchCrmProbeSetting({ duplicateShape: shape });
  }
  const contact =
    normalizeContact(body.contact) ??
    pickContact(body.contacts, emailKey) ??
    normalizeContact(body);
  return { ok: true, data: contact, rateLimit: res.rateLimit };
}

export async function lookupContactByEmail(
  cfg: CrmConfig,
  email: string,
  opts?: { timeoutMs?: number },
): Promise<CrmResponse<GhlContact | null>> {
  // Typeof rather than a default: this module is called from a worker loop and
  // must not throw on a value that arrived from a database column.
  const emailKey = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!emailKey) return localError("bad_request", "lookup needs an email");

  if (!lookupPath) {
    const cached = (await getCrmProbeSetting()).lookupPath;
    if (cached === "lookup" || cached === "duplicate") lookupPath = cached;
  }

  if (lookupPath === "duplicate") return viaDuplicate(cfg, emailKey, opts?.timeoutMs);

  const first = await viaLookup(cfg, emailKey, opts?.timeoutMs);
  if (first.ok) {
    if (lookupPath !== "lookup") {
      lookupPath = "lookup";
      await patchCrmProbeSetting({ lookupPath: "lookup" });
    }
    return first;
  }
  if (first.error.code !== "auth") return first;

  const fallback = await viaDuplicate(cfg, emailKey, opts?.timeoutMs);
  if (fallback.ok) {
    lookupPath = "duplicate";
    await patchCrmProbeSetting({ lookupPath: "duplicate" });
    return fallback;
  }
  // Both refused us. That is a credential problem, not an endpoint problem,
  // and the caller has to see it so the integration can stop trying.
  return first;
}

/**
 * Add tags, and cache what comes back.
 *
 * The response is the contact's full tag list after the operation, which is
 * the only cheap way to learn the post-state without overwriting anything.
 */
export async function addTags(cfg: CrmConfig, contactId: string, tags: string[]): Promise<CrmResponse<{ tags: string[] }>> {
  return tagCall(cfg, contactId, tags, "POST");
}

export async function removeTags(cfg: CrmConfig, contactId: string, tags: string[]): Promise<CrmResponse<{ tags: string[] }>> {
  // A DELETE that requires a JSON body. Some clients and proxies strip one,
  // which is why the probe checks that this endpoint actually took effect.
  return tagCall(cfg, contactId, tags, "DELETE");
}

async function tagCall(
  cfg: CrmConfig,
  contactId: string,
  tags: string[],
  method: "POST" | "DELETE",
): Promise<CrmResponse<{ tags: string[] }>> {
  if (!contactId?.trim()) return localError("bad_request", "tag change needs a contact id");
  const clean = [...new Set((tags ?? []).map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean))];
  // Refusing an empty list rather than returning `{ tags: [] }`: a caller
  // caching that reply would record the contact as having no tags at all and
  // wipe the mirror. A tag job with no tag is malformed and will not fix itself.
  if (!clean.length) return localError("bad_request", "tag change needs at least one tag");

  const res = await crmFetch<{ tags?: unknown }>(cfg, `/contacts/${encodeURIComponent(contactId)}/tags`, {
    method,
    body: { tags: clean },
  });
  if (!res.ok) return res;
  const returned = Array.isArray(res.data.tags) ? res.data.tags.filter((t): t is string => typeof t === "string") : [];
  return { ok: true, data: { tags: returned }, rateLimit: res.rateLimit };
}

/**
 * Set the email channel's DND state.
 *
 * "active" means DND is ON, that is suppressed, and "inactive" means
 * contactable. The polarity and the casing both live in lib/crm/dnd.ts so
 * there is exactly one place either can be got wrong.
 */
export async function setEmailDnd(
  cfg: CrmConfig,
  contactId: string,
  status: "active" | "inactive",
  code?: string,
): Promise<CrmResponse<GhlContact>> {
  if (!contactId?.trim()) return localError("bad_request", "setEmailDnd needs a contact id");
  const res = await crmFetch<{ succeeded?: unknown; contact?: unknown }>(cfg, `/contacts/${encodeURIComponent(contactId)}`, {
    method: "PUT",
    body: writeEmailDnd(status, code),
  });
  if (!res.ok) return res;
  // A 200 that says it did not succeed is the dangerous case: treated as a
  // success it would mark someone suppressed here and mailable there.
  if (res.data.succeeded === false) return localError("server", "the CRM reported the DND update as not succeeded");
  const contact = normalizeContact(res.data.contact);
  if (!contact) return localError("server", "DND update returned no contact");
  return { ok: true, data: contact, rateLimit: res.rateLimit };
}

/**
 * Contact custom fields live on the sub-account endpoint with model=contact.
 * Custom Fields V2 (/custom-fields/*) covers only Custom Objects and Company
 * today, so it is a dead end for contacts however current it looks.
 */
export async function listCustomFields(cfg: CrmConfig): Promise<CrmResponse<GhlCustomField[]>> {
  const res = await crmFetch<{ customFields?: unknown }>(cfg, `/locations/${encodeURIComponent(cfg.locationId)}/customFields`, {
    query: { model: "contact" },
  });
  if (!res.ok) return res;
  const list = Array.isArray(res.data.customFields) ? res.data.customFields : [];
  return { ok: true, data: list.map(normalizeField).filter((f): f is GhlCustomField => f !== null), rateLimit: res.rateLimit };
}

function normalizeField(raw: unknown): GhlCustomField | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const id = str(f.id);
  if (!id) return null;
  return { id, name: str(f.name), fieldKey: str(f.fieldKey), dataType: str(f.dataType), model: str(f.model) };
}

/** Always model "contact": this module has no reason to make any other kind. */
export async function createCustomField(
  cfg: CrmConfig,
  input: { name: string; dataType: string },
): Promise<CrmResponse<GhlCustomField>> {
  const res = await crmFetch<{ customField?: unknown }>(cfg, `/locations/${encodeURIComponent(cfg.locationId)}/customFields`, {
    method: "POST",
    body: { name: input.name, dataType: input.dataType, model: "contact" },
  });
  if (!res.ok) return res;
  const field = normalizeField(res.data.customField);
  if (!field) return localError("server", "create custom field returned no field");
  return { ok: true, data: field, rateLimit: res.rateLimit };
}

/**
 * One field by its key, e.g. "tmd_lead_source".
 *
 * The path accepts a field key as well as an id, which is what makes the
 * bootstrap idempotent: probe, and create only on a miss. A 404 is the miss,
 * so it comes back as null rather than as an error.
 */
export async function getCustomFieldByKey(cfg: CrmConfig, key: string): Promise<CrmResponse<GhlCustomField | null>> {
  const bare = (typeof key === "string" ? key.trim() : "").replace(/^contact\./, "");
  if (!bare) return localError("bad_request", "getCustomFieldByKey needs a key");
  const res = await crmFetch<{ customField?: unknown }>(
    cfg,
    `/locations/${encodeURIComponent(cfg.locationId)}/customFields/${encodeURIComponent(`contact.${bare}`)}`,
  );
  if (!res.ok) return res.error.code === "not_found" ? { ok: true, data: null, rateLimit: EMPTY_RATE_LIMIT } : res;
  return { ok: true, data: normalizeField(res.data.customField), rateLimit: res.rateLimit };
}
