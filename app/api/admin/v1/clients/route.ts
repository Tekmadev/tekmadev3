import { z } from "zod";
import { ok, pageQuery, route } from "@/lib/admin-api";
import {
  ATTENTIONS,
  LIST_STATUSES,
  clientStats,
  createClientByStaff,
  jsonObject,
  loadClientRows,
  matchesQuery,
  matchesStatus,
  pageRows,
  rowNeedsAttention,
} from "@/lib/admin-api/clients/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An enum query value; an empty value is the same as none. */
const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.enum(values, message).optional());

const listQuery = z.object({
  ...pageQuery,
  status: optionalEnum(LIST_STATUSES, "Unknown status filter."),
  attention: optionalEnum(ATTENTIONS, "Unknown attention filter."),
  q: z
    .string()
    .optional()
    .transform((v) => v?.trim().slice(0, 100) || undefined),
  test: z.string().optional(),
});

/**
 * GET /clients?status=&q=&test=1&attention=&cursor=&limit= -> { stats, items, nextCursor }.
 *
 * `status` defaults to `active` (everything but churned and lead); `q` matches
 * business name and email; `attention` narrows to one of Home's "Needs you"
 * cards with the same rules. Test clients only for callers with
 * `testdata.view` who send test=1 (ignored for anyone else). The stat cards
 * ignore the status chip, the search and the attention filter. Most recently
 * updated first, ties by business name; an opaque keyset cursor.
 */
export const GET = route({ method: "GET", capability: "clients.view", query: listQuery }, async (ctx, { query }) => {
  const includeTest = ctx.can("testdata.view") && (query.test === "1" || query.test === "true");
  const entries = await loadClientRows({ includeTest });
  const status = query.status ?? "active";
  const attention = query.attention;
  const filtered = entries.filter(
    (e) => matchesStatus(e.row, status) && matchesQuery(e.row, query.q) && (!attention || rowNeedsAttention(e.row, attention)),
  );
  const page = pageRows(filtered, query.limit, query.cursor);
  return { stats: clientStats(entries.map((e) => e.row)), items: page.items, nextCursor: page.nextCursor };
});

/**
 * POST /clients { businessName, email, name?, phone?, planId?, assignedStrategist?, sendInvite }
 * -> 201 { client, reused: false, invite } (200 with reused: true when a client
 * with that email already existed). 400 `required` without a business name and
 * a valid email; 409 `email_taken` for an email a test client uses (callers who
 * cannot see test data). Honours Idempotency-Key.
 */
export const POST = route(
  { method: "POST", capability: "clients.create", body: jsonObject, idempotent: true },
  async (ctx, { body }) => {
    const result = await createClientByStaff(ctx, body);
    return ok(result, result.reused ? 200 : 201);
  },
);
