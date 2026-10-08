import { GROW_LEAD_SOURCE, growNeeds, revenueBands } from "@/config/grow";
import { MONTH_SHORT, addDays, daysBetween, parseDate, torontoDateOf, torontoToday } from "@/lib/admin-api/analytics/calendar";
import type { Assignee, Touch } from "@/lib/admin-api/leads/data";
import type { TouchKind } from "@/lib/admin-api/leads/input";
import type { Lead, LeadSource, LeadStatus, StaffRef } from "@/lib/admin-api/leads/shape";

/**
 * Client-safe helpers for the web Leads workspace: labels, lead text, contact
 * links, Toronto times, follow-up states, list params, the shared copy and the
 * pending "Log this call" record. Pure TypeScript, safe in server and client
 * components: values come only from config/grow and the Toronto calendar of
 * the staff activity board (lib/admin-api/analytics/calendar.ts, no imports),
 * everything else from the leads domain is a type. The rules and words are the
 * mobile app's (src/modules/leads, src/lib/dates.ts, src/lib/format.ts).
 */

export type { Lead, LeadStatus, StaffRef } from "@/lib/admin-api/leads/shape";
export type { Touch, Assignee } from "@/lib/admin-api/leads/data";
export type { TouchKind } from "@/lib/admin-api/leads/input";

/* ------------------------------------------------------------------ */
/* Form control classes                                                */
/* ------------------------------------------------------------------ */

/**
 * The portal's inputCls with `lg:text-sm` instead of `sm:text-sm`: 16px on
 * every phone, portrait and landscape (iOS zooms on focus below 16px). Written
 * out so Tailwind sees every class; the leadswebtest harness keeps it in step
 * with inputCls.
 */
export const fieldCls =
  "w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold lg:text-sm";
export const fieldSelectCls = fieldCls + " appearance-none";

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export type StatusTone = "gold" | "ok" | "muted";

/** GET /meta `leadStatuses`, in the app's order: new gold, booked ok, the rest muted. */
export const LEAD_STATUS_OPTIONS: readonly { value: LeadStatus; label: string; tone: StatusTone }[] = [
  { value: "new", label: "New", tone: "gold" },
  { value: "booked", label: "Booked", tone: "ok" },
  { value: "contacted", label: "Contacted", tone: "muted" },
  { value: "qualified", label: "Qualified", tone: "muted" },
  { value: "won", label: "Won", tone: "muted" },
  { value: "lost", label: "Lost", tone: "muted" },
  { value: "cancelled", label: "Cancelled", tone: "muted" },
];

/** The source of a lead staff added by hand (the leads domain's OUTREACH_SOURCE, kept here as a value so this file stays client-safe). */
export const OUTREACH_LEAD_SOURCE = "outreach" satisfies LeadSource;

/** GET /meta `leadSources`. */
export const LEAD_SOURCE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "cal_booking", label: "Booked call" },
  { value: GROW_LEAD_SOURCE, label: "Lead form" },
  { value: "lead_magnet", label: "Free tool" },
  { value: "portal_signup", label: "Portal sign-up" },
  { value: OUTREACH_LEAD_SOURCE, label: "Outreach" },
];

/** GET /meta `leadNeeds` (the /grow form's words). */
export const LEAD_NEED_OPTIONS: readonly { value: string; label: string }[] = growNeeds.map(({ value, label }) => ({ value, label }));

/** GET /meta `leadTouchKinds`. */
export const TOUCH_KIND_OPTIONS: readonly { value: TouchKind; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "dm", label: "DM" },
  { value: "meeting", label: "Meeting" },
  { value: "other", label: "Other" },
];

const statusOption = (status: string) => LEAD_STATUS_OPTIONS.find((o) => o.value === status) ?? LEAD_STATUS_OPTIONS[0];

/** "Contacted". An unknown status reads as "New" (the server folds it the same way). */
export function statusLabel(status: string): string {
  return statusOption(status).label;
}

export function statusTone(status: string): StatusTone {
  return statusOption(status).tone;
}

/** "Lead form". An unknown source shows as stored. */
export function sourceLabel(source: string): string {
  return LEAD_SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? source;
}

export function needLabelOf(need: string | null): string | null {
  if (!need) return null;
  return growNeeds.find((n) => n.value === need)?.label ?? null;
}

