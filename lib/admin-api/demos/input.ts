import { z } from "zod";
import { ApiError, MESSAGES as API_MESSAGES, badRequest } from "../errors";
import { isValidIdempotencyKey } from "../idempotency";
import { DEMO_LIMITS } from "./limits";
import { DEMO_STATUSES, type DemoBusiness, type DemoStatus } from "./shape";

/**
 * Body checks for POST /demos and PATCH /demos/:id (docs/admin-api/demos.md),
 * shared with the web admin's demo forms so both answer the same copy.
 *
 * Field problems answer one 400 `validation` with every bad field in `fields`,
 * under the contract's flat keys: businessName, businessType, area, offer,
 * website, brand, customers, wants, neededBy, and for PATCH demoUrl,
 * builderEmail, builderNote. `message` is the first problem's copy.
 */

export const DEMO_MESSAGES = {
  target: "Pick the client or lead this demo is for.",
  closed: "This demo request is closed.",
  demoUrlFirst: "Add the demo link first.",
  statusChange: "A demo request cannot move to that status from here.",
  changed: "Someone else just changed this demo request. Reload and try again.",
  status: "Unknown demo status.",
  businessName: "Enter the business name.",
  businessNameLong: "Keep the business name to 120 characters or fewer.",
  businessType: "Enter the kind of business.",
  businessTypeLong: "Keep the kind of business to 80 characters or fewer.",
  area: "Enter the city or area they serve.",
  areaLong: "Keep the city or area to 120 characters or fewer.",
  offer: "Enter what they sell or do.",
  offerLong: "Keep what they sell or do to 1,000 characters or fewer.",
  website: "Keep the website and social links to 500 characters or fewer.",
  brand: "Keep the logo and brand colours to 500 characters or fewer.",
  customers: "Keep who their customers are to 500 characters or fewer.",
  wants: "Keep what they want to see to 2,000 characters or fewer.",
  neededBy: "Enter a valid date.",
  demoUrl: "Enter a full link starting with https://.",
  builderEmail: "Pick someone on the team.",
  builderNote: "Keep the note to 1,000 characters or fewer.",
  idempotencyKey: "That request carried a bad idempotency key. Update the app and try again.",
  notReady: "Demo requests need a database update first. Ask the owner to apply the demo requests migration.",
} as const;

/** Any JSON object: the rules below report every bad field at once. */
export const demoBody = z.record(z.string(), z.unknown(), { error: API_MESSAGES.invalid });
export type DemoBody = z.output<typeof demoBody>;

export { DEMO_LIMITS };

export type DemoCreateInput = {
  clientId: string | null;
  leadId: string | null;
  business: DemoBusiness;
  wants: string | null;
  neededBy: string | null;
};

export type DemoPatchInput = {
  business?: Partial<DemoBusiness>;
  wants?: string | null;
  neededBy?: string | null;
  status?: DemoStatus;
  demoUrl?: string | null;
  builderEmail?: string | null;
  builderNote?: string | null;
};

const has = (obj: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Collects field problems; `done()` throws one 400 `validation` with all of them. */
class Problems {
  readonly fields: Record<string, string> = {};
  private first: string | null = null;

  add(field: string, message: string): void {
    if (!(field in this.fields)) this.fields[field] = message;
    if (this.first === null) this.first = message;
  }

  done(): void {
    if (this.first !== null) throw badRequest("validation", this.first, this.fields);
  }
}

/** A required text: trimmed, 1..max. Undefined (and a problem) when it fails. */
function required(p: Problems, field: string, value: unknown, max: number, missing: string, long: string): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    p.add(field, missing);
    return undefined;
  }
  const v = value.trim();
  if (v.length > max) {
    p.add(field, long);
    return undefined;
  }
  return v;
}

