import { route } from "@/lib/admin-api";
import { requestAccess } from "@/lib/admin-api/clients/sections/access";
import { jsonObject } from "@/lib/admin-api/clients/sections/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /clients/:id/access-grants { provider, label?, note? } -> 201 AccessGrant.
 * "Request another access": the client is notified and sees it in the portal.
 * Owner, manager and staff.
 */
export const POST = route(
  { method: "POST", capability: "clients.access.request", body: jsonObject, idempotent: true, status: 201 },
  (ctx, { params, body }) => requestAccess(ctx, params.id, body),
);
