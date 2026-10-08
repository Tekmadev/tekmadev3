"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, MessageSquare, MoreHorizontal, Phone, Users, type LucideIcon } from "lucide-react";
import { btnGhost, btnPrimary } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import {
  TOUCH_KIND_OPTIONS,
  clearPendingLog,
  fieldCls,
  instantToTorontoLocal,
  leadTitle,
  timeRangeError,
  torontoLocalToInstant,
  type Lead,
  type TouchKind,
} from "@/lib/leads-ui";
import { logLeadTouchAction } from "@/app/admin/(dashboard)/leads/actions";
import { ActionAlert } from "./ActionAlert";
import { DateTimeField } from "./DateTimeField";
import { chipCls, chipKeyDown } from "./editor-parts";
import { emptyLogDraft, logTouchInputFrom, newIdempotencyKey, type LogDraft } from "./outreach-logic";
import { useLeadAction, type FailedResult } from "./use-lead-action";

/** A way of opening the form: the kind, an optional note, and a counter so the same request twice still counts. */
export type LogRequest = { kind: TouchKind; note?: string; seq: number };

const KIND_ICONS: Record<TouchKind, LucideIcon> = { call: Phone, email: Mail, dm: MessageSquare, meeting: Users, other: MoreHorizontal };
const KIND_VALUES: readonly TouchKind[] = TOUCH_KIND_OPTIONS.map((o) => o.value);
const FIELD_KEYS = ["kind", "outcome", "note", "at", "followUpAt"] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

const YEAR_MS = 365 * 86_400_000;
/** The server's words for a time it cannot read (lib/admin-api/leads/input.ts). */
const AT_INVALID = "Enter a valid time for the touch.";

/**
 * "Log outreach" (the app's sheet, in place under its button): the kind, the
 * outcome in a few words, a note, when it happened (empty: now) and the next
 * follow-up, which starts at the lead's own and is sent only when changed.
 * The server decides what the touch does to the status (a new lead becomes
 * contacted for a call, email, DM or meeting) and checks the role again.
 *
 * One idempotency key per intent: a double tap or a retry with the same
 * details logs once, and a new key after every success keeps the next real
 * touch from being swallowed as a replay. A failed try keeps everything
 * typed. While it holds typed text or a changed follow-up the form says so
 * (`data-unsaved`), so the shell never reloads it away, and Cancel asks first.
 */
