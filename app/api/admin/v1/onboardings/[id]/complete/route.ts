import { route } from "@/lib/admin-api";
import { completeRunByStaff, findRun } from "@/lib/admin-api/clients/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /onboardings/:id/complete -> the full OnboardingRun. Irreversible; 409 `run_complete` when already complete. */
export const POST = route({ method: "POST", capability: "clients.onboarding" }, async (ctx, { params }) => {
  const { run } = await findRun(ctx, params.id);
  return completeRunByStaff(ctx, run);
});
