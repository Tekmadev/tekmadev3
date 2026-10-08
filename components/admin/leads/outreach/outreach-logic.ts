import {
  LEAD_STATUS_OPTIONS,
  TOUCH_KIND_OPTIONS,
  callFailure,
  formatFieldDateTime,
  instantToTorontoLocal,
  isMe,
  staffName,
  statusChoiceBlock,
  timeRangeError,
  torontoLocalToInstant,
} from "@/lib/leads-ui";
import type { Lead, LeadActionResult, LeadStatus, LogTouchFormInput, StaffRef, TouchKind } from "@/lib/leads-ui";

/**
 * Plain rules behind the lead page's Outreach section (no React, so the
 * leadsoutreachtest harness runs them in node): which statuses can be picked,
 * the "Assigned to" choices, the follow-up editor's quick dates and summary
 * line, the Log outreach body, and what a failed server action call becomes.
 * The words are the mobile app's (src/modules/leads). The server still decides
 * every rule; these only keep the buttons honest.
 */

/** Shown under Booked when picking it books the call by hand (and gives the booking credit). */
export const BOOKED_BY_HAND_HINT = "Booked by phone, DM or email";

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export type StatusOption = { value: LeadStatus; label: string; disabled: boolean; hint: string | null };

/**
 * Every status in the app's order (New, Booked, Contacted, Qualified, Won,
 * Lost, Cancelled). Cancelled never can be picked, and Booked cannot on a lead
 * the booking calendar owns unless it already shows booked. Booked by hand
 * says how ("Booked by phone, DM or email"), like the app, while the lead does
 * not show booked yet.
 */
export function statusOptions(lead: Pick<Lead, "status" | "source" | "bookingAt">): StatusOption[] {
  return LEAD_STATUS_OPTIONS.map((o) => {
    const blocked = statusChoiceBlock(lead, o.value);
    if (blocked) return { value: o.value, label: o.label, disabled: true, hint: blocked };
    const hint = o.value === "booked" && lead.status !== "booked" ? BOOKED_BY_HAND_HINT : null;
    return { value: o.value, label: o.label, disabled: false, hint };
  });
}

/* ------------------------------------------------------------------ */
/* Assigned to                                                         */
/* ------------------------------------------------------------------ */

/** value "" = Nobody */
export type AssigneeOption = { value: string; label: string; hint: string | null };

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * "Nobody" first, then the team as the server sorted it. Someone who left the
 * team still shows as the current owner, first among people. Each hint says
 * "You" and, when a name is shown, the email ("You · maya@tekmadev.com").
 */
export function assigneeOptions(items: readonly StaffRef[], current: StaffRef | null, myEmail: string): AssigneeOption[] {
  const people: StaffRef[] = [...items];
  if (current && !people.some((p) => sameEmail(p.email, current.email))) people.unshift(current);
  return [
    { value: "", label: "Nobody", hint: "Anyone on the team can pick it up" },
    ...people.map((p) => {
      const hint = [isMe(p, myEmail) ? "You" : null, p.name?.trim() ? p.email : null].filter(Boolean).join(" · ");
      return { value: p.email, label: staffName(p), hint: hint || null };
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* Follow-up                                                           */
/* ------------------------------------------------------------------ */

const TIME_RE = /^\d{2}:\d{2}$/;

/** A quick date chip keeps the draft's time ("2026-10-09T14:30"), else 9:00 AM. */
export function followUpChipDraft(presetDate: string, draft: string): string {
  const time = typeof draft === "string" ? draft.slice(11, 16) : "";
  return `${presetDate}T${TIME_RE.test(time) ? time : "09:00"}`;
}

export type FollowUpSummary =
  | { kind: "incomplete"; text: "Pick a date and time." }
  | { kind: "error"; text: string }
  | { kind: "ok"; text: string };

export const FOLLOW_UP_INCOMPLETE = "Pick a date and time." as const;
export const TORONTO_NOTE = " Toronto time, whatever zone this phone is in.";

/**
 * The line under the follow-up picker. Never throws, whatever the field holds:
 * its Clear button empties the draft and iOS can send a partial value.
 */
export function followUpSummary(draft: string, openedAt: number): FollowUpSummary {
  try {
    const instant = typeof draft === "string" ? torontoLocalToInstant(draft) : null;
    if (!instant) return { kind: "incomplete", text: FOLLOW_UP_INCOMPLETE };
    const error = timeRangeError(draft, instantToTorontoLocal(openedAt), null, openedAt);
    if (error) return { kind: "error", text: error };
    return { kind: "ok", text: `${formatFieldDateTime(instant, openedAt)}${TORONTO_NOTE}` };
  } catch {
    return { kind: "incomplete", text: FOLLOW_UP_INCOMPLETE };
  }
}

/** A Toronto local value as "YYYY-MM-DDTHH:mm" when it is a complete time (iOS can add seconds), else as given. */
export function normalizeLocal(value: string): string {
  return torontoLocalToInstant(value) ? value.trim().slice(0, 16) : value;
}

/* ------------------------------------------------------------------ */
/* Log outreach                                                        */
/* ------------------------------------------------------------------ */

export type LogDraft = { kind: TouchKind; outcome: string; note: string; at: string; followUpAt: string };

export const TOUCH_KINDS: readonly TouchKind[] = TOUCH_KIND_OPTIONS.map((o) => o.value);

export function isTouchKind(v: unknown): v is TouchKind {
  return typeof v === "string" && (TOUCH_KINDS as readonly string[]).includes(v);
}

/** The form a fresh Log outreach opens with ("Next follow-up" starts at the lead's own). */
export function emptyLogDraft(kind: TouchKind, startFollowUp: string, note = ""): LogDraft {
  return { kind, outcome: "", note, at: "", followUpAt: startFollowUp };
}

/**
 * The action's body. Outcome, note and when go as typed (the server trims, and
 * "" means none or now). The follow-up goes only when it changed ("" clears
 * it), so logging a call never moves a follow-up nobody touched. Never a
 * status: the server moves a new lead to contacted for a call, email, DM or
 * meeting, like the app.
 */
export function logTouchInputFrom(draft: LogDraft, lead: Pick<Lead, "id">, startFollowUp: string, key: string): LogTouchFormInput {
  const input: LogTouchFormInput = {
    leadId: lead.id,
    kind: draft.kind,
    outcome: draft.outcome,
    note: draft.note,
    at: draft.at,
    idempotencyKey: key,
  };
  if (normalizeLocal(draft.followUpAt) !== normalizeLocal(startFollowUp)) input.followUpAt = draft.followUpAt;
  return input;
}

/** One key per intent: crypto.randomUUID(), else a v4 UUID from crypto.getRandomValues. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* ------------------------------------------------------------------ */
/* Failed calls                                                        */
/* ------------------------------------------------------------------ */

/**
 * What a server action call that threw, or resolved to something that is not
 * a result, becomes: offline the network copy (Retry), online the generic copy
 * with "Reload" (an action a new deploy removed, or a redirect after the
 * session ended, only heals with a reload).
 */
export function actionFailure(): LeadActionResult {
  return { ok: false, ...callFailure() };
}