export function LogTouchForm({
  lead,
  request,
  onLogged,
  onCancel,
}: {
  lead: Lead;
  request: LogRequest;
  onLogged: (message: string) => void;
  onCancel: () => void;
}) {
  // The clock is read once, when the form opens: a touch is at most a year back and never ahead.
  const [openedAt] = useState(() => Date.now());
  const [startFollowUp] = useState(() => (lead.followUpAt ? instantToTorontoLocal(lead.followUpAt) : ""));
  const [draft, setDraft] = useState<LogDraft>(() => emptyLogDraft(request.kind, startFollowUp, request.note ?? ""));
  // The note the form was opened with ("By text message."): not typed, so not unsaved.
  const [baseNote, setBaseNote] = useState(request.note ?? "");
  const [appliedSeq, setAppliedSeq] = useState(request.seq);
  const [key, setKey] = useState(newIdempotencyKey);
  const [failure, setFailure] = useState<FailedResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [pressed, setPressed] = useState<"log" | "retry" | null>(null);
  const { pending, run } = useLeadAction();

  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Asked again while open (the dock, the "Log this call" prompt): that kind, and its note when none is typed.
  if (request.seq !== appliedSeq) {
    setAppliedSeq(request.seq);
    const fillNote = !draft.note.trim() && request.note !== undefined;
    setDraft({ ...draft, kind: request.kind, note: fillNote ? (request.note ?? "") : draft.note });
    if (fillNote) setBaseNote(request.note ?? "");
  }

  // Every opening scrolls the form into view and moves focus to its heading, never to a text
  // field (that would pop the iOS keyboard over the form).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      formRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      headingRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [request.seq]);

  const atMin = instantToTorontoLocal(openedAt - YEAR_MS);
  const atMax = instantToTorontoLocal(openedAt);
  const atCheck = !draft.at ? null : !torontoLocalToInstant(draft.at) ? AT_INVALID : timeRangeError(draft.at, atMin, atMax, openedAt);
  const unsaved = draft.outcome !== "" || draft.note !== baseNote || draft.at !== "" || draft.followUpAt !== startFollowUp;
  const knownFieldError = FIELD_KEYS.some((k) => !!fieldErrors[k]);

  const set = <K extends keyof LogDraft>(name: K, value: LogDraft[K]) => {
    setDraft((d) => ({ ...d, [name]: value }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const send = async (button: "log" | "retry") => {
    if (pending) return;
    if (atCheck) {
      // Not sent: say why, out loud, under the field.
      setFieldErrors((f) => ({ ...f, at: atCheck }));
      return;
    }
    const input = logTouchInputFrom(draft, lead, startFollowUp, key);
    setPressed(button);
    setFailure(null);
    setFieldErrors({});
    const result = await run(() => logLeadTouchAction(input));
    if (result.ok) {
      // The "Log this call" reminder for this lead is done, here and on the list.
      clearPendingLog(lead.id);
      setKey(newIdempotencyKey());
      onLogged(result.message);
      return;
    }
    setFailure(result);
    const fields: Partial<Record<FieldKey, string>> = {};
    for (const k of FIELD_KEYS) if (result.fields?.[k]) fields[k] = result.fields[k];
    setFieldErrors(fields);
  };

  const cancel = () => {
    if (unsaved && !window.confirm("Discard this outreach?")) return;
    onCancel();
  };

  const describe = (name: FieldKey, helpId?: string) => {
    const ids = [fieldErrors[name] ? `log-${name}-error` : null, helpId ?? null].filter(Boolean).join(" ");
    return { "aria-invalid": fieldErrors[name] ? true : undefined, "aria-describedby": ids || undefined };
  };

  const serverError = (name: FieldKey) =>
    fieldErrors[name] ? (
      <p id={`log-${name}-error`} role="alert" className="text-sm text-signal">
        {fieldErrors[name]}
      </p>
    ) : null;

  return (
    <form
      id="log-outreach"
      ref={formRef}
      noValidate
      data-unsaved={unsaved ? "true" : undefined}
      aria-labelledby="log-outreach-title"
      onSubmit={(e) => {
        e.preventDefault();
        void send("log");
      }}
      className="flex scroll-mt-20 flex-col gap-5 sm:rounded-xl sm:border sm:border-line-strong sm:bg-bg-2 sm:p-5"
    >
      <div className="min-w-0">
        <h3 id="log-outreach-title" ref={headingRef} tabIndex={-1} className="text-base font-semibold text-ink focus:outline-none">
          Log outreach
        </h3>
        <p className="mt-0.5 break-words text-sm text-ink-3">{leadTitle(lead)}</p>
      </div>

      {failure && !knownFieldError ? (
        <ActionAlert failure={failure} onRetry={() => void send("retry")} pending={pending} retrying={pressed === "retry"} />
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span id="log-kind-label" className="text-sm font-medium text-ink">
          Kind
        </span>
        <div role="radiogroup" aria-labelledby="log-kind-label" {...describe("kind")} className="flex flex-wrap gap-2">
          {TOUCH_KIND_OPTIONS.map((o) => {
            const Icon = KIND_ICONS[o.value];
            const active = draft.kind === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                disabled={pending}
                className={chipCls(active)}
                onClick={() => set("kind", o.value)}
                onKeyDown={(e) => chipKeyDown(e, KIND_VALUES, draft.kind, (v) => set("kind", v))}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {o.label}
              </button>
            );
          })}
        </div>
        {serverError("kind")}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="log-outcome" className="text-sm font-medium text-ink">
          Outcome
        </label>
        <input
          id="log-outcome"
          type="text"
          value={draft.outcome}
          onChange={(e) => set("outcome", e.target.value)}
          onKeyDown={(e) => {
            // "Next" on the iOS keyboard sends Enter: move to the note instead of sending the form.
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              noteRef.current?.focus();
            }
          }}
          maxLength={200}
          autoCapitalize="sentences"
          autoComplete="off"
          enterKeyHint="next"
          className={fieldCls}
          {...describe("outcome", "log-outcome-help")}
        />
        {serverError("outcome")}
        <p id="log-outcome-help" className="text-xs text-ink-4">
          In a few words: Left a voicemail, Wants a quote.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="log-note" className="text-sm font-medium text-ink">
          Note
        </label>
        <textarea
          id="log-note"
          ref={noteRef}
          rows={4}
          value={draft.note}
          onChange={(e) => set("note", e.target.value)}
          maxLength={5000}
          autoCapitalize="sentences"
          className={fieldCls}
          {...describe("note")}
        />
        {serverError("note")}
      </div>

      <DateTimeField
        id="log-at"
        label="When"
        help="Leave it empty for now."
        value={draft.at}
        onChange={(v) => set("at", v)}
        min={atMin}
        max={atMax}
        error={fieldErrors.at ?? atCheck}
        announce={!!fieldErrors.at}
        disabled={pending}
      />

      <DateTimeField
        id="log-followUpAt"
        label="Next follow-up"
        help="When to reach out next."
        value={draft.followUpAt}
        onChange={(v) => set("followUpAt", v)}
        error={fieldErrors.followUpAt}
        announce={!!fieldErrors.followUpAt}
        disabled={pending}
        aside={draft.followUpAt ? null : <span className="text-sm text-ink-4">None planned</span>}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="submit" className={cn(btnPrimary, "w-full sm:w-auto")} disabled={pending}>
          {pending && pressed === "log" ? "Logging" : "Log it"}
        </button>
        <button type="button" className={btnGhost} disabled={pending} onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
