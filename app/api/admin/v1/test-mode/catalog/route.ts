import { requireDb, route } from "@/lib/admin-api";
import { rebuildTestCatalog } from "@/lib/admin-api/testMode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long job: several Stripe calls in the sandbox. The app waits up to 120s and never retries.
export const maxDuration = 120;

/**
 * POST /test-mode/catalog -> the whole TestModeStatus after the rebuild. Owner.
 * 503 `not_configured` without a sandbox key; 502 `stripe` when Stripe refused.
 */
export const POST = route({ method: "POST", capability: "testmode.write" }, async () => rebuildTestCatalog(requireDb()));
