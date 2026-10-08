"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { Notice, btnSecondary } from "@/components/portal/ui";
import { FollowUpBadge, StatusBadge } from "@/components/admin/leads/LeadBadges";
import { cn } from "@/lib/cn";
import {
  LOG_OUTREACH_EVENT,
  canClaimBooking,
  defaultTouchKind,
  finderOf,
  formatFieldDateTime,
  isContactKind,
  logRequestFor,
  requestLogOutreach,
  staffName,
  type AssigneesResult,
  type ContactKind,
  type Lead,
  type LogOutreachRequest,
} from "@/lib/leads-ui";
import { AssigneeEditor } from "./AssigneeEditor";
import { ClaimBookingPanel } from "./ClaimBookingPanel";
import { FollowUpEditor } from "./FollowUpEditor";
import { LogTouchForm, type LogRequest } from "./LogTouchForm";
import { OutreachRow } from "./OutreachRow";
import { StatusEditor } from "./StatusEditor";
import { isTouchKind } from "./outreach-logic";

type RowEditor = "status" | "followUp" | "assignee" | "claim";
type Open = RowEditor | "log" | null;

const panelId = (name: RowEditor) => `outreach-${name}-panel`;
const hintId = (name: RowEditor) => `outreach-${name}-hint`;

/** Whether leaving the Log outreach form would lose typed text, and the person said no. */
function keepsTypedOutreach(): boolean {
  const form = document.getElementById("log-outreach");
  if (form?.getAttribute("data-unsaved") !== "true") return false;
  return !window.confirm("Discard this outreach?");
}

/**
 * The lead page's "Outreach" section (the app's outreach card): status, the
 * next follow-up, who owns the lead, who found it and who booked it (the
 * commission credit, with "I booked this call" while nobody has it), "Log
 * outreach", then the timeline (`children`).
 *
 * With `canUpdate` each row opens its editor in place right under it, one
 * thing open at a time (no sheets, no scroll lock); without it the rows are
 * read only. Every save goes through a server action that checks the role
 * again on the server and revalidates the page, so the new lead arrives as
 * props: nothing here copies the lead into state.
 *
 * Log outreach opens through one window event (LOG_OUTREACH_EVENT), sent by
 * the button here, the contact dock and the "Log this call" prompt; with
 * `openLog` (the page's `?log=`) it opens once on arrival, then `log` leaves
 * the address bar so a reload does not open it again.
 */
