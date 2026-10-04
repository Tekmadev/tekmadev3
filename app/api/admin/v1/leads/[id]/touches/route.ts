import { z } from "zod";
import { pageQuery, route } from "@/lib/admin-api";
import {
  LEAD_MESSAGES as M,
  followUpInput,
  listTouches,
  logTouch,
  optionalText,
  statusInput,
  touchAtInput,
  touchKindInput,
} from "@/lib/admin-api/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /leads/:id/touches?cursor=&limit= -> Page<Touch>, newest first. */
export const GET = route(
  { method: "GET", capability: "leads.view", query: z.object({ ...pageQuery }) },
  async (ctx, { params, query }) => listTouches(ctx, params.id, query.cursor, query.limit),
);

const touchBody = z.object({
  kind: touchKindInput,
  outcome: optionalText(200, M.outcomeLong),
  note: optionalText(5000, M.noteLong),
  at: touchAtInput,
  status: statusInput.optional(),
  followUpAt: followUpInput,
});

/**
 * POST /leads/:id/touches (Idempotency-Key) { kind, outcome?, note?, at?, status?, followUpAt? }
 * -> 201 { touch, lead }. Logging a call, email, DM or meeting on a "new"
 * lead moves it to "contacted" unless `status` says otherwise.
 */
export const POST = route(
  { method: "POST", capability: "leads.outreach", body: touchBody, idempotent: true, status: 201 },
  async (ctx, { body, params, req }) => logTouch(ctx, params.id, body, req.headers.get("idempotency-key")),
);
