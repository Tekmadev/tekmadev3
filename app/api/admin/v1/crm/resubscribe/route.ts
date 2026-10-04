import { ApiError, businessRule, conflict, notConfigured, route } from "@/lib/admin-api";
import { confirmCrmResubscribe } from "@/lib/crm/admin-ops";
import { CRM_MESSAGES } from "@/lib/admin-api/crm/copy";
import { inspectForApi, requireCrmConnection, resubscribeBody } from "@/lib/admin-api/crm/inspect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stale = () => conflict("resub_stale", CRM_MESSAGES.resubStale);
const refused = () => businessRule("resub_refused", CRM_MESSAGES.resubRefused);
const notHere = () => new ApiError(404, "resub_notfound", CRM_MESSAGES.resubNotFound);
const unreachable = () => new ApiError(502, "crm", CRM_MESSAGES.resubUnreachable);

/**
 * POST /crm/resubscribe { email } -> the inspect result, refreshed. Owners and managers
 * (crm.write). "They asked to come back, resubscribe them".
 *
 * The CRM is looked up live again first, so the owner confirms what is true
 * now: the address must still be unsubscribed here (404 `resub_notfound` when
 * there is no subscriber, 422 `resub_refused` for a bounce or a complaint,
 * which are never revived) and still mailable in the CRM (409 `resub_stale`
 * otherwise). Then the web admin's own path (lib/crm/admin-ops.ts
 * confirmCrmResubscribe): a `resubscribed` consent event stamped with the
 * current privacy policy version, recorded as an admin decision, and the
 * matching inbox card resolved. A passed Verify is needed to compare (422
 * `unverified`), and when the live lookup fails nothing changes (502 `crm`).
 */
export const POST = route({ method: "POST", capability: "crm.write", body: resubscribeBody }, async (ctx, { body }) => {
  const { email } = body;
  await requireCrmConnection({ verified: true });

  const { inspection } = await inspectForApi(email);
  const subscriber = inspection.subscriber;
  if (!subscriber) throw notHere();
  if (subscriber.status === "bounced" || subscriber.status === "complained") throw refused();
  const theirs = inspection.theirs;
  // The live lookup failed: nothing is known about their side, so nothing changes.
  if (theirs.state === "error") throw unreachable();
  if (subscriber.status !== "unsubscribed" || theirs.state !== "found" || theirs.dnd !== "inactive") throw stale();

  const result = await confirmCrmResubscribe(email, ctx.email);
  if (!result.ok) {
    if (result.reason === "notfound") throw notHere();
    if (result.reason === "refused") throw refused();
    if (result.reason === "stale") throw stale();
    if (result.reason === "config") throw notConfigured();
    throw new ApiError(500, "unavailable", CRM_MESSAGES.resubSave);
  }
  // Already active: someone else resubscribed them since the lookup.
  if (!result.changed) throw stale();

  const { result: fresh } = await inspectForApi(email);
  return fresh;
});
