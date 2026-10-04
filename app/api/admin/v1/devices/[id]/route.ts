import { ApiError, isUuid, notFound, route } from "@/lib/admin-api";
import { removeAdminDevice } from "@/lib/admin-devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /devices/:id -> null. Any staff, own phones only: an unknown id, or
 * one registered by someone else, is 404 (the app ignores it on sign-out).
 */
export const DELETE = route({ method: "DELETE" }, async (ctx, { params }) => {
  if (!isUuid(params.id)) throw notFound("That device");
  const result = await removeAdminDevice(ctx.userId, params.id);
  if (result === "missing") throw notFound("That device");
  if (result === "failed") throw new ApiError(500, "unavailable", "Could not remove this phone just now. Try again in a moment.");
  return null;
});
