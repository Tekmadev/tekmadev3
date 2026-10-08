import { z } from "zod";
import { pageQuery } from "../cursor";
import { validationError } from "../errors";
import { LEAD_NEEDS, LEAD_REVENUE_BANDS, LEAD_SOURCES, LEAD_STATUSES, SETTABLE_STATUSES } from "./shape";

/**
 * zod pieces shared by the lead routes (POST /leads, PATCH /leads/:id,
 * POST /leads/:id/touches). The messages are the copy the app shows.
 */

export const MESSAGES = {
  status: "Unknown lead status.",
  statusFromCalendar: "Cancelled comes from the booking calendar. Pick another status.",
  bookedByCalendar: "This lead booked through the calendar, so the calendar sets booked. Pick another status.",
  followUpAt: "Enter a valid follow-up time.",
  assignedTo: "Pick someone on the team.",
  need: "Unknown lead need.",
  revenue: "Unknown revenue band.",
  name: "Enter a name or a business.",
  nameLong: "Keep the name to 120 characters or fewer.",
  businessLong: "Keep the business name to 200 characters or fewer.",
  contact: "Enter an email or a phone number.",
  email: "Enter a valid email.",
  phone: "Enter a valid phone number.",
  websiteLong: "Keep the website to 300 characters or fewer.",
  messageLong: "Keep the note to 5,000 characters or fewer.",
  duplicate: "That email is already a lead. Find it in Leads and log the touch there.",
  /** 403 `forbidden` on PATCH /leads/:id: staff editing the details of a lead they did not find and do not own. */
  editNotYours: "You can only edit leads you found or that are assigned to you.",
  kind: "Pick a call, email, DM, meeting or other.",
  outcomeLong: "Keep the outcome to 200 characters or fewer.",
  noteLong: "Keep the note to 5,000 characters or fewer.",
  at: "Enter a valid time for the touch.",
  atFuture: "That time is in the future.",
  atOld: "Log touches from the last year only.",
} as const;

/** A string that is empty after trimming counts as "not given" (null). */
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** Optional text: trimmed, blank or null clears it, absent leaves it. */
export function optionalText(max: number, tooLong: string) {
  return z.preprocess(blankToNull, z.string({ error: tooLong }).trim().max(max, tooLong).nullable()).optional();
}

const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i;

/** Milliseconds since epoch for an ISO instant with a zone, or NaN. Only for range checks: the string itself is stored. */
export function instantMs(value: string): number {
  return ISO_INSTANT_RE.test(value) ? Date.parse(value) : NaN;
}

/** An ISO 8601 instant with a zone ("2026-10-08T13:00:00.000Z"), passed to Postgres as sent. */
export function instantInput(message: string) {
  return z
    .string({ error: message })
    .trim()
    .refine((v) => {
      const ms = instantMs(v);
      // 2020 to ten years out: anything else is a typo or a broken picker.
      return Number.isFinite(ms) && ms >= Date.UTC(2020, 0, 1) && ms <= Date.now() + 10 * 365 * 86_400_000;
    }, message);
}

/** A status a person may set (cancelled gets its own message; booked on a calendar lead is refused by the handler). */
export const statusInput = z.enum(SETTABLE_STATUSES, {
  error: (issue) => (issue.input === "cancelled" ? MESSAGES.statusFromCalendar : MESSAGES.status),
});

/** A follow-up time: an instant, or null (or "") to clear it. */
export const followUpInput = z.preprocess(blankToNull, instantInput(MESSAGES.followUpAt).nullable()).optional();

/** The email of the staff member who owns the lead, or null (or "") for nobody. Checked against the team in the handler. */
export const assigneeInput = z
  .preprocess(blankToNull, z.string({ error: MESSAGES.assignedTo }).trim().toLowerCase().pipe(z.email(MESSAGES.assignedTo)).nullable())
  .optional();

export const needInput = z.preprocess(blankToNull, z.enum(LEAD_NEEDS, MESSAGES.need).nullable()).optional();
export const revenueInput = z.preprocess(blankToNull, z.enum(LEAD_REVENUE_BANDS, MESSAGES.revenue).nullable()).optional();

export const emailInput = z
  .preprocess(blankToNull, z.string({ error: MESSAGES.email }).trim().toLowerCase().max(254, MESSAGES.email).pipe(z.email(MESSAGES.email)).nullable())
  .optional();

export const phoneInput = z
  .preprocess(
    blankToNull,
    z
      .string({ error: MESSAGES.phone })
      .trim()
      .max(40, MESSAGES.phone)
      .refine((v) => {
        const digits = v.replace(/\D/g, "").length;
        return digits >= 7 && digits <= 15 && /^[\d\s()+.\-]+$/.test(v);
      }, MESSAGES.phone)
      .nullable(),
  )
  .optional();

