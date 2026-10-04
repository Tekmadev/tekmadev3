import { route } from "@/lib/admin-api";
import { FieldCheck, findClient, goLiveByStaff, jsonObject } from "@/lib/admin-api/clients/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /clients/:id/go-live { override?: boolean } -> { client, guarantee }.
 * 409 `already_live`; 422 `care_required` when the plan needs Webline Care and
 * none is active (send `override: true` to go live anyway, which is logged).
 */
export const POST = route({ method: "POST", capability: "clients.go_live", body: jsonObject }, async (ctx, { params, body }) => {
  const client = await findClient(ctx, params.id);
  const check = new FieldCheck(body);
  const override = check.flag("override");
  check.done();
  return goLiveByStaff(ctx, client, override === true);
});
