import { instant } from "../data";

/**
 * The booked call on a lead (`Lead.booking`, docs/admin-api/outreach.md
 * section 1, "The booking"), read from the Cal.com event the webhook keeps in
 * `leads.raw` (app/api/webhooks/cal/route.ts keeps the newest event:
 * `{ triggerEvent, createdAt, payload }`, payload version 2021-10-20). Only
 * `raw->>triggerEvent` and `raw->payload` are selected (LEAD_BASE_COLUMNS).
 *
 * Nothing here trusts raw: Cal.com leaves fields out, sends another type, and
 * a stored booking (MEETING_ENDED) carries bare response values instead of
 * `{ label, value }`. Every field falls back to null (or empty), the booking
 * columns (booking_start, booking_end, event_type, booking_uid) fill in what
 * raw lacks, and nothing throws. A lead has a booking when it has a start.
 */

export const BOOKING_STATUSES = ["booked", "cancelled", "past"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_HOW_KINDS = ["video", "phone", "in_person", "link", "other"] as const;
export type BookingHowKind = (typeof BOOKING_HOW_KINDS)[number];

/** How the call happens: the kind, a label to show, and the phone number, the address, or a link that is not the join link, when there is one. */
export type BookingHow = { kind: BookingHowKind; label: string; detail: string | null };

/** One booking form answer the lead gave (a custom question, or a Cal field with no key of its own). */
export type BookingAnswer = { key: string; label: string; value: string };

export type Booking = {
  /** "past" once the end (else the start) is before now and it was not cancelled. */
  status: BookingStatus;
  /** ISO instants (UTC). `end` is null only when neither an end nor a length is known. */
  start: string;
  end: string | null;
  durationMinutes: number | null;
  title: string | null;
  /** The Cal.com event type slug. */
  eventType: string | null;
  /** The booker's IANA time zone, else null. */
  timeZone: string | null;
  how: BookingHow;
  /** An https link to join the call that the booker could not have set (see joinUrlOf), else null. */
  joinUrl: string | null;
  answers: BookingAnswer[];
  notes: string | null;
  /** Guest emails (lowercased), never the booker's own. */
  guests: string[];
  cancellationReason: string | null;
  rescheduleReason: string | null;
  /** The previous start (ISO) when the last event was a reschedule, else null. */
  rescheduledFrom: string | null;
  /** The Cal.com booking page, where the booking is moved or cancelled. */
  manageUrl: string | null;
};

/** What a booking is read from: the booking columns and the two raw paths LEAD_BASE_COLUMNS selects. */
export type BookingSource = {
  /** The stored status, as written (not folded). */
  status: string | null;
  booking_start: string | null;
  booking_end?: string | null;
  booking_uid: string | null;
  event_type?: string | null;
  /** raw->>triggerEvent */
  cal_trigger?: string | null;
  /** raw->payload (any JSON, or null). */
  cal_payload?: unknown;
};

/** The Cal.com booking pages when the payload names no bookerUrl. */
export const CAL_BOOKER_URL = "https://cal.com";

/** Copy for `how.label`. The app shows these as sent. */
export const HOW_LABELS = {
  video: "Video call",
  phone: "Phone call",
  inPerson: "In person",
  link: "Meeting link",
  other: "Other",
  none: "Not set",
} as const;

/* ------------------------------------------------------------------ */
/* Reading odd JSON                                                    */
/* ------------------------------------------------------------------ */

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);

/** Trimmed text (inner line breaks kept), or null for anything else or an all-blank string. */
const text = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
};

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** An ISO instant in UTC (see instant()), or null for anything that is not a valid timestamp. */
function isoInstant(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 64) return null;
  const out = instant(v);
  return out && ISO_UTC.test(out) && !Number.isNaN(Date.parse(out)) ? out : null;
}

/** A length in whole minutes: a positive number (or numeric string) up to a week, else null. */
function minutes(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) return null;
  const whole = Math.round(n);
  return whole > 0 && whole <= 7 * 24 * 60 ? whole : null;
}

