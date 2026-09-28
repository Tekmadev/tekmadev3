/**
 * The /grow lead page and its welcome page.
 *
 * /grow is the link for ads, the bio and DMs: a short form that asks what the
 * business needs and roughly what it makes, saves a qualified lead, and sends
 * the person to /grow/welcome, which leads with the offer that fits their
 * answers (the Growth System, Webline, or custom work) and asks them to book
 * the call while they are warm.
 *
 * The answer codes below are stored as-is in public.leads (need, revenue_band;
 * CHECK constraints in supabase/migrations/20260928000001_grow_lead_form.sql)
 * and sent to the CRM. Add options freely; never rename or remove a code, or
 * old rows stop matching. The labels are what the CRM receives in tmd_need and
 * tmd_revenue_band (lib/crm/outbox.ts), and the speed-to-lead workflow there
 * branches on that exact text (docs/crm-setup.md): change a label and update
 * those If/Else branches in the CRM at the same time.
 */

export const GROW_PATH = "/grow";
export const GROW_WELCOME_PATH = "/grow/welcome";
/**
 * Length of the strategy call, in the copy on /grow, the welcome page and the
 * reply email. Must match the Cal event at business.booking
 * (cal.com/tekmadev/start), which prints its own length right beside this copy.
 */
export const CALL_MINUTES = 30;

/** leads.source for this form. Lowercase: the CRM sends it as the contact's source. */
export const GROW_LEAD_SOURCE = "grow";

export const growNeeds = [
  { value: "customers", label: "More customers and booked jobs" },
  { value: "website", label: "A new or better website" },
  { value: "custom", label: "A custom build: AI, app or software" },
  { value: "content", label: "Content and motion graphics" },
  { value: "unsure", label: "Not sure yet, I want to talk it through" },
] as const;

export type GrowNeed = (typeof growNeeds)[number]["value"];

export const revenueBands = [
  { value: "pre", label: "Just starting, no revenue yet" },
  { value: "under_10k", label: "Under $10K a month" },
  { value: "10k_20k", label: "$10K to $20K a month" },
  { value: "20k_50k", label: "$20K to $50K a month" },
  { value: "50k_100k", label: "$50K to $100K a month" },
  { value: "100k_plus", label: "$100K+ a month" },
] as const;

export type RevenueBand = (typeof revenueBands)[number]["value"];

/**
 * Query parameter that preselects an answer on /grow, so a link from an email
 * or an ad about one offer lands with that offer already picked:
 * /grow?need=website. The person can still change it. Only real need codes
 * count; anything else is ignored.
 */
export const GROW_NEED_PARAM = "need";

/** Which offer the welcome page leads with. */
export type GrowPath = "growth" | "webline" | "custom";

export const GROW_PATHS: readonly GrowPath[] = ["growth", "webline", "custom"];

export function isGrowNeed(v: unknown): v is GrowNeed {
  return growNeeds.some((n) => n.value === v);
}

export function isRevenueBand(v: unknown): v is RevenueBand {
  return revenueBands.some((b) => b.value === v);
}

export function isGrowPath(v: unknown): v is GrowPath {
  return GROW_PATHS.includes(v as GrowPath);
}

export function needLabel(v: string | null | undefined): string | null {
  return growNeeds.find((n) => n.value === v)?.label ?? null;
}

export function revenueBandLabel(v: string | null | undefined): string | null {
  return revenueBands.find((b) => b.value === v)?.label ?? null;
}

/**
 * The offer that fits. What they asked for decides it; revenue only breaks the
 * tie for "more customers" and "not sure": a business with no revenue yet
 * needs to exist online before a growth system has anything to multiply.
 */
export function pathFor(need: GrowNeed, band: RevenueBand): GrowPath {
  if (need === "website") return "webline";
  if (need === "custom" || need === "content") return "custom";
  if (band === "pre") return "webline";
  return "growth";
}

/** The welcome page's order: the fitting offer first, the other two after it. */
export function pathOrder(first: GrowPath): GrowPath[] {
  return [first, ...GROW_PATHS.filter((p) => p !== first)];
}
