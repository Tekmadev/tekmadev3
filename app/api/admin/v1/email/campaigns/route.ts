import { z } from "zod";
import { conflict, notConfigured, route, unavailable } from "@/lib/admin-api";
import { createEmailCampaign } from "@/lib/email-admin";
import { toCampaign } from "@/lib/admin-api/email/shapes";
import { CAMPAIGN_KEY, CAMPAIGN_KEY_MAX, EMAIL_MESSAGES } from "@/lib/admin-api/email/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Optional text: trimmed; blank, missing or not a string is null. */
const optionalText = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null));

const objectOrEmpty = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/**
 * The key is trimmed and lowercased, then must be letters, numbers and single
 * dashes (no leading or trailing dash), up to 64 characters. Fields are
 * checked in this order, so when key and name are both wrong the answer
 * carries the key error as code and message and both in `fields`.
 */
const createBody = z.preprocess(
  objectOrEmpty,
  z.object({
    key: z
      .string({ error: EMAIL_MESSAGES.key })
      .trim()
      .toLowerCase()
      .max(CAMPAIGN_KEY_MAX, EMAIL_MESSAGES.key)
      .regex(CAMPAIGN_KEY, EMAIL_MESSAGES.key),
    name: z.string({ error: EMAIL_MESSAGES.name }).trim().min(1, EMAIL_MESSAGES.name).max(200, EMAIL_MESSAGES.nameLong),
    subject: optionalText,
    template: optionalText,
    description: optionalText,
  }),
);

/**
 * POST /email/campaigns { key, name, subject?, template?, description? } -> 201 Campaign.
 * Owners and managers (email.campaigns.write). Idempotency-Key honoured. 409 `dupe` for
 * a key that is already registered.
 */
export const POST = route(
  { method: "POST", capability: "email.campaigns.write", body: createBody, idempotent: true, status: 201 },
  async (_ctx, { body }) => {
    const result = await createEmailCampaign(body);
    if (!result.ok) {
      if (result.reason === "dupe") throw conflict("dupe", EMAIL_MESSAGES.dupe, { key: EMAIL_MESSAGES.dupe });
      if (result.reason === "config") throw notConfigured();
      throw unavailable("The campaign could not be saved. Try again in a moment.");
    }
    return toCampaign(result.campaign);
  },
);
