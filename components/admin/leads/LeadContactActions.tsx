"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Mail, MessageSquare, PenLine, Phone, X, type LucideIcon } from "lucide-react";
import { useTyping } from "@/components/admin/use-typing";
import { btnPrimary } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import {
  LOG_OUTREACH_EVENT,
  PENDING_LOG_EVENT,
  clearPendingLog,
  defaultTouchKind,
  firstName,
  formatPhone,
  logRequestFor,
  mailtoHref,
  pendingLogPrompt,
  readPendingLog,
  requestLogOutreach,
  savePendingLog,
  smsHref,
  telHref,
  type ContactKind,
  type Lead,
} from "@/lib/leads-ui";

const ITEM =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium text-ink-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold";
const CIRCLE = "flex h-10 w-10 items-center justify-center rounded-full";

const PROMPT_ICONS: Record<ContactKind, LucideIcon> = { call: Phone, email: Mail, text: MessageSquare };

/** The bottom space the page keeps while the prompt floats above the dock on a phone. */
const PROMPT_SPACE = "--lead-prompt-space";

type Prompt = { name: string; kind: ContactKind };

type ActionProps = {
  icon: LucideIcon;
  label: string;
  href: string | null;
  ariaLabel: string;
  disabledHint: string;
  onOpen: () => void;
};

/**
 * One contact action: a plain tel:, sms: or mailto: link (no target, never
 * intercepted, so iOS hands it to Phone, Messages or Mail even from the
 * home-screen app), or a dimmed button saying why it is off.
 */
function ContactAction({ icon: Icon, label, href, ariaLabel, disabledHint, onOpen }: ActionProps) {
  const hintId = useId();
  if (!href) {
    return (
      <button type="button" disabled aria-describedby={hintId} className={cn(ITEM, "cursor-not-allowed opacity-60")}>
        <span className={cn(CIRCLE, "bg-bg-3 text-ink-4")} aria-hidden>
          <Icon className="h-5 w-5" />
        </span>
        <span>{label}</span>
        <span id={hintId} className="sr-only">
          {disabledHint}
        </span>
      </button>
    );
  }
  return (
    <a href={href} aria-label={ariaLabel} onClick={onOpen} className={cn(ITEM, "hover:bg-bg-3/60")}>
      <span className={cn(CIRCLE, "bg-gold/15 text-gold-deep")} aria-hidden>
        <Icon className="h-5 w-5" />
      </span>
      <span>{label}</span>
    </a>
  );
}

/**
 * One-tap contact on a lead: Call, Text, Email and Log. On a phone it is the
 * dock fixed at the bottom of the screen (where the tab bar sits on other
 * pages); from `lg` it is an inline row under the title.
 *
 * After Call, Text or Email (when the person may log outreach) it offers "Log
 * this call" until used or dismissed. A browser cannot tell whether the
 * dialer opened, so the tap itself shows the prompt and saves a pending log
 * (two hours), which brings the prompt back after the trip to Phone, Messages
 * or Mail, and lets the Leads list remind the person if iOS relaunched the
 * home-screen app. The prompt is a sibling of the dock, never inside it: the
 * dock's backdrop blur would make it the box a fixed child is placed in.
 */