/** An optional text: trimmed; null, "" or blank clears it (null). Undefined (and a problem) when it fails. */
function optional(p: Problems, field: string, value: unknown, max: number, long: string): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") {
    p.add(field, long);
    return undefined;
  }
  const v = value.trim();
  if (v === "") return null;
  if (v.length > max) {
    p.add(field, long);
    return undefined;
  }
  return v;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day between 2020 and 2100 ("2026-02-30" is not one). */
export function isDemoDate(value: string): boolean {
  const m = value.match(DATE_RE);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2020 || y > 2100) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function dateValue(p: Problems, value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") {
    p.add("neededBy", DEMO_MESSAGES.neededBy);
    return undefined;
  }
  const v = value.trim();
  if (v === "") return null;
  if (!isDemoDate(v)) {
    p.add("neededBy", DEMO_MESSAGES.neededBy);
    return undefined;
  }
  return v;
}

/** A full https link with a host ("https://acme-demo.tekmadev.com/"). */
export function isDemoUrl(value: string): boolean {
  if (value.length > DEMO_LIMITS.demoUrl || /\s/.test(value) || !/^https:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^[^.\s]+(\.[^.\s]+)+$/.test(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

const zEmail = z.email();

function urlValue(p: Problems, value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") {
    p.add("demoUrl", DEMO_MESSAGES.demoUrl);
    return undefined;
  }
  const v = value.trim();
  if (v === "") return null;
  if (!isDemoUrl(v)) {
    p.add("demoUrl", DEMO_MESSAGES.demoUrl);
    return undefined;
  }
  return v;
}

function emailValue(p: Problems, value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") {
    p.add("builderEmail", DEMO_MESSAGES.builderEmail);
    return undefined;
  }
  const v = value.trim().toLowerCase();
  if (v === "") return null;
  if (v.length > 254 || !zEmail.safeParse(v).success) {
    p.add("builderEmail", DEMO_MESSAGES.builderEmail);
    return undefined;
  }
  return v;
}

/**
 * The business block: every key for a create (a missing or non-object block
 * reports each required field), only the keys sent for a PATCH (a non-object
 * block there is a problem with the business name).
 */
function readBusiness(p: Problems, raw: unknown, partial: boolean): Partial<DemoBusiness> {
  if (partial && !isObject(raw)) {
    p.add("businessName", DEMO_MESSAGES.businessName);
    return {};
  }
  const b: Record<string, unknown> = isObject(raw) ? raw : {};
  const out: Partial<DemoBusiness> = {};
  const want = (key: string) => !partial || has(b, key);
  if (want("name")) out.name = required(p, "businessName", b.name, DEMO_LIMITS.businessName, DEMO_MESSAGES.businessName, DEMO_MESSAGES.businessNameLong);
  if (want("type")) out.type = required(p, "businessType", b.type, DEMO_LIMITS.businessType, DEMO_MESSAGES.businessType, DEMO_MESSAGES.businessTypeLong);
  if (want("area")) out.area = required(p, "area", b.area, DEMO_LIMITS.area, DEMO_MESSAGES.area, DEMO_MESSAGES.areaLong);
  if (want("offer")) out.offer = required(p, "offer", b.offer, DEMO_LIMITS.offer, DEMO_MESSAGES.offer, DEMO_MESSAGES.offerLong);
  // Optional keys: absent on a create is null; absent on a PATCH leaves them alone.
  if (has(b, "website")) out.website = optional(p, "website", b.website, DEMO_LIMITS.website, DEMO_MESSAGES.website);
  else if (!partial) out.website = null;
  if (has(b, "brand")) out.brand = optional(p, "brand", b.brand, DEMO_LIMITS.brand, DEMO_MESSAGES.brand);
  else if (!partial) out.brand = null;
  if (has(b, "customers")) out.customers = optional(p, "customers", b.customers, DEMO_LIMITS.customers, DEMO_MESSAGES.customers);
  else if (!partial) out.customers = null;
  for (const key of Object.keys(out) as (keyof DemoBusiness)[]) if (out[key] === undefined) delete out[key];
  return out;
}

const idText = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().toLowerCase() : null);

