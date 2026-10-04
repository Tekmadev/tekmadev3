import { z } from "zod";
import { requireDb, route } from "@/lib/admin-api";
import { parseLoaderBody, readLoader, saveLoader } from "@/lib/admin-api/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /settings/loader -> LoaderSettings (the six values GET /me sends as `loader`). Owner. */
export const GET = route({ method: "GET", capability: "loader.view" }, async () => readLoader(requireDb()));

/**
 * PUT /settings/loader LoaderSettings | { reset: true } -> the saved LoaderSettings. Owner.
 * All six values are required; out-of-range values are clamped, not refused.
 * A failed save answers 500 `db` and changes nothing.
 */
export const PUT = route({ method: "PUT", capability: "loader.write", body: z.unknown() }, async (ctx, { body }) => {
  const input = parseLoaderBody(body);
  requireDb();
  return saveLoader(input, ctx.email);
});
