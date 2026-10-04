/**
 * Calendar dates for the clients domain. The app shows `YYYY-MM-DD` dates in
 * America/Toronto; the database keeps some of them as instants (`live_at`,
 * `guarantee_started_at`). Only date strings leave this file: instants for the
 * app go through `instant()` in lib/admin-api/data.ts untouched.
 */

export const TIME_ZONE = "America/Toronto";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const torontoFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The Toronto calendar date of a moment. */
export function torontoDateOf(moment: Date | string): string {
  const d = typeof moment === "string" ? new Date(moment) : moment;
  return torontoFormat.format(d);
}

/** Today in Toronto. */
export function todayToronto(): string {
  return torontoDateOf(new Date());
}

/** A real calendar day (2026-02-30 is not one). */
export function isRealDate(value: string): boolean {
  const m = value.match(DATE_RE);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** `date` plus `days` calendar days. */
export function addDays(date: string, days: number): string {
  const m = date.match(DATE_RE);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * DAY_MS);
  return d.toISOString().slice(0, 10);
}

/** Whole calendar days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  const ma = a.match(DATE_RE);
  const mb = b.match(DATE_RE);
  if (!ma || !mb) return 0;
  const ta = Date.UTC(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]));
  const tb = Date.UTC(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]));
  return Math.round((tb - ta) / DAY_MS);
}

const UTC_MIDNIGHT_RE = /^(\d{4}-\d{2}-\d{2})[T ]00:00:00(?:\.0+)?(?:Z|[+-]00(?::?00)?)$/i;

/**
 * The calendar date a stored instant stands for. The web admin's date inputs
 * save a plain date as midnight UTC (`new Date("2026-10-03").toISOString()`),
 * so an instant at exactly midnight UTC is that date; anything else (go live
 * saves "now") is read as its Toronto date.
 */
export function storedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  if (DATE_RE.test(s)) return s;
  const utcMidnight = s.match(UTC_MIDNIGHT_RE);
  if (utcMidnight) return utcMidnight[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : torontoDateOf(d);
}

const torontoHour = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" });

/**
 * The instant to store for a calendar date: midnight in Toronto. It reads back
 * as the same date here (its Toronto date), in the web admin's date inputs
 * (its UTC date is the same day) and in the website's guarantee window, which
 * then starts when that Toronto day starts.
 */
export function dateToStored(date: string): string {
  const m = date.match(DATE_RE);
  if (!m) return date;
  const utcMidnight = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Toronto is UTC-4 in summer and UTC-5 in winter.
  for (const hours of [4, 5]) {
    const candidate = new Date(utcMidnight + hours * 3_600_000);
    if (torontoFormat.format(candidate) === date && Number(torontoHour.format(candidate)) === 0) return candidate.toISOString();
  }
  return new Date(utcMidnight + 5 * 3_600_000).toISOString();
}

/** A `date` column value (`YYYY-MM-DD`, sometimes with a time) as a calendar date. */
export function dateColumn(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim().slice(0, 10);
  return DATE_RE.test(s) ? s : null;
}
