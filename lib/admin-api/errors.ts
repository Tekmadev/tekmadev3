import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * The admin API envelope (contract v1, PROMPT.md section 11):
 *
 *   success  { ok: true, data }
 *   failure  { ok: false, error: { code, message, fields? } }
 *
 * Every response is JSON with `cache-control: no-store`. `message` is human copy
 * the app shows as is in a toast, so it is plain, short and never technical.
 * `fields` maps a form field to its inline error.
 */

export type ErrorBody = { code: string; message: string; fields?: Record<string, string> };
export type SuccessEnvelope<T> = { ok: true; data: T };
export type FailureEnvelope = { ok: false; error: ErrorBody };
export type Envelope<T> = SuccessEnvelope<T> | FailureEnvelope;

/** Copy shared by every domain. Domain messages live next to their routes. */
export const MESSAGES = {
  unauthorized: "Sign in again.",
  notStaff: "That account is not allowed here.",
  ownerOnly: "That section is owner only.",
  forbidden: "Your role cannot do that.",
  notFound: "That item no longer exists.",
  notJson: "The app sent something the server could not read. Update the app and try again.",
  tooLarge: "That is too much to send at once.",
  upgrade: "This version of the app is too old. Update to keep going.",
  rateLimited: "Too many requests. Wait a moment, then try again.",
  notConfigured: "The server is missing a setting for this feature.",
  unavailable: "Could not load this just now. Nothing is lost: try again in a moment.",
  upstream: "Stripe or Meta did not answer properly. Try again in a moment.",
  cursor: "That page is out of date. Pull to refresh.",
  idempotencyConflict: "That request was already sent with different details. Start again.",
  idempotencyRunning: "That request is still running. Try again in a moment.",
  invalid: "Check the highlighted fields.",
} as const;

export const NO_STORE_HEADERS = { "cache-control": "no-store" } as const;

/**
 * A failure any code under a route may throw. The route helper turns it into
 * the failure envelope with its status. Anything else thrown becomes a 500
 * "unavailable" with the details logged on the server only.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly headers?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>, headers?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields && Object.keys(fields).length > 0 ? fields : undefined;
    this.headers = headers;
  }

  get body(): FailureEnvelope {
    return failureBody(this.code, this.message, this.fields);
  }
}

export function failureBody(code: string, message: string, fields?: Record<string, string>): FailureEnvelope {
  return { ok: false, error: fields && Object.keys(fields).length > 0 ? { code, message, fields } : { code, message } };
}

/** `{ ok: true, data }` with `cache-control: no-store`. `undefined` is sent as `null`. */
export function ok<T>(data: T, status = 200, headers?: Record<string, string>): NextResponse<SuccessEnvelope<T>> {
  return NextResponse.json({ ok: true, data: (data === undefined ? null : data) as T }, { status, headers: { ...NO_STORE_HEADERS, ...headers } });
}

/** `{ ok: false, error: { code, message, fields? } }` with a real HTTP status and `cache-control: no-store`. */
export function fail(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
  headers?: Record<string, string>,
): NextResponse<FailureEnvelope> {
  return NextResponse.json(failureBody(code, message, fields), { status, headers: { ...NO_STORE_HEADERS, ...headers } });
}

/* ------------------------------------------------------------------ */
/* Throwable shortcuts, for lib code that runs under a route.          */
/* ------------------------------------------------------------------ */

/** 400 with a code, a message and optional inline field errors. */
export const badRequest = (code: string, message: string, fields?: Record<string, string>) => new ApiError(400, code, message, fields);

/** 404 `not_found` "<what> no longer exists." (the app shows it as is). */
export const notFound = (what = "That item") => new ApiError(404, "not_found", `${what} no longer exists.`);

/** 409 for a uniqueness clash (`slug_taken`, `dupe`, ...). */
export const conflict = (code: string, message: string, fields?: Record<string, string>) => new ApiError(409, code, message, fields);

/** 422 for a business rule (`care_required`, `not_actionable`, ...). */
export const businessRule = (code: string, message: string, fields?: Record<string, string>) => new ApiError(422, code, message, fields);

/** 502 when Stripe or Meta failed. */
export const upstream = (code = "upstream", message: string = MESSAGES.upstream) => new ApiError(502, code, message);

/** 503 when a setting this feature needs is missing (no Supabase, no Stripe key, ...). */
export const notConfigured = (message: string = MESSAGES.notConfigured) => new ApiError(503, "not_configured", message);

/** 500 for a read or write that failed (the cause is logged by the caller). */
export const unavailable = (message: string = MESSAGES.unavailable) => new ApiError(500, "unavailable", message);

/* ------------------------------------------------------------------ */
/* zod errors to field errors                                          */
/* ------------------------------------------------------------------ */

/** "appVersion" -> "app_version": the default error code for a bad field. */
export function snakeCase(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
}

/**
 * A 400 from a failed zod parse. `fields` maps each bad field (its path joined
 * with ".") to the first message for it. `code` is the first bad field's code:
 * `fieldCodes[field]` when given, else the field name in snake_case
 * ("appVersion" -> "app_version"), or "invalid" for a problem with the whole
 * body. `message` is the first issue's message, so write the schema messages as
 * the copy the app should show ("Enter a display name.").
 */
export function validationError(error: ZodError, fieldCodes?: Record<string, string>): ApiError {
  const fields: Record<string, string> = {};
  let firstField: string | null = null;
  let firstMessage: string | null = null;
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".");
    const message = issue.message || MESSAGES.invalid;
    if (firstMessage === null) {
      firstMessage = message;
      firstField = path || null;
    }
    if (path && !(path in fields)) fields[path] = message;
  }
  const top = firstField?.split(".")[0] ?? null;
  const code = (firstField && (fieldCodes?.[firstField] ?? (top ? fieldCodes?.[top] : undefined))) ?? (top ? snakeCase(top) : "invalid");
  return new ApiError(400, code, firstMessage ?? MESSAGES.invalid, fields);
}
