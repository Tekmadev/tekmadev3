import { z } from "zod";
import { isUuid, notConfigured, notFound, route, unavailable, validationError } from "@/lib/admin-api";
import { deleteEmailCampaign, setEmailCampaignActive } from "@/lib/email-admin";
import { getCampaign } from "@/lib/admin-api/email/data";
import { EMAIL_MESSAGES } from "@/lib/admin-api/email/messages";
import { toCampaign } from "@/lib/admin-api/email/shapes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const missing = () => notFound("That campaign");

const objectOrEmpty = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** `{ active }`: a boolean, nothing else (400 `active`). */
const patchBody = z.preprocess(objectOrEmpty, z.object({ active: z.boolean({ error: EMAIL_MESSAGES.active }) }));

/**
 * PATCH /email/campaigns/:id { active } -> Campaign. Owners and managers. Pause and
 * Resume are a label only: opens and clicks are still counted. An unknown
 * campaign is 404 before the body is looked at (as the mock does), then 400
 * `active` unless it is a boolean.
 */
export const PATCH = route(
  // z.unknown(): route() still answers 415 and bad_json; the zod check runs in the handler, after the 404.
  { method: "PATCH", capability: "email.campaigns.write", body: z.unknown() },
  async (_ctx, { params, body }) => {
    if (!isUuid(params.id)) throw missing();
    const parsed = patchBody.safeParse(body);
    if (!parsed.success) {
      if (!(await getCampaign(params.id))) throw missing();
      throw validationError(parsed.error);
    }

    const result = await setEmailCampaignActive(params.id, parsed.data.active);
    if (!result.ok) {
      if (result.reason === "config") throw notConfigured();
      throw unavailable("The campaign could not be saved. Try again in a moment.");
    }
    if (!result.campaign) throw missing();
    return toCampaign(result.campaign);
  },
);

/**
 * DELETE /email/campaigns/:id -> null. Owners and managers. Past opens and clicks stay
 * on record; adding the key again starts its counters from zero.
 */
export const DELETE = route({ method: "DELETE", capability: "email.campaigns.write" }, async (_ctx, { params }) => {
  if (!isUuid(params.id)) throw missing();
  const result = await deleteEmailCampaign(params.id);
  if (!result.ok) {
    if (result.reason === "config") throw notConfigured();
    throw unavailable("The campaign could not be deleted. Try again in a moment.");
  }
  if (!result.deleted) throw missing();
  return null;
});
