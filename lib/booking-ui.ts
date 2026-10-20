import type { Booking, BookingStatus } from "@/lib/admin-api/leads/booking";
import type { Lead } from "@/lib/admin-api/leads/shape";
import { bookingDistance } from "@/lib/leads-ui";

/**
 * The booked call on the web admin's screens: the lead page's "Booked call"
 * panel, a Leads row's call time and Join, and Overview's "Upcoming calls"
 * (the app's Home "Upcoming calls"). The copy and the rules are the app's,
 * word for word (docs/admin-api/outreach.md section 1, "The booking"). Every
 * time shows in America/Toronto; only "Their time" uses the booker's own zone.
 *
 * Pure TypeScript, safe in server and client components: only types come from
 * the leads domain, and the call distance from the client-safe leads-ui. Every
 * function takes the time it decides from (`nowMs`), so a server render and
 * the browser's first render agree.
 */

export type { Booking, BookingStatus } from "@/lib/admin-api/leads/booking";

export const BOOKING_COPY = {
  title: "Booked call",
  how: "How",
  join: "Join call",
  joinShort: "Join",
  copyLink: "Copy link",
  linkCopied: "Link copied.",
  copyFailed: "Could not copy that.",
  openCal: "Open in Cal.com",
  answers: "Their answers",
  notes: "Notes",
  guests: "Guests",
  cancelled: "Cancelled",
  done: "Done",
  upcoming: "Upcoming calls",
  noUpcoming: "No upcoming calls.",
  now: "Now",
  newTab: "(opens in a new tab)",
} as const;

/** Join is emphasised from this long before the start until the end. */
export const JOIN_EARLY_MS = 15 * 60_000;

/** Overview's "Upcoming calls" shows at most this many. */
export const UPCOMING_CALLS_LIMIT = 5;

const TORONTO = "America/Toronto";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/* ------------------------------------------------------------------ */
/* Wall clocks in a zone                                               */
/* ------------------------------------------------------------------ */

type Wall = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

/** One formatter per zone (null for a zone this runtime does not know), kept small. */
const formats = new Map<string, Intl.DateTimeFormat | null>();

function formatFor(zone: string): Intl.DateTimeFormat | null {
  const known = formats.get(zone);
  if (known !== undefined) return known;
  let format: Intl.DateTimeFormat | null = null;
  try {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
      weekday: "short",
    });
  } catch {
    format = null;
  }
  if (formats.size >= 64) formats.clear();
  formats.set(zone, format);
  return format;
}

/** The wall clock of an instant in a zone, or null for a bad instant or zone. */
function wallIn(ms: number, zone: string): Wall | null {
  if (!Number.isFinite(ms)) return null;
  const format = formatFor(zone);
  if (!format) return null;
  const out: Wall = { year: 0, month: 0, day: 0, hour: 0, minute: 0, weekday: 0 };
  for (const p of format.formatToParts(new Date(ms))) {
    if (p.type === "year") out.year = Number(p.value);
    else if (p.type === "month") out.month = Number(p.value);
    else if (p.type === "day") out.day = Number(p.value);
    else if (p.type === "hour") out.hour = Number(p.value) % 24;
    else if (p.type === "minute") out.minute = Number(p.value);
    else if (p.type === "weekday") out.weekday = Math.max(0, WEEKDAYS.indexOf(p.value as (typeof WEEKDAYS)[number]));
  }
  return out;
}

/** Milliseconds of an ISO instant (any fractional precision); NaN when missing or invalid. */
export function bookingMs(at: string | null | undefined): number {
  if (typeof at !== "string" || !at.trim()) return NaN;
  return Date.parse(at.trim().replace(/(\.\d{3})\d+/, "$1"));
}

const pad = (n: number) => String(n).padStart(2, "0");
const sameDay = (a: Wall, b: Wall) => a.year === b.year && a.month === b.month && a.day === b.day;
const dayNumber = (w: Wall) => Math.floor(Date.UTC(w.year, w.month - 1, w.day) / 86_400_000);

/** "3:00 p.m.", "12:00 p.m." (noon), "12:30 a.m." */
function clock(w: Wall): string {
  const h = w.hour % 12 === 0 ? 12 : w.hour % 12;
  return `${h}:${pad(w.minute)} ${w.hour < 12 ? "a.m." : "p.m."}`;
}

/** "Tue, Oct 21", with the year when it is not this year in Toronto ("Tue, Oct 21, 2027"). */
function day(w: Wall, nowMs: number): string {
  const thisYear = wallIn(nowMs, TORONTO)?.year ?? w.year;
  const base = `${WEEKDAYS[w.weekday]}, ${MONTHS[w.month - 1]} ${w.day}`;
  return w.year === thisYear ? base : `${base}, ${w.year}`;
}

/** "Tue, Oct 21, 3:00 p.m." in Toronto ("" when the instant is invalid). */
export function bookingDayTime(at: string | null | undefined, nowMs: number): string {
  const w = wallIn(bookingMs(at), TORONTO);
  return w ? `${day(w, nowMs)}, ${clock(w)}` : "";
}

