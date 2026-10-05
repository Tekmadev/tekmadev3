import { z } from "zod";
import { isUuid, pageQuery, route } from "@/lib/admin-api";
import { DEMO_STATUS_FILTERS, createDemo, demoBody, demoIdempotencyKey, listDemos, parseDemoCreate } from "@/lib/admin-api/demos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An optional query value; an empty value is the same as none. */
const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);

const listQuery = z.object({
  ...pageQuery,
  status: z.preprocess(blankToUndefined, z.enum(DEMO_STATUS_FILTERS, "Unknown demo status.").optional()),
  mine: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  clientId: z.preprocess(blankToUndefined, z.string().trim().toLowerCase().refine(isUuid, "Unknown client.").optional()),
  leadId: z.preprocess(blankToUndefined, z.string().trim().toLowerCase().refine(isUuid, "Unknown lead.").optional()),
});

/**
 * GET /demos?status=open|requested|building|ready|shown|cancelled|all&mine=1&clientId=&leadId=&cursor=&limit=
 * -> { items: DemoRequest[], nextCursor, counts: { open, requested, building, ready, mine } }.
 * Default status `open` (requested, building, ready); newest first; list rows
 * send `events: []`. `counts` ignore the status and mine filters but respect
 * clientId and leadId (docs/admin-api/demos.md).
 */
export const GET = route({ method: "GET", capability: "demos.view", query: listQuery }, async (ctx, { query }) =>
  listDemos(ctx, {
    status: query.status ?? "open",
    mine: query.mine,
    clientId: query.clientId,
    leadId: query.leadId,
    cursor: query.cursor,
    limit: query.limit,
  }),
);

/**
 * POST /demos { clientId? | leadId?, business, wants?, neededBy?, idempotencyKey } -> 201 DemoRequest.
 * Exactly one of clientId / leadId (400 `target`), field problems 400
 * `validation` with `fields`, an unknown client or lead 404. The same
 * idempotencyKey (or Idempotency-Key header) with the same body answers the
 * first result; with a different body 409 `idempotency_conflict`.
 */
export const POST = route(
  { method: "POST", capability: "demos.request", body: demoBody, idempotent: true, status: 201 },
  async (ctx, { body, req }) => {
    const input = parseDemoCreate(body);
    const key = demoIdempotencyKey(body, req.headers.get("idempotency-key"));
    return createDemo(ctx, input, key);
  },
);
