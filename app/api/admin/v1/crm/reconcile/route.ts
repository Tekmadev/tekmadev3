import { ApiError, businessRule, route } from "@/lib/admin-api";
import { reconcileCrmNow } from "@/lib/crm/admin-ops";
import { getCrmSyncSetting } from "@/lib/crm/config";
import { CRM_MESSAGES } from "@/lib/admin-api/crm/copy";
import { requireCrmConnection } from "@/lib/admin-api/crm/inspect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A long job: a 45 second budget, paced at eight CRM lookups a second.
export const maxDuration = 120;

/**
 * POST /crm/reconcile ("Run now", long job) -> { corrected, halted }. Owner
 * only (crm.write). Needs a token (503) and a passed Verify (422
 * `unverified`). The web admin's reconcile: it only ever raises suppression,
 * and its safety stop (`halted`) ends the run once it would unsubscribe more
 * than the allowed share of the list; `corrected` counts what it applied
 * before stopping. Like the web button, it only runs while the Nightly
 * reconcile switch is on; with the switch off the answer is 422 `switch_off`
 * instead of a "corrected 0" that never ran. 502 `reconcile` when the run fails.
 */
export const POST = route({ method: "POST", capability: "crm.write" }, async () => {
  await requireCrmConnection({ verified: true });
  const setting = await getCrmSyncSetting();
  if (!setting.reconcile) throw businessRule("switch_off", CRM_MESSAGES.reconcileOff);
  const result = await reconcileCrmNow();
  if (!result.ok) throw new ApiError(502, "reconcile", CRM_MESSAGES.reconcile);
  return { corrected: result.corrected, halted: result.halted };
});
