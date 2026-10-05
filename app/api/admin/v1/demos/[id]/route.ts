import { notFound, route } from "@/lib/admin-api";
import { demoBody, getDemo, parseDemoPatch, updateDemo } from "@/lib/admin-api/demos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /demos/:id -> DemoRequest with its events, oldest first. 404 `not_found` "That demo request no longer exists.". */
export const GET = route({ method: "GET", capability: "demos.view" }, async (ctx, { params }) => {
  const demo = await getDemo(ctx, params.id);
  if (!demo) throw notFound("That demo request");
  return demo;
});

/**
 * PATCH /demos/:id { business?, wants?, neededBy?, status?, demoUrl?, builderEmail?, builderNote? }
 * -> the full DemoRequest with events. Only the keys sent change. Status,
 * link, builder and note need `demos.manage`; the person who asked may edit
 * the details while requested or building, cancel while requested or
 * building and mark it shown once ready. 403 `forbidden`, 409 `demo_closed`,
 * 422 `status_change`, 400 `demo_url` "Add the demo link first.", 400
 * `validation` (docs/admin-api/demos.md).
 */
export const PATCH = route(
  { method: "PATCH", capability: "demos.view", anyCapability: ["demos.request", "demos.manage"], body: demoBody },
  async (ctx, { body, params }) => updateDemo(ctx, params.id, parseDemoPatch(body)),
);
