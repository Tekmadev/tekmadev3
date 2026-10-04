import { ApiError, notConfigured, requireDb, route } from "@/lib/admin-api";
import { verifyCrmConnection } from "@/lib/crm/admin-ops";
import { crmConfigured } from "@/lib/crm/config";
import { CRM_MESSAGES } from "@/lib/admin-api/crm/copy";
import { loadCrmConnection } from "@/lib/admin-api/crm/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A long job: the probe makes about twenty CRM calls.
export const maxDuration = 120;

/**
 * POST /crm/verify (long job) -> the connection card. Owners and managers (crm.write).
 *
 * Runs the web admin's probe (lib/crm/probe.ts through verifyCrmConnection):
 * every check is stored with its detail and the health it settles, so a
 * failed check is an answer (200, "Not verified" with the checklist), not an
 * error. Every switch that is on stops running until Verify passes again.
 */
export const POST = route({ method: "POST", capability: "crm.write" }, async (ctx) => {
  requireDb();
  if (!crmConfigured()) throw notConfigured(CRM_MESSAGES.notConfigured);
  try {
    await verifyCrmConnection(ctx.email);
  } catch (err) {
    // The probe reports failures as failed checks and never throws; this is the
    // "could not run at all" case.
    console.error("[admin-api] crm verify threw", err instanceof Error ? err.message : String(err));
    throw new ApiError(502, "probe", CRM_MESSAGES.probe);
  }
  return loadCrmConnection();
});