export const TOUCH_KINDS = ["call", "email", "dm", "meeting", "other"] as const;
export type TouchKind = (typeof TOUCH_KINDS)[number];

/** Kinds that count as reaching out: logging one moves a "new" lead to "contacted". */
export const CONTACT_KINDS: readonly TouchKind[] = ["call", "email", "dm", "meeting"];

export const touchKindInput = z.enum(TOUCH_KINDS, MESSAGES.kind);

/** When the touch happened: up to five minutes ahead (clock skew), at most a year back. */
export const touchAtInput = z
  .string({ error: MESSAGES.at })
  .trim()
  .superRefine((v, ctx) => {
    const ms = instantMs(v);
    if (!Number.isFinite(ms)) ctx.addIssue({ code: "custom", message: MESSAGES.at });
    else if (ms > Date.now() + 5 * 60_000) ctx.addIssue({ code: "custom", message: MESSAGES.atFuture });
    else if (ms < Date.now() - 366 * 86_400_000) ctx.addIssue({ code: "custom", message: MESSAGES.atOld });
  })
  .optional();

/**
 * A lead's details, with the same rules and limits on create (POST /leads)
 * and edit (PATCH /leads/:id): trimmed, blank or null clears, absent leaves
 * it. Email is lowercased; website is any text (a site or a social handle).
 */
export const leadDetailFields = {
  name: optionalText(120, MESSAGES.nameLong),
  business: optionalText(200, MESSAGES.businessLong),
  email: emailInput,
  phone: phoneInput,
  website: optionalText(300, MESSAGES.websiteLong),
  need: needInput,
  message: optionalText(5000, MESSAGES.messageLong),
};

/** The detail keys of PATCH /leads/:id (sending any of them is an edit: see updateLead). */
export const LEAD_DETAIL_KEYS = ["name", "business", "email", "phone", "website", "need", "message"] as const;
export type LeadDetailKey = (typeof LEAD_DETAIL_KEYS)[number];

/**
 * POST /leads body: a lead added by hand. Shared by the API route and the web
 * admin's Add lead form, so both accept and refuse exactly the same input.
 */
export const createLeadBody = z
  .object({
    name: leadDetailFields.name,
    business: leadDetailFields.business,
    email: leadDetailFields.email,
    phone: leadDetailFields.phone,
    website: leadDetailFields.website,
    need: leadDetailFields.need,
    revenue: revenueInput,
    message: leadDetailFields.message,
    status: statusInput.optional(),
    followUpAt: followUpInput,
    assignedTo: assigneeInput,
  })
  .superRefine((b, issue) => {
    if (!b.name && !b.business) issue.addIssue({ code: "custom", path: ["name"], message: MESSAGES.name });
    if (!b.email && !b.phone) issue.addIssue({ code: "custom", path: ["email"], message: MESSAGES.contact });
  });

/* ------------------------------------------------------------------ */
/* The route schemas, shared with the web admin                        */
/* ------------------------------------------------------------------ */

const M = MESSAGES;

/** An enum query value; an empty value is the same as none. */
const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.enum(values, message).optional());

const UNKNOWN_ASSIGNEE = "Unknown assignee.";

/**
 * GET /leads query. Identical to the route's schema (proven in the
 * leadswebtest harness, by errors and by source text). The route still has its
 * own copy; switch it to import this one when app/api is free.
 */
export const leadListQuery = z.object({
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
 * PATCH /leads/:id body: the route's own schema (it imports this one) and the
 * web admin's. Status, follow-up and assignee, plus the lead's details (edit
 * lead, owner decision 2026-10-08) with the field rules of POST /leads. The
 * two rules on the whole lead (a name or a business, an email or a phone),
 * who may edit the details and one email per lead are updateLead's: they
 * depend on the lead as it is stored.
 */
export const leadPatchBody = z.object({
  ...leadDetailFields,
  status: statusInput.optional(),
  followUpAt: followUpInput,
  assignedTo: assigneeInput,
});

/**
 * POST /leads/:id/touches body. Identical to the route's schema (proven in the
 * leadswebtest harness, by errors and by source text). The route still has its
 * own copy; switch it to import this one when app/api is free.
 */
export const leadTouchBody = z.object({
  kind: touchKindInput,
  outcome: optionalText(200, M.outcomeLong),
  note: optionalText(5000, M.noteLong),
  at: touchAtInput,
  status: statusInput.optional(),
  followUpAt: followUpInput,
});

/** safeParse, else throw validationError(error): the same 400 (code, message, fields) the route sends. */
export function parseLeadInput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data as z.output<S>;
}
