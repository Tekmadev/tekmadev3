import { notFound, route } from "@/lib/admin-api";
import { getToolSubmission } from "@/lib/admin-api/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /tools/submissions/:id -> the row plus `answers`, `result` (display
 * text, as emailed) and `leadId`. 404 "That submission no longer exists.".
 */
export const GET = route({ method: "GET", capability: "tools.view" }, async (_ctx, { params }) => {
  const submission = await getToolSubmission(params.id);
  if (!submission) throw notFound("That submission");
  return submission;
});
