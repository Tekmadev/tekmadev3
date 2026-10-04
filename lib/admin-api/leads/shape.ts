import { growNeeds, revenueBands, GROW_LEAD_SOURCE } from "@/config/grow";
import { instant } from "../data";

/**
 * The `Lead` the admin app reads (docs/api-requests/leads.md in the app repo,
 * `zLead` in src/api/schemas/leads.ts), built from a `public.leads` row.
 *
 * The website writes more status values than the app knows (the Cal webhook
 * writes "rescheduled", portal sign-ups "signed_up", a paid checkout
 * "converted"), so each stored value is folded into one of the app's seven.
 * Filters use the same table backwards, so a list filtered to "booked" holds
 * exactly the rows that show a "booked" badge.
 */

export const LEAD_STATUSES = ["new", "booked", "contacted", "qualified", "won", "lost", "cancelled"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Statuses a person may set by hand. Booked and cancelled come from the booking calendar. */
export const SETTABLE_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

/** `outreach` is a lead added by hand in the app (POST /leads). */
export const OUTREACH_SOURCE = "outreach";
export const LEAD_SOURCES = ["cal_booking", GROW_LEAD_SOURCE, "lead_magnet", "portal_signup", OUTREACH_SOURCE] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_NEEDS = growNeeds.map((n) => n.value) as [string, ...string[]];
export const LEAD_REVENUE_BANDS = revenueBands.map((b) => b.value) as [string, ...string[]];

/** Every stored value besides the app's own that folds into an app status. */
const STORED_ALIASES: Record<string, LeadStatus> = {
  // Cal webhook (app/api/webhooks/cal/route.ts statusFor): the trigger, lowercased.
  rescheduled: "booked",
  booking_requested: "booked",
  booking_paid: "booked",
  meeting_started: "booked",
  meeting_ended: "booked",
  booking_rejected: "cancelled",
  // lib/lead-accounts.ts: a portal account, not paid yet.
  signed_up: "new",
  // lib/client-provisioning.ts: the lead paid and became an onboarding client.
  converted: "won",
};

/** The app status for a stored value. Empty and unknown values read as "new". */
export function toLeadStatus(stored: string | null | undefined): LeadStatus {
  const s = (stored ?? "").trim().toLowerCase();
  if ((LEAD_STATUSES as readonly string[]).includes(s)) return s as LeadStatus;
  return STORED_ALIASES[s] ?? "new";
}

/** Stored values that read as `status` (for "new": every known value that does not, plus null). */
export function storedValuesFor(status: LeadStatus): string[] {
  return [status, ...Object.entries(STORED_ALIASES).filter(([, v]) => v === status).map(([k]) => k)];
}

/** Every stored value that reads as something other than "new" (the "new" filter is "none of these"). */
export function storedValuesNotNew(): string[] {
  return LEAD_STATUSES.filter((s) => s !== "new").flatMap(storedValuesFor);
}

/* ------------------------------------------------------------------ */
/* Row and columns                                                     */
/* ------------------------------------------------------------------ */

/** Columns every database has (crm_baseline, grow_lead_form). JSON paths keep `raw` out of the payload. */
export const LEAD_BASE_COLUMNS = [
  "id",
  "created_at",
  "source",
  "status",
  "name",
  "email",
  "phone",
  "business_name",
  "website",
  "need",
  "revenue_band",
  "message",
  "booking_start",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "referrer",
  "raw_company:raw->>company",
  "raw_business_name:raw->>business_name",
  "cal_notes:raw->payload->>additionalNotes",
  "added_by:form->>added_by",
].join(",");

/** Added by 20261003000004_lead_outreach.sql. */
export const LEAD_OUTREACH_COLUMNS = "follow_up_at,assigned_to";

export const LEAD_COLUMNS = `${LEAD_BASE_COLUMNS},${LEAD_OUTREACH_COLUMNS}`;

export type LeadRow = {
  id: string;
  created_at: string;
  source: string | null;
  status: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  business_name: string | null;
  website: string | null;
  need: string | null;
  revenue_band: string | null;
  message: string | null;
  booking_start: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  raw_company: string | null;
  raw_business_name: string | null;
  cal_notes: string | null;
  added_by: string | null;
  /** Absent until the outreach migration is applied. */
  follow_up_at?: string | null;
  assigned_to?: string | null;
};

/* ------------------------------------------------------------------ */
/* API shape                                                           */
/* ------------------------------------------------------------------ */

/** A staff member as the app shows them: the name when there is one, else the email. */
export type StaffRef = { email: string; name: string | null };

export type Lead = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  business: string | null;
  status: LeadStatus;
  source: string;
  need: string | null;
  revenue: string | null;
  message: string | null;
  bookingAt: string | null;
  createdAt: string;
  utm: { source: string | null; medium: string | null; campaign: string | null };
  referrer: string | null;
  convertedClientId: string | null;
  /* Outreach (docs/admin-api/outreach.md): extra keys, ignored by older app builds. */
  website: string | null;
  followUpAt: string | null;
  assignedTo: StaffRef | null;
  /** Who added the lead by hand (source outreach), else null. */
  addedBy: StaffRef | null;
};

/** What a lead's row needs from other tables. */
export type LeadLinks = {
  /** The client this lead became, when the caller may see it. */
  client?: { id: string; businessName: string | null } | null;
  /** Display names by lowercased email (staff). */
  names: Map<string, string | null>;
};

const clean = (v: string | null | undefined): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
};

function staffRef(email: string | null | undefined, names: Map<string, string | null>): StaffRef | null {
  const e = clean(email)?.toLowerCase();
  if (!e) return null;
  return { email: e, name: names.get(e) ?? null };
}

const isNeed = (v: string | null): v is string => !!v && (LEAD_NEEDS as readonly string[]).includes(v);
const isBand = (v: string | null): v is string => !!v && (LEAD_REVENUE_BANDS as readonly string[]).includes(v);

export function toLead(row: LeadRow, links: LeadLinks): Lead {
  const source = clean(row.source) ?? "cal_booking";
  const need = clean(row.need);
  const revenue = clean(row.revenue_band);
  // Free tools keep the business in raw.company, portal sign-ups on the client
  // they created (raw.business_name is only the placeholder it started with).
  const business =
    clean(row.business_name) ??
    clean(row.raw_company) ??
    (source === "portal_signup" ? clean(links.client?.businessName) ?? clean(row.raw_business_name) : null);
  return {
    id: row.id,
    name: clean(row.name),
    // The app's Lead always has an email; a lead found by phone has none yet.
    email: clean(row.email) ?? "",
    phone: clean(row.phone),
    business,
    status: toLeadStatus(row.status),
    source,
    need: isNeed(need) ? need : null,
    revenue: isBand(revenue) ? revenue : null,
    // Typed as is, line breaks kept: only an all-blank message reads as none.
    message: row.message && row.message.trim() ? row.message : row.cal_notes && row.cal_notes.trim() ? row.cal_notes : null,
    bookingAt: instant(row.booking_start),
    createdAt: instant(row.created_at),
    utm: { source: clean(row.utm_source), medium: clean(row.utm_medium), campaign: clean(row.utm_campaign) },
    referrer: clean(row.referrer),
    convertedClientId: links.client?.id ?? null,
    website: clean(row.website),
    followUpAt: instant(row.follow_up_at ?? null),
    assignedTo: staffRef(row.assigned_to, links.names),
    addedBy: source === OUTREACH_SOURCE ? staffRef(row.added_by, links.names) : null,
  };
}