/** "Under $10K a month". Only ever called with a band the server sent (owners and managers). */
export function revenueLabelOf(band: string | null): string | null {
  if (!band) return null;
  return revenueBands.find((b) => b.value === band)?.label ?? null;
}

export function touchKindLabel(kind: string): string {
  return TOUCH_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? "Other";
}

/* ------------------------------------------------------------------ */
/* Lead text                                                           */
/* ------------------------------------------------------------------ */

type LeadNameParts = Pick<Lead, "name" | "email" | "business" | "phone">;

/**
 * North American numbers as "(613) 555-0199". Accepts E.164 and the usual typed
 * forms; anything else (other countries, extensions, letters) is returned as
 * typed, trimmed. "" when there is none.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const text = raw.trim();
  if (!text) return "";
  if (!/^\+?[\d\s().-]+$/.test(text)) return text;
  let digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) {
    if (digits.length !== 11 || !digits.startsWith("1")) return text;
    digits = digits.slice(1);
  } else if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return text;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** The name, else the email, else the business, else the phone number, else "Lead". */
export function leadTitle(lead: LeadNameParts): string {
  return lead.name?.trim() || (lead.email ?? "").trim() || lead.business?.trim() || formatPhone(lead.phone) || "Lead";
}

/** The row's second line: the business, else the email, else the phone; never what the title already says. */
export function rowSubtitle(lead: LeadNameParts): string | null {
  const title = leadTitle(lead);
  const candidates = [lead.business?.trim(), (lead.email ?? "").trim(), formatPhone(lead.phone)];
  return candidates.find((c) => !!c && c !== title) || null;
}

/** "Lead form · 3 h ago" */
export function rowMeta(lead: Pick<Lead, "source" | "createdAt">, nowMs: number): string {
  return [sourceLabel(lead.source), relativeTime(lead.createdAt, nowMs)].filter(Boolean).join(" · ");
}

/** A team member as leads show them: the name, else the email. */
export function staffName(ref: StaffRef): string {
  return ref.name?.trim() || ref.email;
}

/** Whether a reference is the signed-in person (emails compare without case). */
export function isMe(ref: StaffRef | null | undefined, myEmail: string): boolean {
  return !!ref && !!myEmail && ref.email.trim().toLowerCase() === myEmail.trim().toLowerCase();
}

/** "Olivia Martin" to "Olivia"; without a name, the title (a business or an email stays whole). */
export function firstName(lead: LeadNameParts): string {
  const name = lead.name?.trim();
  return name ? (name.split(/\s+/)[0] ?? name) : leadTitle(lead);
}

