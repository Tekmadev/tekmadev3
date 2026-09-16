/**
 * The maths behind the Revenue Leak Calculator.
 *
 * Pure and dependency-free so the client component, the API route and the
 * report email all compute the identical number from the identical input. No
 * randomness, no dates: the same answers always produce the same result, which
 * is what lets us store a result and re-render it in an email days later.
 *
 * Every assumption is a named constant with a stated reason, and the page
 * shows them. An estimate a prospect cannot audit is a sales trick; an
 * estimate they can audit is an argument.
 */

export type ReplyBand = "under_5m" | "under_30m" | "under_2h" | "under_24h" | "over_24h";
export type FollowUpBand = "six_plus" | "three_five" | "one_two" | "none";

export type LeakAnswers = {
  /** New leads and inquiries a month, from every source. */
  leadsPerMonth: number;
  /** Average revenue from one closed job, deal or contract. */
  dealValue: number;
  /** Percent of leads that turn into paying work today, 1 to 100. */
  closeRate: number;
  /** How fast a new lead typically gets a real human reply. */
  replyBand: ReplyBand;
  /** Calls a week that ring out, go to voicemail, or land outside hours. */
  missedCallsPerWeek: number;
  /** How many times a lead that goes quiet is chased before you give up. */
  followUpBand: FollowUpBand;
};

export type LeakResult = {
  /** Revenue a month from leads you close today. */
  currentRevenue: number;
  /** Close rate, in percent, once speed and follow-up are fixed. */
  recoveredCloseRate: number;
  /** Monthly dollars attributable to replying slowly. */
  slowReplyLoss: number;
  /** Monthly dollars attributable to giving up on leads too early. */
  followUpLoss: number;
  /** Monthly dollars attributable to calls nobody answers. */
  missedCallLoss: number;
  /** The three above, added up. */
  monthlyLeak: number;
  annualLeak: number;
  /** Extra closed jobs a month the recovered revenue represents. */
  extraDealsPerMonth: number;
  /** Extra appointments a month behind those jobs. */
  extraAppointmentsPerMonth: number;
};

/**
 * Close-rate multipliers by first-reply speed. The lead response research
 * (the Lead Response Management study, and Harvard Business Review's follow-up
 * of it) found the odds of qualifying a lead fall off a cliff after the first
 * five minutes, by multiples far larger than these. We use a deliberately
 * conservative fraction of that effect, because the published numbers measure
 * odds of qualifying a lead, not odds of closing one.
 */
export const SPEED_MULTIPLIER: Record<ReplyBand, number> = {
  under_5m: 1.0,
  under_30m: 1.15,
  under_2h: 1.3,
  under_24h: 1.55,
  over_24h: 1.8,
};

/**
 * Close-rate multipliers by follow-up depth. Most sales that need chasing
 * happen after the fifth attempt, and most businesses stop before the third.
 * Six or more touches is treated as the ceiling, so a business already doing
 * that gets no credit here.
 */
export const FOLLOW_UP_MULTIPLIER: Record<FollowUpBand, number> = {
  six_plus: 1.0,
  three_five: 1.1,
  one_two: 1.2,
  none: 1.3,
};

/**
 * Share of unanswered calls that are a new prospect at all, rather than a
 * supplier, a wrong number, a robocall or an existing customer. Without this
 * the model treats every missed call as a lost sale, which is the single
 * easiest way to make a calculator like this dishonest.
 */
export const PROSPECT_SHARE_OF_MISSED_CALLS = 0.4;

/**
 * Share of those prospects who never call back. Widely reported at around 85%.
 * We use 60%, so the number stays defensible even for a business whose callers
 * are unusually persistent.
 */
export const NO_CALLBACK_RATE = 0.6;

/** Weeks in an average month. */
export const WEEKS_PER_MONTH = 4.33;

/**
 * Ceiling on the recovered close rate. No system turns a service business into
 * a 90% closer, and a calculator that claims one is not believable. Fixing
 * speed and follow-up also never lowers a close rate, so the result is floored
 * at what the business does today.
 */
