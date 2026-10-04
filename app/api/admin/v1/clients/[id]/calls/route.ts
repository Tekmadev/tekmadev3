import { route } from "@/lib/admin-api";
import { logCall } from "@/lib/admin-api/clients/sections/calls";
import { jsonObject } from "@/lib/admin-api/clients/sections/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /clients/:id/calls -> 201 { call, guarantee }. "Log a booked call":
 * hand-logged calls are qualified at once. Owner, manager and staff (staff may
 * log calls but never review them).
 */
export const POST = route(
  { method: "POST", capability: "clients.calls.log", body: jsonObject, idempotent: true, status: 201 },
  (ctx, { params, body }) => logCall(ctx, params.id, body),
);
