import { route } from "@/lib/admin-api";
import { findRun, jsonObject, patchRun } from "@/lib/admin-api/clients/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /onboardings/:id { stage?, blocked?, blockedReason?, targetLiveDate?, kickoffAt? }
 * -> the full OnboardingRun with its derived stage and progress. `stage:
 * "complete"` completes the run like POST /complete. Unblocking clears the
 * reason. 409 `run_complete` once the run is complete.
 */
export const PATCH = route({ method: "PATCH", capability: "clients.onboarding", body: jsonObject }, async (ctx, { params, body }) => {
  const found = await findRun(ctx, params.id);
  return patchRun(ctx, found, body);
});
