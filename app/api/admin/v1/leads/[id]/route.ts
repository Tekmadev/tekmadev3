import { notFound, route } from "@/lib/admin-api";
import { getLead, leadPatchBody, updateLead } from "@/lib/admin-api/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /leads/:id -> Lead (with `canEdit` for the caller). 404 `not_found` "That lead no longer exists.". */
export const GET = route({ method: "GET", capability: "leads.view" }, async (ctx, { params }) => {
  const lead = await getLead(ctx, params.id);
  if (!lead) throw notFound("That lead");
  return lead;
});

/**
 * PATCH /leads/:id { name?, business?, email?, phone?, website?, need?,
 * message?, status?, followUpAt?, assignedTo? } -> the full Lead.
 * Partial: only the keys sent change; null (or "") clears a field. The body
 * is the shared leadPatchBody (the web admin parses with it too).
 *
 * Status, follow-up and assignee: any `leads.update` caller. Booked records
 * the caller as the booker the first time; a calendar lead can only be set to
 * booked when it already shows booked. Cancelled is not settable (it mirrors
 * the calendar).
 *
 * Details (edit lead, owner decision 2026-10-08), on a lead of any source:
 * owners and managers on any lead, staff on a lead they found or that is
 * assigned to them (else 403 `forbidden`). The POST /leads field rules apply,
 * the lead must keep a name or a business and an email or a phone, and an
 * email already on another lead is 409 `duplicate`. docs/admin-api/outreach.md
 * section 4.
 */
export const PATCH = route({ method: "PATCH", capability: "leads.update", body: leadPatchBody }, async (ctx, { body, params }) =>
  updateLead(ctx, params.id, body),
);
