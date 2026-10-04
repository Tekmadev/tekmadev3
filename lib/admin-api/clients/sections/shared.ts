import { z } from "zod";
import { ApiError, dbError, isUuid, notFound, requireDb, type ApiContext } from "@/lib/admin-api";
import type { Client } from "@/lib/clients-data";

/**
 * Helpers shared by the client detail sections of the admin API (access,
 * files, approvals, agreements, calls and the guarantee, CRM mapping, portal
 * team, activity). Contract: the app's docs/api-requests/clients.md and
 * src/api/schemas/clients.ts.
 */

export const TZ = "America/Toronto";
export const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ */
/* Copy the app shows as is (the mock's exact strings)                 */
/* ------------------------------------------------------------------ */

export const COPY = {
  input: "Check the highlighted fields.",
  sendText: "Send text.",
  sendBool: "Send true or false.",
  email: "Enter a valid email.",
  link: "Enter a full link starting with https://.",
  dateTime: "Enter a valid date and time.",
  status: "Pick a status from the list.",
  inviteFailed: "Invite email failed. Check the Supabase auth email settings.",
} as const;

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const DAY_PARTS = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar day (YYYY-MM-DD) in Toronto for an instant in milliseconds. */
export function torontoDate(ms: number): string {
  const parts = DAY_PARTS.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Milliseconds for a Postgres timestamp, or null. Only for arithmetic: instants sent to the app use instant(). */
export function msOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

export const isEmail = (value: string | null | undefined): value is string => !!value && EMAIL_RE.test(value.trim());
export const isUrl = (value: string | null | undefined): value is string => !!value && URL_RE.test(value);

/** The first line, cut to `max` characters with "..." (activity summaries). */
export function shorten(text: string, max = 140): string {
  const line = (text.split("\n")[0] ?? "").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}...` : line;
}

/** The CRM vendor is never named in a response: it is "CRM". */
export function noVendor(text: string): string {
  return text.replace(/\b(go\s*high\s*level|highlevel|ghl)\b/gi, "CRM");
}

/** "out_of_area" -> "Out of area". */
export function humanize(value: string): string {
  const words = value.replace(/[_.-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : value;
}

/** PostgREST ilike pattern for an exact, case-insensitive match. */
export function exactIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/* ------------------------------------------------------------------ */
/* Body validation                                                     */
/* ------------------------------------------------------------------ */

/**
 * The `body` option for these routes: any JSON object. The handler then
 * validates it with parseBody(), after the 404 checks, like the mock does.
 */
export const jsonObject = z.record(z.string(), z.unknown(), { error: COPY.input });

/**
 * Parses a body with zod and answers 400 the way the contract describes:
 * `fields` maps every bad field to its inline message; `code` and `message`
 * come from the first bad field. A field listed in `codes` has its own code
 * and its message is the toast; any other field answers `input` "Check the
 * highlighted fields.".
 */
export function parseBody<S extends z.ZodType>(schema: S, raw: unknown, codes: Record<string, string> = {}): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const errors = new FieldErrors();
  for (const issue of parsed.error.issues) {
    const field = issue.path.length ? String(issue.path[0]) : "";
    const message = issue.message || COPY.input;
    const code = (field && codes[field]) || "input";
    errors.add(field || "body", code, code === "input" ? COPY.input : message, message);
  }
  errors.throwIfAny();
  // Unreachable: a failed parse always has issues.
  throw new ApiError(400, "input", COPY.input);
}

/**
 * Collects the business-rule checks that run after the shape is valid. The
 * first problem decides the code and toast; every field keeps its inline text.
 */
export class FieldErrors {
  readonly fields: Record<string, string> = {};
  private first: { code: string; message: string } | null = null;

  add(field: string, code: string, message: string, inline: string = message): void {
    if (!(field in this.fields)) this.fields[field] = inline;
    if (!this.first) this.first = { code, message };
  }

  get empty(): boolean {
    return this.first === null;
  }

  throwIfAny(): void {
    if (this.first) throw new ApiError(400, this.first.code, this.first.message, this.fields);
  }
}

/** Optional nullable text: absent stays undefined, null or blank clears (null), otherwise trimmed. */
export function zText(max: number) {
  return z
    .string({ error: COPY.sendText })
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .nullable()
    .optional()
    .transform((v): string | null | undefined => (v === undefined ? undefined : v === null || v === "" ? null : v));
}

/** Optional nullable instant (ISO 8601 with a zone), kept exactly as sent. */
export const zInstantInput = z
  .string({ error: COPY.dateTime })
  .regex(INSTANT_RE, COPY.dateTime)
  .refine((v) => Number.isFinite(Date.parse(v)), COPY.dateTime)
  .nullable()
  .optional();

/* ------------------------------------------------------------------ */
/* Lookups that respect who is asking                                  */
/* ------------------------------------------------------------------ */

/**
 * A client the caller may see: never a deleted one, and test clients only
 * with `testdata.view` (owners). Anything else is the given 404.
 */
export async function findSectionClient(ctx: ApiContext, id: string | null | undefined, what = "That client"): Promise<Client> {
  if (!isUuid(id)) throw notFound(what);
  const { data, error } = await requireDb().from("clients").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError("client lookup", error);
  const client = (data as Client | null) ?? null;
  if (!client || client.deleted_at || (client.is_test && !ctx.can("testdata.view"))) throw notFound(what);
  return client;
}

/** The client again after a write (its guarantee status may have moved). */
export async function reloadClient(id: string): Promise<Client> {
  const { data, error } = await requireDb().from("clients").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError("client reload", error);
  if (!data) throw notFound("That client");
  return data as Client;
}

/* ------------------------------------------------------------------ */
/* Who did it: display names for the emails the website stores         */
/* ------------------------------------------------------------------ */

export type People = {
  /** The person's display name, or null when we only know the email. */
  name(email: string | null | undefined): string | null;
  /** The display name, else the email itself (for "verified by", "requested by"). */
  display(email: string | null | undefined): string | null;
};

let staffCache: { at: number; names: Map<string, string> } | null = null;
const STAFF_TTL_MS = 60_000;

/** Staff display names from the admins table, cached for a minute. Names are cosmetic: a failed read falls back to emails. */
async function staffNames(): Promise<Map<string, string>> {
  if (staffCache && Date.now() - staffCache.at < STAFF_TTL_MS) return staffCache.names;
  const names = new Map<string, string>();
  const { data, error } = await requireDb().from("admins").select("email,name");
  if (error) {
    console.error("[admin-api] staff names unavailable", error.code ?? "", error.message);
    return names;
  }
  for (const row of (data ?? []) as { email: string | null; name: string | null }[]) {
    if (row.email && row.name?.trim()) names.set(row.email.toLowerCase(), row.name.trim());
  }
  staffCache = { at: Date.now(), names };
  return names;
}

/**
 * Names for the emails on a client's records: staff (admins table, plus the
 * caller's own name) and the client's portal people.
 */
export async function loadPeople(ctx: ApiContext, members: readonly { email: string; name: string | null }[] = []): Promise<People> {
  const names = new Map(await staffNames());
  for (const m of members) if (m.name?.trim() && !names.has(m.email.toLowerCase())) names.set(m.email.toLowerCase(), m.name.trim());
  if (ctx.name) names.set(ctx.email.toLowerCase(), ctx.name);
  const name = (email: string | null | undefined) => (email ? names.get(email.toLowerCase()) ?? null : null);
  return { name, display: (email) => (email ? name(email) ?? email : null) };
}

/** Portal people (name and email) of one client, for loadPeople. */
export async function memberNames(clientId: string): Promise<{ email: string; name: string | null }[]> {
  const { data, error } = await requireDb().from("client_members").select("email,name").eq("client_id", clientId);
  if (error) throw dbError("client members names", error);
  return (data ?? []) as { email: string; name: string | null }[];
}

/** True for a Postgres CHECK violation (a migration that is not applied yet). */
export function isCheckViolation(err: unknown): boolean {
  return err instanceof Error && /violates check constraint/i.test(err.message);
}

