import { z } from "zod";
import { requireDb, route } from "@/lib/admin-api";
import { purgeTestModeData } from "@/lib/admin-api/testMode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /test-mode/purge { confirm: true } -> { clients, orders, subscriptions, logins }
 * deleted. Owner. Without `confirm: true`: 400 `confirm`, nothing deleted.
 */
export const POST = route({ method: "POST", capability: "testmode.write", body: z.unknown() }, async (_ctx, { body }) => {
  requireDb();
  return purgeTestModeData(body);
});
