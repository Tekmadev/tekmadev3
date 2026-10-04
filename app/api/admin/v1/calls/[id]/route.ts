import { route } from "@/lib/admin-api";
import { updateCall } from "@/lib/admin-api/clients/sections/calls";
import { jsonObject } from "@/lib/admin-api/clients/sections/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /calls/:id { status?, qualified?, disqualifiedReason?, notes? } -> { call, guarantee }.
 * Owner and manager (staff never review calls).
 */
export const PATCH = route(
  { method: "PATCH", capability: "clients.calls.review", body: jsonObject },
  (ctx, { params, body }) => updateCall(ctx, params.id, body),
);
