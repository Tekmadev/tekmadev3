import { route } from "@/lib/admin-api";
import { getCrmLocation, saveCrmLocation } from "@/lib/admin-api/clients/sections/crm";
import { jsonObject } from "@/lib/admin-api/clients/sections/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /clients/:id/crm-location -> CrmLocation. Owners and managers. */
export const GET = route({ method: "GET", capability: "clients.crm" }, (ctx, { params }) => getCrmLocation(ctx, params.id));

/**
 * PUT /clients/:id/crm-location { locationId, calendarIds } -> CrmLocation.
 * Owners and managers: it decides what counts toward a commercial promise.
 */
export const PUT = route(
  { method: "PUT", capability: "clients.crm", body: jsonObject },
  (ctx, { params, body }) => saveCrmLocation(ctx, params.id, body),
);
