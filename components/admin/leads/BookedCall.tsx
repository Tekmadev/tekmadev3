"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Video } from "lucide-react";
import { btnPrimary, btnSecondary } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import { BOOKING_COPY, isJoinTime, nextJoinChange, type JoinFields } from "@/lib/booking-ui";
import { copyText } from "./CopyButton";

/*
 * The parts of a booked call that run in the browser: Join (which turns on,
 * or turns bold, by the clock while the page is open) and Copy link. The rest
 * of the panel is plain server markup (BookedCallPanel.tsx). A server
 * component passes `joinFieldsOf(booking)`, never the whole booking.
 */

/** setTimeout's longest delay (about 24.8 days); later changes wait in steps. */
const MAX_DELAY = 2_147_483_647;
const SHOW_MS = 2000;

/**
 * Whether it is time to join, from the server's time on the first render (so
 * it matches the server markup), then the browser's clock: re-checked exactly
 * when the window opens or closes, and when a phone wakes the page.
 */
function useJoinTime(b: JoinFields, initialNowMs: number): boolean {
  const [nowMs, setNowMs] = useState(initialNowMs);
  const { status, start, end, joinUrl } = b;

  useEffect(() => {
    const fields = { status, start, end, joinUrl };
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const t = Date.now();
      setNowMs(t);
      const next = nextJoinChange(fields, t);
      if (next !== null) timer = setTimeout(schedule, Math.min(MAX_DELAY, Math.max(1000, next - t)));
    };
    // A macrotask, so the first check never sets state inside the effect itself.
    timer = setTimeout(schedule, 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, start, end, joinUrl]);

  return isJoinTime({ status, start, end, joinUrl }, nowMs);
}

/**
 * "Join call": opens the join link in a new tab. Shown whenever there is a
 * link (the panel passes none on a cancelled call: joinLinkOf); bold (the
 * primary button) from 15 minutes before the start to the end. `who` names
 * the lead for a screen reader when the label alone does not.
 */
export function JoinCallLink({
  booking,
  nowMs,
  label = BOOKING_COPY.join,
  who,
  className,
}: {
  booking: JoinFields;
  nowMs: number;
  label?: string;
  who?: string;
  className?: string;
}) {
  const live = useJoinTime(booking, nowMs);
  if (!booking.joinUrl) return null;
  return (
    <a
      href={booking.joinUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={who ? `${label}, ${who} ${BOOKING_COPY.newTab}` : undefined}
      className={cn(live ? btnPrimary : btnSecondary, className)}
    >
      <Video className="h-4 w-4" aria-hidden />
      {label}
      {who ? null : <span className="sr-only">{` ${BOOKING_COPY.newTab}`}</span>}
    </a>
  );
}

/**
 * A row's Join: only while it is time to join (15 minutes before the start to
 * the end), and only with a join link. Outside the row's own link. "Join" on
 * a Leads row; Overview's Upcoming calls passes "Join call", as on the app's Home.
 */
export function RowJoinLink({
  booking,
  nowMs,
  who,
  label = BOOKING_COPY.joinShort,
  className,
}: {
  booking: JoinFields;
  nowMs: number;
  who: string;
  label?: string;
  className?: string;
}) {
  const live = useJoinTime(booking, nowMs);
  if (!live || !booking.joinUrl) return null;
  return (
    <a
      href={booking.joinUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label}, ${who} ${BOOKING_COPY.newTab}`}
      className={cn(btnPrimary, "shrink-0 px-4", className)}
    >
      <Video className="h-4 w-4" aria-hidden />
      {label}
    </a>
  );
}

/** "Copy link": copies the join link and says "Link copied." for two seconds (or "Could not copy that."). */
export function CopyLinkButton({ url, className }: { url: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = async () => {
    const ok = await copyText(url);
    if (timer.current !== null) clearTimeout(timer.current);
    setState(ok ? "copied" : "failed");
    timer.current = setTimeout(() => {
      timer.current = null;
      setState("idle");
    }, SHOW_MS);
  };

  const Icon = state === "copied" ? Check : Copy;
  return (
    <span className={cn("inline-flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2", className)}>
      <button type="button" onClick={() => void onCopy()} className={cn(btnSecondary, "w-full sm:w-auto")}>
        <Icon className={cn("h-4 w-4", state === "copied" && "text-emerald-700 dark:text-emerald-300")} aria-hidden />
        {BOOKING_COPY.copyLink}
      </button>
      <span role="status" aria-live="polite" className={cn("text-sm", state === "failed" ? "text-signal" : "text-ink-3", state === "idle" && "sr-only")}>
        {state === "copied" ? BOOKING_COPY.linkCopied : state === "failed" ? BOOKING_COPY.copyFailed : ""}
      </span>
    </span>
  );
}
