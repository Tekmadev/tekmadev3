import { businessRule, route } from "@/lib/admin-api";
import { retryInbox } from "@/lib/crm/inbox";
import { retryOutbox } from "@/lib/crm/outbox";
import { crmBatchBody } from "@/lib/admin-api/crm/batch";
import { CRM_MESSAGES } from "@/lib/admin-api/crm/copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /crm/retry { queue, ids } -> { count }. Owners and managers (crm.write). Puts
 * stopped items back in their queue with their tries reset, the web admin's
 * Retry. Only signed items are retried (an unverified delivery never is); the
 * rest are skipped. 422 `nothing` when none of the ids could be retried.
 */
export const POST = route({ method: "POST", capability: "crm.write", body: crmBatchBody }, async (ctx, { body: batch }) => {
  const count = batch.queue === "inbox" ? await retryInbox(batch.ids, ctx.email) : await retryOutbox(batch.ids, ctx.email);
  if (count === 0) throw businessRule("nothing", CRM_MESSAGES.nothing);
  return { count };
});
