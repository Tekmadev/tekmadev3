import { route } from "@/lib/admin-api";
import { requestApproval } from "@/lib/admin-api/clients/sections/approvals";
import { jsonObject } from "@/lib/admin-api/clients/sections/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /clients/:id/approvals { title, kind?, description?, previewUrl?, taskId?, attachment? }
 * -> 201 Approval (the new version; a pending version of the same title is
 * superseded). Owner, manager and staff.
 */
export const POST = route(
  { method: "POST", capability: "clients.approvals.request", body: jsonObject, idempotent: true, status: 201 },
  (ctx, { params, body }) => requestApproval(ctx, params.id, body),
);