// Characters that never start a word for initials ("(Ottawa)", "@maya", "-").
const NOT_INITIAL = /["'`()[\]{}<>.,;:!?@#$%^&*_+=|\\/~-]/g;

/** Avatar initials: "Anna Park" to "AP", "Maya" to "M", "maya.chen@x.com" to "MC". */
export function initials(title: string): string {
  if (!title) return "";
  let text = title.trim();
  if (/^\S+@\S+$/.test(text)) text = text.slice(0, text.indexOf("@")).replace(/[._+-]+/g, " ");
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(NOT_INITIAL, ""))
    .filter(Boolean);
  if (words.length === 0) return "";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** Who found the lead: `foundBy`, else (an older server) whoever added it by hand. */
export function finderOf(lead: Pick<Lead, "source" | "foundBy" | "addedBy">): StaffRef | null {
  if (lead.foundBy) return lead.foundBy;
  return isOutreachLead(lead) ? (lead.addedBy ?? null) : null;
}

/* ------------------------------------------------------------------ */
/* Contact links                                                       */
/* ------------------------------------------------------------------ */

function dialDigits(phone: string | null | undefined): string | null {
  const v = (phone ?? "").trim();
  if (!v) return null;
  const digits = v.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 7 ? digits : null;
}

/** "tel:+16135550199", or null without a usable phone (7 digits or more). */
export function telHref(phone: string | null): string | null {
  const digits = dialDigits(phone);
  return digits ? `tel:${digits}` : null;
}

/** "sms:+16135550199", or null without a usable phone. */
export function smsHref(phone: string | null): string | null {
  const digits = dialDigits(phone);
  return digits ? `sms:${digits}` : null;
}

/** "mailto:ana@x.com", or null without a usable email. */
export function mailtoHref(email: string): string | null {
  const v = (email ?? "").trim();
  return v && /^\S+@\S+\.\S+$/.test(v) ? `mailto:${v}` : null;
}

/** What "Log outreach" starts on: a call with a phone, else an email with an email, else a DM. */
export function defaultTouchKind(lead: Pick<Lead, "phone" | "email">): TouchKind {
  if (telHref(lead.phone)) return "call";
  if (mailtoHref(lead.email)) return "email";
  return "dm";
}

/* ------------------------------------------------------------------ */
/* Toronto time                                                        */
/* ------------------------------------------------------------------ */

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

let wallFormat: Intl.DateTimeFormat | null = null;

/** Toronto wall-clock parts of an instant (hour 0 to 23, weekday 0 = Sunday). */
function wallParts(ms: number): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  if (!wallFormat) {
    wallFormat = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
      weekday: "short",
    });
  }
  const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0, weekday: 0 };
  for (const p of wallFormat.formatToParts(new Date(ms))) {
    if (p.type === "year") out.year = Number(p.value);
    else if (p.type === "month") out.month = Number(p.value);
    else if (p.type === "day") out.day = Number(p.value);
    else if (p.type === "hour") out.hour = Number(p.value) % 24;
    else if (p.type === "minute") out.minute = Number(p.value);
    else if (p.type === "weekday") out.weekday = Math.max(0, WEEKDAY_SHORT.indexOf(p.value as (typeof WEEKDAY_SHORT)[number]));
  }
  return out;
}

/** Milliseconds of an ISO instant (any fractional precision) or a timestamp; NaN when invalid. */
function toMs(at: string | number | null | undefined): number {
  if (typeof at === "number") return Number.isFinite(at) ? at : NaN;
  if (typeof at !== "string" || !at.trim()) return NaN;
  return Date.parse(at.trim().replace(/(\.\d{3})\d+/, "$1"));
}

const pad = (n: number) => String(n).padStart(2, "0");
const hour12 = (h: number) => (h % 12 === 0 ? 12 : h % 12);

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?$/;

/**
 * A Toronto wall time from a datetime-local field ("2026-10-08T14:30") to an
 * ISO instant ("2026-10-08T18:30:00.000Z"), whatever zone the phone is in.
 * Seconds are accepted and dropped (iOS Safari can send them). A time the
 * spring-forward jump skips reads one hour later; a fall-back time that
 * happens twice is the first one. Null when empty or malformed.
 */
export function torontoLocalToInstant(local: string): string | null {
  if (typeof local !== "string") return null;
  const m = local.trim().match(LOCAL_RE);
  if (!m) return null;
  const [year, month, day, hour, minute] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(naive);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  // Toronto is UTC-4 (EDT) or UTC-5 (EST).
  const candidates = [naive + 4 * 3_600_000, naive + 5 * 3_600_000];
  const shows = (ms: number) => {
    const w = wallParts(ms);
    return w.year === year && w.month === month && w.day === day && w.hour === hour && w.minute === minute;
  };
  const match = candidates.find(shows);
  return new Date(match ?? candidates[1]).toISOString();
}

