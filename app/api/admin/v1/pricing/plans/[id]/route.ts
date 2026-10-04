import { z } from "zod";
import { requireDb, route } from "@/lib/admin-api";
import { parsePlanPatch, updatePlanPrices } from "@/lib/admin-api/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Up to two new Stripe prices plus archiving the old ones.
export const maxDuration = 60;

/**
 * PATCH /pricing/plans/:id { monthly?, setup? } (cents) -> { plan, stripe }. Owner.
 *
 * Only the amounts sent change. Each changed price is created in Stripe and
 * saved, or refused and left as it was: a refusal answers 502 `stripe` with a
 * message saying what was and was not saved. `stripe: "skipped"` when nothing
 * changed or Stripe is not configured.
 */
export const PATCH = route(
  { method: "PATCH", capability: "pricing.write", body: z.unknown() },
  async (_ctx, { params, body }) => updatePlanPrices(requireDb(), params.id ?? "", parsePlanPatch(body)),
);