/** An https URL (normalized), else null. */
function httpsUrl(v: unknown): string | null {
  const t = text(v);
  if (!t || t.length > 2048 || !/^https:\/\//i.test(t)) return null;
  try {
    const url = new URL(t);
    return url.protocol === "https:" && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

/** An http(s) URL, else null (to tell a link location from an address). */
function anyUrl(v: string): URL | null {
  if (!/^https?:\/\//i.test(v)) return null;
  try {
    return new URL(v);
  } catch {
    return null;
  }
}

/** A phone number as given: 7 to 15 digits with a little punctuation, else null. */
function phoneLike(v: unknown): string | null {
  const t = text(v);
  if (!t || !/^\+?[\d\s().-]{7,24}$/.test(t)) return null;
  const digits = t.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15 ? t : null;
}

/** An IANA zone name the runtime knows ("America/Toronto", "UTC"), else null. */
function ianaZone(v: unknown): string | null {
  const z = text(v);
  if (!z || z.length > 64 || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(z)) return null;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: z });
    return z;
  } catch {
    return null;
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A key ("budgetRange", "budget_range", "budget-range") as sentence case words ("Budget range"). */
function words(key: string): string {
  const out = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : key;
}

/**
 * An answer's label: the question as the organizer typed it, but Cal's own
 * fields carry an i18n key ("phone_number", "location") there, which reads
 * as words; with no label, the response key as words.
 */
function labelFor(label: string | null, key: string): string {
  if (label) return /^[a-z0-9]+(_[a-z0-9]+)*$/.test(label) ? words(label) : label;
  return words(key);
}

/**
 * An answer as one line of text: text trimmed, numbers as typed, yes/no for a
 * checkbox, a list joined with ", ", a choice with its own input
 * ({ value, optionValue }) as both. Anything else (or empty) is null.
 */
function answerText(v: unknown, nested = false): string | null {
  if (typeof v === "string") return text(v);
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (nested) return null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => answerText(x, true)).filter((x): x is string => !!x);
    return parts.length ? parts.join(", ") : null;
  }
  const o = obj(v);
  if (!o) return null;
  const parts = [answerText(o.value, true), answerText(o.optionValue, true)].filter((x): x is string => !!x);
  return parts.length ? parts.join(", ") : null;
}

type Response = { key: string; label: string | null; value: unknown; hidden: boolean };

/**
 * The booking form responses in form order. A webhook sends each as
 * `{ label, value, isHidden }`; a stored booking sends the bare value (a
 * location is then `{ value, optionValue }`, told apart by having no label).
 */
function responsesOf(p: Obj): Response[] {
  const all = obj(p.responses);
  if (!all) return [];
  return Object.entries(all).map(([key, v]) => {
    const o = obj(v);
    if (o && "value" in o && ("label" in o || "isHidden" in o)) {
      return { key, label: text(o.label), value: o.value, hidden: o.isHidden === true };
    }
    return { key, label: null, value: v, hidden: false };
  });
}

/* ------------------------------------------------------------------ */
/* How the call happens                                                */
/* ------------------------------------------------------------------ */

/** Video apps by a Cal location type ("integrations:google:meet") or videoCallData.type ("google_meet_video"). */
const VIDEO_APPS: [RegExp, string][] = [
  [/google[:_-]?meet|googlemeet/i, "Google Meet"],
  [/zoom/i, "Zoom"],
  [/daily|cal[:_-]?video/i, "Cal Video"],
  [/office365|msteams|teams/i, "Microsoft Teams"],
  [/whereby/i, "Whereby"],
  [/jitsi/i, "Jitsi"],
  [/webex/i, "Webex"],
];

const videoApp = (v: string | null): string | null => (v ? (VIDEO_APPS.find(([re]) => re.test(v))?.[1] ?? null) : null);

/** Video apps by the host of a join link. */
function videoAppForUrl(url: URL | null): string | null {
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const on = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (on("meet.google.com")) return "Google Meet";
  if (on("zoom.us") || on("zoom.com")) return "Zoom";
  if (on("cal.video") || on("daily.co") || ((on("cal.com") || on("app.cal.com")) && url.pathname.startsWith("/video/"))) return "Cal Video";
  if (on("teams.microsoft.com") || on("teams.live.com")) return "Microsoft Teams";
  if (on("whereby.com")) return "Whereby";
  if (on("meet.jit.si")) return "Jitsi";
  if (on("webex.com")) return "Webex";
  return null;
}

/** Cal.com location types (not values): what the booker picked. */
const PHONE_TYPES = new Set(["phone", "userphone", "attendeephone"]);
const IN_PERSON_TYPES = new Set(["attendeeinperson", "inperson"]);
const OTHER_TYPES = new Set(["somewhereelse"]);
const isLocationType = (v: string) => {
  const t = v.toLowerCase();
  return t.startsWith("integrations:") || t === "link" || t === "conferencing" || PHONE_TYPES.has(t) || IN_PERSON_TYPES.has(t) || OTHER_TYPES.has(t);
};
/** A type whose link the organizer or Cal.com set: a video app, a fixed link, conferencing. */
const isOrganizerLinkType = (v: string) => {
  const t = v.toLowerCase();
  return t.startsWith("integrations:") || t === "link" || t === "conferencing";
};
/** A type whose value can be whatever the booker typed (or none at all): a phone, an address, somewhere else. */
const isBookerTextType = (v: string) => {
  const t = v.toLowerCase();
  return PHONE_TYPES.has(t) || IN_PERSON_TYPES.has(t) || OTHER_TYPES.has(t);
};

/**
 * The link to join, https only, from what the booker cannot set:
 *
 *  1. videoCallData.url, which only Cal's video apps write.
 *  2. payload.location, when the type picked is the organizer's (a video
 *     app, a link, conferencing): Cal.com puts its own meeting link there.
 *     With no type picked, only a link on a known video app's host.
 *  3. metadata.videoCallUrl, only with no videoCallData link, on a known video
 *     app's host, and never for a phone, in person or somewhere else type:
 *     whoever books can put any metadata key in the booking page link, and
 *     Cal.com lets theirs replace its own.
 *
 * Anything else (a link the booker typed, any other host) is never Join.
 */
function joinUrlOf(input: { type: string | null; location: string | null; metadataUrl: unknown; videoCallUrl: unknown }): string | null {
  const fromCall = httpsUrl(input.videoCallUrl);
  if (fromCall) return fromCall;
  const fromLocation = httpsUrl(input.location);
  if (fromLocation && (input.type ? isOrganizerLinkType(input.type) : !!videoAppForUrl(new URL(fromLocation)))) return fromLocation;
  const fromMetadata = httpsUrl(input.metadataUrl);
  if (fromMetadata && !(input.type && isBookerTextType(input.type)) && videoAppForUrl(new URL(fromMetadata))) return fromMetadata;
  return null;
}

type HowInput = {
  /** responses.location.value: the type the booker picked. */
  type: string | null;
  /** responses.location.optionValue: their phone number or address for that type. */
  option: string | null;
  /** payload.location: a type, a phone number, an address or a URL. */
  location: string | null;
  /** videoCallData.type ("daily_video"). */
  videoType: string | null;
  /** The join link, when there is one. */
  joinUrl: string | null;
  /** The booker's phone from attendees, the last resort for a phone call. */
  attendeePhone: string | null;
};

function videoHow(input: HowInput, type: string | null): BookingHow {
  const label = videoApp(type) ?? videoApp(input.videoType) ?? videoAppForUrl(input.joinUrl ? anyUrl(input.joinUrl) : null) ?? HOW_LABELS.video;
  return { kind: "video", label, detail: null };
}

/** The how for a Cal location type, or null for a type this does not know. */
function howForType(input: HowInput, type: string, value: string | null): BookingHow | null {
  const t = type.toLowerCase();
  if (t.startsWith("integrations:") || t === "conferencing") return videoHow(input, type);
  if (PHONE_TYPES.has(t)) {
    return { kind: "phone", label: HOW_LABELS.phone, detail: phoneLike(input.option) ?? phoneLike(value) ?? phoneLike(input.attendeePhone) };
  }
  if (IN_PERSON_TYPES.has(t)) {
    return { kind: "in_person", label: HOW_LABELS.inPerson, detail: input.option ?? (value && !anyUrl(value) ? value : null) };
  }
  if (t === "link") {
    const app = videoAppForUrl(value ? anyUrl(value) : null);
    return app ? { kind: "video", label: app, detail: null } : { kind: "link", label: HOW_LABELS.link, detail: null };
  }
  if (OTHER_TYPES.has(t)) return { kind: "other", label: HOW_LABELS.other, detail: input.option ?? value };
  return null;
}

/** The how for a location value: a link (a known video app by its host), a phone number, else an address. */
function howForValue(value: string | null): BookingHow | null {
  if (!value) return null;
  const url = anyUrl(value);
  if (url) {
    const app = videoAppForUrl(url);
    return app ? { kind: "video", label: app, detail: null } : { kind: "link", label: HOW_LABELS.link, detail: null };
  }
  const phone = phoneLike(value);
  if (phone) return { kind: "phone", label: HOW_LABELS.phone, detail: phone };
  return { kind: "in_person", label: HOW_LABELS.inPerson, detail: value };
}

/**
 * How the call happens: the type the booker picked (responses.location),
 * else payload.location read as a type or as a value, else the video call
 * Cal.com made, else "Not set".
 */
function howOf(input: HowInput): BookingHow {
  const locationIsType = !!input.location && isLocationType(input.location);
  // A location that is a value (not a type) is the detail itself.
  const value = locationIsType ? null : input.location;
  const types = [input.type, locationIsType ? input.location : null].filter((t): t is string => !!t);
  for (const type of types) {
    const how = howForType(input, type, value);
    if (how) return how;
  }
  const fromValue = howForValue(value);
  if (fromValue) return fromValue;
  if (input.joinUrl || input.videoType) return videoHow(input, null);
  return { kind: "other", label: HOW_LABELS.none, detail: null };
}

/* ------------------------------------------------------------------ */
/* The booking                                                         */
/* ------------------------------------------------------------------ */

/**
 * Response keys with a booking field of their own (or the lead's own name and
 * email): never in `answers`. Cal.com's built-in questions arrive with code
 * labels ("phone_number", "what_is_this_meeting_about"; a real booking
 * 2026-10-20): labelFor turns them into words, and an unanswered one is
 * hidden, so it is skipped.
 */
const OWN_KEYS = new Set(["name", "email", "location", "notes", "guests", "rescheduleReason"]);

/** Stored statuses that mean the booking was called off (they fold to "cancelled" in shape.ts). */
const CANCELLED_STORED = new Set(["cancelled", "booking_rejected"]);

/** `<bookerUrl>/booking/<uid>`, bookerUrl only when it is https (else cal.com). */
function manageUrlFor(bookerUrl: unknown, uid: string | null): string | null {
  if (!uid) return null;
  const base = httpsUrl(bookerUrl);
  let root = CAL_BOOKER_URL;
  if (base) {
    const url = new URL(base);
    root = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  }
  return `${root}/booking/${encodeURIComponent(uid)}`;
}

/**
 * The lead's booking, or null when it has none (no start in the columns or
 * in raw). `now` (ms) decides "past"; it defaults to the current time.
 */
export function toBooking(row: BookingSource, now: number = Date.now()): Booking | null {
  const p = obj(row.cal_payload) ?? {};

  const start = isoInstant(row.booking_start) ?? isoInstant(p.startTime);
  if (!start) return null;
  const startMs = Date.parse(start);

  const length = minutes(p.length);
  let end = isoInstant(row.booking_end) ?? isoInstant(p.endTime);
  if (end && Date.parse(end) < startMs) end = null;
  if (!end && length) end = new Date(startMs + length * 60_000).toISOString().replace(".000Z", "Z");
  const durationMinutes = length ?? (end ? minutes((Date.parse(end) - startMs) / 60_000) : null);

  const trigger = (text(row.cal_trigger) ?? "").toUpperCase();
  const stored = (row.status ?? "").trim().toLowerCase();
  const calStatus = (text(p.status) ?? "").toUpperCase();
  const cancelled =
    trigger === "BOOKING_CANCELLED" ||
    trigger === "BOOKING_REJECTED" ||
    calStatus === "CANCELLED" ||
    calStatus === "REJECTED" ||
    CANCELLED_STORED.has(stored);
  const status: BookingStatus = cancelled ? "cancelled" : Date.parse(end ?? start) < now ? "past" : "booked";

  const responses = responsesOf(p);
  const response = (key: string) => responses.find((r) => r.key === key);

  const attendees = (Array.isArray(p.attendees) ? p.attendees : []).map(obj).filter((a): a is Obj => !!a);
  const booker = attendees[0] ?? null;
  const bookerEmail = text(booker?.email)?.toLowerCase() ?? text(response("email")?.value)?.toLowerCase() ?? null;

  const metadata = obj(p.metadata);
  const videoCallData = obj(p.videoCallData);
  const location = text(p.location);

  const pick = obj(response("location")?.value);
  const pickedType = text(pick?.value) ?? text(response("location")?.value);
  const joinUrl = joinUrlOf({
    // The type picked, else payload.location when it names a type.
    type: pickedType ?? (location && isLocationType(location) ? location : null),
    location,
    metadataUrl: metadata?.videoCallUrl,
    videoCallUrl: videoCallData?.url,
  });
  let how = howOf({
    type: pickedType,
    option: text(pick?.optionValue),
    location,
    videoType: text(videoCallData?.type),
    joinUrl,
    attendeePhone: text(booker?.phoneNumber) ?? text(response("attendeePhoneNumber")?.value),
  });
  // A link that is not Join still shows, as text to copy.
  if (how.kind === "link" && !how.detail && !joinUrl && location && anyUrl(location)) how = { ...how, detail: location };

  const answers: BookingAnswer[] = [];
  for (const r of responses) {
    if (r.hidden || OWN_KEYS.has(r.key)) continue;
    const value = answerText(r.value);
    if (value) answers.push({ key: r.key, label: labelFor(r.label, r.key), value });
  }

  const guestList = response("guests");
  const guestSource = Array.isArray(guestList?.value) ? (guestList.value as unknown[]) : attendees.slice(1).map((a) => a.email);
  const guests: string[] = [];
  for (const g of guestSource) {
    const email = text(g)?.toLowerCase();
    if (email && EMAIL.test(email) && email !== bookerEmail && !guests.includes(email)) guests.push(email);
  }

  const rescheduled = trigger === "BOOKING_RESCHEDULED" || (!trigger && stored === "rescheduled");

  return {
    status,
    start,
    end,
    durationMinutes,
    title: text(p.title) ?? text(p.eventTitle),
    eventType: text(p.type) ?? text(row.event_type),
    timeZone: ianaZone(booker?.timeZone),
    how,
    joinUrl,
    answers,
    // Never payload.description: Cal.com copies the event type's description there.
    notes: text(response("notes")?.value) ?? text(p.additionalNotes),
    guests,
    cancellationReason: cancelled ? (text(p.cancellationReason) ?? text(p.rejectionReason)) : null,
    rescheduleReason: text(response("rescheduleReason")?.value) ?? text(p.rescheduleReason),
    rescheduledFrom: rescheduled ? isoInstant(p.rescheduleStartTime) : null,
    manageUrl: manageUrlFor(p.bookerUrl, text(p.uid) ?? text(row.booking_uid)),
  };
}