/** An instant as a Toronto datetime-local value, "YYYY-MM-DDTHH:mm" ("" when invalid). */
export function instantToTorontoLocal(at: string | number): string {
  const ms = toMs(at);
  if (!Number.isFinite(ms)) return "";
  const w = wallParts(ms);
  return `${torontoDateOf(ms)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** "4:00 PM" */
export function formatTime(at: string): string {
  const ms = toMs(at);
  if (!Number.isFinite(ms)) return "";
  const w = wallParts(ms);
  return `${hour12(w.hour)}:${pad(w.minute)} ${w.hour < 12 ? "AM" : "PM"}`;
}

/** "Oct 8" this year (Toronto), "Oct 8, 2025" otherwise. */
export function formatShortDate(at: string, nowMs: number): string {
  const ms = toMs(at);
  if (!Number.isFinite(ms)) return "";
  const d = parseDate(torontoDateOf(ms));
  const thisYear = parseDate(torontoToday(nowMs)).year;
  const base = `${MONTH_SHORT[d.month - 1]} ${d.day}`;
  return d.year === thisYear ? base : `${base}, ${d.year}`;
}

/** "Oct 8, 10:00 AM" (year added when not this year). */
export function formatDateTime(at: string, nowMs: number): string {
  if (!Number.isFinite(toMs(at))) return "";
  return `${formatShortDate(at, nowMs)}, ${formatTime(at)}`;
}

/** "Thu, Oct 8, 10:00 AM" (year added when not this year). */
export function formatFieldDateTime(at: string, nowMs: number): string {
  const ms = toMs(at);
  if (!Number.isFinite(ms)) return "";
  return `${WEEKDAY_SHORT[wallParts(ms).weekday]}, ${formatDateTime(at, nowMs)}`;
}

/** "just now", "5 min ago", "3 h ago", "Yesterday", "Oct 8"; ahead: "in 5 min", "today 4:00 PM", "tomorrow 4:00 PM", "Oct 8". */
export function relativeTime(at: string, nowMs: number): string {
  const ms = toMs(at);
  if (!Number.isFinite(ms)) return "";
  const diff = nowMs - ms;
  if (diff < 0) {
    const ahead = -diff;
    // Clamped so 59.6 minutes never reads "in 60 min".
    if (ahead < 3_600_000) return `in ${Math.min(59, Math.max(1, Math.round(ahead / 60_000)))} min`;
    const days = daysBetween(torontoToday(nowMs), torontoDateOf(ms));
    if (days === 0) return `today ${formatTime(at)}`;
    if (days === 1) return `tomorrow ${formatTime(at)}`;
    return formatShortDate(at, nowMs);
  }
  if (diff < 45_000) return "just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} min ago`;
  const days = daysBetween(torontoDateOf(ms), torontoToday(nowMs));
  if (days === 0) return `${Math.floor(diff / 3_600_000)} h ago`;
  if (days === 1) return "Yesterday";
  return formatShortDate(at, nowMs);
}