/* ------------------------------------------------------------------ */
/* The panel's lines                                                   */
/* ------------------------------------------------------------------ */

/**
 * The first line: "Tue, Oct 21, 3:00 p.m. to 3:30 p.m." in Toronto. An end on
 * another Toronto day carries its own day ("... 11:30 p.m. to Wed, Oct 22,
 * 12:30 a.m."); with no end, the start alone.
 */
export function bookingWhen(b: Pick<Booking, "start" | "end">, nowMs: number): string {
  const start = wallIn(bookingMs(b.start), TORONTO);
  if (!start) return "";
  const head = `${day(start, nowMs)}, ${clock(start)}`;
  const end = wallIn(bookingMs(b.end), TORONTO);
  if (!end || bookingMs(b.end) < bookingMs(b.start)) return head;
  return sameDay(start, end) ? `${head} to ${clock(end)}` : `${head} to ${day(end, nowMs)}, ${clock(end)}`;
}

/**
 * A zone as a place: the last part of its name in words ("America/Vancouver"
 * is "Vancouver", "America/Argentina/Buenos_Aires" "Buenos Aires"); UTC and
 * the fixed Etc zones as UTC offsets ("Etc/GMT+5" is UTC-5: its sign is POSIX).
 */
export function zoneCity(zone: string): string {
  const z = zone.trim();
  if (/^(Etc\/)?(UTC|UCT|GMT|Zulu|Universal|Greenwich)(0)?$/i.test(z)) return "UTC";
  const fixed = z.match(/^Etc\/GMT([+-])(\d{1,2})$/i);
  if (fixed) return `UTC${fixed[1] === "+" ? "-" : "+"}${Number(fixed[2])}`;
  const last = z.split("/").pop() ?? z;
  return last.replace(/_/g, " ").trim() || z;
}

/**
 * "Their time: 12:00 p.m. (Vancouver)" when the booker's clock reads
 * differently from Toronto's at the start; their day joins in when it is
 * another day there ("Their time: Thu, Oct 22, 6:00 a.m. (Sydney)"). Null
 * without a zone, or when their clock matches Toronto's (New York).
 */
export function bookingTheirTime(b: Pick<Booking, "start" | "timeZone">, nowMs: number): string | null {
  if (!b.timeZone) return null;
  const ms = bookingMs(b.start);
  const ours = wallIn(ms, TORONTO);
  const theirs = wallIn(ms, b.timeZone);
  if (!ours || !theirs) return null;
  if (sameDay(ours, theirs) && ours.hour === theirs.hour && ours.minute === theirs.minute) return null;
  const when = sameDay(ours, theirs) ? clock(theirs) : `${day(theirs, nowMs)}, ${clock(theirs)}`;
  return `Their time: ${when} (${zoneCity(b.timeZone)})`;
}

/** The call's status at `nowMs`: cancelled stays cancelled; otherwise past once the end (else the start) has gone by. */
export function bookingStatusAt(b: Pick<Booking, "status" | "start" | "end">, nowMs: number): BookingStatus {
  if (b.status === "cancelled") return "cancelled";
  const over = bookingMs(b.end ?? b.start);
  return Number.isFinite(over) && over < nowMs ? "past" : "booked";
}

/** The badge beside the title: "Cancelled", "Done" once it is over, else none. */
export function bookingBadge(b: Pick<Booking, "status" | "start" | "end">, nowMs: number): "Cancelled" | "Done" | null {
  const status = bookingStatusAt(b, nowMs);
  return status === "cancelled" ? BOOKING_COPY.cancelled : status === "past" ? BOOKING_COPY.done : null;
}

/** "Reason: ..." for a reason given, else null. */
function reasonLine(reason: string | null | undefined): string | null {
  const r = typeof reason === "string" ? reason.trim() : "";
  return r ? `Reason: ${r}` : null;
}

/**
 * What changed: a cancelled call's reason, or a moved call's "Moved from Mon,
 * Oct 20, 2:00 p.m." and its reason. Each is null when there is nothing to say.
 */
export function bookingChange(
  b: Pick<Booking, "status" | "cancellationReason" | "rescheduleReason" | "rescheduledFrom">,
  nowMs: number,
): { moved: string | null; reason: string | null } {
  if (b.status === "cancelled") return { moved: null, reason: reasonLine(b.cancellationReason) };
  const from = b.rescheduledFrom ? bookingDayTime(b.rescheduledFrom, nowMs) : "";
  if (!from) return { moved: null, reason: null };
  return { moved: `Moved from ${from}`, reason: reasonLine(b.rescheduleReason) };
}

/* ------------------------------------------------------------------ */
/* Join                                                                */
/* ------------------------------------------------------------------ */

export type JoinFields = Pick<Booking, "status" | "start" | "end" | "joinUrl">;

/** Only what Join needs, so a client component never receives the answers, notes or guests. */
export function joinFieldsOf(b: JoinFields): JoinFields {
  return { status: b.status, start: b.start, end: b.end, joinUrl: b.joinUrl };
}

