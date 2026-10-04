import { route } from "@/lib/admin-api";
import { updateMember } from "@/lib/admin-api/clients/sections/members";
import { jsonObject } from "@/lib/admin-api/clients/sections/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /members/:id { role?, status? } -> the full Member. Owner and manager. */
export const PATCH = route(
  { method: "PATCH", capability: "clients.members", body: jsonObject },
  (ctx, { params, body }) => updateMember(ctx, params.id, body),
);
