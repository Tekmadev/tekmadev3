import { z } from "zod";
import { badRequest, pageQuery, route } from "@/lib/admin-api";
import { listSubscribers } from "@/lib/admin-api/email/data";
import { isSubscriberStatus } from "@/lib/admin-api/email/labels";
import { EMAIL_MESSAGES } from "@/lib/admin-api/email/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listQuery = z.object({
  ...pageQuery,
  // Matches anywhere in the email. Never a 400: an overlong search is cut short.
  q: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().slice(0, 100) || null),
  status: z.string().optional(),
});

/**
 * GET /email/subscribers?q=&status=&cursor=&limit= -> Page<Subscriber>, newest
 * signup first. Owners and managers (email.subscribers.view). 400 `status` for an
 * unknown status.
 */
export const GET = route(
  { method: "GET", capability: "email.subscribers.view", query: listQuery },
  async (_ctx, { query }) => {
    const status = query.status?.trim() || null;
    if (status !== null && !isSubscriberStatus(status)) throw badRequest("status", EMAIL_MESSAGES.status);
    return listSubscribers({ q: query.q, status, cursor: query.cursor ?? null, limit: query.limit });
  },
);