/** How far a booked call is, by Toronto day: "in 25 min", "today", "earlier today", "tomorrow", "yesterday", "in 3 days", "4 days ago". */
export function bookingDistance(at: string, nowMs: number): string {
  const ms = toMs(at);
  if (!Number.isFinite(ms)) return "";
  const ahead = ms - nowMs;
  if (ahead > 0 && ahead < 3_600_000) return `in ${Math.min(59, Math.max(1, Math.round(ahead / 60_000)))} min`;
  const days = daysBetween(torontoToday(nowMs), torontoDateOf(ms));
  if (days === 0) return ahead > 0 ? "today" : "earlier today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Whether an instant (a booked call) is still ahead. */
export function isUpcoming(at: string, nowMs: number): boolean {
  const ms = toMs(at);
  return Number.isFinite(ms) && ms > nowMs;
}

/**
 * "Pick a time after Oct 5, 2:41 PM." / "Pick a time before ..." for a Toronto
 * local value outside min or max (inclusive bounds, also Toronto local), or
 * null when it is fine, empty or malformed.
 */
export function timeRangeError(local: string, min: string | null, max: string | null, nowMs: number): string | null {
  const value = torontoLocalToInstant(local);
  if (!value) return null;
  const at = Date.parse(value);
  const lo = min ? torontoLocalToInstant(min) : null;
  const hi = max ? torontoLocalToInstant(max) : null;
  if (lo && at < Date.parse(lo)) return `Pick a time after ${formatDateTime(lo, nowMs)}.`;
  if (hi && at > Date.parse(hi)) return `Pick a time before ${formatDateTime(hi, nowMs)}.`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Follow-ups (by Toronto calendar day)                                */
/* ------------------------------------------------------------------ */

type FollowUpState = "overdue" | "today" | "upcoming";
export type FollowUpTone = "signal" | "gold" | "muted";

const FOLLOW_UP_TONES: Record<FollowUpState, FollowUpTone> = { overdue: "signal", today: "gold", upcoming: "muted" };

/** Toronto calendar days from today to the follow-up (negative: overdue), or null without one. */
function followUpDays(at: string | null | undefined, nowMs: number): number | null {
  const ms = toMs(at);
  if (!Number.isFinite(ms)) return null;
  return daysBetween(torontoToday(nowMs), torontoDateOf(ms));
}

/** A row's follow-up: "2d overdue", "Today" (any time today, even once the hour has passed), "Tomorrow", "Oct 8". */
export function followUpShort(at: string | null | undefined, nowMs: number): { text: string; tone: FollowUpTone } | null {
  const days = followUpDays(at, nowMs);
  if (days === null || !at) return null;
  const tone = FOLLOW_UP_TONES[days < 0 ? "overdue" : days === 0 ? "today" : "upcoming"];
  if (days < 0) return { text: `${-days}d overdue`, tone };
  if (days === 0) return { text: "Today", tone };
  if (days === 1) return { text: "Tomorrow", tone };
  return { text: formatShortDate(at, nowMs), tone };
}

/** What a screen reader says: "follow-up 2 days overdue", "follow-up today at 4:00 PM". "" without one. */
export function followUpSpoken(at: string | null | undefined, nowMs: number): string {
  const days = followUpDays(at, nowMs);
  if (days === null || !at) return "";
  if (days < 0) return `follow-up ${-days} ${days === -1 ? "day" : "days"} overdue`;
  if (days === 0) return `follow-up today at ${formatTime(at)}`;
  if (days === 1) return `follow-up tomorrow at ${formatTime(at)}`;
  return `follow-up ${formatShortDate(at, nowMs)}`;
}

/** The badge beside the follow-up on a lead: "Overdue", "Today", "Tomorrow", "In 3 days". */
export function followUpBadge(at: string | null | undefined, nowMs: number): { text: string; tone: FollowUpTone } | null {
  const days = followUpDays(at, nowMs);
  if (days === null) return null;
  if (days < 0) return { text: "Overdue", tone: "signal" };
  if (days === 0) return { text: "Today", tone: "gold" };
  return { text: days === 1 ? "Tomorrow" : `In ${days} days`, tone: "muted" };
}

/** One-tap dates in the follow-up editor (Toronto days; the time stays what was picked). */
export function followUpPresets(nowMs: number): { label: "Tomorrow" | "In 3 days" | "Next week"; date: string }[] {
  const today = torontoToday(nowMs);
  return [
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "In 3 days", date: addDays(today, 3) },
    { label: "Next week", date: addDays(today, 7) },
  ];
}

/** The follow-up editor's start: the current follow-up if still ahead, else tomorrow at its time, or 09:00. */
export function defaultFollowUpLocal(current: string | null, nowMs: number): string {
  const ms = toMs(current);
  if (Number.isFinite(ms) && ms > nowMs) return instantToTorontoLocal(ms);
  const time = Number.isFinite(ms) ? instantToTorontoLocal(ms).slice(11) : "09:00";
  return `${addDays(torontoToday(nowMs), 1)}T${time}`;
}

/* ------------------------------------------------------------------ */
/* UI mirrors of server rules (the server still decides)               */
/* ------------------------------------------------------------------ */

const SETTABLE: readonly string[] = ["new", "booked", "contacted", "qualified", "won", "lost"];

/** Shown under a status the booking calendar sets (it cannot be picked). */
export const CALENDAR_STATUS_HINT = "Set by the booking calendar";

/** A lead the booking calendar owns: a Cal booking, or a lead a booking was attached to. */
export function isCalendarLead(lead: Pick<Lead, "source" | "bookingAt">): boolean {
  return lead.source === "cal_booking" || !!lead.bookingAt;
}

/** A lead staff added by hand: it shows "Added" and "Note", and has no attribution (it never visited the site). */
export function isOutreachLead(lead: Pick<Lead, "source">): boolean {
  return lead.source === OUTREACH_LEAD_SOURCE;
}

/** Booked calls and lead forms ask for the need and the revenue band; free tools and portal sign-ups do not. */
const QUALIFIER_SOURCES: readonly string[] = ["cal_booking", GROW_LEAD_SOURCE];

/** Whether the lead's page shows Need and Revenue: its source asks for them, or it already has one. */
export function asksQualifiers(lead: Pick<Lead, "source" | "need" | "revenue">): boolean {
  return QUALIFIER_SOURCES.includes(lead.source) || lead.need !== null || lead.revenue !== null;
}

/** Why a status cannot be picked for this lead, or null: cancelled never; booked not on a calendar lead that does not show booked. */
export function statusChoiceBlock(lead: Pick<Lead, "source" | "bookingAt" | "status">, status: string): string | null {
  if (!SETTABLE.includes(status)) return CALENDAR_STATUS_HINT;
  if (status === "booked" && isCalendarLead(lead) && lead.status !== "booked") return CALENDAR_STATUS_HINT;
  return null;
}

/** "I booked this call" is offered when the lead shows booked and nobody has the booking credit yet. */
export function canClaimBooking(lead: Pick<Lead, "status" | "bookedBy">): boolean {
  return lead.status === "booked" && lead.bookedBy === null;
}

/** The lead page's client button: "open" the client it became, "create" one from it, or nothing. */
export function leadClientAction(
  lead: Pick<Lead, "convertedClientId">,
  caps: { clientsView: boolean; leadsConvert: boolean; clientsCreate: boolean },
): "open" | "create" | null {
  if (lead.convertedClientId) return caps.clientsView ? "open" : null;
  return caps.leadsConvert && caps.clientsCreate ? "create" : null;
}

export function newClientHref(lead: Pick<Lead, "id">): string {
  return `/admin/clients/new?leadId=${encodeURIComponent(lead.id)}`;
}

/** An Edit lead value as compared and sent: trimmed, with a browser's CRLF line breaks as LF (as the app sends them). */
export const leadFormText = (v: unknown): string => (typeof v === "string" ? v : "").replace(/\r\n?/g, "\n").trim();

/**
 * Whether an Edit lead detail differs from what the form showed when it
 * opened (the app's editLeadPatch rule): an email in another casing is not a
 * change. The server sends only these (changedLeadDetails); the form keeps
 * Save off until one differs.
 */
export function leadDetailDiffers(key: string, now: unknown, was: unknown): boolean {
  const next = leadFormText(now);
  const before = leadFormText(was);
  return key === "email" ? next.toLowerCase() !== before.toLowerCase() : next !== before;
}

/* ------------------------------------------------------------------ */
/* List params                                                         */
/* ------------------------------------------------------------------ */

export type LeadListView = "all" | "due" | "mine";
export type LeadListSort = "newest" | "followup";
export type LeadListParams = {
  view: LeadListView;
  /** Follow-ups due: everyone's (the default, like the app), or false for "Show only mine" (who=mine). Other views ignore it. */
  everyone: boolean;
  sort: LeadListSort;
  q: string;
  source: string;
  status: string;
  need: string;
};

export const DEFAULT_LEAD_LIST_PARAMS: LeadListParams = {
  view: "all",
  everyone: true,
  sort: "newest",
  q: "",
  source: "",
  status: "",
  need: "",
};

const asView = (v: unknown): LeadListView => (v === "due" || v === "mine" ? v : "all");
const asSort = (v: unknown): LeadListSort => (v === "followup" ? "followup" : "newest");
const cut = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** From a page's search params: unknown values fall back to the default (source, status and need are checked later by the shared schema). */
export function leadListParamsFrom(sp: Record<string, string | string[] | undefined>): LeadListParams {
  const first = (key: string): string | undefined => {
    const v = sp?.[key];
    return Array.isArray(v) ? v[0] : v;
  };
  return {
    view: asView(first("view")),
    everyone: first("who") !== "mine",
    sort: asSort(first("sort")),
    q: cut(first("q"), 100),
    source: cut(first("source"), 40),
    status: cut(first("status"), 40),
    need: cut(first("need"), 40),
  };
}

/** From an object a browser sent (a server action argument): every key type-checked, anything else the default. */
export function sanitizeLeadListParams(raw: unknown): LeadListParams {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_LEAD_LIST_PARAMS };
  const r = raw as Record<string, unknown>;
  return {
    view: asView(r.view),
    everyone: typeof r.everyone === "boolean" ? r.everyone : DEFAULT_LEAD_LIST_PARAMS.everyone,
    sort: asSort(r.sort),
    q: cut(r.q, 100),
    source: cut(r.source, 40),
    status: cut(r.status, 40),
    need: cut(r.need, 40),
  };
}

