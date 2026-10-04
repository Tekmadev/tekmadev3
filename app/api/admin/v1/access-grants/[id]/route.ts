import { route } from "@/lib/admin-api";
import { updateAccessGrant } from "@/lib/admin-api/clients/sections/access";
import { jsonObject } from "@/lib/admin-api/clients/sections/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /access-grants/:id { status?, note? } -> the full AccessGrant.
 * An empty note keeps the old one; null clears it. Owner and manager.
 */
export const PATCH = route(
  { method: "PATCH", capability: "clients.access.update", body: jsonObject },
  (ctx, { params, body }) => updateAccessGrant(ctx, params.id, body),
);