export function LeadContactActions({ lead, canLog, restorePrompt = true }: { lead: Lead; canLog: boolean; restorePrompt?: boolean }) {
  const typing = useTyping();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  // After the log form was opened from this page, a stored reminder does not pop back up
  // here (a cancelled form keeps it for the Leads list); a new Call, Text or Email does.
  // Opened with ?log= the form was open from the start, so it starts quiet: once `log`
  // leaves the address bar, a refresh renders restorePrompt={true} on this same mount.
  const quiet = useRef(!restorePrompt);
  // False when the last tap could not be stored (storage blocked): the prompt then stays
  // until used or dismissed instead of reading as cleared when the person comes back.
  const storable = useRef(true);
  const logHintId = useId();
  const dismissHintId = useId();

  const phone = formatPhone(lead.phone);
  const tel = telHref(lead.phone);
  const sms = smsHref(lead.phone);
  const mailto = mailtoHref(lead.email);
  const leadId = lead.id;

  // Bring the prompt back from storage: on load, after a save or clear anywhere, and when the
  // person comes back from the Phone app. With restorePrompt off (the page opened with ?log=,
  // so Log outreach is already open), storage can only hide it (once the touch is logged).
  useEffect(() => {
    if (!canLog) return;
    const sync = () => {
      const pending = readPendingLog(Date.now());
      if (!pending || pending.leadId !== leadId) {
        if (pending || storable.current) setPrompt(null);
      } else if (restorePrompt && !quiet.current) setPrompt({ name: pending.name, kind: pending.kind });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    if (restorePrompt) sync();
    window.addEventListener(PENDING_LOG_EVENT, sync);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(PENDING_LOG_EVENT, sync);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [canLog, restorePrompt, leadId]);

  // Log outreach opened (from the dock, the prompt or the Outreach card): the prompt has done its job.
  useEffect(() => {
    const onLog = () => {
      quiet.current = true;
      setPrompt(null);
    };
    window.addEventListener(LOG_OUTREACH_EVENT, onLog);
    return () => window.removeEventListener(LOG_OUTREACH_EVENT, onLog);
  }, []);

  // While the prompt floats on a phone, the page keeps room at its end to scroll clear of it.
  const showing = prompt !== null;
  useEffect(() => {
    if (!showing) return;
    const root = document.documentElement;
    root.style.setProperty(PROMPT_SPACE, "8rem");
    return () => {
      root.style.removeProperty(PROMPT_SPACE);
    };
  }, [showing]);

  const contacted = (kind: ContactKind) => {
    if (!canLog) return;
    const name = firstName(lead);
    const at = Date.now();
    quiet.current = false;
    savePendingLog({ leadId, name, kind, at });
    const saved = readPendingLog(at);
    storable.current = saved !== null && saved.leadId === leadId && saved.at === at;
    setPrompt({ name, kind });
  };

  const logFromPrompt = () => {
    if (!prompt) return;
    // Text is logged as a DM with the note "By text message.". The record stays until
    // the touch is logged, so a cancelled form still leaves the reminder for later.
    requestLogOutreach(logRequestFor(prompt.kind));
    setPrompt(null);
  };

  const dismiss = () => {
    setPrompt(null);
    clearPendingLog(leadId);
  };

  const copy = prompt ? pendingLogPrompt(prompt) : null;
  const PromptIcon = prompt ? PROMPT_ICONS[prompt.kind] : Phone;

  return (
    <>
      <nav
        aria-label="Contact"
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
          "lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none",
          typing && "max-lg:hidden",
        )}
      >
        <div className="mx-auto flex min-h-16 max-w-lg items-stretch gap-1 px-2 py-1 lg:mx-0 lg:max-w-md lg:justify-start lg:px-0">
          <ContactAction
            icon={Phone}
            label="Call"
            href={tel}
            ariaLabel={`Call ${phone}`}
            disabledHint="No phone number on this lead"
            onOpen={() => contacted("call")}
          />
          <ContactAction
            icon={MessageSquare}
            label="Text"
            href={sms}
            ariaLabel={`Text ${phone}`}
            disabledHint="No phone number on this lead"
            onOpen={() => contacted("text")}
          />
          <ContactAction
            icon={Mail}
            label="Email"
            href={mailto}
            ariaLabel={`Email ${lead.email}`}
            disabledHint="No valid email on this lead"
            onOpen={() => contacted("email")}
          />
          {canLog ? (
            <button
              type="button"
              aria-label="Log outreach"
              aria-describedby={logHintId}
              onClick={() => requestLogOutreach({ kind: defaultTouchKind(lead) })}
              className={cn(ITEM, "hover:bg-bg-3/60")}
            >
              <span className={cn(CIRCLE, "bg-ink text-bg")} aria-hidden>
                <PenLine className="h-5 w-5" />
              </span>
              <span>Log</span>
              <span id={logHintId} className="sr-only">
                Logs a call, email, DM or meeting with this lead
              </span>
            </button>
          ) : null}
        </div>
      </nav>

      {canLog && prompt && copy ? (
        <div
          role="status"
          className={cn(
            "fixed left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30",
            // Opaque under the gold tint, so the page never shows through while it floats.
            "mx-auto max-w-lg rounded-2xl bg-surface shadow-lg lg:static lg:mx-0 lg:max-w-md lg:shadow-none",
            typing && "max-lg:hidden",
          )}
        >
          {/* Phones in portrait: the words, then the button under them, X top right. From sm (landscape) one short row. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-2xl border border-gold/40 bg-gold/[0.08] p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
            <p className="col-start-1 row-start-1 break-words pl-1 pt-2 text-sm text-ink sm:pt-0">{copy.text}</p>
            <button
              type="button"
              onClick={logFromPrompt}
              className={cn(btnPrimary, "col-start-1 row-start-2 justify-self-start sm:col-start-2 sm:row-start-1")}
            >
              <PromptIcon className="h-4 w-4" aria-hidden />
              {copy.action}
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              aria-describedby={dismissHintId}
              className="col-start-2 row-start-1 -mr-1 -mt-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-3 outline-none transition-colors hover:bg-bg-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-gold sm:col-start-3 sm:mt-0"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <span id={dismissHintId} className="sr-only">
              Hides this without logging
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
