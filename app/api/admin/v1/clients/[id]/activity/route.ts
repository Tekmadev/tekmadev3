import { z } from "zod";
import { pageQuery, route } from "@/lib/admin-api";
import { listActivity, postActivity } from "@/lib/admin-api/clients/sections/activity";
import { jsonObject } from "@/lib/admin-api/clients/sections/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listQuery = z.object({ ...pageQuery });

/** GET /clients/:id/activity?cursor=&limit= -> Page<Activity>, newest first. Anyone who may view clients. */
export const GET = route({ method: "GET", capability: "clients.view", query: listQuery }, (ctx, { params, query }) =>
  listActivity(ctx, params.id, query),
);

/**
 * POST /clients/:id/activity { kind: "note" | "update", text, subject?, actionUrl? } -> 201 Activity.
 * A note is internal; an update appears in the client's portal (no email).
 * Owner, manager and staff.
 */
export const POST = route(
  { method: "POST", capability: "clients.activity.write", body: jsonObject, idempotent: true, status: 201 },
  (ctx, { params, body }) => postActivity(ctx, params.id, body),
);
