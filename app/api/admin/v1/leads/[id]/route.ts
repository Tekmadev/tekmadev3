import { z } from "zod";
import { notFound, route } from "@/lib/admin-api";
import { assigneeInput, followUpInput, getLead, statusInput, updateLead } from "@/lib/admin-api/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /leads/:id -> Lead. 404 `not_found` "That lead no longer exists.". */
export const GET = route({ method: "GET", capability: "leads.view" }, async (ctx, { params }) => {
  const lead = await getLead(ctx, params.id);
  if (!lead) throw notFound("That lead");
  return lead;
});

const patchBody = z.object({
  status: statusInput.optional(),
  followUpAt: followUpInput,
  assignedTo: assigneeInput,
});

/**
 * PATCH /leads/:id { status?, followUpAt?, assignedTo? } -> the full Lead.
 * Partial: only the keys sent change; null clears the follow-up or the
 * assignee. Booked records the caller as the booker the first time; a
 * calendar lead can only be set to booked when it already shows booked.
 * Cancelled is not settable (it mirrors the calendar).
 */
export const PATCH = route({ method: "PATCH", capability: "leads.update", body: patchBody }, async (ctx, { body, params }) =>
  updateLead(ctx, params.id, body),
);