/** "/admin/leads?q=..&view=due&who=mine&sort=followup&source=..&status=..&need=..", defaults left out. */
export function leadListHref(params: LeadListParams, patch?: Partial<LeadListParams>): string {
  const p = { ...params, ...patch };
  const sp = new URLSearchParams();
  const q = (p.q ?? "").trim();
  if (q) sp.set("q", q);
  if (p.view === "due" || p.view === "mine") sp.set("view", p.view);
  if (p.view === "due" && !p.everyone) sp.set("who", "mine");
  if (p.view !== "due" && p.sort === "followup") sp.set("sort", "followup");
  if (p.source) sp.set("source", p.source);
  if (p.status) sp.set("status", p.status);
  if (p.need) sp.set("need", p.need);
  const qs = sp.toString();
  return qs ? `/admin/leads?${qs}` : "/admin/leads";
}

/** Whether a view, sort or filter narrows the list (the search box is not counted). */
export function isNarrowed(params: LeadListParams): boolean {
  return params.view !== "all" || params.sort !== "newest" || !!params.source || !!params.status || !!params.need;
}

/* ------------------------------------------------------------------ */
/* Results shared by the server actions and client components          */
/* ------------------------------------------------------------------ */

export type LeadActionResult =
  | { ok: true; message: string; lead: Lead; touch?: Touch }
  | { ok: false; code: string; message: string; fields?: Record<string, string>; lead?: Lead };