export function LeadOutreachCard({
  lead,
  myEmail,
  nowMs,
  canUpdate,
  canOutreach,
  assignees,
  openLog,
  children,
}: {
  lead: Lead;
  myEmail: string;
  nowMs: number;
  canUpdate: boolean;
  canOutreach: boolean;
  assignees: AssigneesResult | null;
  openLog?: ContactKind | null;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState<Open>(null);
  const [rowsNote, setRowsNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [logNote, setLogNote] = useState<string | null>(null);
  const [logRequest, setLogRequest] = useState<LogRequest | null>(null);
  const rowRefs = useRef<Partial<Record<RowEditor, HTMLButtonElement | null>>>({});
  const logButtonRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Where focus goes once the open editor has closed (its row, or the Log outreach button).
  const focusAfterClose = useRef<(() => HTMLElement | null | undefined) | null>(null);

  useEffect(() => {
    if (open !== null || !focusAfterClose.current) return;
    const target = focusAfterClose.current;
    focusAfterClose.current = null;
    // The row can be gone (a claimed booking turns read only): the section heading then.
    const el = target() ?? headingRef.current;
    if (el && el.isConnected) el.focus({ preventScroll: true });
  }, [open]);

  const openLogForm = useCallback((req: LogOutreachRequest) => {
    setRowsNote(null);
    setLogNote(null);
    setLogRequest((prev) => ({ kind: req.kind, note: req.note, seq: (prev?.seq ?? 0) + 1 }));
    setOpen("log");
  }, []);

  // Every way of opening Log outreach (this card's button, the contact dock, the "Log this call" prompt).
  useEffect(() => {
    if (!canOutreach) return;
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail as Partial<LogOutreachRequest> | null | undefined;
      if (!detail || !isTouchKind(detail.kind)) return;
      openLogForm({ kind: detail.kind, note: typeof detail.note === "string" ? detail.note : undefined });
    };
    window.addEventListener(LOG_OUTREACH_EVENT, onRequest);
    return () => window.removeEventListener(LOG_OUTREACH_EVENT, onRequest);
  }, [canOutreach, openLogForm]);

  // Arriving from the list's "Log this call" (`?log=call|email|text`): open once, then drop `log`
  // from the address bar without a navigation, so a reload or a revalidation does not reopen it.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    if (!canOutreach || !isContactKind(openLog)) return;
    openLogForm(logRequestFor(openLog));
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("log")) {
        url.searchParams.delete("log");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    } catch {
      // An address the browser cannot parse: leave it.
    }
  }, [canOutreach, openLog, openLogForm]);

  const toggle = (name: RowEditor) => () => {
    if (open !== name && open === "log" && keepsTypedOutreach()) return;
    setRowsNote(null);
    setLogNote(null);
    setOpen((current) => (current === name ? null : name));
  };

  const cancel = (name: RowEditor) => () => {
    focusAfterClose.current = () => rowRefs.current[name];
    setOpen((current) => (current === name ? null : current));
  };

  // The new lead arrives with the same transition, so the editor closes as the row shows the new value.
  const saved = (name: RowEditor) => (message: string) => {
    focusAfterClose.current = () => rowRefs.current[name];
    startTransition(() => {
      setOpen((current) => (current === name ? null : current));
      setRowsNote({ kind: "ok", text: message });
    });
  };

  const refused = (message: string) => {
    focusAfterClose.current = () => rowRefs.current.claim;
    setOpen((current) => (current === "claim" ? null : current));
    setRowsNote({ kind: "err", text: message });
  };

  const logged = (message: string) => {
    focusAfterClose.current = () => logButtonRef.current;
    startTransition(() => {
      setOpen((current) => (current === "log" ? null : current));
      setLogNote(message);
    });
  };

  const closeLog = () => {
    focusAfterClose.current = () => logButtonRef.current;
    setOpen((current) => (current === "log" ? null : current));
  };

  const rowProps = (name: RowEditor, hint: string) =>
    canUpdate
      ? {
          ref: (el: HTMLButtonElement | null) => {
            rowRefs.current[name] = el;
          },
          onToggle: toggle(name),
          expanded: open === name,
          panelId: panelId(name),
          hint,
          hintId: hintId(name),
        }
      : {};

  const panel = (name: RowEditor, content: React.ReactNode) =>
    canUpdate && open === name ? (
      <div id={panelId(name)} className="border-t border-line bg-bg-2 px-4 py-4 sm:px-5">
        {content}
      </div>
    ) : null;

  const finder = finderOf(lead);
  const claimable = !lead.bookedBy && canClaimBooking(lead);
  const rowsOk = rowsNote?.kind === "ok" ? rowsNote.text : null;
  const rowsErr = rowsNote?.kind === "err" ? rowsNote.text : null;

  return (
    <section id="outreach" aria-labelledby="outreach-title" className="scroll-mt-20 rounded-2xl border border-line-strong bg-surface">
      <h2 id="outreach-title" ref={headingRef} tabIndex={-1} className="px-4 pt-4 text-base font-semibold text-ink focus:outline-none sm:px-5">
        Outreach
      </h2>

      <div className="mt-3 divide-y divide-line border-y border-line">
        <div>
          <OutreachRow label="Status" {...rowProps("status", "Changes the status")}>
            <StatusBadge status={lead.status} dot />
          </OutreachRow>
          {panel("status", <StatusEditor lead={lead} onSaved={saved("status")} onCancel={cancel("status")} />)}
        </div>

        <div>
          <OutreachRow label="Follow-up" {...rowProps("followUp", lead.followUpAt ? "Changes or clears the follow-up" : "Plans the next follow-up")}>
            {lead.followUpAt ? (
              <>
                <span className="text-right tabular-nums">{formatFieldDateTime(lead.followUpAt, nowMs)}</span>
                <FollowUpBadge followUpAt={lead.followUpAt} nowMs={nowMs} />
              </>
            ) : (
              <span className="text-ink-4">None planned</span>
            )}
          </OutreachRow>
          {panel("followUp", <FollowUpEditor lead={lead} onSaved={saved("followUp")} onCancel={cancel("followUp")} />)}
        </div>

        <div>
          <OutreachRow label="Assigned to" {...rowProps("assignee", "Changes who owns this lead")}>
            {lead.assignedTo ? (
              <span className="min-w-0 text-right wrap-anywhere">{staffName(lead.assignedTo)}</span>
            ) : (
              <span className="text-ink-4">Nobody</span>
            )}
          </OutreachRow>
          {panel(
            "assignee",
            <AssigneeEditor lead={lead} myEmail={myEmail} assignees={assignees} onSaved={saved("assignee")} onCancel={cancel("assignee")} />,
          )}
        </div>

        {finder ? (
          <OutreachRow label="Found by">
            <span className="min-w-0 text-right wrap-anywhere">{staffName(finder)}</span>
          </OutreachRow>
        ) : null}

        {lead.bookedBy ? (
          <OutreachRow label="Booked by">
            <span className="min-w-0 text-right wrap-anywhere">{staffName(lead.bookedBy)}</span>
          </OutreachRow>
        ) : claimable ? (
          <div>
            <OutreachRow label="Booked by" {...rowProps("claim", "Records that you booked this call")}>
              <span className="text-ink-4">Nobody yet</span>
            </OutreachRow>
            {panel(
              "claim",
              <ClaimBookingPanel lead={lead} onSaved={saved("claim")} onCancel={cancel("claim")} onRefused={refused} />,
            )}
          </div>
        ) : null}
      </div>

      <div role="status" aria-live="polite">
        {rowsOk ? (
          <div className="px-4 pt-4 sm:px-5">
            <Notice kind="ok">{rowsOk}</Notice>
          </div>
        ) : null}
      </div>
      {rowsErr ? (
        <div role="alert" className="px-4 pt-4 sm:px-5">
          <Notice kind="err">{rowsErr}</Notice>
        </div>
      ) : null}

      {canOutreach ? (
        <div className="p-4 sm:p-5">
          {open !== "log" ? (
            <>
              <button
                ref={logButtonRef}
                type="button"
                className={cn(btnSecondary, "w-full sm:w-auto")}
                aria-describedby="outreach-log-hint"
                onClick={() => requestLogOutreach({ kind: defaultTouchKind(lead) })}
              >
                <PenLine aria-hidden="true" className="h-4 w-4" />
                Log outreach
              </button>
              <span id="outreach-log-hint" className="sr-only">
                Logs a call, email, DM or meeting with this lead
              </span>
            </>
          ) : null}
          <div role="status" aria-live="polite">
            {logNote ? (
              <div className="mt-4">
                <Notice kind="ok">{logNote}</Notice>
              </div>
            ) : null}
          </div>
          {open === "log" && logRequest ? <LogTouchForm lead={lead} request={logRequest} onLogged={logged} onCancel={closeLog} /> : null}
        </div>
      ) : rowsNote ? (
        <div className="pt-4" />
      ) : null}

      {children ? <div className={cn("p-4 sm:p-5", (canOutreach || rowsNote) && "border-t border-line")}>{children}</div> : null}
    </section>
  );
}
