import { route } from "@/lib/admin-api";
import { findIntake, reviewIntakeFromApp } from "@/lib/admin-api/clients/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /intakes/:id/review -> the full Intake, now reviewed. Only a submitted
 * intake: 409 `not_submitted` otherwise ("This intake is already reviewed."
 * for a reviewed one). Also closes the "intake submitted" inbox item and an
 * open "review the intake" checklist task.
 */
export const POST = route({ method: "POST", capability: "clients.intake.review" }, async (ctx, { params }) => {
  const found = await findIntake(ctx, params.id);
  return reviewIntakeFromApp(ctx, found);
});
