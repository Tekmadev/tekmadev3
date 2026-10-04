import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { authenticate, type ApiContext } from "./auth";
import { ApiError, MESSAGES, NO_STORE_HEADERS, fail, validationError } from "./errors";
import { withIdempotency, type StoredResponse } from "./idempotency";
import { requireAnyCapability, requireCapability, type Capability } from "./permissions";
import { assertAppVersion } from "./version";

/**
 * One wrapper per endpoint, so a route file stays a few lines:
 *
 *   // app/api/admin/v1/leads/[id]/route.ts
 *   export const dynamic = "force-dynamic";
 *   export const GET = route({ method: "GET", capability: "leads.view" }, async (ctx, { params }) => getLead(params.id));
 *
 * In order, for every call:
 *   1. 405 when the export name and `method` disagree (a wiring mistake)
 *   2. 426 `upgrade_required` below the minimum app version
 *   3. 401 / 403 `not_staff` (auth.ts)
 *   4. 429 `rate_limited` past 240 calls a minute per person (per instance)
 *   5. 403 `owner_only` / `forbidden` for a missing capability
 *   6. 400 for a bad query (when `query` is given), 415 `not_json` for a body that
 *      is not JSON, 400 `bad_json` for JSON that does not parse, 400 with
 *      `fields` for a body that fails `body`
 *   7. Idempotency-Key replay for `idempotent: true` (creates)
 *   8. the handler: return data (sent as `{ ok: true, data }` with `status`,
 *      default 200), or a Response from ok()/fail(), or throw an ApiError.
 *      Anything else thrown is logged and answered 500 `unavailable`.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RouteOptions<B extends z.ZodType | undefined, Q extends z.ZodType | undefined> = {
  method: HttpMethod;
  /** Every capability listed is required. Omit for "any staff". */
  capability?: Capability | readonly Capability[];
  /** At least one of these is required (checked after `capability`). */
  anyCapability?: readonly Capability[];
  /** zod schema for the JSON body. Its output is `input.body`. */
  body?: B;
  /** zod schema for the query string (an object of strings). Its output is `input.query`. */
  query?: Q;
  /** Honour Idempotency-Key (every create). */
  idempotent?: boolean;
  /** Success status when the handler returns plain data (default 200; creates often 201). */
  status?: number;
  /**
   * Error code per field for zod failures, when it is not the field name in
   * snake_case. Example: `{ maxRedemptions: "max" }`.
   */
  fieldCodes?: Record<string, string>;
  /** Calls a minute per person; false to skip (default 240). */
  rateLimit?: number | false;
};

export type RouteInput<B extends z.ZodType | undefined, Q extends z.ZodType | undefined> = {
  body: B extends z.ZodType ? z.output<B> : undefined;
  query: Q extends z.ZodType ? z.output<Q> : Record<string, string>;
  /** Dynamic segments, decoded. A catch-all segment arrives joined with "/". */
  params: Record<string, string>;
  req: NextRequest;
};

export type RouteHandler<B extends z.ZodType | undefined, Q extends z.ZodType | undefined, T> = (
  ctx: ApiContext,
  input: RouteInput<B, Q>,
) => Promise<T | Response> | T | Response;

/** The second argument Next.js passes a route handler. */
export type RouteSegment = { params: Promise<Record<string, string | string[] | undefined>> };

export type NextRouteHandler = (req: NextRequest, segment: RouteSegment) => Promise<Response>;

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_RATE_PER_MINUTE = 240;
const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** A failure Response for anything thrown. Unknown errors are logged, never sent. */
export function errorResponse(err: unknown, req?: NextRequest): NextResponse {
  if (err instanceof ApiError) return fail(err.status, err.code, err.message, err.fields, err.headers);
  const where = req ? `${req.method} ${req.nextUrl.pathname}` : "request";
  console.error(`[admin-api] ${where} failed`, err);
  return fail(500, "unavailable", MESSAGES.unavailable);
}

async function readParams(segment: RouteSegment | undefined): Promise<Record<string, string>> {
  const raw = segment ? await segment.params : {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.join("/");
  }
  return out;
}

function readQuery(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  // The first value wins when a key repeats.
  for (const [key, value] of req.nextUrl.searchParams) if (!(key in out)) out[key] = value;
  return out;
}

/** The JSON body: {} when empty, 415 when not JSON, 400 when it does not parse. */
async function readJsonBody(req: NextRequest): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new ApiError(400, "too_large", MESSAGES.tooLarge);
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(400, "too_large", MESSAGES.tooLarge);
  if (text.trim() === "") return {};
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!/^application\/([a-z0-9.+-]*\+)?json\b/.test(type)) throw new ApiError(415, "not_json", MESSAGES.notJson);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "bad_json", MESSAGES.notJson);
  }
}

