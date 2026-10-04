import { route } from "@/lib/admin-api";
import { refreshAds } from "@/lib/admin-api/ads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A long job: the app waits up to 2 minutes (a first pull backfills 90 days).
export const maxDuration = 120;

/**
 * POST /ads/refresh: pull the latest ad-day rows from Meta now (the nightly
 * job's pull, on demand). Owners and managers. `{ rowsUpserted }`.
 * Meta refuses: 502 `upstream` (the inbox gets the reason). Not connected:
 * 503 `not_configured`.
 */
export const POST = route({ method: "POST", capability: "ads.refresh" }, async () => refreshAds());
