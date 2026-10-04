import { route } from "@/lib/admin-api";
import { addMember } from "@/lib/admin-api/clients/sections/members";
import { jsonObject } from "@/lib/admin-api/clients/sections/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /clients/:id/members { email, name?, title?, role? } -> 201 { member, invite }.
 * "Add a person" to the client's portal; the invite email goes out at once.
 * Owner and manager.
 */
export const POST = route(
  { method: "POST", capability: "clients.members", body: jsonObject, idempotent: true, status: 201 },
  (ctx, { params, body }) => addMember(ctx, params.id, body),
);