/**
 * POST /demos: `{ clientId?, leadId?, business, wants?, neededBy?, idempotencyKey }`.
 * Exactly one of clientId / leadId, else 400 `target`; then every field rule
 * (400 `validation`). Whether the client or lead exists is the handler's 404.
 */
export function parseDemoCreate(body: Record<string, unknown>): DemoCreateInput {
  const clientId = idText(body.clientId);
  const leadId = idText(body.leadId);
  if ((clientId === null) === (leadId === null)) throw badRequest("target", DEMO_MESSAGES.target);

  const p = new Problems();
  const business = readBusiness(p, body.business, false);
  const wants = has(body, "wants") ? optional(p, "wants", body.wants, DEMO_LIMITS.wants, DEMO_MESSAGES.wants) : null;
  const neededBy = has(body, "neededBy") ? dateValue(p, body.neededBy) : null;
  p.done();
  return {
    clientId,
    leadId,
    business: {
      name: business.name as string,
      type: business.type as string,
      area: business.area as string,
      offer: business.offer as string,
      website: business.website ?? null,
      brand: business.brand ?? null,
      customers: business.customers ?? null,
    },
    wants: wants ?? null,
    neededBy: neededBy ?? null,
  };
}

/**
 * PATCH /demos/:id: any of `{ business?: Partial, wants?, neededBy?, status?,
 * demoUrl?, builderEmail?, builderNote? }`. Only the keys sent change; null (or
 * "") clears an optional one. An unknown status is 400 `status`; field problems
 * 400 `validation`. Who may change what is the handler's (403, 409, 422).
 */
export function parseDemoPatch(body: Record<string, unknown>): DemoPatchInput {
  let status: DemoStatus | undefined;
  if (has(body, "status")) {
    if (typeof body.status !== "string" || !(DEMO_STATUSES as readonly string[]).includes(body.status)) {
      throw badRequest("status", DEMO_MESSAGES.status, { status: DEMO_MESSAGES.status });
    }
    status = body.status as DemoStatus;
  }

  const p = new Problems();
  const out: DemoPatchInput = {};
  if (has(body, "business")) {
    const business = readBusiness(p, body.business, true);
    if (Object.keys(business).length > 0) out.business = business;
  }
  if (has(body, "wants")) {
    const v = optional(p, "wants", body.wants, DEMO_LIMITS.wants, DEMO_MESSAGES.wants);
    if (v !== undefined) out.wants = v;
  }
  if (has(body, "neededBy")) {
    const v = dateValue(p, body.neededBy);
    if (v !== undefined) out.neededBy = v;
  }
  if (has(body, "demoUrl")) {
    const v = urlValue(p, body.demoUrl);
    if (v !== undefined) out.demoUrl = v;
  }
  if (has(body, "builderEmail")) {
    const v = emailValue(p, body.builderEmail);
    if (v !== undefined) out.builderEmail = v;
  }
  if (has(body, "builderNote")) {
    const v = optional(p, "builderNote", body.builderNote, DEMO_LIMITS.builderNote, DEMO_MESSAGES.builderNote);
    if (v !== undefined) out.builderNote = v;
  }
  p.done();
  if (status !== undefined) out.status = status;
  return out;
}

/**
 * The idempotency key of a create: the body's `idempotencyKey` (the contract),
 * else the Idempotency-Key header, else none. A malformed one is 400
 * `idempotency_key`.
 */
export function demoIdempotencyKey(body: Record<string, unknown>, header: string | null): string | null {
  const raw = has(body, "idempotencyKey") && body.idempotencyKey !== null ? body.idempotencyKey : header;
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string" || !isValidIdempotencyKey(raw)) {
    throw new ApiError(400, "idempotency_key", DEMO_MESSAGES.idempotencyKey);
  }
  return raw;
}
