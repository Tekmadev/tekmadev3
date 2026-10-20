import { z } from "zod";
import { pageQuery, route } from "@/lib/admin-api";
import { LEAD_NEEDS, LEAD_SOURCES, LEAD_STATUSES, createLeadBody, createOutreachLead, listLeads } from "@/lib/admin-api/leads";
import { listUpcomingBookings } from "@/lib/admin-api/leads/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An enum query value; an empty value is the same as none. */
const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.enum(values, message).optional());

const UNKNOWN_ASSIGNEE = "Unknown assignee.";

/** GET /leads?booking=upcoming answers at most this many (the web Overview's "Upcoming calls", the app's Home). */
const UPCOMING_MAX = 5;

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
  /** The calls still to come (the app's Home, the web Overview): one short page; the other filters and the cursor do not apply. */
  booking: optionalEnum(["upcoming"], "Unknown booking filter."),
});

/**
 * GET /leads?q=&source=&status=&need=&cursor=&limit= -> Page<Lead>, newest first.
 * Every row carries `booking` (the booked call, else null), as GET /leads/:id.
 * Unknown filter values are a 400 (`source`, `status`, `need`). Outreach adds
 * `assigned` and `followUp` (docs/admin-api/outreach.md).
 *
 * `booking=upcoming&limit=`: every lead whose booking is not cancelled and not
 * over (one under way counts), whatever the lead's status, soonest start
 * first, at most 5, `nextCursor` null (listUpcomingBookings, the same read as
 * the web Overview). An older app never sends it.
 */
export const GET = route({ method: "GET", capability: "leads.view", query: listQuery }, async (ctx, { query, req }) => {
  if (query.booking === "upcoming") {
    const asked = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
    const limit = Math.min(Math.max(Number.isFinite(asked) && asked > 0 ? asked : UPCOMING_MAX, 1), UPCOMING_MAX);
    return { items: await listUpcomingBookings(ctx, { limit }), nextCursor: null };
  }
  return listLeads(ctx, query);
});

/**
 * POST /leads (Idempotency-Key) -> 201 Lead. A lead added by hand: source
 * "outreach", assigned to the caller unless `assignedTo` says otherwise.
 * 409 `duplicate` when the email is already on a lead.
 */
export const POST = route(
  { method: "POST", capability: "leads.create", body: createLeadBody, idempotent: true, status: 201 },
  async (ctx, { body, req }) => createOutreachLead(ctx, body, req.headers.get("idempotency-key")),
);
