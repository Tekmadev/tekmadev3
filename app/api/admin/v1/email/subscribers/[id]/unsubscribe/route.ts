import { conflict, isUuid, notConfigured, notFound, route, unavailable } from "@/lib/admin-api";
import { setSubscriberStatus } from "@/lib/subscribers-data";
import { loadSubscriberDetail } from "@/lib/admin-api/email/data";
import { EMAIL_MESSAGES } from "@/lib/admin-api/email/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const missing = () => notFound("That subscriber");
const notActive = () => conflict("not_active", EMAIL_MESSAGES.notActive);

/**
 * POST /email/subscribers/:id/unsubscribe -> { subscriber, consentHistory }.
 * Owners and managers (email.subscribers.write). Active subscribers only, else 409
 * `not_active`.
 *
 * Through setSubscriberStatus with source "admin", like the web admin's
 * Unsubscribe button: it stamps the source, clears nothing it should keep, and
 * its compare-and-swap refuses a row that changed underneath. The history
 * trigger adds the `unsubscribed` consent event, and the CRM trigger queues
 * email DND and the newsletter tag removal while Outbound is on.
 */
export const POST = route({ method: "POST", capability: "email.subscribers.write" }, async (_ctx, { params }) => {
  if (!isUuid(params.id)) throw missing();
  const before = await loadSubscriberDetail(params.id);
  if (!before) throw missing();
  if (before.subscriber.status !== "active") throw notActive();

  const result = await setSubscriberStatus({ match: { by: "id", id: params.id }, status: "unsubscribed", source: "admin" });
  if (!result.ok) {
    if (result.reason === "notfound") throw missing();
    if (result.reason === "refused" || result.reason === "stale") throw notActive();
    if (result.reason === "config") throw notConfigured();
    throw unavailable("The subscriber could not be unsubscribed. Try again in a moment.");
  }
  // Someone else got there first: it is no longer the active row this was sent for.
  if (!result.changed) throw notActive();

  const after = await loadSubscriberDetail(params.id);
  if (!after) throw missing();
  return after;
});
