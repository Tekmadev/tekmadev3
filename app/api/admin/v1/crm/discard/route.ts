import { businessRule, route } from "@/lib/admin-api";
import { discardInbox } from "@/lib/crm/inbox";
import { discardOutbox } from "@/lib/crm/outbox";
import { crmBatchBody } from "@/lib/admin-api/crm/batch";
import { CRM_MESSAGES } from "@/lib/admin-api/crm/copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /crm/discard { queue, ids } -> { count }. Owners and managers (crm.write). Stops
 * trying for good, the web admin's Discard: items leave "Needs attention" but
 * stay on record with who decided, never deleted. 422 `nothing` when none of
 * the ids matched.
 */
export const POST = route({ method: "POST", capability: "crm.write", body: crmBatchBody }, async (ctx, { body: batch }) => {
  const count = batch.queue === "inbox" ? await discardInbox(batch.ids, ctx.email) : await discardOutbox(batch.ids, ctx.email);
  if (count === 0) throw businessRule("nothing", CRM_MESSAGES.nothing);
  return { count };
});
