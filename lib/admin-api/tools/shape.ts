import { getLeadMagnet, revenueLeakCopy, REVENUE_LEAK_SLUG } from "@/config/lead-magnets";
import type { LeadMagnetSubmissionRow } from "@/lib/lead-magnet-data";
import { formatMoney } from "@/lib/money";
import { calculateLeak, normalizeAnswers, type LeakAnswers, type LeakResult } from "@/lib/revenue-leak";
import { instant, money } from "../data";

/**
 * Free tool submissions for the admin app (docs/api-requests/tools.md in the
 * app repo, `zToolSubmission` and `zToolSubmissionDetail` in
 * src/api/schemas/tools.ts), built from `public.lead_magnet_submissions`.
 *
 * The only tool today is the Revenue Leak Calculator (config/lead-magnets.ts,
 * lib/revenue-leak.ts). Its stored `result` is in whole dollars, as the person
 * saw it on the page and in the email; the API sends cents. A tool added
 * later still lists and opens: its answers and result are shown key by key
 * until it gets its own lines here.
 */

export type SubmissionRow = Pick<
  LeadMagnetSubmissionRow,
  "id" | "created_at" | "magnet" | "email" | "name" | "company" | "answers" | "result" | "consent_marketing" | "ghl_synced_at" | "emailed_at"
> & {
  /** numeric: PostgREST may send it as a number or a string. */
  score: number | string | null;
  lead_id: string | null;
};

export const SUBMISSION_COLUMNS =
  "id,created_at,magnet,email,name,company,answers,result,score,consent_marketing,ghl_synced_at,emailed_at,lead_id";

type Money = { amount: number; currency: string };

export type ToolSubmission = {
  id: string;
  tool: string;
  toolName: string;
  name: string | null;
  email: string;
  business: string | null;
  leak: Money | null;
  closeRate: { before: number; after: number } | null;
  replySpeed: string | null;
  newsletter: boolean;
  delivered: { email: boolean; crm: boolean };
  createdAt: string;
};

export type ToolLine = { label: string; value: string; emphasis?: boolean };

export type ToolSubmissionDetail = ToolSubmission & {
  answers: { label: string; value: string }[];
  result: ToolLine[];
  leadId: string | null;
};

const clean = (v: string | null | undefined): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** "missed_calls" -> "Missed calls" (the same rule as meta's humanize, kept here so routes do not load every meta fragment). */
const humanize = (value: string): string => {
  const s = value.replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : value;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Dollars (as stored) to integer cents. */
const centsOf = (dollars: number) => Math.round(dollars * 100);

/** A dollar figure as display text, with cents only when there are cents ("$1,200", "$387.50"). */
const dollars = (n: number) => formatMoney(centsOf(Math.max(0, n)));

const numberText = (n: number) => new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 }).format(n);
const percentText = (n: number) => `${numberText(n)}%`;

/** A percent (20, 34.5) as a ratio (0.2, 0.345) without float dust. */
const ratio = (percent: number) => Math.round(percent * 100) / 10_000;

const optionLabel = (options: readonly { value: string; label: string }[], value: unknown): string | null =>
  typeof value === "string" ? options.find((o) => o.value === value)?.label ?? humanize(value) : null;

const c = revenueLeakCopy;

/* ------------------------------------------------------------------ */
/* Revenue Leak Calculator                                             */
/* ------------------------------------------------------------------ */

const LEAK_RESULT_KEYS = [
  "currentRevenue",
  "recoveredCloseRate",
  "slowReplyLoss",
  "followUpLoss",
  "missedCallLoss",
  "monthlyLeak",
  "annualLeak",
  "extraDealsPerMonth",
  "extraAppointmentsPerMonth",
] as const satisfies readonly (keyof LeakResult)[];

/**
 * The result the person was shown: the stored one, or (when a row predates a
 * field) the same pure maths run again on the stored answers.
 */
function leakResult(row: SubmissionRow): LeakResult {
  const stored = obj(row.result);
  if (LEAK_RESULT_KEYS.every((k) => num(stored[k]) !== null)) {
    return Object.fromEntries(LEAK_RESULT_KEYS.map((k) => [k, num(stored[k]) as number])) as LeakResult;
  }
  return calculateLeak(normalizeAnswers(obj(row.answers)));
}

