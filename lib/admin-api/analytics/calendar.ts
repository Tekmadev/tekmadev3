/**
 * Toronto calendar helpers for the analytics and ads endpoints.
 *
 * Calendar dates are `YYYY-MM-DD` strings and are only ever handled as
 * calendar dates (UTC midnight arithmetic, no zone involved). Instants coming
 * from Postgres are never re-encoded for the app; Date is used here only to
 * find which Toronto day an instant falls on, and the instant a Toronto day
 * starts at (a query parameter).
 */

export const BUSINESS_TZ = "America/Toronto";

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
/** Sunday first, like Date.getUTCDay(). */
export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type CalendarDate = { year: number; month: number; day: number };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-09-30" (or the date part of "2026-09-30T14:00:00") as numbers. */
export function parseDate(value: string): CalendarDate {
  const m = value.match(DATE_RE);
  if (!m) throw new Error(`calendar: not a date: ${value}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function formatDate(d: CalendarDate): string {
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** Calendar arithmetic: "2026-09-30" + 1 = "2026-10-01". */
export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  const x = parseDate(a);
  const y = parseDate(b);
  return Math.round((Date.UTC(y.year, y.month - 1, y.day) - Date.UTC(x.year, x.month - 1, x.day)) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(date: string): number {
  const d = parseDate(date);
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wallClock(ms: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = partsFormat.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

/** The Toronto calendar date of an instant (an ISO string from Postgres, or a ms timestamp). */
export function torontoDateOf(value: string | number): string {
  const ms = typeof value === "number" ? value : Date.parse(value);
  const w = wallClock(ms);
  return formatDate(w);
}

/** Today in Toronto. */
export function torontoToday(nowMs: number = Date.now()): string {
  return torontoDateOf(nowMs);
}

/** Toronto's offset from UTC at an instant, in ms (negative: behind UTC). */
function offsetAt(ms: number): number {
  const whole = Math.floor(ms / 1000) * 1000;
  const w = wallClock(whole);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - whole;
}

/**
 * The instant a Toronto calendar day starts, as an ISO string for a query
 * parameter. Two passes settle the offset on the days the clocks change
 * (Toronto changes at 2 AM, so midnight itself always exists).
 */
export function torontoDayStart(date: string): string {
  const d = parseDate(date);
  const wall = Date.UTC(d.year, d.month - 1, d.day);
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t).toISOString();
}