/**
 * The link Join call and Copy link use: whenever there is one, except on a
 * cancelled call (Cal.com closes its room). The app's joinLink.
 */
export function joinLinkOf(b: Pick<Booking, "status" | "joinUrl"> | null | undefined): string | null {
  if (!b || b.status === "cancelled") return null;
  return b.joinUrl?.trim() || null;
}

/**
 * Whether it is time to join: a join link, not cancelled, and from 15 minutes
 * before the start to the end (the start, with no end). The panel emphasises
 * Join call then; a Leads row and an Upcoming calls row show it only then.
 */
export function isJoinTime(b: JoinFields | null | undefined, nowMs: number): boolean {
  if (!b || !b.joinUrl || b.status === "cancelled") return false;
  const start = bookingMs(b.start);
  const end = bookingMs(b.end ?? b.start);
  if (!Number.isFinite(start)) return false;
  return nowMs >= start - JOIN_EARLY_MS && nowMs <= (Number.isFinite(end) && end >= start ? end : start);
}

/** The next time (ms) isJoinTime changes after `nowMs`, or null when it never will. */
export function nextJoinChange(b: JoinFields | null | undefined, nowMs: number): number | null {
  if (!b || !b.joinUrl || b.status === "cancelled") return null;
  const start = bookingMs(b.start);
  if (!Number.isFinite(start)) return null;
  const endRaw = bookingMs(b.end ?? b.start);
  const end = Number.isFinite(endRaw) && endRaw >= start ? endRaw : start;
  const opens = start - JOIN_EARLY_MS;
  if (nowMs < opens) return opens;
  if (nowMs <= end) return end + 1;
  return null;
}

/* ------------------------------------------------------------------ */
/* Short times (Leads rows, Upcoming calls rows)                       */
/* ------------------------------------------------------------------ */

/**
 * When a call that is not over happens, short: "Now, until 3:30 p.m." while
 * it is under way, else "Today, 3:00 p.m.", "Tomorrow, 3:00 p.m." or "Tue,
 * Oct 21, 3:00 p.m." (Toronto days). Null when it is over, cancelled or unknown.
 */
export function callTimeShort(b: Pick<Booking, "status" | "start" | "end"> | null | undefined, nowMs: number): string | null {
  if (!b || bookingStatusAt(b, nowMs) !== "booked") return null;
  const startMs = bookingMs(b.start);
  const start = wallIn(startMs, TORONTO);
  const now = wallIn(nowMs, TORONTO);
  if (!start || !now) return null;
  if (startMs <= nowMs) {
    const end = wallIn(bookingMs(b.end), TORONTO);
    return end ? `Now, until ${clock(end)}` : `Now, from ${clock(start)}`;
  }
  const days = dayNumber(start) - dayNumber(now);
  if (days === 0) return `Today, ${clock(start)}`;
  if (days === 1) return `Tomorrow, ${clock(start)}`;
  return `${day(start, nowMs)}, ${clock(start)}`;
}

/** A Leads row's call line: "Call today, 3:00 p.m.", "Call now, until 3:30 p.m.", "Call Tue, Oct 21, 3:00 p.m."; null when no call is coming. */
export function rowCallLine(b: Pick<Booking, "status" | "start" | "end"> | null | undefined, nowMs: number): string | null {
  const short = callTimeShort(b, nowMs);
  if (!short) return null;
  return /^(Now|Today|Tomorrow)\b/.test(short) ? `Call ${short.charAt(0).toLowerCase()}${short.slice(1)}` : `Call ${short}`;
}

/** An Upcoming calls row's second line, under the name: "Tue, Oct 21, 3:00 p.m. · Google Meet" (the app's callLine). */
export function upcomingCallLine(b: Pick<Booking, "start" | "how">, nowMs: number): string {
  return [bookingDayTime(b.start, nowMs), b.how.label].filter(Boolean).join(" · ");
}

/** An Upcoming calls row's right side: "Now" once it started, else "in 25 min", "today", "tomorrow", "in 3 days" (the app's callDistance). */
export function upcomingCallDistance(b: Pick<Booking, "start">, nowMs: number): string {
  const start = bookingMs(b.start);
  if (!Number.isFinite(start)) return "";
  return start <= nowMs ? BOOKING_COPY.now : bookingDistance(b.start, nowMs);
}

/**
 * Overview's "Upcoming calls" from a set of leads: the booked calls that are
 * not cancelled and not over at `nowMs` (one under way counts), soonest first,
 * at most `limit`.
 */
export function upcomingCalls<T extends Pick<Lead, "id" | "booking">>(leads: readonly T[], nowMs: number, limit: number = UPCOMING_CALLS_LIMIT): T[] {
  return leads
    .filter((l) => !!l.booking && bookingStatusAt(l.booking, nowMs) === "booked")
    .sort((a, b) => bookingMs(a.booking!.start) - bookingMs(b.booking!.start) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, Math.max(0, limit));
}
