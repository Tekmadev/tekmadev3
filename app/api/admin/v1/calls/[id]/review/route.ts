import { route } from "@/lib/admin-api";
import { reviewCall } from "@/lib/admin-api/clients/sections/calls";
import { jsonObject } from "@/lib/admin-api/clients/sections/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /calls/:id/review { counts } -> { call, guarantee }. "Real prospect,
 * count it" or "Agree, it does not count". Owner and manager.
 */
export const POST = route(
  { method: "POST", capability: "clients.calls.review", body: jsonObject },
  (ctx, { params, body }) => reviewCall(ctx, params.id, body),
);