/**
 * Handler output as a status and an envelope body. A Response's body is only
 * read when it must be stored for an Idempotency-Key replay.
 */
async function toStored(output: unknown, status: number, readBody: boolean): Promise<StoredResponse & { response?: Response }> {
  if (output instanceof Response) {
    let body: unknown = null;
    if (readBody) {
      try {
        body = await output.clone().json();
      } catch {
        body = null;
      }
    }
    return { status: output.status, body, response: output };
  }
  return { status, body: { ok: true, data: output === undefined ? null : output } };
}

/** Mark a handler's Response no-store (a Response with frozen headers is copied). */
function withNoStore(response: Response): Response {
  try {
    response.headers.set("cache-control", "no-store");
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}

/** HEAD is answered by the GET handler (Next.js does this when no HEAD is exported). */
function methodMatches(actual: string, expected: HttpMethod): boolean {
  const m = actual.toUpperCase();
  return m === expected || (m === "HEAD" && expected === "GET");
}

export function route<B extends z.ZodType | undefined = undefined, Q extends z.ZodType | undefined = undefined, T = unknown>(
  options: RouteOptions<B, Q>,
  handler: RouteHandler<B, Q, T>,
): NextRouteHandler {
  return async (req, segment) => {
    try {
      if (!methodMatches(req.method, options.method)) {
        return fail(405, "method", "Method not allowed.", undefined, { allow: options.method });
      }
      await assertAppVersion(req.headers.get("x-app-version"));
      const ctx = await authenticate(req);

      const perMinute = options.rateLimit === undefined ? DEFAULT_RATE_PER_MINUTE : options.rateLimit;
      if (perMinute !== false) {
        const limited = rateLimit(`admin-api:${ctx.userId}`, perMinute, 60_000);
        if (!limited.ok) {
          throw new ApiError(429, "rate_limited", MESSAGES.rateLimited, undefined, { "retry-after": String(limited.retryAfter) });
        }
      }

      if (options.capability) {
        const required = typeof options.capability === "string" ? [options.capability] : [...options.capability];
        requireCapability(ctx, ...required);
      }
      if (options.anyCapability?.length) requireAnyCapability(ctx, ...options.anyCapability);

      const params = await readParams(segment);

      const rawQuery = readQuery(req);
      let query: unknown = rawQuery;
      if (options.query) {
        const parsed = options.query.safeParse(rawQuery);
        if (!parsed.success) throw validationError(parsed.error, options.fieldCodes);
        query = parsed.data;
      }

      let rawBody: unknown = undefined;
      let body: unknown = undefined;
      if (options.body || BODY_METHODS.has(options.method)) {
        rawBody = options.method === "DELETE" && !options.body ? undefined : await readJsonBody(req);
        if (options.body) {
          const parsed = options.body.safeParse(rawBody);
          if (!parsed.success) throw validationError(parsed.error, options.fieldCodes);
          body = parsed.data;
        }
      }

      const input = { body, query, params, req } as RouteInput<B, Q>;
      const successStatus = options.status ?? 200;

      const key = req.headers.get("idempotency-key");
      const replayable = Boolean(options.idempotent && key);

      const execute = async (): Promise<StoredResponse & { response?: Response }> => {
        try {
          return await toStored(await handler(ctx, input), successStatus, replayable);
        } catch (err) {
          // Business failures are answers too: a retried create gets the same 4xx.
          if (err instanceof ApiError) return { status: err.status, body: err.body, response: errorResponse(err) };
          throw err;
        }
      };

      if (replayable && key) {
        const stored = await withIdempotency(
          { userId: ctx.userId, key, method: options.method, path: req.nextUrl.pathname, body: rawBody ?? null },
          execute,
        );
        return NextResponse.json(stored.body, {
          status: stored.status,
          headers: { ...NO_STORE_HEADERS, ...(stored.replayed ? { "idempotent-replayed": "true" } : {}) },
        });
      }

      const result = await execute();
      if (result.response) return withNoStore(result.response);
      return NextResponse.json(result.body, { status: result.status, headers: NO_STORE_HEADERS });
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}

/**
 * A route with no sign-in (health checks). No version gate, no auth, no body.
 * Keep these few and free of anything private.
 */
export function publicRoute<T>(
  options: { method: HttpMethod },
  handler: (input: { req: NextRequest; params: Record<string, string> }) => Promise<T | Response> | T | Response,
): NextRouteHandler {
  return async (req, segment) => {
    try {
      if (!methodMatches(req.method, options.method)) {
        return fail(405, "method", "Method not allowed.", undefined, { allow: options.method });
      }
      const output = await handler({ req, params: await readParams(segment) });
      if (output instanceof Response) return withNoStore(output);
      return NextResponse.json({ ok: true, data: output === undefined ? null : output }, { headers: NO_STORE_HEADERS });
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}
