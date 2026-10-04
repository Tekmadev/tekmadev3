import { ApiError, route } from "@/lib/admin-api";
import { syncCrmNow } from "@/lib/crm/admin-ops";
import { CRM_MESSAGES } from "@/lib/admin-api/crm/copy";
import { requireCrmConnection } from "@/lib/admin-api/crm/inspect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A long job: about 45 seconds of work budget (inbox 20 s, then outbox 25 s).
export const maxDuration = 120;

/**
 * POST /crm/sync ("Sync now", long job) -> { handled }. Owners and managers (crm.write).
 * Needs a token (503) and a passed Verify (422 `unverified`). Applies the
 * inbox while Inbound is on and pushes the outbox while Outbound is on, each
 * recording its own run; a leg that is switched off is skipped. 502 `sync`
 * when a pass fails: queued items stay queued.
 */
export const POST = route({ method: "POST", capability: "crm.write" }, async () => {
  await requireCrmConnection({ verified: true });
  const result = await syncCrmNow();
  if (!result.ok) throw new ApiError(502, "sync", CRM_MESSAGES.sync);
  return { handled: result.handled };
});
