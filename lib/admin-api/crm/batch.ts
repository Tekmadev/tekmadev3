import { z } from "zod";
import { CRM_MESSAGES } from "./copy";

const objectOrEmpty = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/**
 * The body of POST /crm/retry and POST /crm/discard: `{ queue, ids }`. Fields
 * are checked in that order, so the code is `queue` before `ids`, as in the
 * contract. An empty list is not a 400: nothing matches, so the route answers
 * 422 `nothing`. Duplicates are dropped and the list is capped.
 */
export const crmBatchBody = z.preprocess(
  objectOrEmpty,
  z.object({
    queue: z.enum(["outbox", "inbox"], { error: CRM_MESSAGES.queue }),
    ids: z
      .array(z.string({ error: CRM_MESSAGES.ids }), { error: CRM_MESSAGES.ids })
      .transform((ids) => Array.from(new Set(ids)).slice(0, 500)),
  }),
);

export type CrmBatch = z.output<typeof crmBatchBody>;
