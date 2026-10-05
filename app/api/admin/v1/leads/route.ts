import { z } from "zod";
import { pageQuery, route } from "@/lib/admin-api";
import { LEAD_NEEDS, LEAD_SOURCES, LEAD_STATUSES, createLeadBody, createOutreachLead, listLeads } from "@/lib/admin-api/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An enum query value; an empty value is the same as none. */
const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.enum(values, message).optional());

const UNKNOWN_ASSIGNEE = "Unknown assignee.";

const listQuery = z.object({
  ...pageQuery,
  q: z
    .string()
    .optional()
    .transform((v) => v?.trim().slice(0, 100) || undefined),
  source: optionalEnum(LEAD_SOURCES, "Unknown lead source."),
  status: optionalEnum(LEAD_STATUSES, "Unknown lead status."),
  need: optionalEnum(LEAD_NEEDS, "Unknown lead need."),
  /** "me", "none" or a staff email (outreach). */
  assigned: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => v === "me" || v === "none" || z.email().safeParse(v).success, UNKNOWN_ASSIGNEE)
      .optional(),
  ),
  /** The follow-up queue (outreach): due, upcoming or any, soonest first. */
  followUp: optionalEnum(["due", "upcoming", "any"], "Unknown follow-up filter."),
});

/**
 * GET /leads?q=&source=&status=&need=&cursor=&limit= -> Page<Lead>, newest first.
 * Unknown filter values are a 400 (`source`, `status`, `need`). Outreach adds
 * `assigned` and `followUp` (docs/admin-api/outreach.md).
 */
export const GET = route({ method: "GET", capability: "leads.view", query: listQuery }, async (ctx, { query }) =>
  listLeads(ctx, query),
);

/**
 * POST /leads (Idempotency-Key) -> 201 Lead. A lead added by hand: source
 * "outreach", assigned to the caller unless `assignedTo` says otherwise.
 * 409 `duplicate` when the email is already on a lead.
 */
export const POST = route(
  { method: "POST", capability: "leads.create", body: createLeadBody, idempotent: true, status: 201 },
  async (ctx, { body, req }) => createOutreachLead(ctx, body, req.headers.get("idempotency-key")),
);
