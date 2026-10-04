"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { BlackHole } from "@/components/BlackHole";
import { cn } from "@/lib/cn";

/** How long to hold, the same 1.2s as the Android app's HoldToConfirm. */
const HOLD_MS = 1200;

/** "Hold to pause access" -> "Pause access". */
function actionName(label: string): string {
  const rest = label.replace(/^hold to\s+/i, "").trim();
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : label;
}

/**
 * Hold to confirm, for the web admin: the submit for a form whose action is
 * a server action, sent only after the button is pressed and held for 1.2s
 * (mouse, touch, or Space / Enter held down). A fill sweeps across while
 * holding; letting go early resets it and sends nothing. A screen reader's
 * activation (a click with no press behind it) asks with a confirm dialog
 * instead, since holding is impractical there.
 *
 * Like PendingSubmit, it shows the black hole spinner while the action runs
 * and locks itself so nothing is sent twice. Put the values the action needs
 * in hidden inputs: the form is sent without a submitter.
 */
export function HoldSubmit({
  label,
  pendingLabel,
  accessibleLabel,
  className,
}: {
  /** Says what holding does: "Hold to pause access". */
  label: string;
  /** Next to the spinner while the action runs. Defaults to the label without "Hold to". */
  pendingLabel?: string;
  /** What a screen reader reads, when the label alone is ambiguous ("Pause access for sam@x.com"). */
  accessibleLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const [progress, setProgress] = useState(0);
  const [mine, setMine] = useState(false);
  const frame = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const lastKeyAt = useRef(0);

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    startedAt.current = null;
  };

  const send = () => {
    stop();
    setMine(true);
    setProgress(1);
    ref.current?.form?.requestSubmit();
  };

  const begin = () => {
    if (pending || startedAt.current !== null) return;
    startedAt.current = performance.now();
    const tick = (now: number) => {
      if (startedAt.current === null) return;
      const p = Math.min(1, (now - startedAt.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) send();
      else frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const cancel = () => {
    if (startedAt.current === null) return;
    stop();
    setProgress(0);
  };

  // Done (or failed): back to the start.
  useEffect(() => {
    if (!pending) {
      setMine(false);
      setProgress(0);
    }
  }, [pending]);

  useEffect(() => stop, []);

  const name = actionName(label);
  const busy = pending && mine;
  const isKey = (key: string) => key === " " || key === "Enter";

  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={pending}
        aria-busy={busy || undefined}
        aria-label={accessibleLabel}
        aria-describedby={hintId}
        title="Press and hold to confirm"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          begin();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={(e) => {
          if (!isKey(e.key)) return;
          e.preventDefault();
          lastKeyAt.current = performance.now();
          if (!e.repeat) begin();
        }}
        onKeyUp={(e) => {
          if (!isKey(e.key)) return;
          e.preventDefault();
          lastKeyAt.current = performance.now();
          cancel();
        }}
        onBlur={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          // A pointer or key press is handled above. A click with no press
          // behind it is assistive technology activating the button.
          if (e.detail !== 0 || startedAt.current !== null || pending) return;
          if (performance.now() - lastKeyAt.current < 600) return;
          if (window.confirm(`${accessibleLabel ?? name}?`)) send();
        }}
        className={cn(
          "relative inline-flex min-h-9 touch-none select-none items-center justify-center overflow-hidden rounded-full border border-signal/50 px-3 py-1.5 text-xs font-medium text-signal transition-colors hover:border-signal disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {/* The fill, and the label again on top of it, clipped to the fill. */}
        <span
          aria-hidden
          className="absolute inset-0 origin-left bg-signal"
          style={{ transform: `scaleX(${progress})` }}
        />
        <span aria-hidden className="relative inline-flex items-center gap-1.5">
          {busy ? (
            <>
              <BlackHole />
              {pendingLabel ?? name}
            </>
          ) : (
            label
          )}
        </span>
        <span
          aria-hidden
          className="absolute inset-0 inline-flex items-center justify-center gap-1.5 px-3 text-white"
          style={{ clipPath: `inset(0 ${100 - progress * 100}% 0 0)` }}
        >
          {busy ? (
            <>
              <BlackHole />
              {pendingLabel ?? name}
            </>
          ) : (
            label
          )}
        </span>
        {!accessibleLabel && <span className="sr-only">{name}</span>}
      </button>
      <span id={hintId} className="sr-only">
        Press and hold to confirm
      </span>
    </>
  );
}