export const MAX_CLOSE_RATE = 60;

/** Appointments it typically takes to close one job, used to size the gap. */
export const APPOINTMENTS_PER_DEAL = 2;

export const LIMITS = {
  leadsPerMonth: { min: 0, max: 5000 },
  dealValue: { min: 1, max: 1_000_000 },
  closeRate: { min: 1, max: 100 },
  missedCallsPerWeek: { min: 0, max: 500 },
} as const;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const round = (n: number) => Math.round(n);

/** Coerces anything into a number inside its documented range. */
export function clampAnswer(field: keyof typeof LIMITS, raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return LIMITS[field].min;
  return clamp(n, LIMITS[field].min, LIMITS[field].max);
}

export function isReplyBand(v: unknown): v is ReplyBand {
  return typeof v === "string" && v in SPEED_MULTIPLIER;
}

export function isFollowUpBand(v: unknown): v is FollowUpBand {
  return typeof v === "string" && v in FOLLOW_UP_MULTIPLIER;
}

/** Normalizes untrusted input (a form post) into answers the maths can take. */
export function normalizeAnswers(raw: Record<string, unknown>): LeakAnswers {
  return {
    leadsPerMonth: clampAnswer("leadsPerMonth", raw.leadsPerMonth),
    dealValue: clampAnswer("dealValue", raw.dealValue),
    closeRate: clampAnswer("closeRate", raw.closeRate),
    missedCallsPerWeek: clampAnswer("missedCallsPerWeek", raw.missedCallsPerWeek),
    replyBand: isReplyBand(raw.replyBand) ? raw.replyBand : "under_24h",
    followUpBand: isFollowUpBand(raw.followUpBand) ? raw.followUpBand : "one_two",
  };
}

/**
 * The model, in one place.
 *
 * Speed and follow-up are applied to the close rate in that order, each capped,
 * so the gain from each is separable and the total can never exceed the cap.
 * Missed calls are treated as opportunities that never entered the lead count
 * at all (the form asks for them that way), valued at the recovered close rate
 * because a business that answers its phone also replies fast.
 */
export function calculateLeak(a: LeakAnswers): LeakResult {
  const leads = a.leadsPerMonth;
  const value = a.dealValue;
  const rateNow = clamp(a.closeRate, 0, 100);

  const afterSpeed = clamp(rateNow * SPEED_MULTIPLIER[a.replyBand], rateNow, MAX_CLOSE_RATE);
  const afterBoth = clamp(afterSpeed * FOLLOW_UP_MULTIPLIER[a.followUpBand], afterSpeed, MAX_CLOSE_RATE);

  const currentRevenue = leads * (rateNow / 100) * value;
  const slowReplyLoss = leads * ((afterSpeed - rateNow) / 100) * value;
  const followUpLoss = leads * ((afterBoth - afterSpeed) / 100) * value;

  const missedCallsPerMonth = a.missedCallsPerWeek * WEEKS_PER_MONTH;
  const lostProspects = missedCallsPerMonth * PROSPECT_SHARE_OF_MISSED_CALLS * NO_CALLBACK_RATE;
  const missedCallLoss = lostProspects * (afterBoth / 100) * value;

  const monthlyLeak = slowReplyLoss + followUpLoss + missedCallLoss;
  const extraDeals = value > 0 ? monthlyLeak / value : 0;

  return {
    currentRevenue: round(currentRevenue),
    recoveredCloseRate: Math.round(afterBoth * 10) / 10,
    slowReplyLoss: round(slowReplyLoss),
    followUpLoss: round(followUpLoss),
    missedCallLoss: round(missedCallLoss),
    monthlyLeak: round(monthlyLeak),
    annualLeak: round(monthlyLeak * 12),
    extraDealsPerMonth: Math.round(extraDeals * 10) / 10,
    extraAppointmentsPerMonth: Math.round(extraDeals * APPOINTMENTS_PER_DEAL),
  };
}

/** Whole dollars, no cents. Used on the page, in the email, and in the admin. */
export function formatDollars(n: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(n)));
}