function leakAnswers(row: SubmissionRow): { label: string; value: string }[] {
  const a = obj(row.answers) as Partial<Record<keyof LeakAnswers, unknown>>;
  const f = c.fields;
  const show = (v: number | null, format: (n: number) => string) => (v === null ? "Not given" : format(v));
  return [
    { label: f.leadsPerMonth.label, value: show(num(a.leadsPerMonth), numberText) },
    { label: f.dealValue.label, value: show(num(a.dealValue), dollars) },
    { label: f.closeRate.label, value: show(num(a.closeRate), percentText) },
    { label: f.missedCallsPerWeek.label, value: show(num(a.missedCallsPerWeek), numberText) },
    { label: f.replyBand.label, value: optionLabel(f.replyBand.options, a.replyBand) ?? "Not given" },
    { label: f.followUpBand.label, value: optionLabel(f.followUpBand.options, a.followUpBand) ?? "Not given" },
  ];
}

/** The breakdown, in the email's words and order. The monthly leak and the fixed close rate are the headline lines. */
function leakLines(row: SubmissionRow): ToolLine[] {
  const r = leakResult(row);
  const closeNow = num(obj(row.answers).closeRate);
  const b = c.breakdown;
  return [
    { label: "Revenue leaking each month", value: dollars(r.monthlyLeak), emphasis: true },
    { label: "Revenue leaking each year", value: dollars(r.annualLeak) },
    { label: b.slowReply.label, value: `${dollars(r.slowReplyLoss)} a month` },
    { label: b.missedCalls.label, value: `${dollars(r.missedCallLoss)} a month` },
    { label: b.followUp.label, value: `${dollars(r.followUpLoss)} a month` },
    ...(closeNow === null ? [] : [{ label: b.rateNow, value: percentText(closeNow) }]),
    { label: b.rateFixed, value: percentText(r.recoveredCloseRate), emphasis: true },
    { label: "More jobs a month", value: numberText(r.extraDealsPerMonth) },
    { label: "More appointments a month", value: numberText(r.extraAppointmentsPerMonth) },
    { label: "Revenue a month from leads closed today", value: dollars(r.currentRevenue) },
  ];
}

/* ------------------------------------------------------------------ */
/* Any other tool: shown key by key                                    */
/* ------------------------------------------------------------------ */

function displayValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return Number.isFinite(v) ? numberText(v) : null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    const parts = v.map(displayValue).filter((p): p is string => !!p);
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

function genericLines(value: unknown): { label: string; value: string }[] {
  return Object.entries(obj(value)).flatMap(([key, v]) => {
    const text = displayValue(v);
    return text ? [{ label: humanize(key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()), value: text }] : [];
  });
}

/* ------------------------------------------------------------------ */
/* API shapes                                                          */
/* ------------------------------------------------------------------ */

export function toSubmission(row: SubmissionRow): ToolSubmission {
  const isLeak = row.magnet === REVENUE_LEAK_SLUG;
  const a = obj(row.answers);
  const score = num(row.score);
  const before = isLeak ? num(a.closeRate) : null;
  const after = isLeak ? leakResult(row).recoveredCloseRate : null;
  return {
    id: row.id,
    tool: row.magnet,
    toolName: getLeadMagnet(row.magnet)?.name ?? humanize(row.magnet),
    name: clean(row.name),
    email: clean(row.email) ?? "",
    business: clean(row.company),
    // The monthly leak is the leak tool's score (dollars). No score, or a tool whose
    // score is not money: no number, never a fake $0.
    leak: isLeak && score !== null ? money(centsOf(Math.max(0, score))) : null,
    closeRate: before !== null && after !== null ? { before: ratio(before), after: ratio(after) } : null,
    replySpeed: isLeak ? optionLabel(c.fields.replyBand.options, a.replyBand) : null,
    newsletter: row.consent_marketing === true,
    delivered: { email: !!row.emailed_at, crm: !!row.ghl_synced_at },
    createdAt: instant(row.created_at),
  };
}

export function toSubmissionDetail(row: SubmissionRow, leadId: string | null): ToolSubmissionDetail {
  const isLeak = row.magnet === REVENUE_LEAK_SLUG;
  return {
    ...toSubmission(row),
    answers: isLeak ? leakAnswers(row) : genericLines(row.answers),
    result: isLeak ? leakLines(row) : genericLines(row.result),
    leadId,
  };
}
