import { ApiError, isUuid, notConfigured, notFound, route, unavailable } from "@/lib/admin-api";
import { eraseSubscriber } from "@/lib/email-admin";
import { loadSubscriberDetail } from "@/lib/admin-api/email/data";
import { EMAIL_MESSAGES } from "@/lib/admin-api/email/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const missing = () => notFound("That subscriber");

/**
 * GET /email/subscribers/:id -> { subscriber, consentHistory (newest first) }.
 * Owners and managers (email.subscribers.view).
 */
export const GET = route({ method: "GET", capability: "email.subscribers.view" }, async (_ctx, { params }) => {
  if (!isUuid(params.id)) throw missing();
  const detail = await loadSubscriberDetail(params.id);
  if (!detail) throw missing();
  return detail;
});

/**
 * DELETE /email/subscribers/:id -> null. Owners and managers (email.subscribers.write).
 * Permanent erasure, the web admin's own path (lib/email-admin.ts): the CRM
 * contact is queued to be suppressed and tagged erased and the address is
 * tombstoned first, then the subscriber and their consent history are deleted.
 * When the erasure cannot be queued nothing is deleted: 500 `crm_erase`.
 */
export const DELETE = route({ method: "DELETE", capability: "email.subscribers.write" }, async (_ctx, { params }) => {
  if (!isUuid(params.id)) throw missing();
  const result = await eraseSubscriber(params.id);
  if (!result.ok) {
    if (result.reason === "crm_erase") throw new ApiError(500, "crm_erase", EMAIL_MESSAGES.crmErase);
    if (result.reason === "config") throw notConfigured();
    throw unavailable("The subscriber could not be deleted. Try again in a moment.");
  }
  if (!result.deleted) throw missing();
  return null;
});