export type LeadPageResult = { ok: true; items: Lead[]; nextCursor: string | null } | { ok: false; message: string };
export type TouchPageResult = { ok: true; items: Touch[]; nextCursor: string | null } | { ok: false; message: string };
export type AssigneesResult = { ok: true; items: Assignee[] } | { ok: false; message: string };
export type LogTouchFormInput = {
  leadId: string;
  /** call | email | dm | meeting | other */
  kind: string;
  /** "" = none */
  outcome: string;
  /** "" = none */
  note: string;
  /** Toronto local "YYYY-MM-DDTHH:mm"; "" = now. */
  at: string;
  /** Absent = leave the follow-up alone; "" = clear; else Toronto local. */
  followUpAt?: string;
  /** crypto.randomUUID() per intent; a new one after every success. */
  idempotencyKey: string;
};

/* ------------------------------------------------------------------ */
/* Copy shared by every task                                           */
/* ------------------------------------------------------------------ */

export const COPY = {
  loadFailed: "Could not load this just now. Nothing is lost: try again in a moment.",
  network: "Could not reach the server. Check your connection.",
  generic: "Something went wrong. Try again.",
  forbidden: "Your role cannot do that.",
  notFound: "That lead no longer exists.",
  staleList: "That list changed. Refresh to see the latest.",
  notSet: "Not set",
} as const;

/* ------------------------------------------------------------------ */
/* When a server action call throws                                    */
/* ------------------------------------------------------------------ */

/** An object with a boolean `ok` (what every action resolves to). */
export function isResult(value: unknown): value is { ok: boolean } {
  return !!value && typeof value === "object" && typeof (value as { ok?: unknown }).ok === "boolean";
}

export type CallFailure = { code: "network" | "reload"; message: string };

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Offline: the network copy (Retry). Online: the generic copy, and the UI adds
 * "Reload" (an action removed by a new deploy, or a redirect after the session
 * ended, only heals with a reload).
 */
export function callFailure(): CallFailure {
  return isOffline() ? { code: "network", message: COPY.network } : { code: "reload", message: COPY.generic };
}

/* ------------------------------------------------------------------ */
/* Cross-component hooks (plain strings, no React)                     */
/* ------------------------------------------------------------------ */

export const LOG_OUTREACH_EVENT = "tekmadev:log-outreach";
export type LogOutreachRequest = { kind: TouchKind; note?: string };

/** Ask the lead page's "Log outreach" form to open with this kind (and note). */
export function requestLogOutreach(req: LogOutreachRequest): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LOG_OUTREACH_EVENT, { detail: req }));
}

/** sessionStorage: the last /admin/leads URL with its query. */
export const LAST_LIST_KEY = "tekmadev:leads-last-list";

/* ------------------------------------------------------------------ */
/* Pending "Log this call"                                             */
/* ------------------------------------------------------------------ */

