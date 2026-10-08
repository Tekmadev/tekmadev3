"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Mail, MessageSquare, Phone, X } from "lucide-react";
import { useTyping } from "@/components/admin/use-typing";
import { btnPrimary } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import {
  PENDING_LOG_EVENT,
  PENDING_LOG_KEY,
  PENDING_LOG_TTL_MS,
  clearPendingLog,
  pendingLogHref,
  pendingLogPrompt,
  readPendingLog,
  type PendingLog,
} from "@/lib/leads-ui";

const ICONS = { call: Phone, email: Mail, text: MessageSquare } as const;

/** The bottom space the page keeps while the banner floats above the tab bar on a phone. */
const PROMPT_SPACE = "--lead-prompt-space";

/**
 * "Called Olivia? Log it while it is fresh." on Leads, after a call, text or
 * email started from the web admin. It survives the trip to Phone, Messages or
 * Mail and an app relaunch (the record is in localStorage for 2 hours).
 * Nothing renders on the server or on the first client render, so the two
 * always match; it reads the record after mount and whenever the app comes
 * back to the front.
 *
 * Below lg it floats above the tab bar like the lead page's prompt, so it is
 * on screen after a call from a row far down the list (iOS keeps the scroll
 * position). It hides while typing. It is never inside the tab bar: the bar's
 * backdrop blur would make it the box a fixed child is placed in. From lg it
 * sits at the top of the page.
 */
export function PendingLogBanner() {
  const typing = useTyping();
  const [pending, setPending] = useState<PendingLog | null>(null);
  const hintId = useId();

  useEffect(() => {
    let expiry: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      const p = readPendingLog(Date.now());
      setPending(p);
      if (expiry) clearTimeout(expiry);
      expiry = null;
      // Hide it when its 2 hours run out while the page stays open.
      if (p) expiry = setTimeout(read, Math.max(1000, p.at + PENDING_LOG_TTL_MS - Date.now() + 1000));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === PENDING_LOG_KEY) read();
    };
    read();
    window.addEventListener(PENDING_LOG_EVENT, read);
    window.addEventListener("pageshow", read);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (expiry) clearTimeout(expiry);
      window.removeEventListener(PENDING_LOG_EVENT, read);
      window.removeEventListener("pageshow", read);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // While the banner floats on a phone, the list keeps room at its end to scroll clear of it.
  const showing = pending !== null;
  useEffect(() => {
    if (!showing) return;
    const root = document.documentElement;
    root.style.setProperty(PROMPT_SPACE, "8rem");
    return () => {
      root.style.removeProperty(PROMPT_SPACE);
    };
  }, [showing]);

  if (!pending) return null;
  const prompt = pendingLogPrompt(pending);
  const Icon = ICONS[pending.kind] ?? Phone;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30",
        // Opaque under the gold tint, so the list never shows through while it floats.
        "mx-auto max-w-lg rounded-2xl bg-surface shadow-lg lg:static lg:mx-0 lg:max-w-none lg:shadow-none",
        typing && "max-lg:hidden",
      )}
    >
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold/40 bg-gold/[0.08] p-3">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-deep">
            <Icon aria-hidden="true" className="h-4 w-4" />
          </span>
          <p className="min-w-0 flex-1 break-words text-sm text-ink">{prompt.text}</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Link href={pendingLogHref(pending)} className={cn(btnPrimary, "flex-1 sm:flex-none")}>
            {prompt.action}
          </Link>
          <button
            type="button"
            onClick={() => clearPendingLog()}
            aria-label="Dismiss"
            aria-describedby={hintId}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-bg-3 hover:text-ink"
          >
            <X aria-hidden="true" className="h-5 w-5" />
            <span id={hintId} className="sr-only">
              Hides this without logging
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
