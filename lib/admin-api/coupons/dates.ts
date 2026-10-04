/**
 * Toronto calendar days for coupon expiry. A coupon's `redeem_by` is an
 * instant; the app shows and sends the Toronto day it falls on.
 */

const TZ = "America/Toronto";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const wallFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function parts(format: Intl.DateTimeFormat, at: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of format.formatToParts(at)) out[part.type] = part.value;
  return out;
}

/** The Toronto calendar day an instant falls on, `YYYY-MM-DD`. */
export function torontoDay(at: Date): string {
  const p = parts(dayFormat, at);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Today in Toronto. */
export const torontoToday = () => torontoDay(new Date());

/** Whether `YYYY-MM-DD` names a real calendar day (2027-02-31 does not). */
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Toronto's offset from UTC at an instant, in ms (negative: Toronto is behind). */
function torontoOffsetMs(at: Date): number {
  const p = parts(wallFormat, at);
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The last second of a Toronto calendar day (23:59:59 local), so a code that
 * expires on a day still works all of that day in Toronto.
 */
export function endOfTorontoDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const nextMidnightWall = Date.UTC(y, m - 1, d + 1);
  // Read the offset at local midnight: 05:00 UTC is before 02:00 in Toronto in
  // both EST and EDT, so a DST change that day does not shift it.
  const offset = torontoOffsetMs(new Date(nextMidnightWall + 5 * 3_600_000));
  return new Date(nextMidnightWall - offset - 1000);
}