export type ContactKind = "call" | "text" | "email";
/** name = firstName(lead) */
export type PendingLog = { leadId: string; name: string; kind: ContactKind; at: number };

/** localStorage, one record (the latest contact wins). */
export const PENDING_LOG_KEY = "tekmadev:pending-log";
export const PENDING_LOG_TTL_MS = 2 * 60 * 60 * 1000;
/** Dispatched on window by savePendingLog and clearPendingLog, so a mounted banner or prompt updates at once. */
export const PENDING_LOG_EVENT = "tekmadev:pending-log";

export function isContactKind(v: unknown): v is ContactKind {
  return v === "call" || v === "text" || v === "email";
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function announcePendingLog(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(PENDING_LOG_EVENT));
  } catch {
    // An old browser without the Event constructor: the banner re-reads on its next mount.
  }
}

/** Remember the contact so "Log this call" survives the trip to Phone, Messages or Mail (and an app relaunch). */
export function savePendingLog(p: PendingLog): void {
  if (typeof window === "undefined") return;
  try {
    storage()?.setItem(PENDING_LOG_KEY, JSON.stringify(p));
  } catch {
    // Private mode or full storage: the prompt still shows on this page.
  }
  announcePendingLog();
}

/** The pending record, or null when missing, malformed, older than 2 hours (removed), or storage throws. */
export function readPendingLog(nowMs: number): PendingLog | null {
  if (typeof window === "undefined") return null;
  try {
    const store = storage();
    const raw = store?.getItem(PENDING_LOG_KEY);
    if (!store || !raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const p = parsed as Partial<PendingLog> | null;
    if (
      !p ||
      typeof p !== "object" ||
      typeof p.leadId !== "string" ||
      !p.leadId ||
      typeof p.name !== "string" ||
      !isContactKind(p.kind) ||
      typeof p.at !== "number" ||
      !Number.isFinite(p.at)
    ) {
      return null;
    }
    if (nowMs - p.at > PENDING_LOG_TTL_MS || p.at > nowMs + 60_000) {
      try {
        store.removeItem(PENDING_LOG_KEY);
      } catch {
        // Nothing more to do.
      }
      return null;
    }
    return { leadId: p.leadId, name: p.name, kind: p.kind, at: p.at };
  } catch {
    return null;
  }
}

/** Forget the pending record (only when it belongs to `leadId`, if given). */
export function clearPendingLog(leadId?: string): void {
  if (typeof window === "undefined") return;
  try {
    const store = storage();
    if (store) {
      if (leadId === undefined) store.removeItem(PENDING_LOG_KEY);
      else {
        const raw = store.getItem(PENDING_LOG_KEY);
        let owner: unknown = null;
        try {
          owner = raw ? (JSON.parse(raw) as { leadId?: unknown } | null)?.leadId : null;
        } catch {
          owner = null;
        }
        // A malformed record belongs to nobody: drop it too.
        if (raw && (owner === leadId || typeof owner !== "string")) store.removeItem(PENDING_LOG_KEY);
      }
    }
  } catch {
    // Storage blocked: nothing stored to clear.
  }
  announcePendingLog();
}

/** "/admin/leads/<id>?log=call": the lead with Log outreach open. */
export function pendingLogHref(p: Pick<PendingLog, "leadId" | "kind">): string {
  return `/admin/leads/${encodeURIComponent(p.leadId)}?log=${p.kind}`;
}

const PROMPTS: Record<ContactKind, { verb: string; action: string }> = {
  call: { verb: "Called", action: "Log this call" },
  email: { verb: "Emailed", action: "Log this email" },
  text: { verb: "Texted", action: "Log this text" },
};

/** "Called Olivia? Log it while it is fresh." with "Log this call" (the app's words). */
export function pendingLogPrompt(p: Pick<PendingLog, "name" | "kind">): { text: string; action: string } {
  const prompt = PROMPTS[p.kind] ?? PROMPTS.call;
  return { text: `${prompt.verb} ${p.name}? Log it while it is fresh.`, action: prompt.action };
}

/** What Log outreach opens with: a text message is logged as a DM, with a note that says so. */
export function logRequestFor(kind: ContactKind): LogOutreachRequest {
  if (kind === "text") return { kind: "dm", note: "By text message." };
  return { kind: kind === "email" ? "email" : "call" };
}
